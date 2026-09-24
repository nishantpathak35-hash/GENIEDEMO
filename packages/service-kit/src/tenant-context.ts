import type { Pool, PoolClient } from 'pg';
import type { Principal, TenantContext, TenantId } from '@cog/contracts';

/**
 * `withTenant` — the only place a database connection is acquired.
 *
 * ADR-0006 fixes the order: tenant context, then the query layer, then RLS as
 * the backstop. This is the query layer's front door, and three things about it
 * are load-bearing.
 *
 * **1. It is the only caller of `pool.connect()`.** No `pool` and no `db` is
 * exported from this package. `pg-pool` does not inspect transaction state on
 * `release()` and does not roll back for you, so a handler that acquires a
 * client, opens a transaction, throws, and releases in a `finally` returns a
 * connection to the pool **still inside tenant A's transaction**. The next
 * request gets it. That — not PgBouncer — is where connection reuse actually
 * bites.
 *
 * **2. The tenant setting is transaction-scoped, and set with a bind
 * parameter.** `set_config(..., true)` reverts at COMMIT/ROLLBACK, and
 * PgBouncer links a server connection to a client for exactly the span of a
 * transaction, so the two scopes coincide. `SET LOCAL` takes no bind
 * parameters, so the alternative is interpolating a tenant id into SQL inside
 * the layer whose whole job is tenant isolation.
 *
 * **3. A `system` principal with no tenant is refused.** See `withoutTenant`.
 */

/** Thrown when the context itself is unusable. Never carries the tenant id. */
export class TenantContextError extends Error {
  override readonly name = 'TenantContextError';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The handle handed to the callback. It is deliberately narrow: no `release`,
 * no `connect`, no way to reach the pool.
 */
export interface TenantTx {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<R[]>;
}

/**
 * Run `fn` inside one transaction with the tenant context set.
 *
 * The transaction is a **unit of work**, not a request. Holding one open for
 * the whole request pins a pooled server connection for its duration and turns
 * a slow external call into pool exhaustion.
 */
export async function withTenant<T>(
  pool: Pool,
  context: TenantContext,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  if (!UUID.test(context.tenantId)) {
    // Validated here rather than in the policy: a malformed id is our bug, and
    // `''::uuid` or `'nope'::uuid` inside a policy raises 22P02 — a 500 that
    // looks like a database fault rather than a context fault.
    throw new TenantContextError('tenant id is not a uuid');
  }

  const client = await pool.connect();
  let released = false;
  // Discard the connection rather than return a possibly-dirty one to the pool.
  const releaseBroken = (): void => {
    if (!released) {
      released = true;
      client.release(true);
    }
  };

  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', [
      'app.tenant_id',
      context.tenantId,
    ]);
    await client.query('SELECT set_config($1, $2, true)', [
      'app.user_id',
      context.principal.id,
    ]);

    const tx = frozenTx(client);
    const result = await fn(tx);
    await client.query('COMMIT');
    released = true;
    client.release();
    revoke(tx);
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
      if (!released) {
        released = true;
        client.release();
      }
    } catch {
      releaseBroken();
    }
    throw error;
  }
}

/** Marks a `tx` dead so an un-awaited query cannot run on a later tenant's connection. */
const revoked = new WeakSet<object>();

function revoke(tx: TenantTx): void {
  revoked.add(tx);
}

function frozenTx(client: PoolClient): TenantTx {
  const tx: TenantTx = {
    async query(sql, params = []) {
      if (revoked.has(tx)) {
        // An un-awaited promise from a completed handler would otherwise
        // execute inside the NEXT tenant's transaction, as that tenant.
        throw new TenantContextError('transaction handle used after it completed');
      }
      const result = await client.query(sql, params as unknown[]);
      return result.rows as never;
    },
  };
  return Object.freeze(tx);
}

/**
 * The scheduler's only escape hatch: enumerate tenants and enqueue, nothing else.
 *
 * A background job that must touch many tenants is a **fan-out** — N short
 * transactions through `withTenant`, one per tenant — not one privileged
 * transaction over all of them. That gives per-tenant retry, per-tenant failure
 * isolation and a per-tenant audit row, and it costs N transactions rather than
 * N connections.
 *
 * The two traps this exists to prevent:
 *
 *   - a `BYPASSRLS` job role, which makes the whole design decorative;
 *   - a magic tenant — `set_config('app.tenant_id', '*')` with
 *     `... OR current_setting('app.tenant_id', true) = '*'` in every policy.
 *     One string on a pooled connection turns isolation off platform-wide. The
 *     drift test asserts the canonical policy text precisely so that this
 *     cannot be merged.
 */
export async function withoutTenant<T>(
  pool: Pool,
  purpose: 'enumerate-tenants-to-enqueue',
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  if (purpose !== 'enumerate-tenants-to-enqueue') {
    throw new TenantContextError('tenantless work is limited to enqueue fan-out');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(frozenTx(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** A `system` principal, which still must name the tenant it acts for. */
export function systemPrincipal(): Principal {
  return { kind: 'system', id: 'system', roles: [] };
}

export function systemContext(tenantId: TenantId, requestId: string): TenantContext {
  return { tenantId, principal: systemPrincipal(), requestId };
}

/**
 * Refuse to serve unless the runtime role is what we think it is.
 *
 * A PgBouncer `[databases]` entry carrying `user=` can silently change who the
 * application connects as. If that role is a superuser or holds `BYPASSRLS`,
 * every policy in the system is inert and nothing else would notice.
 */
export async function assertRuntimeRoleIsSafe(pool: Pool, expected = 'app_runtime'): Promise<void> {
  const { rows } = await pool.query<{
    current_user: string;
    rolsuper: boolean;
    rolbypassrls: boolean;
    rolcreaterole: boolean;
    rolcreatedb: boolean;
  }>(
    `SELECT current_user, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
       FROM pg_roles WHERE rolname = current_user`,
  );
  const row = rows[0];
  if (row === undefined) throw new TenantContextError('could not resolve current_user');

  const problems: string[] = [];
  if (row.current_user !== expected) problems.push(`connected as ${row.current_user}, expected ${expected}`);
  if (row.rolsuper) problems.push('role is a superuser');
  if (row.rolbypassrls) problems.push('role has BYPASSRLS');
  if (row.rolcreaterole) problems.push('role has CREATEROLE');
  if (row.rolcreatedb) problems.push('role has CREATEDB');

  if (problems.length > 0) {
    throw new TenantContextError(`unsafe database role: ${problems.join('; ')}`);
  }
}

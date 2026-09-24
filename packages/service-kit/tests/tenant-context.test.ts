import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import type { TenantContext, TenantId } from '@cog/contracts';
import { TenantContextError, withTenant, withoutTenant } from '../src/index.js';

/**
 * Behaviour of the wrapper itself. The SQL-level guarantee — that a policy
 * denies across a reused pooled connection — is proved separately, against real
 * Postgres behind real PgBouncer, in services/tenancy's isolation suite. These
 * tests cover what that suite cannot see: how the wrapper treats the client.
 */

const TENANT: TenantId = '11111111-1111-4111-8111-111111111111' as TenantId;

function stubPool() {
  const queries: string[] = [];
  const release = vi.fn();
  const client = {
    // TWO parameters, because `withTenant` passes two. The stub declared only
    // `sql`, so `mock.calls[n][1]` — the bind parameters, which the assertion
    // below is entirely about — was typed as not existing. Nothing reported it
    // because no test file was typechecked.
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      queries.push(sql);
      void params;
      return { rows: [] };
    }),
    release,
  };
  const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
  return { pool, client, queries, release };
}

const ctx = (tenantId: string): TenantContext => ({
  tenantId: tenantId as TenantId,
  principal: { kind: 'staff', id: 'u1', roles: [] },
  requestId: 'req_1',
});

describe('withTenant', () => {
  it('sets the tenant inside an explicit transaction, via a bind parameter', async () => {
    const { pool, client, queries } = stubPool();
    await withTenant(pool, ctx(TENANT), async () => undefined);

    expect(queries[0]).toBe('BEGIN');
    expect(queries[1]).toContain('set_config');
    expect(queries.at(-1)).toBe('COMMIT');

    // The tenant id is a parameter, never interpolated. Interpolating it inside
    // the layer whose job is tenant isolation is the injection vector this
    // whole design exists to close.
    const call = client.query.mock.calls.find((c) => String(c[0]).includes('set_config'));
    expect(call?.[1]).toEqual(['app.tenant_id', TENANT]);
  });

  it('rejects a tenant id that is not a uuid, before touching the database', async () => {
    // A malformed value reaching the policy raises 22P02 — a 500 that reads as
    // a database fault rather than a context fault.
    const { pool } = stubPool();
    await expect(withTenant(pool, ctx('not-a-uuid'), async () => 1)).rejects.toBeInstanceOf(
      TenantContextError,
    );
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('rolls back and still releases when the callback throws', async () => {
    const { pool, queries, release } = stubPool();
    await expect(
      withTenant(pool, ctx(TENANT), async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(queries).toContain('ROLLBACK');
    expect(release).toHaveBeenCalled();
  });

  it('refuses a transaction handle used after it completed', async () => {
    // An un-awaited promise from a finished handler would otherwise run inside
    // the NEXT tenant's transaction, as that tenant.
    const { pool } = stubPool();
    let escaped: { query: (s: string) => Promise<unknown> } | undefined;
    await withTenant(pool, ctx(TENANT), async (tx) => {
      escaped = tx;
    });
    await expect(escaped?.query('SELECT 1')).rejects.toBeInstanceOf(TenantContextError);
  });

  it('never hands out release or connect', async () => {
    const { pool } = stubPool();
    await withTenant(pool, ctx(TENANT), async (tx) => {
      expect(Object.keys(tx)).toEqual(['query']);
      expect((tx as unknown as Record<string, unknown>)['release']).toBeUndefined();
      expect(Object.isFrozen(tx)).toBe(true);
    });
  });
});

describe('withoutTenant', () => {
  it('allows only the enqueue fan-out', async () => {
    const { pool } = stubPool();
    await expect(
      // @ts-expect-error — the type forbids it; the runtime must too.
      withoutTenant(pool, 'run-a-report-across-tenants', async () => 1),
    ).rejects.toBeInstanceOf(TenantContextError);
  });

  it('permits enumerating tenants to enqueue', async () => {
    const { pool } = stubPool();
    await expect(
      withoutTenant(pool, 'enumerate-tenants-to-enqueue', async () => 'ok'),
    ).resolves.toBe('ok');
  });
});

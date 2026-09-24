import { Hono, type Context } from 'hono';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { z } from 'zod';
import {
  setTenantPlanInput, HTTP_STATUS } from '@cog/contracts';
import { readPage } from '@cog/service-kit';
import {
  listProvisioningEvents,
  listTenants,
  setTenantPlan,
  provisionTenant,
  seedTenantModules,
  resolvePlatformPrincipal,
  ProvisioningRefused,
} from '@cog/tenancy';
import { assignRoles, seedDefaultRoles } from '@cog/identity';
import { seedDefaultChains } from '@cog/workflow';
import { seedCostingPolicy } from '@cog/procurement';

/**
 * `/platform/v1` — the back office, outside every tenant.
 *
 * **Deliberately NOT behind `tenantMiddleware`**, and that is the whole design.
 * A platform principal belongs to no tenant, so there is no context to set; and
 * because there is none, every tenant-scoped policy in the database denies this
 * connection by construction. A platform account cannot read a tenant's data by
 * accident, because the mechanism that would let it — a tenant id in the
 * session — is never set.
 *
 * The third tenantless prefix, and each has a stated reason: `/healthz` touches
 * no dependency, `/connector/v1` resolves a tenant from a per-tenant key inside
 * its own handlers, and this one has no tenant at all.
 *
 * **Provisioning is the highest-privilege operation in the product.** It
 * creates a tenant and its first administrator, so a flaw here yields somebody
 * else's data rather than merely one's own. Three things follow:
 *
 *   - the caller is resolved through `tenancy.resolve_platform_principal`, a
 *     SECURITY DEFINER function over a table `app_runtime` has no grant on —
 *     the same shape as the tenant bootstrap, not a second mechanism;
 *   - every attempt is recorded, refused ones included, by the function itself
 *     rather than by this file, so a refusal cannot go unlogged;
 *   - a simple per-process rate limit, because an unauthenticated-adjacent
 *     endpoint that creates organisations is worth slowing down even when the
 *     credential check holds.
 *
 * Impersonation (M6's other half) is **not built**. It needs an audit trail
 * that carries the impersonator alongside the impersonated principal on every
 * action, a time box, and a refusal on any route that writes money. Half of it
 * — a way to assume a tenant context without the record — is worse than none.
 */

const provisionInput = z.object({
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z][a-z0-9-]*$/, 'lower case letters, digits and hyphens, starting with a letter'),
  legalName: z.string().min(1).max(200),
  /** Where this tenant's invitation links point. Per-tenant so no invite URL is ever a constant. */
  appOrigin: z.url().max(300),
  adminEmail: z.email().max(320),
  adminExternalId: z.string().min(1).max(320),
});

/**
 * The narrow slice of a pg client `services/tenancy` needs, as a generic
 * method rather than a fixed row type — `TxLike` there is structural, and a
 * non-generic `query` does not satisfy it.
 */
function txFor(client: pg.PoolClient): {
  query<R extends Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<R[]>;
} {
  return {
    async query<R extends Record<string, unknown>>(sql: string, params?: readonly unknown[]) {
      const result = await client.query(sql, params as unknown[]);
      return result.rows as R[];
    },
  };
}

/** What the middleware puts on the context, typed so `c.get` is not `unknown`. */
type PlatformVariables = {
  platformPrincipal: string;
  platformClient: pg.PoolClient;
};

export interface PlatformOptions {
  readonly pool: pg.Pool;
  /** Verifies the credential, exactly as the tenant path does. */
  readonly verify: (request: Request) => Promise<{ externalId: string } | null>;
  /**
   * Provisioning attempts allowed per minute, per process. Default 10.
   *
   * A setting rather than a constant because the right number depends on the
   * deployment — a back office onboarding a batch of customers is doing the
   * thing this bounds, on purpose. The isolation suite raises it because it
   * provisions a tenant per scenario and was tripping the ceiling as a side
   * effect of having more scenarios, which is a test failure that says nothing
   * about the product.
   *
   * **The control is not bypassable, only tunable.** There is no value that
   * turns it off, the floor is 1, and a test asserts it still fires at
   * whatever it is set to.
   */
  readonly provisionAttemptLimit?: number | undefined;
}

function requestId(c: Context): string {
  return c.req.header('x-request-id') ?? randomUUID();
}

function refuse(c: Context, message: string): Response {
  return c.json(
    { code: 'FORBIDDEN' as const, message, requestId: requestId(c) },
    HTTP_STATUS.FORBIDDEN as 403,
  );
}

function platformValidationFailed(c: Context, message: string): Response {
  return c.json(
    { code: 'VALIDATION_FAILED' as const, message, requestId: requestId(c) },
    HTTP_STATUS.VALIDATION_FAILED as 400,
  );
}

/**
 * A per-process ceiling on provisioning attempts.
 *
 * Not a distributed rate limit and not presented as one: it bounds a single
 * process, and a deployment behind several would allow more. It is here because
 * the alternative is nothing at all, and because the operation it slows down is
 * the one that creates organisations. The real control is the credential check
 * above it.
 */
const ATTEMPT_WINDOW_MS = 60_000;
const DEFAULT_ATTEMPT_LIMIT = 10;
const attempts: number[] = [];

function tooManyAttempts(now: number, limit: number): boolean {
  while (attempts.length > 0 && now - (attempts[0] ?? 0) > ATTEMPT_WINDOW_MS) attempts.shift();
  if (attempts.length >= limit) return true;
  attempts.push(now);
  return false;
}

export function platformRoutes(options: PlatformOptions): Hono<{ Variables: PlatformVariables }> {
  const app = new Hono<{ Variables: PlatformVariables }>();

  // Floor of 1, and no ceiling that disables it. A configurable control that
  // accepts a value meaning "off" is a control somebody switches off.
  const attemptLimit = Math.max(1, options.provisionAttemptLimit ?? DEFAULT_ATTEMPT_LIMIT);

  /**
   * Resolve the caller, on every route.
   *
   * A connection from the pool WITHOUT `withTenant`: there is no tenant to set.
   * That is safe here precisely because it is unsafe everywhere else — a
   * connection with no tenant context reads zero rows from every tenant-scoped
   * table, which is exactly the isolation a platform account should have.
   */
  app.use('*', async (c, next) => {
    const verified = await options.verify(c.req.raw);
    if (verified === null) return refuse(c, 'This is the platform console.');

    const client = await options.pool.connect();
    try {
      const principalId = await resolvePlatformPrincipal(txFor(client), verified.externalId);
      if (principalId === null) return refuse(c, 'This is the platform console.');
      c.set('platformPrincipal', principalId);
      c.set('platformClient', client);
      await next();
    } finally {
      client.release();
    }
  });

  function principalOf(c: Context<{ Variables: PlatformVariables }>): string {
    return c.get('platformPrincipal');
  }

  function txOf(c: Context<{ Variables: PlatformVariables }>): ReturnType<typeof txFor> {
    return txFor(c.get('platformClient'));
  }

  app.get('/whoami', (c) => c.json({ principalId: principalOf(c), kind: 'platform' }));

  app.get('/tenants', async (c) => {
    const page = readPage(c);
    if ('error' in page) return platformValidationFailed(c, page.error);
    return c.json(await listTenants(txOf(c), principalOf(c), page));
  });

  /**
   * Create a tenant and its first administrator.
   *
   * The test that says this works is not "a row was written": it creates a
   * tenant, then authenticates as its first user and reads back an empty
   * project list — proving the tenant exists and is REACHABLE (M6 done-when 1).
   */
  app.post('/tenants', async (c) => {
    if (tooManyAttempts(Date.now(), attemptLimit)) {
      return c.json(
        {
          code: 'CONFLICT' as const,
          message: 'Too many provisioning attempts. Try again shortly.',
          requestId: requestId(c),
        },
        HTTP_STATUS.CONFLICT as 409,
      );
    }

    const parsed = provisionInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        {
          code: 'VALIDATION_FAILED' as const,
          message: parsed.error.issues[0]?.message ?? 'That organisation was not created.',
          requestId: requestId(c),
        },
        HTTP_STATUS.VALIDATION_FAILED as 400,
      );
    }

    // ONE transaction for the whole of it.
    //
    // Provisioning runs without a tenant context — it is the operation that
    // creates the context — and the role model has to be written WITH one. So
    // the tenant id is set LOCAL after the tenant row exists and before the
    // seeding, inside the same transaction, and evaporates at COMMIT.
    //
    // Atomic on purpose. A tenant provisioned without a role model has an
    // administrator entitled to nothing and no screen from which to grant
    // themselves anything — an organisation nobody can use, holding the slug so
    // the retry fails too. Better that it never existed.
    const tx = txOf(c);
    await tx.query('BEGIN');
    let created;
    try {
      created = await provisionTenant(tx, principalOf(c), parsed.data);
      await tx.query('SELECT set_config($1, $2, true)', ['app.tenant_id', created.tenantId]);
      await seedDefaultRoles(tx);
      await seedDefaultChains(tx);
      await seedCostingPolicy(tx);
      await seedTenantModules(tx, created.tenantId);
      // The first administrator holds `admin`, or the organisation is
      // unusable: `provision_tenant` inserts the principal with the column
      // default — an EMPTY role array — so without this they are entitled to
      // nothing, including the settings screen that grants entitlements.
      await assignRoles(tx, created.principalId, ['admin']);
      await tx.query('COMMIT');
    } catch (error) {
      // A REFUSAL is not a failure, and must not roll back.
      //
      // `tenancy.provision_tenant` records every attempt including the refused
      // ones, and it goes to some trouble to do so — an inner EXCEPTION
      // subtransaction, so the audit row survives the refusal that produced it.
      // Rolling back here would undo exactly the record that design exists to
      // keep. So a refusal commits what was written (the audit row, and
      // nothing else) and is then re-thrown to become a 409.
      await tx.query(error instanceof ProvisioningRefused ? 'COMMIT' : 'ROLLBACK');
      throw error;
    }

    return c.json({ ...created, slug: parsed.data.slug }, 201);
  });

  /**
   * Give an EXISTING organisation the role model it never got.
   *
   * Provisioning seeds roles, chains and the costing policy in the same
   * transaction that creates the tenant. Every organisation created before
   * those existed has none of them — and there was no way to fix that, from
   * anywhere. Found by seeding a compose database whose two tenants were
   * provisioned on 2026-09-03, before migration 0024:
   *
   *     slug                 roles=0  chains=0  costing=0
   *
   * The consequence is not cosmetic. `loadEntitlements` returns nothing, so
   * every approval refuses, the settings screen that would grant a role is
   * itself behind `manage_settings`, and the organisation cannot be repaired
   * from inside itself. It is bricked, quietly, and it looks like an approval
   * bug rather than a missing seed.
   *
   * Idempotent, and that is load-bearing rather than a nicety: all three
   * seeders already refuse to overwrite (`ON CONFLICT DO NOTHING`, and
   * `seedDefaultChains` skips a tenant that has an active chain), so running
   * this against a healthy tenant is a no-op and running it twice is the same
   * as running it once. It therefore needs no "has it run?" flag, which is the
   * usual way a backfill acquires a second source of truth.
   *
   * It does NOT assign a role to anybody. Handing an existing principal `admin`
   * from the platform console would be a privilege grant made by whoever ran a
   * repair, and that is a decision for the organisation. This restores the
   * vocabulary; somebody inside still has to be given a role.
   */
  app.post('/tenants/:tenantId/role-model', async (c) => {
    const tenantId = c.req.param('tenantId');
    if (!/^[0-9a-f-]{36}$/i.test(tenantId)) {
      return c.json(
        { code: 'VALIDATION_FAILED' as const, message: 'tenantId must be a uuid', requestId: requestId(c) },
        HTTP_STATUS.VALIDATION_FAILED as 422,
      );
    }

    const tx = txOf(c);
    await tx.query('BEGIN');
    try {
      // The tenant must exist, resolved through `tenancy.list_tenants` rather
      // than by selecting the table.
      //
      // Two reasons, and the second is the one that bites. `tenancy.tenants`
      // carries the same RESTRICTIVE policy as everything else, and the
      // platform console runs with NO tenant context — it is the surface that
      // exists above tenancies — so a direct SELECT returns zero rows for a
      // tenant that plainly exists, and this route answered 404 for both of
      // them. The SECURITY DEFINER function is the authorised path, and it
      // takes the platform principal, so existence and permission are one
      // question rather than two.
      const found = await tx.query<{ id: string }>(
        'SELECT id FROM tenancy.list_tenants($1) WHERE id = $2',
        [principalOf(c), tenantId],
      );
      if (found[0] === undefined) {
        await tx.query('ROLLBACK');
        return c.json(
          { code: 'NOT_FOUND' as const, message: 'no such organisation', requestId: requestId(c) },
          HTTP_STATUS.NOT_FOUND as 404,
        );
      }

      await tx.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
      await seedDefaultRoles(tx);
      await seedDefaultChains(tx);
      await seedCostingPolicy(tx);
      await seedTenantModules(tx, tenantId);

      const counts = await tx.query<{ roles: string; chains: string }>(
        `SELECT (SELECT count(*)::text FROM identity.role_catalog)  AS roles,
                (SELECT count(*)::text FROM workflow.approval_chains WHERE is_active) AS chains`,
      );
      await tx.query('COMMIT');
      return c.json({
        tenantId,
        roles: Number(counts[0]?.roles ?? 0),
        chains: Number(counts[0]?.chains ?? 0),
      });
    } catch (error) {
      await tx.query('ROLLBACK');
      throw error;
    }
  });

  /** The plan label an operator keeps for an organisation. Not a price; nothing gates on it. */
  app.put('/tenants/:tenantId/plan', async (c) => {
    const tenantId = c.req.param('tenantId');
    if (!/^[0-9a-f-]{36}$/i.test(tenantId)) {
      return c.json(
        { code: 'NOT_FOUND' as const, message: 'no such organisation', requestId: requestId(c) },
        HTTP_STATUS.NOT_FOUND as 404,
      );
    }
    const parsed = setTenantPlanInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return platformValidationFailed(c, 'plan must be up to 40 characters, or null');
    const found = await setTenantPlan(txOf(c), principalOf(c), tenantId, parsed.data.plan);
    if (!found) {
      return c.json(
        { code: 'NOT_FOUND' as const, message: 'no such organisation', requestId: requestId(c) },
        HTTP_STATUS.NOT_FOUND as 404,
      );
    }
    return c.json({ ok: true as const });
  });

  app.get('/provisioning-events', async (c) => {
    const page = readPage(c);
    if ('error' in page) return platformValidationFailed(c, page.error);
    return c.json(await listProvisioningEvents(txOf(c), principalOf(c), page));
  });

  app.onError((error, c) => {
    if (error instanceof ProvisioningRefused) {
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    throw error;
  });

  return app;
}

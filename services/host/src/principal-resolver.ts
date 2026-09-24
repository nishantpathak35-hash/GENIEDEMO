import type pg from 'pg';
import type { Principal, TenantId } from '@cog/contracts';
import type { PrincipalResolver } from '@cog/service-kit';

/**
 * Resolving a request to a principal.
 *
 * This runs **before** any tenant context exists — that is the whole point, and
 * it is the bootstrap problem at the centre of every row-level-security design:
 * a tenant-scoped read with no tenant set returns zero rows, so nothing could
 * ever authenticate.
 *
 * The answer is a SECURITY DEFINER function owned by `app_auth`, reading an
 * `app_auth`-owned lookup table that `app_runtime` has **no grant on at all**.
 * The function returns two ids and nothing else — no email, no roles list, no
 * enumeration. See migration `0003`.
 *
 * Lives in the host rather than in `services/identity` because it is composition:
 * it needs the pool, and no service is allowed to own that.
 */

export interface ResolverOptions {
  readonly pool: pg.Pool;
  /**
   * Verifies the incoming credential and returns the provider's user id.
   *
   * Injected so the host can be run against the local development adapter or
   * WorkOS without either being compiled in. There is deliberately no fallback:
   * a provider that silently degrades to "local" in production is an
   * authentication bypass, which is exactly the shape of the legacy's silent
   * fallback to an in-memory JWT secret.
   */
  readonly verify: (request: Request) => Promise<{ externalId: string } | null>;
}

export function createPrincipalResolver(options: ResolverOptions): PrincipalResolver {
  return {
    async resolve(request: Request) {
      const verified = await options.verify(request);
      if (verified === null) return null;

      // Not inside withTenant: there is no tenant yet. This is the one query in
      // the system that legitimately runs without a tenant context, and it can
      // only ever return a single row for an exact external id.
      const { rows } = await options.pool.query<{
        tenant_id: string;
        principal_id: string;
      }>('SELECT * FROM identity.resolve_principal($1)', [verified.externalId]);

      const row = rows[0];
      if (row === undefined) return null;

      // Roles are read separately, INSIDE the tenant context, by the handler
      // that needs them — not returned by the bootstrap function. Widening that
      // function to return roles would make it an enumeration surface for the
      // one query that runs unscoped.
      const principal: Principal = {
        kind: 'staff',
        id: row.principal_id,
        roles: [],
      };

      return { tenantId: row.tenant_id as TenantId, principal };
    },
  };
}

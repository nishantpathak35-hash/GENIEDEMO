import { Hono } from 'hono';
import { HTTP_STATUS } from '@cog/contracts';
import { txOf } from '@cog/service-kit';

/**
 * Tenancy HTTP surface — this tenant's own settings.
 *
 * Mounted by `services/host` behind the tenant middleware. No query carries a
 * `WHERE tenant_id`; the RLS policy applies it.
 *
 * ---
 *
 * **There is deliberately no connector-key endpoint here, and the reason is a
 * measured fact rather than a preference.**
 *
 * `tenancy.connector_keys` grants nothing to `app_runtime` — only to `app_auth`
 * — and carries RLS enabled with no policy at all. Measured:
 *
 * ```
 * cog=> SET ROLE app_runtime; SELECT count(*) FROM tenancy.connector_keys;
 * ERROR:  permission denied for table connector_keys
 * ```
 *
 * That is M1's design, not an oversight: a connector key identifies a tenant
 * *before* any tenant context exists, so it is reached only through the
 * `app_auth`-owned SECURITY DEFINER function `tenancy.resolve_connector_key`,
 * exactly as `identity.principal_lookup` is. The request path can verify a key
 * and can never enumerate one.
 *
 * Minting and revoking therefore cannot be a tenant-scoped route. They are
 * **platform** operations and belong to the provisioning path in
 * `docs/plans/M6.md`, alongside tenant creation — which faces the same
 * bootstrap problem and gets the same treatment. Adding a `GRANT` and a policy
 * here so that a route would work is the shape of change that quietly widens
 * the blast radius of the runtime role, and it is not made to satisfy an
 * endpoint.
 */

type TenantRow = {
  id: string;
  slug: string;
  legal_name: string;
  app_origin: string | null;
};

export function tenancyRoutes(): Hono {
  const app = new Hono();

  /**
   * This tenant's settings.
   *
   * `appOrigin` is per-tenant rather than a constant because `auth.js:253`
   * hardcodes one demo domain as the invite URL. In a multi-tenant product that
   * sends every customer's staff to somebody else's login page, which is why
   * `mintInvite` refuses outright when it is missing instead of defaulting.
   */
  app.get('/settings', async (c) => {
    const rows = await txOf(c).query<TenantRow>(
      `SELECT id, slug, legal_name, app_origin FROM tenancy.tenants LIMIT 1`,
    );
    const row = rows[0];
    if (row === undefined) {
      // Under RLS this means the context resolved to a tenant whose own row is
      // not visible — which should be impossible, and is worth being loud about
      // rather than answering with an empty object.
      return c.json(
        {
          code: 'NOT_FOUND' as const,
          message: 'No settings are visible for the resolved organisation.',
          requestId: c.req.header('x-request-id') ?? 'unknown',
        },
        HTTP_STATUS.NOT_FOUND as 404,
      );
    }
    return c.json({
      id: row.id,
      slug: row.slug,
      legalName: row.legal_name,
      appOrigin: row.app_origin,
    });
  });

  return app;
}

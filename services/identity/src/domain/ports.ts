import type { Principal, TenantId } from '@cog/contracts';

/**
 * The identity provider, behind a port.
 *
 * ADR-0005 moves credentials to a managed provider: password storage, reset
 * flows, session rotation, MFA, brute-force protection and breach monitoring
 * stop being our code and our liability. This service owns only the mapping
 * from a provider identity to an application principal, and the roles that
 * principal holds.
 *
 * Two adapters implement this. `local` mints principals from seeded synthetic
 * users and is what `docker compose up` uses; `workos` is the real one. The
 * port exists because M1's done-when is "compose from clean gives a working
 * stack", and that cannot depend on a third-party account, API keys and network
 * egress — nor can the isolation suite, which has to stay hermetic.
 */

/** What the provider tells us about a completed sign-in. */
export interface ProviderIdentity {
  /** Stable, provider-issued. The only thing we key on. */
  readonly externalId: string;
  readonly email: string;
  /** The provider's organisation, which maps to a tenant. */
  readonly externalOrgId: string;
}

export interface IdentityProvider {
  readonly name: 'local' | 'workos';
  /** Exchange whatever the provider handed back for a verified identity. */
  verify(credential: string): Promise<ProviderIdentity | null>;
}

/**
 * Resolves a provider identity to a principal.
 *
 * Backed by `identity.resolve_principal`, a SECURITY DEFINER function, because
 * this lookup necessarily happens BEFORE any tenant context exists — under RLS
 * a tenant-scoped read with no tenant set returns zero rows, so nothing could
 * ever authenticate.
 */
export interface PrincipalResolver {
  resolve(externalId: string): Promise<{ tenantId: TenantId; principal: Principal } | null>;
}

/**
 * Reads per-tenant configuration owned by `services/tenancy`.
 *
 * This is a PORT rather than an import. `services/identity` must not import
 * `services/tenancy` — the one-way rule forbids it and `eslint.config.mjs`
 * enforces it — so the host wires the two together and identity depends only on
 * this shape.
 */
export interface TenantConfigReader {
  /**
   * Where this tenant's application lives, e.g. `https://acme.example`.
   *
   * The legacy app hardcodes a single demo domain at `auth.js:253`:
   *
   *     const inviteUrl = `https://lwa-iota.vercel.app/?invite=${token}`;
   *
   * A compiled-in domain cannot serve a multi-tenant product — every tenant's
   * invitation would point at one company's deployment. It is per-tenant
   * configuration, it belongs to tenancy, and it is read through here.
   */
  appOrigin(tenantId: TenantId): Promise<string | null>;
}

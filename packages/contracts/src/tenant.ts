import { z } from 'zod';

/**
 * The tenant context: which company this request acts for, and as whom.
 *
 * ADR-0006 fixes the order — context object, then query layer, then RLS — and
 * one rule about this object above all others:
 *
 *   **It is resolved ONCE per request from the authenticated principal, and
 *   carried explicitly. Never from a global, an AsyncLocalStorage, a module
 *   singleton, or anything a caller can reach without being handed it.**
 *
 * The legacy app is the argument for that rule. Its RPC route dispatches
 * `api[method](...args, session)` with arguments padded but never truncated, so
 * a client-supplied argument can bind to the `session` parameter; seven modules
 * then accept a payload object as the session when none was resolved. A context
 * that can be *passed in* by a caller is not a context, it is a suggestion.
 *
 * Consequently: nothing in this file constructs a `TenantContext`. Construction
 * lives in `packages/service-kit`, from the verified principal only.
 */

declare const tenantIdBrand: unique symbol;

/** A tenant's stable identifier. Opaque; never derived from a name. */
export type TenantId = string & { readonly [tenantIdBrand]: 'TenantId' };

/**
 * What kind of principal is acting.
 *
 * These are separate trust boundaries, not roles. A `vendor` and a `staff`
 * principal may both be "authenticated", but they reach different surfaces —
 * which is why the apps are split by audience (TOPOLOGY) rather than by feature.
 */
export const principalKind = z.enum([
  /** Internal staff of the tenant company: PM, procurement, finance, director. */
  'staff',
  /** An external vendor or subcontractor, via the vendor portal. */
  'vendor',
  /** The tenant's own end client, via the client portal. */
  'client',
  /**
   * The on-prem Tally connector, authenticated by a per-tenant connector key.
   *
   * A machine principal. It holds no roles and reaches only `/connector/v1`.
   * It is the second tenant-resolution path alongside the identity provider,
   * which is why M1 proves tenant context works for both.
   */
  'connector',
  /**
   * The platform itself: migrations, scheduled jobs, queue workers.
   *
   * Never reachable from an HTTP request. A `system` principal arriving from
   * the network is a bug, and services should treat it as one.
   */
  'system',
]);

export type PrincipalKind = z.infer<typeof principalKind>;

/**
 * The authenticated actor.
 *
 * `roles` is a list of tenant-scoped role names, not a closed enum — the legacy
 * app already supports tenant-defined custom roles, and a fixed union here
 * would make that a schema change. Role *semantics* belong to
 * `services/identity`; this type only carries them.
 *
 * Roles are resolved server-side from the identity provider. They are never
 * read from a token claim the client can edit, and never derived in a browser
 * — the legacy `POsView.js` computes `isSuperAdmin(user?.email)` client-side,
 * which is the hole this shape exists to close.
 */
export interface Principal {
  readonly kind: PrincipalKind;
  /** Stable id within the tenant. For `connector`, the connector key's id. */
  readonly id: string;
  readonly roles: readonly string[];
}

/**
 * Everything a service needs to scope a request, and nothing it does not.
 *
 * Deliberately absent: the raw token, the request body, anything mutable.
 */
export interface TenantContext {
  readonly tenantId: TenantId;
  readonly principal: Principal;
  /** Correlates logs, audit rows and traces for one request. */
  readonly requestId: string;
}

/**
 * Wire shape, for logging and admin surfaces only.
 *
 * There is deliberately no `z.infer` → `TenantContext` transform and no
 * `parseTenantContext`. A context is *derived from an authenticated principal*,
 * never *parsed from input* — offering a parser would make the unsafe path the
 * convenient one, which is exactly how the legacy session hole works.
 */
export const tenantContextWire = z.object({
  tenantId: z.string().min(1),
  principal: z.object({
    kind: principalKind,
    id: z.string().min(1),
    roles: z.array(z.string()),
  }),
  requestId: z.string().min(1),
});

/**
 * `services/identity` — the mapping from a provider identity to an application
 * principal, and the roles that principal holds.
 *
 * Owns no credentials: ADR-0005 puts those with the identity provider.
 * Imports no other service — per-tenant configuration arrives through the
 * `TenantConfigReader` port, which the API host wires to `services/tenancy`.
 */

export type {
  IdentityProvider,
  ProviderIdentity,
  PrincipalResolver,
  TenantConfigReader,
} from './domain/ports.js';

export { LocalIdentityProvider, assertNotProduction } from './adapters/local.js';
export { WorkOsIdentityProvider, type WorkOsClient } from './adapters/workos.js';

export {
  mintInvite,
  checkInvite,
  hashInviteToken,
  InviteError,
  DEFAULT_INVITE_TTL_MS,
  type MintedInvite,
  type MintInviteInput,
  type StoredInvite,
  type InviteRejection,
} from './application/invite.js';

export { identityRoutes } from './api/routes.js';

export { loadPrincipalRoles } from './application/roles.js';

/**
 * External-principal scoping. A `vendor` or `client` principal is narrowed to
 * the subjects it is linked to; a principal with no link is scoped to nothing.
 * `identity.principals.kind` has carried these values since migration 0003 —
 * what did not exist until 0023 is anything that narrows them.
 */
export {
  loadPrincipalScope,
  linkPrincipal,
  listPrincipalsOfKind,
  pagePrincipalsOfKind,
  findPrincipalOfKind,
  countPrincipalsOfKind,
  countActivePrincipalsOfKind,
  linkedSubjects,
  unlinkPrincipal,
  entitledTo,
  PrincipalNotFound,
  type PrincipalScope,
  type PrincipalKind,
  type PrincipalRecord,
} from './application/scope.js';

/**
 * The role model. PO-13's answer, landed as rows a director can edit rather
 * than as a constant — see the PROPOSED table in `docs/OPEN-DECISIONS.md`.
 */
export {
  loadEntitlements,
  namedHoldersOfRole,
  principalNames,
  principalsHoldingRole,
  listRoles,
  setRoleGrants,
  addRole,
  retireRole,
  seedDefaultRoles,
  assignRoles,
  permits,
  reaches,
  RoleError,
  type PrincipalEntitlements,
  type RoleRow,
  type SetGrantsInput,
} from './application/authz.js';

export {
  acceptInvite,
  AcceptConflict,
  type AcceptInviteInput,
  type AcceptRejection,
  type AcceptResult,
  type AcceptedPrincipal,
} from './application/accept.js';

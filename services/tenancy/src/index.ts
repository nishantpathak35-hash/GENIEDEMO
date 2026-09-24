/**
 * `services/tenancy` — tenants, per-tenant configuration, connector keys.
 *
 * Owns the tables under the `tenancy` schema and the RLS policies on them.
 * Imports no other service (eslint.config.mjs enforces it); cross-domain reads
 * go through `packages/contracts`.
 */

export {
  mintConnectorKey,
  hashConnectorKey,
  prefixOf,
  verifyConnectorKey,
  isKeyUsable,
  type MintedKey,
} from './domain/connector-key.js';

export { tenancyRoutes } from './api/routes.js';

/**
 * Platform provisioning: creating a tenant is the one operation that cannot
 * run inside a tenant context, because the context does not exist yet.
 */
export {
  resolvePlatformPrincipal,
  listTenants,
  setTenantPlan,
  noteTenantActivity,
  provisionTenant,
  listProvisioningEvents,
  ProvisioningRefused,
  type TenantRecord,
  type ProvisionInput,
  type ProvisioningEvent,
} from './application/provisioning.js';

/**
 * Optional modules. Whether a feature is turned on for a tenant at all —
 * a different question from whether a person may use it, which is
 * `identity.role_grants`.
 */
export {
  OPTIONAL_MODULES,
  isOptionalModule,
  moduleEnabled,
  listModules,
  setModuleEnabled,
  seedTenantModules,
  type OptionalModule,
  type OptionalModuleKey,
  type ModuleState,
} from './application/modules.js';

/** The words this tenant uses — one per pair, read by every label. */
export { DEFAULT_TERMINOLOGY, TerminologyRefused, getTerminology, saveTerminology } from './application/terminology.js';

/**
 * The organisation's own registered details, and the defaults it works to.
 * A GSTIN here is identity, not a statutory calculation.
 */
export {
  getCompanyProfile,
  saveCompanyProfile,
  getOperationalDefaults,
  saveOperationalDefaults,
  getTaxSetup,
  saveTaxSetup,
  currentTenantName,
  completeTaxReview,
  TaxReviewRefused,
  connectorPresence,
  type TaxSetup,
  type ConnectorPresence,
  type CompanyProfile,
  type CompanyProfileInput,
  type OperationalDefaults,
} from './application/company-profile.js';

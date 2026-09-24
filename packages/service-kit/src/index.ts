/**
 * `packages/service-kit` — the shared service runtime.
 *
 * M1 delivered the tenant context and correlated logging; M2 adds health
 * checks and error handling, which is what makes "a new service can be created
 * from the golden path" true rather than aspirational.
 *
 * `withTenant` is the only place a connection is acquired. No `pool` and no
 * `db` is exported from this package, deliberately: `pg-pool` does not roll
 * back on `release()`, so a handler that acquires a client directly can return
 * one to the pool still inside another tenant's transaction.
 */

export { createLogger, forRequest, type Logger, type LoggerOptions } from './logger.js';

export {
  withTenant,
  withoutTenant,
  systemPrincipal,
  systemContext,
  assertRuntimeRoleIsSafe,
  TenantContextError,
  type TenantTx,
} from './tenant-context.js';

export {
  liveness,
  readiness,
  databaseCheck,
  type DependencyCheck,
  type HealthStatus,
  type ReadinessReport,
} from './health.js';

export {
  ServiceError,
  toErrorResponse,
  SAFE_MESSAGES,
  type ErrorResponse,
} from './http-errors.js';

export {
  tenantMiddleware,
  tenantOf,
  txOf,
  CTX_TENANT,
  CTX_TX,
  CTX_LOGGER,
  type PrincipalResolver,
  type TenantMiddlewareOptions,
} from './http/tenant-middleware.js';

export {
  auditRoutes,
  routesOf,
  TENANTLESS_ROUTES,
  RouteAuditError,
  type RegisteredRoute,
} from './http/route-audit.js';

export {
  readPage,
  keyset,
  finishPage,
  encodeCursor,
  decodeCursor,
  type Cursor,
  type PageQuery,
  type PageLimits,
  type Keyset,
  type KeyType,
  type Page,
} from './paging.js';
export { isoWeeksEnding, type IsoWeek } from './weeks.js';
export {
  todayInIndia,
  addDays,
  daysBetween,
  weekdayLabel,
  businessWeek,
  financialWindow,
  type BusinessWeek,
  type FinancialPeriod,
  type FinancialWindow,
} from './calendar.js';

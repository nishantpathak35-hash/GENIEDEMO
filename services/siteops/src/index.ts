/**
 * `services/siteops` — DPR, WPR, site recce, JMR, imprest, tasks.
 *
 * Separate from `services/projects` because its user is a site engineer on a
 * phone with patchy signal: offline-first sync, photo upload and low-bandwidth
 * payloads are constraints that apply here and nowhere else (TOPOLOGY).
 *
 * `manpower-legacy.ts` is deliberately NOT exported — it reproduces the legacy
 * defects as commit 1 of the port protocol and exists to be compared against.
 */

export {
  headcount,
  floorManpower,
  overallManpower,
  manpowerByTrade,
  ManpowerError,
  type ManpowerEntry,
  type Floor,
} from './domain/manpower.js';

export {
  aggregateWeek,
  assertIssuable,
  WprError,
  type DailyReport,
  type WeeklyAggregate,
} from './domain/wpr.js';

export { siteopsRoutes } from './api/routes.js';

export {
  listImprest,
  requestImprest,
  sanctionImprest,
  reconcileImprest,
  listMeasurements,
  recordMeasurement,
  ImprestNotFound,
  ImprestConflict,
  MeasurementRefused,
} from './application/site-controls.js';

export {
  listRecces,
  getRecce,
  createRecce,
  RecceNotFound,
  RecceRefused,
} from './application/recce.js';

export { clientSiteProgress, type ClientSiteProgress } from './application/client-view.js';
export { peopleOnSiteByWeek } from './application/weekly.js';
export { siteToday, headCountByDay, type Site, type SiteToday } from './application/site-issues.js';

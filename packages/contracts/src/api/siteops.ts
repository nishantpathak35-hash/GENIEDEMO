import { z } from 'zod';
import { pageOf } from '../pagination.js';
import { paiseWire } from '../money.js';

/**
 * Site operations shapes — daily progress reports and the weekly aggregate.
 *
 * `headCount` is a whole non-negative integer on the wire, not a string. The
 * legacy accepts free text and runs it through `parseInt`, which takes a
 * prefix — `'12 workers'` becomes 12, `'0x10'` becomes 16 — and a malformed
 * value becomes `NaN`, which then lowers the site total instead of failing
 * (DPR-01..03). Refusing at the schema is the first of three lines; the domain
 * raises, and the column carries a CHECK.
 */

export const manpowerEntry = z.object({
  floor: z.string().min(1).max(80),
  trade: z.string().min(1).max(80),
  headCount: z.number().int().min(0),
});

export const dailyReport = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  /** The site date covered, not the moment of entry. */
  reportDate: z.iso.date(),
  submitted: z.boolean(),
  notes: z.string(),
  /** People on site that day, summed from the report's manpower rows. `null` when none were recorded. */
  headCount: z.number().int().min(0).nullable(),
});

export const dailyReportsResponse = pageOf(dailyReport);

export type DailyReportsResponse = z.infer<typeof dailyReportsResponse>;

export const createDailyReportInput = z.object({
  projectId: z.uuid(),
  reportDate: z.iso.date(),
  notes: z.string().max(4000).optional(),
  manpower: z.array(manpowerEntry).max(500).optional(),
});

export type CreateDailyReportInput = z.infer<typeof createDailyReportInput>;

/**
 * A site issue — raised on the day it is noticed, open across the reports
 * that follow, resolved by whoever fixed it (migration 0085). `blocking` is
 * the severity that stops work.
 */
export const SITE_ISSUE_SEVERITIES = ['minor', 'major', 'blocking'] as const;
export const siteIssueSeverity = z.enum(SITE_ISSUE_SEVERITIES);

export const siteIssue = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  dailyReportId: z.uuid().nullable(),
  title: z.string(),
  severity: siteIssueSeverity,
  raisedOn: z.iso.date(),
  resolvedOn: z.iso.date().nullable(),
  resolution: z.string(),
});
export type SiteIssue = z.infer<typeof siteIssue>;

export const siteIssueListResponse = pageOf(siteIssue);
export type SiteIssueListResponse = z.infer<typeof siteIssueListResponse>;

export const raiseSiteIssueInput = z.object({
  projectId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  severity: siteIssueSeverity.default('minor'),
  raisedOn: z.iso.date().optional(),
  dailyReportId: z.uuid().optional(),
});
export type RaiseSiteIssueInput = z.infer<typeof raiseSiteIssueInput>;

export const resolveSiteIssueInput = z.object({
  resolution: z.string().trim().max(1000).default(''),
});
export type ResolveSiteIssueInput = z.infer<typeof resolveSiteIssueInput>;

/**
 * Today across every site, for the Site screen's stat row: people on site
 * from today's reports (`null` when no report today carries a head count),
 * how many sites reported, and the issues still open.
 */
export const siteTodayResponse = z.object({
  date: z.iso.date(),
  onSite: z.number().int().min(0).nullable(),
  sitesReporting: z.number().int().min(0),
  openIssues: z.number().int().min(0),
  blockingIssues: z.number().int().min(0),
  /**
   * Every site — a project in progress — and whether it reported today; the
   * date of its last report when it did not. A site with no report is the
   * first sign of a problem, so the ones that did not report are the answer.
   */
  sites: z.array(
    z.object({
      projectId: z.uuid(),
      code: z.string(),
      reportedToday: z.boolean(),
      lastReportOn: z.iso.date().nullable(),
    }),
  ),
  /** Projects in progress. */
  sitesTotal: z.number().int().min(0),
  /** The latest day any site reported, and how many did that day — "2 of 4 yesterday" when nobody has today. */
  latestReportOn: z.iso.date().nullable(),
  sitesReportingOnLatest: z.number().int().min(0),
  /** The last seven days, oldest first: head count on site that day, `null` for a day with no report. */
  byDay: z.array(
    z.object({
      date: z.iso.date(),
      /** "Mon", "Tue" … */
      label: z.string(),
      onSite: z.number().int().min(0).nullable(),
      /** `onSite` as basis points of the week's largest day, for the column. */
      index: z.number().int().min(0).max(10000),
    }),
  ),
  /** The first open issue that is stopping work, named with its site. */
  firstBlocking: z.object({ title: z.string(), projectCode: z.string() }).nullable(),
});
export type SiteTodayResponse = z.infer<typeof siteTodayResponse>;

/**
 * A week, with its gaps named.
 *
 * `missingDates` and `reportedDays` are part of the answer rather than
 * diagnostics. A week that silently averages five submitted days as though
 * there were six reads as a slow week, and that figure supports a progress
 * claim to a client — so the denominator is stated and `issuable` is false
 * while any day is missing.
 */
export const weeklyAggregateResponse = z.object({
  projectId: z.uuid(),
  weekStart: z.iso.date(),
  weekEnd: z.iso.date(),
  reportedDays: z.number().int(),
  missingDates: z.array(z.iso.date()),
  personDays: z.number().int(),
  personDaysByTrade: z.record(z.string(), z.number().int()),
  averageOverReportedDays: z.number().nullable(),
  issuable: z.boolean(),
});

export type WeeklyAggregateResponse = z.infer<typeof weeklyAggregateResponse>;

// --------------------------------------------------------- site controls --

export const requestImprestInput = z.object({
  projectId: z.uuid(),
  purpose: z.string().min(1).max(500),
  amountRequested: paiseWire,
});
export type RequestImprestInput = z.infer<typeof requestImprestInput>;

/** Sanctioning may be for less than was asked. */
export const sanctionImprestInput = z.object({
  amountSanctioned: paiseWire,
  expectedVersion: z.number().int().min(1),
});
export type SanctionImprestInput = z.infer<typeof sanctionImprestInput>;

/**
 * Reconciling.
 *
 * The amount is **required** and a CHECK keeps it within the sanction.
 * `reconcileSiteImprest` (`site-controls.js:72`) stores receipt text and
 * compares nothing at all (IMP-01).
 */
export const reconcileImprestInput = z.object({
  amountReconciled: paiseWire,
  expectedVersion: z.number().int().min(1),
});
export type ReconcileImprestInput = z.infer<typeof reconcileImprestInput>;

export const imprest = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  purpose: z.string(),
  amountRequested: paiseWire,
  amountSanctioned: paiseWire.nullable(),
  amountReconciled: paiseWire.nullable(),
  status: z.enum(["requested", "sanctioned", "reconciled", "rejected"]),
  requestedBy: z.uuid(),
  /** Held apart from the requester so a separation-of-duties rule can read both. */
  sanctionedBy: z.uuid().nullable(),
  reconciledBy: z.uuid().nullable(),
  version: z.number().int(),
});
export type Imprest = z.infer<typeof imprest>;

/**
 * A joint measurement.
 *
 * Both signatures are the point. `signedByClient` is free text because the
 * client signatory is not a user of this system; the site signatory is the
 * authenticated principal and is not a field here.
 */
export const recordMeasurementInput = z.object({
  projectId: z.uuid(),
  boqItemId: z.uuid().optional(),
  description: z.string().min(1).max(500),
  location: z.string().max(300).optional(),
  quantityWhole: z.number().int().min(0),
  quantityMillionths: z.number().int().min(0).max(999_999),
  uom: z.string().min(1).max(24),
  signedByClient: z.string().min(1).max(200),
  measuredOn: z.iso.date(),
});
export type RecordMeasurementInput = z.infer<typeof recordMeasurementInput>;

// ----------------------------------------------------------------- recce --

/**
 * A site recce.
 *
 * Areas travel as whole units plus millionths, like every other measurement
 * here. `bua_sqft`, `carpet_sqft` and `floor_height_ft` are `REAL` in the
 * legacy — none is money, but a built-up area drives an estimate.
 *
 * `conductedBy` is absent: it is the authenticated principal.
 */
export const createRecceInput = z.object({
  projectId: z.uuid(),
  recceOn: z.iso.date(),
  clientPresent: z.boolean().optional(),
  buaWhole: z.number().int().min(0).optional(),
  buaMillionths: z.number().int().min(0).max(999_999).optional(),
  carpetWhole: z.number().int().min(0).optional(),
  carpetMillionths: z.number().int().min(0).max(999_999).optional(),
  floorHeightWhole: z.number().int().min(0).optional(),
  floorHeightMillionths: z.number().int().min(0).max(999_999).optional(),
  floorNumber: z.string().max(60).optional(),
  numFloors: z.number().int().min(1).max(500).optional(),
  siteCondition: z.enum(["bare_shell", "warm_shell", "fitted", "occupied"]).optional(),
  handoverOn: z.iso.date().optional(),
  keyChallenges: z.string().max(8000).optional(),
  observations: z.string().max(8000).optional(),
  /** A survey form's free shape. Not modelled as columns — a site engineer changes it. */
  measurements: z.record(z.string(), z.unknown()).optional(),
  services: z.record(z.string(), z.unknown()).optional(),
});
export type CreateRecceInput = z.infer<typeof createRecceInput>;
// --- read shapes the screens need ---------------------------------------

export const imprestListResponse = pageOf(imprest);
export type ImprestListResponse = z.infer<typeof imprestListResponse>;

/**
 * A joint measurement, signed by both sides.
 *
 * Append-only: there is no edit and no delete. A measurement the client signed
 * is evidence, and an editable record of it is not.
 */
export const measurement = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  boqItemId: z.uuid().nullable(),
  description: z.string(),
  location: z.string(),
  measuredMicros: z.string(),
  uom: z.string(),
  signedByClient: z.string(),
  signedBySite: z.string(),
  measuredOn: z.string(),
});
export type Measurement = z.infer<typeof measurement>;

export const measurementListResponse = pageOf(measurement);
export type MeasurementListResponse = z.infer<typeof measurementListResponse>;

/**
 * A site survey.
 *
 * Areas are exact integers of millionths of a unit, as strings — a floor area
 * in a float reaches every figure derived from it. `conductedBy` is the
 * authenticated principal, never a name from the body.
 */
export const recce = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  recceOn: z.string(),
  conductedBy: z.uuid(),
  clientPresent: z.boolean(),
  buaMicros: z.string().nullable(),
  carpetMicros: z.string().nullable(),
  floorHeightMicros: z.string().nullable(),
  floorNumber: z.string(),
  numFloors: z.number().int(),
  siteCondition: z.string(),
  handoverOn: z.string().nullable(),
  keyChallenges: z.string(),
  observations: z.string(),
  measurements: z.unknown(),
  services: z.unknown(),
  status: z.string(),
  version: z.number().int(),
});
export type Recce = z.infer<typeof recce>;

export const recceListResponse = pageOf(recce);
export type RecceListResponse = z.infer<typeof recceListResponse>;

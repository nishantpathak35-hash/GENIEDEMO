import { type Floor, manpowerByTrade, overallManpower } from './manpower.js';

/**
 * Weekly progress report — an aggregation over daily reports.
 *
 * **A correction to the documentation as well as the code.**
 * `STACK-MIGRATION.md` already records that the legacy README's claim of a
 * "WPR PowerPoint exporter" is false: no pptx library is present, no export
 * function exists, and the `.pptx` in `public/` was produced by hand. So there
 * is no exporter to port — only the aggregation, and the legacy's is a
 * `getWPRAggregation` RPC with no calculation module behind it.
 *
 * What a WPR has to get right is not arithmetic. It is **which days are
 * missing**: a week that silently averages five submitted days as though they
 * were seven reads as a full week of progress, and that figure supports a
 * progress claim.
 */

export class WprError extends Error {
  override readonly name = 'WprError';
}

export interface DailyReport {
  /** ISO date, `YYYY-MM-DD`. */
  readonly date: string;
  readonly floors: readonly Floor[];
  readonly submitted: boolean;
}

export interface WeeklyAggregate {
  readonly weekStart: string;
  readonly weekEnd: string;
  /** Days in the period that have a submitted report. */
  readonly reportedDays: number;
  /** Days with no submitted report. Named, not counted. */
  readonly missingDates: readonly string[];
  /** Total person-days across the reported days. */
  readonly personDays: number;
  /** Per-trade person-days, which a single total cannot give. */
  readonly personDaysByTrade: ReadonlyMap<string, number>;
  /**
   * Average headcount **over reported days only**, with the denominator stated.
   *
   * Averaging over seven when five were submitted understates the site by 29%
   * and looks like a slow week. Averaging over five without saying so overstates
   * coverage. Both figures are given, so neither reading is implied.
   */
  readonly averageOverReportedDays: number | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Aggregate a week.
 *
 * `expectedDates` is supplied by the caller rather than derived, because what
 * counts as a working day is a site decision — a six-day week is normal on
 * Indian sites, and a public holiday is not a missing report.
 */
export function aggregateWeek(
  expectedDates: readonly string[],
  reports: readonly DailyReport[],
): WeeklyAggregate {
  if (expectedDates.length === 0) throw new WprError('a week needs at least one expected day');
  for (const d of expectedDates) {
    if (!ISO_DATE.test(d)) throw new WprError(`not an ISO date: ${d}`);
  }

  const sorted = [...expectedDates].sort();
  const submitted = new Map(reports.filter((r) => r.submitted).map((r) => [r.date, r]));

  // A report for a date nobody expected is a data-entry error, not a bonus.
  for (const r of submitted.values()) {
    if (!sorted.includes(r.date)) {
      throw new WprError(`report for ${r.date} falls outside the week being aggregated`);
    }
  }

  const missing = sorted.filter((d) => !submitted.has(d));

  let personDays = 0;
  const byTrade = new Map<string, number>();
  for (const report of submitted.values()) {
    personDays += overallManpower(report.floors);
    for (const [trade, count] of manpowerByTrade(report.floors)) {
      byTrade.set(trade, (byTrade.get(trade) ?? 0) + count);
    }
  }

  const reportedDays = submitted.size;
  return {
    weekStart: sorted[0] as string,
    weekEnd: sorted[sorted.length - 1] as string,
    reportedDays,
    missingDates: missing,
    personDays,
    personDaysByTrade: byTrade,
    averageOverReportedDays: reportedDays === 0 ? null : personDays / reportedDays,
  };
}

/**
 * Whether a week may be issued to a client.
 *
 * A weekly report with gaps can still be useful internally. Sending one to a
 * client as evidence of progress, without saying which days are missing, is the
 * problem — so issuing is refused rather than the gaps being hidden.
 */
export function assertIssuable(aggregate: WeeklyAggregate): void {
  if (aggregate.reportedDays === 0) {
    throw new WprError('a week with no submitted reports cannot be issued');
  }
  if (aggregate.missingDates.length > 0) {
    throw new WprError(
      `cannot issue: no report for ${aggregate.missingDates.join(', ')}`,
    );
  }
}

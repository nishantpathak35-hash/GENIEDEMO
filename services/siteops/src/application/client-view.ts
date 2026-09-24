import type { TxLike } from './site-controls.js';

/**
 * What a client may see of the site work on its own project.
 *
 * Counts and a date. **No money.** The legacy client portal derives a billing
 * percentage as billed over contract value and caps it with `Math.min(100, …)`,
 * so an over-billed project reads as exactly complete; there is no percentage
 * here at all, because what is billed is CA-gated and a completion figure
 * derived from money is a money figure.
 *
 * Siteops owns these two tables, so siteops counts them. The drawing count the
 * same screen shows belongs to `projects`, and the host puts the halves
 * together — a cross-service SQL query is the same boundary violation as a
 * cross-service import, and the lint rule cannot see one written in SQL.
 */

export interface ClientSiteProgress {
  readonly reportedDays: number;
  readonly lastReportOn: string | null;
  readonly measurementsRecorded: number;
}

export async function clientSiteProgress(
  tx: TxLike,
  projectId: string,
): Promise<ClientSiteProgress> {
  const rows = await tx.query<{
    reported_days: string;
    last_report_on: string | null;
    measurements: string;
  }>(
    `SELECT
       (SELECT count(*) FROM siteops.daily_reports d WHERE d.project_id = $1)::text
         AS reported_days,
       (SELECT max(d.report_date)::text FROM siteops.daily_reports d WHERE d.project_id = $1)
         AS last_report_on,
       (SELECT count(*) FROM siteops.measurement_records m WHERE m.project_id = $1)::text
         AS measurements`,
    [projectId],
  );
  const row = rows[0];
  return {
    reportedDays: row === undefined ? 0 : countOf(row.reported_days),
    lastReportOn: row?.last_report_on ?? null,
    measurementsRecorded: row === undefined ? 0 : countOf(row.measurements),
  };
}

function countOf(text: string): number {
  const value = BigInt(text);
  return value > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(value);
}

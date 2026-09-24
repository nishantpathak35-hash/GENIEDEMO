import type { IsoWeek } from '@cog/service-kit';
import type { TxLike } from './site-controls.js';

/**
 * People on site, by ISO week — the head count reported across every site,
 * averaged over the days that filed a report that week. A week with no
 * report is `null`, not zero: nobody said nobody was there.
 *
 * Head counts, not money; the average is the database's.
 */
export async function peopleOnSiteByWeek(
  tx: TxLike,
  weeks: readonly IsoWeek[],
): Promise<readonly (number | null)[]> {
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  if (first === undefined || last === undefined) return [];
  const rows = await tx.query<{ week_start: string; people: number }>(
    `SELECT date_trunc('week', r.report_date)::date::text AS week_start,
            round(SUM(m.head_count)::numeric / count(DISTINCT r.report_date))::int AS people
       FROM siteops.daily_reports r
       JOIN siteops.daily_manpower m ON m.tenant_id = r.tenant_id AND m.daily_report_id = r.id
      WHERE r.report_date >= $1::date AND r.report_date < $2::date
      GROUP BY 1`,
    [first.start, last.end],
  );
  const perWeek = new Map(rows.map((r) => [r.week_start, r.people]));
  return weeks.map((w) => perWeek.get(w.start) ?? null);
}

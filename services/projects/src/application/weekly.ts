import type { IsoWeek } from '@cog/service-kit';
import type { TxLike } from './boq-writes.js';

/**
 * Pipeline added, by ISO week — the estimated value of the opportunities
 * opened in each week on the grid. Not the pipeline's size at the time: a
 * lead carries its current stage and no history of stages, so what it was
 * worth "then" cannot be read back, and a series that pretended to would be a
 * guess. What was opened each week is a fact the rows hold.
 *
 * Per week, not cumulative — a sparkline of new business. Digit-string paise;
 * the sum is the database's.
 */
export async function pipelineOpenedByWeek(
  tx: TxLike,
  weeks: readonly IsoWeek[],
): Promise<readonly string[]> {
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  if (first === undefined || last === undefined) return [];
  const rows = await tx.query<{ week_start: string; value: string }>(
    `SELECT date_trunc('week', created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS week_start,
            COALESCE(SUM(estimated_value), 0)::text AS value
       FROM projects.leads
      WHERE created_at >= ($1::date)::timestamp AT TIME ZONE 'Asia/Kolkata'
        AND created_at <  ($2::date)::timestamp AT TIME ZONE 'Asia/Kolkata'
      GROUP BY 1`,
    [first.start, last.end],
  );
  const perWeek = new Map(rows.map((r) => [r.week_start, r.value]));
  return weeks.map((w) => perWeek.get(w.start) ?? '0');
}

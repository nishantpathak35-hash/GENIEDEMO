import type { IsoWeek } from '@cog/service-kit';
import type { TxLike } from './approval-subject.js';

/**
 * Ordered so far, by ISO week — the running total of every order that is not
 * cancelled, at the end of each week on the grid. The same definition as
 * `committedByProject`, sliced by `created_at`: an order counts from the day
 * it was raised, because that is when the spend was decided.
 *
 * Cumulative, so the sparkline climbs; the last point is today's committed
 * total and matches the Today hero. Digit-string paise on the way out — the
 * sum is addition, done by the database, and nothing here multiplies.
 */
export async function orderedSoFarByWeek(
  tx: TxLike,
  weeks: readonly IsoWeek[],
): Promise<readonly string[]> {
  const last = weeks[weeks.length - 1];
  if (last === undefined) return [];
  const rows = await tx.query<{ week_start: string; gross: string }>(
    `SELECT date_trunc('week', created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS week_start,
            COALESCE(SUM(gross), 0)::text AS gross
       FROM procurement.purchase_orders
      WHERE state <> 'cancelled'
        AND created_at < ($1::date)::timestamp AT TIME ZONE 'Asia/Kolkata'
      GROUP BY 1`,
    [last.end],
  );
  const perWeek = new Map(rows.map((r) => [r.week_start, BigInt(r.gross)]));
  // Everything before the grid's first week is the opening balance.
  const first = weeks[0];
  let running = 0n;
  for (const [weekStart, gross] of perWeek) {
    if (first !== undefined && weekStart < first.start) running += gross;
  }
  return weeks.map((w) => {
    running += perWeek.get(w.start) ?? 0n;
    return running.toString();
  });
}

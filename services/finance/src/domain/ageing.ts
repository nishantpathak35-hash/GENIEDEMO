import type { Paise } from '@cog/contracts';
import { ZERO, add, mulRatio, ratio, roundToPaise, shareBasisPoints, sub, sum, toWire } from '@cog/money';

/**
 * Money owed, in ageing buckets — the rule Today's two money cards and two
 * tiles draw. The buckets are the industry's: current (not yet past its date),
 * then overdue by 1 to 30, 31 to 60 and over 60 days. Each bucket's share of
 * the whole owed is worked out here through `shareBasisPoints`, the one exact
 * division of money into a share, and truncated to two decimals for the bar —
 * a display width, so no rounding boundary governs it, and never a figure a
 * screen would add up.
 *
 * `daysPast` is the server's count against `today`; a screen compares no
 * dates. Which bucket a day count falls in is `bucketOf`, tested on its
 * edges: day 30 is still the first bucket, day 31 the second, day 61 the third.
 */

export type AgeingBucketName = 'current' | 'days1to30' | 'days31to60' | 'over60';

export function bucketOf(daysPast: number): AgeingBucketName {
  if (daysPast <= 0) return 'current';
  if (daysPast <= 30) return 'days1to30';
  if (daysPast <= 60) return 'days31to60';
  return 'over60';
}

export interface AgeingLine {
  readonly daysPast: number;
  readonly amount: Paise;
}

export interface AgeingBucket {
  readonly count: number;
  readonly total: string;
  readonly pct: number;
}

export interface Ageing {
  readonly total: string;
  readonly openCount: number;
  readonly overdue: AgeingBucket;
  readonly buckets: Record<AgeingBucketName, AgeingBucket>;
}

/** `part` as a percentage of `whole`, two decimals, truncated; zero on an empty scale. */
export function sharePct(part: Paise, whole: Paise): number {
  if (whole <= ZERO || part <= ZERO) return 0;
  const bp = shareBasisPoints(part, whole);
  return bp >= 10000 ? 100 : bp / 100;
}

/** Every open line bucketed, each bucket with its count, its total and its share of the whole. */
export function ageing(lines: readonly AgeingLine[]): Ageing {
  const open = lines.filter((l) => l.amount > ZERO);
  const total = sum(open.map((l) => l.amount));
  const of = (name: AgeingBucketName): { count: number; total: Paise } => {
    const in_ = open.filter((l) => bucketOf(l.daysPast) === name);
    return { count: in_.length, total: sum(in_.map((l) => l.amount)) };
  };
  const shaped = (b: { count: number; total: Paise }): AgeingBucket => ({
    count: b.count,
    total: toWire(b.total),
    pct: sharePct(b.total, total),
  });
  const current = of('current');
  const b1 = of('days1to30');
  const b2 = of('days31to60');
  const b3 = of('over60');
  const overdueTotal = add(add(b1.total, b2.total), b3.total);
  return {
    total: toWire(total),
    openCount: open.length,
    overdue: shaped({ count: b1.count + b2.count + b3.count, total: overdueTotal }),
    buckets: { current: shaped(current), days1to30: shaped(b1), days31to60: shaped(b2), over60: shaped(b3) },
  };
}

/**
 * Money in and out by month: what came in and what went out in each month of
 * a window, the two totals and their difference, and each figure as basis
 * points of the window's largest monthly figure on either series — one scale,
 * so the two lines are comparable — for a chart that draws plain numbers.
 */
export interface MonthFigures {
  readonly month: string;
  readonly label: string;
  readonly collected: Paise;
  readonly paidOut: Paise;
}

export interface MonthSeries {
  readonly months: ReadonlyArray<{
    readonly month: string;
    readonly label: string;
    readonly collected: string;
    readonly paidOut: string;
    readonly collectedIndex: number;
    readonly paidOutIndex: number;
  }>;
  readonly collected: string;
  readonly paidOut: string;
  readonly net: string;
  /** The axis: quarters of the peak, each at its index with the figure the tick prints. Empty for a window with nothing in it. */
  readonly ticks: ReadonlyArray<{ readonly index: number; readonly wire: string }>;
}

export function monthSeries(months: readonly MonthFigures[]): MonthSeries {
  let peak: Paise = ZERO;
  for (const m of months) {
    if (m.collected > peak) peak = m.collected;
    if (m.paidOut > peak) peak = m.paidOut;
  }
  const index = (v: Paise): number => (peak === ZERO || v <= ZERO ? 0 : shareBasisPoints(v, peak));
  const collected = sum(months.map((m) => m.collected));
  const paidOut = sum(months.map((m) => m.paidOut));
  return {
    months: months.map((m) => ({
      month: m.month,
      label: m.label,
      collected: toWire(m.collected),
      paidOut: toWire(m.paidOut),
      collectedIndex: index(m.collected),
      paidOutIndex: index(m.paidOut),
    })),
    collected: toWire(collected),
    paidOut: toWire(paidOut),
    net: toWire(sub(collected, paidOut)),
    // a quarter of the peak is a share of money — `mulRatio` with the plain
    // paise boundary: an axis label, not a statutory figure
    ticks:
      peak === ZERO
        ? []
        : [1n, 2n, 3n, 4n].map((k) => ({ index: Number(k) * 2500, wire: toWire(mulRatio(peak, ratio(k, 4n), roundToPaise)) })),
  };
}

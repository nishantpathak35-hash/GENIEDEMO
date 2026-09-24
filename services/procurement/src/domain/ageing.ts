import type { Paise } from '@cog/contracts';
import { ZERO, add, shareBasisPoints, sum, toWire } from '@cog/money';

/**
 * What the firm owes vendors, in ageing buckets — current (not yet due), then
 * overdue by 1 to 30, 31 to 60 and over 60 days past the bill's due date.
 *
 * The same buckets finance draws for receivables (`services/finance/src/domain/ageing.ts`),
 * kept here rather than imported because no service imports another: each
 * side of the ledger owns its rule and its test. Shares go through
 * `shareBasisPoints`, the one exact division of money into a share, truncated
 * to two decimals for a bar — a display width, never a figure a screen adds.
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
  return {
    total: toWire(total),
    openCount: open.length,
    overdue: shaped({ count: b1.count + b2.count + b3.count, total: add(add(b1.total, b2.total), b3.total) }),
    buckets: { current: shaped(current), days1to30: shaped(b1), days31to60: shaped(b2), over60: shaped(b3) },
  };
}

/**
 * Spend by trade package: every order not cancelled, gross, by the trade its
 * lines name — the top five and the rest as one, each with its share of the
 * whole. A line that names no trade is "Unassigned", kept apart rather than
 * folded into a trade. Ties break by code so the answer is stable.
 */
export interface TradeSpend {
  readonly tradeCode: string | null;
  readonly gross: Paise;
}

export interface SpendByTrade {
  readonly total: string;
  readonly items: ReadonlyArray<{ readonly tradeCode: string | null; readonly label: string; readonly gross: string; readonly pct: number }>;
  readonly rest: { readonly count: number; readonly gross: string; readonly pct: number };
}

export const UNASSIGNED_LABEL = 'Unassigned';
export const TOP_TRADES = 5;

export function spendByTrade(rows: readonly TradeSpend[], labelOf: (code: string) => string, top = TOP_TRADES): SpendByTrade {
  const byCode = new Map<string | null, Paise>();
  for (const r of rows) byCode.set(r.tradeCode, add(byCode.get(r.tradeCode) ?? ZERO, r.gross));
  const sorted = [...byCode]
    .filter(([, gross]) => gross > ZERO)
    .sort((a, b) => (a[1] > b[1] ? -1 : a[1] < b[1] ? 1 : (a[0] ?? '').localeCompare(b[0] ?? '')));
  const total = sum(sorted.map(([, g]) => g));
  const shown = sorted.slice(0, top);
  const rest = sorted.slice(top);
  const restGross = sum(rest.map(([, g]) => g));
  return {
    total: toWire(total),
    items: shown.map(([code, gross]) => ({
      tradeCode: code,
      label: code === null ? UNASSIGNED_LABEL : labelOf(code),
      gross: toWire(gross),
      pct: sharePct(gross, total),
    })),
    rest: { count: rest.length, gross: toWire(restGross), pct: sharePct(restGross, total) },
  };
}

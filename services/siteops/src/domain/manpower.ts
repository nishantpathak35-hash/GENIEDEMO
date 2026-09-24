/**
 * COMMIT 2 OF 2 — DPR manpower counting, corrected.
 *
 * Closes **DPR-01 … DPR-03** from `docs/STACK-MIGRATION.md`. The verbatim port
 * is in `manpower-legacy.ts` with its own tests, and the legacy values are kept
 * there as a recorded divergence.
 *
 * A daily progress report is not an internal note. It is signed at site, it
 * supports a progress claim, and its headcount feeds a client bill — so a
 * malformed entry has to be refused, not silently counted as zero.
 */

export interface ManpowerEntry {
  readonly trade: string;
  readonly count: number;
}

export interface Floor {
  readonly name: string;
  readonly manpower: readonly ManpowerEntry[];
}

export class ManpowerError extends Error {
  override readonly name = 'ManpowerError';
}

/**
 * A headcount is a whole, non-negative number of people.
 *
 * **Fixes DPR-01.** `parseInt` is lenient: `'12 workers'` is 12, `'1.9'` is 1,
 * `'0x10'` is 16. None of those is a headcount anyone typed on purpose, and
 * accepting a prefix of free text is how a wrong number gets signed off at
 * site. This accepts a number, and only a whole non-negative one.
 *
 * **Fixes DPR-02.** No `|| 0`. A malformed entry raises rather than quietly
 * lowering the reported figure — under-reporting labour on a document that
 * supports a progress claim is worse than failing loudly.
 *
 * **Fixes DPR-03.** A negative count is refused rather than subtracting from
 * the total.
 */
export function headcount(value: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ManpowerError(`a headcount must be a whole number, got ${String(value)}`);
  }
  if (value < 0) {
    throw new ManpowerError('a headcount cannot be negative');
  }
  return value;
}

export function floorManpower(floor: Floor): number {
  let total = 0;
  for (const entry of floor.manpower) {
    if (entry.trade.trim() === '') {
      // An unlabelled count cannot be reconciled against a subcontractor's
      // attendance, which is what the figure is used for.
      throw new ManpowerError(`a manpower entry on ${floor.name} has no trade`);
    }
    total += headcount(entry.count);
  }
  return total;
}

export function overallManpower(floors: readonly Floor[]): number {
  return floors.reduce((sum, floor) => sum + floorManpower(floor), 0);
}

/**
 * Manpower broken down by trade across the whole report.
 *
 * Not in the legacy, which only ever produces a single total. A total alone
 * cannot be reconciled against subcontractor attendance or used to spot that a
 * trade was recorded twice on two floors, which is what the site team actually
 * needs from the number.
 */
export function manpowerByTrade(floors: readonly Floor[]): ReadonlyMap<string, number> {
  const byTrade = new Map<string, number>();
  for (const floor of floors) {
    for (const entry of floor.manpower) {
      const trade = entry.trade.trim();
      if (trade === '') throw new ManpowerError(`a manpower entry on ${floor.name} has no trade`);
      byTrade.set(trade, (byTrade.get(trade) ?? 0) + headcount(entry.count));
    }
  }
  return byTrade;
}

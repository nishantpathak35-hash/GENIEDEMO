import type { BasisPoints } from '@cog/contracts';

/**
 * Effective-dated rate lookup.
 *
 * **This file contains the mechanism. It contains no real rate.**
 *
 * ADR-0014 requires rates to be time-versioned: TDS rates change every Budget,
 * and a voucher raised in FY2024-25 must compute under FY2024-25 rules forever.
 * The legacy schema gestures at this — `tds_sections` carries `effective_from`
 * and `effective_to` columns — and **no query filters on either**, while a
 * second, hardcoded rate map in `tdsChallan281.js` disagrees with the table.
 * Two sources of truth, neither time-aware.
 *
 * Every rate value is deferred to M2.5 and question **CA-05**, which records
 * that legacy holds two disagreeing tables and that every value in them should
 * be treated as stale. The rates used in this package's tests are deliberately
 * absurd — 10% and 20% flat, effective from 1999 — so that no one can mistake a
 * fixture for a verified figure. A plausible-looking placeholder is the thing
 * that gets promoted by accident.
 */

/** ISO date, `YYYY-MM-DD`. The date the rule applies from, inclusive. */
export type EffectiveDate = string;

export type Provenance = 'provisional' | 'verified';

export interface RateRow<Key extends string = string> {
  /** What this rate is for — a TDS section, a GST slab, a cess. */
  readonly key: Key;
  /** Who it applies to. TDS differs by payee class; GST does not use this. */
  readonly payeeClass?: string;
  readonly rate: BasisPoints;
  readonly effectiveFrom: EffectiveDate;
  /** Exclusive. `null` means "still in force". */
  readonly effectiveTo: EffectiveDate | null;
  /**
   * **Only a human may set this to `verified`.**
   *
   * `provisional` means we wrote it from statute text or inference and it is
   * not evidence. `verified` means a named chartered accountant signed it off,
   * on a date, against a cited statute.
   */
  readonly status: Provenance;
  readonly statute?: string;
  readonly verifiedBy?: string;
  readonly verifiedOn?: EffectiveDate;
  /** The `CA-nn` id in docs/statutory/QUESTIONS-FOR-CA.md. */
  readonly questionRef?: string;
}

export class RateLookupError extends Error {
  override readonly name = 'RateLookupError';
}

/**
 * Find the rate in force for a key on a given date.
 *
 * **Throws when no row matches.** It does not fall back to a default, to the
 * most recent row, or to zero. A missing rate is a missing rule, and the legacy
 * `Number(value) || 0` habit — turning absent data into a silent zero — is
 * exactly how a return gets filed with no tax on it.
 */
export function rateOn<Key extends string>(
  table: readonly RateRow<Key>[],
  key: Key,
  on: EffectiveDate,
  payeeClass?: string,
): RateRow<Key> {
  assertIsoDate(on);

  const matches = table.filter(
    (r) =>
      r.key === key &&
      (r.payeeClass === undefined || r.payeeClass === payeeClass) &&
      r.effectiveFrom <= on &&
      (r.effectiveTo === null || on < r.effectiveTo),
  );

  if (matches.length === 0) {
    throw new RateLookupError(
      `no rate for ${key}${payeeClass === undefined ? '' : ` / ${payeeClass}`} in force on ${on}`,
    );
  }
  if (matches.length > 1) {
    // Overlapping rows mean two rules claim the same day. Picking one silently
    // is how a rate change lands a day early for half the vouchers.
    throw new RateLookupError(
      `overlapping rates for ${key} on ${on}: ${matches.length} rows match`,
    );
  }
  return matches[0] as RateRow<Key>;
}

/**
 * Every row a caller is about to rely on, that no CA has signed.
 *
 * This is what an API surface calls before it lets a figure reach a document.
 * Used by the M3 endpoints to refuse to *file* anything computed from an
 * unverified rate, while still allowing the pipeline to be exercised end to
 * end in development.
 */
export function unverified<Key extends string>(
  table: readonly RateRow<Key>[],
): readonly RateRow<Key>[] {
  return table.filter((r) => r.status !== 'verified');
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(value: string): void {
  if (!ISO_DATE.test(value)) {
    throw new RateLookupError(`not an ISO date: ${JSON.stringify(value)}`);
  }
}

/**
 * The Indian financial year containing a date: 1 April to 31 March.
 *
 * Returned as `"2024-25"`, which is how every return, challan and circular
 * refers to it. A rate lookup keyed on the calendar year would put a
 * 15 March voucher in the wrong year.
 */
export function financialYearOf(on: EffectiveDate): string {
  assertIsoDate(on);
  const year = Number(on.slice(0, 4));
  const month = Number(on.slice(5, 7));
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

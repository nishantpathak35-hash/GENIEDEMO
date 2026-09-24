import type { BasisPoints, Paise } from '@cog/contracts';
import { add, mulRate, roundToPaise } from '@cog/money';

/**
 * COMMIT 2 OF 2 — the corrected CPWD/DSR 4-factor rate engine.
 *
 * The verbatim port is in `rate-analysis-legacy.ts` with its own tests. This
 * file closes the defects recorded as **RATE-01 … RATE-03** in
 * `docs/STACK-MIGRATION.md`; each is named at the line that fixes it, so a
 * figure that differs from the legacy system can be traced to a specific
 * change rather than to "the rewrite".
 *
 * `docs/ports/cpwd-rate-engine.md` has the full note.
 *
 * ---
 *
 * **This engine computes a rate. It does not decide what the rate means.**
 * Whether a BOQ line rate should be tax-inclusive at all is **PO-16** and is
 * open — so this returns the pre-tax rate and the tax separately, and leaves
 * the composition to the caller. The legacy stores `final_rate_with_gst` and
 * then uses it as a BOQ unit rate, embedding tax inside a rate; reproducing
 * that would bake an unanswered question into the schema.
 *
 * Overhead and margin percentages are **inputs**, not constants. The legacy
 * defaults (6% overhead, 15% margin) are commercial seed configuration per
 * tenant — **PO-15**, unanswered — not properties of the formula.
 */

export interface RateAnalysisInput {
  readonly materialCost: Paise;
  readonly labourCost: Paise;
  readonly equipmentCost: Paise;
  readonly overheadRate: BasisPoints;
  readonly marginRate: BasisPoints;
}

export interface RateAnalysis {
  readonly directCost: Paise;
  readonly overhead: Paise;
  readonly costWithOverhead: Paise;
  readonly margin: Paise;
  /** The rate BEFORE tax. Tax is the caller's composition — see PO-16. */
  readonly baseRate: Paise;
}

/**
 * Direct cost, overhead, margin — each rounded once, at paise precision.
 *
 * **Fixes RATE-01.** The legacy rounds `baseRate` to whole rupees mid-formula
 * and then applies GST to the rounded figure, which is why its two code paths
 * produce 481 and 482 for the same input. Here every step rounds to paise —
 * the smallest representable amount — so nothing is discarded before the end,
 * and a document-level rounding boundary is applied later by whoever issues the
 * document.
 *
 * **Fixes RATE-02.** The inputs are `Paise` — a branded `bigint` — so a
 * malformed value cannot reach this function at all. There is no coercion, no
 * `|| 0` fallback, and therefore no path by which `'12,500'` becomes NaN or a
 * missing cost becomes a free line item. Parsing happens once, at the edge, in
 * `packages/money`, and throws.
 *
 * **Fixes RATE-03** by omission: there is no GST here to default to 18%. A
 * zero-rated supply is expressible because the tax rate is the caller's.
 */
export function analyseRate(input: RateAnalysisInput): RateAnalysis {
  const directCost = add(add(input.materialCost, input.labourCost), input.equipmentCost);
  const overhead = mulRate(directCost, input.overheadRate, roundToPaise);
  const costWithOverhead = add(directCost, overhead);
  const margin = mulRate(costWithOverhead, input.marginRate, roundToPaise);
  const baseRate = add(costWithOverhead, margin);

  return { directCost, overhead, costWithOverhead, margin, baseRate };
}

/**
 * A BOQ line: quantity × the analysed rate.
 *
 * Kept separate from `analyseRate` because the legacy conflates them — its BOQ
 * import (`boq.js:365`) hardcodes quantity to 1 and uses the tax-inclusive rate
 * as the line amount, so a rate and a line total are the same value and neither
 * can be reasoned about.
 */
export function lineAmount(baseRate: Paise, quantityMillionths: bigint): Paise {
  if (quantityMillionths < 0n) throw new RangeError('quantity must not be negative');
  return roundToPaise(baseRate * quantityMillionths, 1_000_000n);
}

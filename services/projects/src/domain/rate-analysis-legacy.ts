/**
 * COMMIT 1 OF 2 — the CPWD/DSR 4-factor rate engine, ported VERBATIM.
 *
 * **This file reproduces the legacy behaviour including its defects. Do not
 * "improve" it.** The corrected engine lands in commit 2, in
 * `rate-analysis.ts`, with its own tests. Fixing while porting would destroy
 * the only way to tell whether a figure that differs from the legacy system
 * differs because the port was wrong or because the fix was right
 * (ADR-0014 decision 5).
 *
 * Source: `_legacy/atelier-current/app/lib/estimationCalculations.js:5-33`,
 * which is the **authoritative** path — `app/lib/api/estimation.js:43,81` calls
 * it and stores the result in `estimation_items.base_rate` and
 * `.final_rate_with_gst`.
 *
 * See `docs/ports/cpwd-rate-engine.md` for the full note, including the two
 * other implementations that disagree with this one.
 *
 * Defects carried over deliberately, each with a row in
 * `docs/STACK-MIGRATION.md`:
 *
 *   1. **Mid-formula rounding.** `baseRate` is rounded to whole rupees BEFORE
 *      GST is applied, so GST is charged on a rounded figure.
 *   2. **`Number(x || 0)`.** A malformed or missing cost silently becomes zero
 *      rather than raising.
 *   3. **Floating point throughout.** The legacy columns are `REAL`.
 *   4. **GST folded into a "rate".** `finalRateWithGst` is stored and then used
 *      as a BOQ unit rate (`boq.js:365`), embedding tax in a rate.
 *
 * It exists to be *compared against*, not to be called by new code. Nothing in
 * `services/projects/src/index.ts` exports it.
 */

export interface LegacyRateInput {
  readonly material_cost?: unknown;
  readonly materialCost?: unknown;
  readonly labour_cost?: unknown;
  readonly labourCost?: unknown;
  readonly equipment_cost?: unknown;
  readonly equipmentCost?: unknown;
  readonly overhead_pct?: unknown;
  readonly overheadPct?: unknown;
  readonly margin_pct?: unknown;
  readonly marginPct?: unknown;
  readonly gst_pct?: unknown;
  readonly gstPct?: unknown;
}

export interface LegacyRateBreakdown {
  readonly directCost: number;
  readonly overheadAmt: number;
  readonly marginAmt: number;
  readonly baseRate: number;
  readonly gstAmt: number;
  readonly finalRateWithGst: number;
}

/**
 * Verbatim transcription of `calculateEstimationRateBreakdown`.
 *
 * Every line corresponds to a line in the original. The `||` fallbacks, the
 * `Number()` coercion, the mid-formula `Math.round` and the float arithmetic
 * are all reproduced exactly — including the fact that `0` is falsy, so an
 * explicit zero cost falls through to the next alternative and then to the
 * default.
 */
export function calculateEstimationRateBreakdownLegacy(
  item: LegacyRateInput = {},
): LegacyRateBreakdown {
  // Read as an untyped bag, deliberately: the legacy takes whichever of two
  // casings is truthy off an unvalidated payload, and reproducing that
  // faithfully means reproducing the absence of types too. The corrected engine
  // in rate-analysis.ts takes branded Paise and has no such escape.
  const it = item as Record<string, unknown>;

  const mat = Number(it['material_cost'] || it['materialCost'] || 0);
  const lab = Number(it['labour_cost'] || it['labourCost'] || 0);
  const eqp = Number(it['equipment_cost'] || it['equipmentCost'] || 0);

  const directCost = mat + lab + eqp;

  const overheadPct = Number(it['overhead_pct'] || it['overheadPct'] || 0);
  const marginPct = Number(it['margin_pct'] || it['marginPct'] || 0);
  // The legacy default. Not a statutory finding — CA-16 covers the real rate.
  const gstPct = Number(it['gst_pct'] || it['gstPct'] || 18);

  const overheadAmt = directCost * (overheadPct / 100);
  const costWithOverhead = directCost + overheadAmt;

  const marginAmt = costWithOverhead * (marginPct / 100);
  // DEFECT 1: rounded here, before GST. estimationCalculations.js:20
  const baseRate = Math.round(costWithOverhead + marginAmt);

  // DEFECT 1 (continued): GST applied to the ROUNDED base. :22
  const gstAmt = baseRate * (gstPct / 100);
  const finalRateWithGst = Math.round(baseRate + gstAmt);

  return { directCost, overheadAmt, marginAmt, baseRate, gstAmt, finalRateWithGst };
}

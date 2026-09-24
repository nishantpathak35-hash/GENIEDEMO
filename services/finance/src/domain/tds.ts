import type { BasisPoints, Paise } from '@cog/contracts';
import { ZERO, add, compare, mulRate, roundToPaise, sub, sum } from '@cog/money';
import type { RoundingBoundary } from '@cog/money';

/**
 * TDS deduction — the mechanism only.
 *
 * **No rate, no threshold and no section code appears in this file.** All three
 * are inputs, because all three are unsettled:
 *
 * | Question | What is open |
 * |---|---|
 * | CA-05 | The rate table itself. Legacy holds two disagreeing tables; treat every value as stale |
 * | CA-06 | 194C aggregate thresholds — single vs annual, behaviour on mid-year crossing, per PAN or per vendor |
 * | CA-07 | Deductee classification, no-PAN higher rate under 206AA, the 194C(6) transporter declaration |
 * | CA-08 | Whether the base excludes GST for works contracts and composite orders |
 * | CA-09 | The deduction event — credit or payment, whichever is earlier — and which workflow step that maps to |
 *
 * What the code can express exactly, and does, is *where the rounding happens*
 * and *what the base is composed of*. Those are the parts a CA answer
 * parameterises rather than rewrites.
 */

export interface DeductionBase {
  /** The taxable value of the supply, excluding tax. */
  readonly taxable: Paise;
  /** GST charged on it. Carried separately precisely so it can be excluded. */
  readonly gst: Paise;
}

/**
 * The amount TDS is computed on.
 *
 * HUMAN(CA-08): the base **excludes GST** here. That follows CBDT Circular
 * 23/2017, which directs that tax be deducted on the amount excluding the GST
 * component *where that component is shown separately on the invoice* — and in
 * this system it always is, because `services/procurement` computes and stores
 * it as a distinct figure.
 *
 * It is not settled for works contracts and composite orders, which is what
 * this product mostly issues. If the answer is "include GST", every deduction
 * is understated by the tax on the tax, and the difference is a short-deduction
 * exposure rather than a rounding difference.
 *
 * The legacy code computes TDS on `subtotal`, which excludes GST — so this
 * matches its behaviour. Matching legacy is not evidence of correctness; it is
 * recorded here only so that a divergence later is traceable to a decision
 * rather than to a bug.
 */
export function deductionBase(base: DeductionBase, includeGst: boolean): Paise {
  return includeGst ? add(base.taxable, base.gst) : base.taxable;
}

export interface DeductionInput {
  readonly base: DeductionBase;
  readonly rate: BasisPoints;
  /** CA-08. Explicit at every call site; there is deliberately no default. */
  readonly includeGst: boolean;
  /**
   * CA-03, answered in the CA answers document (provisional): s.288B applies to
   * the challan, not to each deduction, so a deduction passes
   * `roundTdsDeductionToPaise` and keeps its computed amount to the paise.
   */
  readonly boundary: RoundingBoundary;
}

export interface Deduction {
  readonly base: Paise;
  readonly rate: BasisPoints;
  readonly tds: Paise;
  /** What the vendor is actually paid. */
  readonly netPayable: Paise;
}

export function computeDeduction(input: DeductionInput): Deduction {
  const base = deductionBase(input.base, input.includeGst);
  const tds = mulRate(base, input.rate, input.boundary);

  // Net of the WHOLE invoice, not of the base: the vendor is paid the gross
  // amount less the tax withheld, and GST is part of what they are owed even
  // when it is excluded from the deduction base.
  const gross = add(input.base.taxable, input.base.gst);
  return { base, rate: input.rate, tds, netPayable: sub(gross, tds) };
}

// ------------------------------------------------------------ thresholds --

export interface ThresholdRule {
  /** Deduct once any single payment exceeds this. */
  readonly singlePayment: Paise;
  /** Deduct once the aggregate for the year exceeds this. */
  readonly annualAggregate: Paise;
}

export interface ThresholdState {
  /** Total already paid to this deductee in the financial year, before this one. */
  readonly aggregateSoFar: Paise;
}

export type ThresholdOutcome =
  | { readonly deduct: false; readonly reason: 'below-both-thresholds' }
  | { readonly deduct: true; readonly reason: 'single-payment' | 'annual-aggregate' };

/**
 * Whether a payment crosses a deduction threshold.
 *
 * **The legacy system tracks no thresholds at all** — ADR-0014 records the
 * absence, and `STACK-MIGRATION.md` lists it among the statutory defects. So
 * there is nothing to port and no legacy behaviour to preserve; this is new,
 * and it is deliberately a pure function of explicit state so that the hard
 * part — knowing what `aggregateSoFar` is — stays visible at the call site
 * rather than hidden in a query.
 *
 * HUMAN(CA-06): unsettled, and the unsettled parts change the answer:
 *   - whether the aggregate is per PAN or per vendor record (a vendor with two
 *     records under one PAN would otherwise get two thresholds);
 *   - what happens to earlier, below-threshold payments once the aggregate is
 *     crossed — the common reading is that tax becomes deductible on the whole
 *     aggregate including them, which this function does NOT yet express;
 *   - whether the year is the financial year, which `financialYearOf` assumes.
 */
export function thresholdOutcome(
  payment: Paise,
  rule: ThresholdRule,
  state: ThresholdState,
): ThresholdOutcome {
  if (compare(payment, rule.singlePayment) > 0) {
    return { deduct: true, reason: 'single-payment' };
  }
  if (compare(add(state.aggregateSoFar, payment), rule.annualAggregate) > 0) {
    return { deduct: true, reason: 'annual-aggregate' };
  }
  return { deduct: false, reason: 'below-both-thresholds' };
}

/** Aggregate of prior payments, for threshold evaluation. Exact. */
export function aggregate(payments: readonly Paise[]): Paise {
  return payments.length === 0 ? ZERO : sum(payments);
}

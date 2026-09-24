import type { Paise } from '@cog/contracts';

/**
 * Statutory rounding boundaries.
 *
 * Each boundary is its own exported function carrying its citation, rather than
 * a shared helper parameterised by a constant. That is deliberate: when a
 * chartered accountant corrects one of these in M2.5, the correction is one
 * function body plus a golden-file regeneration, and it cannot silently change
 * the others.
 *
 * A boundary receives the amount as an EXACT RATIONAL — numerator and
 * denominator in paise — not as a pre-divided value. Rounding must happen
 * exactly once, from the exact product. The legacy estimation engine rounds
 * `baseRate` to whole rupees mid-formula and then applies GST to the rounded
 * figure; that is why its server and client implementations disagree on 132 of
 * 300 sampled inputs.
 */
export type RoundingBoundary = (numerator: bigint, denominator: bigint) => Paise;

/**
 * Round the exact rational `numerator / denominator` paise to the nearest
 * multiple of `unit` paise, with halves going AWAY FROM ZERO.
 *
 * Half-away-from-zero is chosen over JavaScript's native behaviour on purpose.
 * `Math.round(-0.5)` is `-0`: it rounds halves toward +infinity, so a credit
 * note would round in the opposite direction to the invoice it reverses and the
 * two would differ by a rupee. Every statute cited below is phrased for
 * positive amounts ("if such part is fifty paise or more, increase to one
 * rupee"), so the negative case is OUR convention, chosen for symmetry.
 *
 * HUMAN(CA-01): confirm the negative-amount convention with the CA alongside the
 * rest of the rule spec. Symmetric rounding is the defensible default, not a
 * statutory finding.
 */
function roundAwayFromZero(numerator: bigint, denominator: bigint, unit: bigint): Paise {
  if (denominator <= 0n) {
    throw new RangeError(`denominator must be positive, got ${denominator.toString()}`);
  }
  if (unit <= 0n) {
    throw new RangeError(`rounding unit must be positive, got ${unit.toString()}`);
  }

  const scaled = denominator * unit;
  const quotient = numerator / scaled; // bigint division truncates toward zero
  const remainder = numerator % scaled; // sign follows the numerator

  if (remainder === 0n) return (quotient * unit) as Paise;

  const twiceRemainder = (remainder < 0n ? -remainder : remainder) * 2n;
  const roundsUp = twiceRemainder >= scaled;
  if (!roundsUp) return (quotient * unit) as Paise;

  const step = numerator < 0n ? -1n : 1n;
  return ((quotient + step) * unit) as Paise;
}

/**
 * The exact rational, with everything below `unit` paise dropped — toward zero,
 * never rounded. The "ignore" half of a rule that ignores a part before it
 * rounds the rest.
 */
function dropBelow(numerator: bigint, denominator: bigint, unit: bigint): Paise {
  if (denominator <= 0n) {
    throw new RangeError(`denominator must be positive, got ${denominator.toString()}`);
  }
  if (unit <= 0n) {
    throw new RangeError(`rounding unit must be positive, got ${unit.toString()}`);
  }
  // bigint division truncates toward zero.
  return ((numerator / (denominator * unit)) * unit) as Paise;
}

/** One rupee, in paise. */
const RUPEE = 100n;

/** Ten rupees, in paise. */
const TEN_RUPEES = 1000n;

/**
 * Round to whole paise — the smallest representable amount.
 *
 * **Not a statutory boundary.** It is the commercial line-level convention, and
 * it exists because every external format this system must emit carries
 * paise-precision LINE values and a separate document-level round-off: the
 * e-invoice IRP schema wants 2-decimal item tax with the rupee rounding in
 * `RndOffAmt`, GSTR-1 B2B tables are 2-decimal, and Tally books line tax in
 * paise against a Round Off ledger.
 *
 * Without this boundary the only rounding available is to the rupee, so a
 * developer computing a line would either apply Sec 170 per line — which is
 * wrong, and drifts (40 lines of ₹5.00 at 9% give ₹0 per line against ₹18 for
 * the invoice) — or bypass the package entirely, which is worse.
 *
 * CA-02 is answered (the CA answers document, provisional): a GST head keeps its
 * calculated value to the paise (`roundGstHeadToPaise`), and only the invoice
 * total is rounded to the rupee (`roundInvoiceTotalSec170`), once, with the
 * difference on its own round-off line.
 */
export const roundToPaise: RoundingBoundary = (numerator, denominator) =>
  roundAwayFromZero(numerator, denominator, 1n);

/**
 * **A GST head on a tax invoice — CGST, SGST or IGST — to the paise: the CA's
 * answer to CA-02** (CA answers document, reviewed by the CA; CA details to
 * follow; provisional).
 *
 * "The taxable/basic value and the GST components shall retain their calculated
 * values and shall not be individually rounded to the nearest rupee." So a head
 * is rounded only as far as money is held — to whole paise, halves away from
 * zero (CA-01) — which is also the precision the e-invoice schema and GSTR-1
 * carry. The rupee rounding belongs to the invoice total, once.
 */
export const roundGstHeadToPaise: RoundingBoundary = (numerator, denominator) =>
  roundAwayFromZero(numerator, denominator, 1n);

/**
 * **A tax invoice's total, to the rupee — Section 170, CGST Act 2017, where the
 * CA's answer to CA-02 applies it** (CA answers document; provisional).
 *
 * Section 170: "The amount of tax, interest, penalty, fine or any other sum
 * payable ... shall be rounded off to the nearest rupee and where such amount
 * contains a part of a rupee consisting of paise, if such part is fifty paise or
 * more, it shall be increased to one rupee and if such part is less than fifty
 * paise it shall be ignored."
 *
 * The answer: "Rounding shall be applied only to the final total invoice value
 * ... Any round-off adjustment will therefore be posted only at the
 * invoice-total level." So it is applied once — to the taxable value plus every
 * head — never to a head and never per line, and the difference is the
 * invoice's round-off line.
 */
export const roundInvoiceTotalSec170: RoundingBoundary = (numerator, denominator) =>
  roundAwayFromZero(numerator, denominator, RUPEE);

/**
 * **A TDS deduction, to the paise — the CA's answer to CA-03** (CA answers
 * document, reviewed by the CA; CA details to follow; provisional).
 *
 * "Section 288B rounding to the nearest ₹10 should be applied to the amount
 * payable under the Income-tax Act at the challan / final tax-payable level, not
 * independently to every vendor-payment TDS deduction. Individual voucher
 * deductions should retain the actual computed TDS amount required for vendor
 * and return reconciliation."
 *
 * So a deduction is rounded only as far as money can be held — to whole paise,
 * halves away from zero (CA-01) — and the ₹10 rounding happens once, on the
 * challan.
 */
export const roundTdsDeductionToPaise: RoundingBoundary = (numerator, denominator) =>
  roundAwayFromZero(numerator, denominator, 1n);

/**
 * **A TDS challan's amount — Section 288B, Income-tax Act 1961, as the CA's
 * answer to CA-04 applies it** (CA answers document, reviewed by the CA; CA
 * details to follow; provisional).
 *
 * Section 288B: "Any amount payable, and the amount of refund due, under the
 * provisions of this Act shall be rounded off to the nearest multiple of ten
 * rupees and for this purpose any part of ten rupees shall, if such part is five
 * rupees or more, be increased to ten rupees and if such part is less than five
 * rupees be ignored."
 *
 * The answer: "ignore paise first and then round the rupee amount to the
 * nearest multiple of ₹10; where the last rupee digit is 5 or more, round up to
 * the next ₹10, otherwise round down to the previous ₹10." So, in that order:
 * the paise are dropped, toward zero, and the whole rupees are rounded to ten,
 * five up (away from zero for a negative amount, CA-01). ITNS-281 has no paise
 * column, and the amount carries none.
 *
 * The two steps give the figure rounding the exact amount to ten rupees would —
 * a part of ten rupees is five or more exactly when its whole rupees are — and
 * they are written in the answer's order so the function reads as the rule.
 */
export const roundChallanSec288B: RoundingBoundary = (numerator, denominator) =>
  roundAwayFromZero(dropBelow(numerator, denominator, RUPEE), 1n, TEN_RUPEES);

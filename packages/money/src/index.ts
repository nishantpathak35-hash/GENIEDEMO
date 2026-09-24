/**
 * `packages/money` — the only module permitted to multiply or divide money.
 *
 * See ADR-0012 and docs/plans/M1.md D1/D2.
 *
 * Rates are exact rationals (`Ratio`); `BasisPoints` is sugar for the common
 * case and `mulRate` is a thin wrapper over `mulRatio`. See D1 in
 * docs/plans/M1.md for why integer basis points were not enough.
 *
 * Deliberately NOT here yet: allocation of a rounded total across N line items
 * so the parts sum exactly to the whole. It needs a decision about where the
 * residual lands (first line, last line, largest line), that decision shows up
 * on an invoice, and there is no consumer yet to make it concrete.
 */

export {
  ZERO,
  RUPEE,
  paise,
  bp,
  fromWire,
  toWire,
  fromRupeeString,
  toRupeeString,
  add,
  sub,
  negate,
  abs,
  sum,
  compare,
  isZero,
  isNegative,
} from './paise.js';

export {
  roundToPaise,
  roundGstHeadToPaise,
  roundInvoiceTotalSec170,
  roundTdsDeductionToPaise,
  roundChallanSec288B,
  type RoundingBoundary,
} from './rounding.js';

export { excessBasisPoints, mulRate, mulRatio, ratio, ratioOf, shareBasisPoints } from './rate.js';

/**
 * Display formatting — the only operation an app is permitted to perform on a
 * monetary value. Takes the WIRE STRING, not a `Paise`, so that reaching for a
 * formatter never puts a money type inside an app (see `format.ts`).
 */
export {
  MoneyFormatError,
  formatRupees,
  formatIndianRupees,
  formatIndianRupeesOrDash,
  formatCompactRupees,
  formatRupeesOrEmpty,
  formatQuantity,
  formatBasisPoints,
} from './format.js';

/**
 * Parsing what a person typed. The other half of the reason `apps/` can ban
 * `Number`, `parseInt` and `parseFloat` outright — a ban with no alternative
 * gets worked around.
 */
export {
  MoneyInputError,
  parseRupeesToWire,
  parseQuantityToParts,
  parseWholeNumber,
  parsePercentToBasisPoints,
} from './input.js';

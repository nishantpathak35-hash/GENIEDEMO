/**
 * Money and rate TYPES, and the wire shapes they travel in.
 *
 * This file deliberately contains no arithmetic, no parsing, and no runtime
 * dependency on `packages/money`.
 *
 * ADR-0012 puts the branded `Paise` type in `packages/contracts` and the
 * arithmetic in `packages/money`, which reads like a circular dependency and is
 * not: TypeScript types are erased at compile time, so declaring the brand here
 * emits nothing and costs nothing. What must never appear in this package is a
 * *value* — every function that PRODUCES a `Paise` (`fromWire`, `fromRupees`,
 * `mulRate`) lives in `packages/money`, because that is the only module
 * permitted to multiply or divide money.
 *
 * The schemas below therefore validate the WIRE SHAPE only and return strings.
 * They never transform into `Paise`; doing so would drag the parser in here.
 */

import { z } from 'zod';

// --- Branded types ------------------------------------------------------

declare const paiseBrand: unique symbol;

/**
 * An exact amount of Indian paise. 1 rupee = 100 paise.
 *
 * A branded `bigint`, not a branded `number`, and that is the enforcement
 * mechanism rather than a stylistic choice:
 *
 *   - `bigint * number` is a compile error AND a runtime TypeError, so a float
 *     cannot silently enter a monetary calculation.
 *   - `bigint * bigint` compiles, but yields an unbranded `bigint`, so the
 *     result cannot be assigned back into a `Paise` field without going through
 *     `packages/money`.
 *
 * The legacy app stored every monetary column as `REAL` and guarded it with
 * `Number(value) || 0`, which turns corrupt data into a silent zero. In a
 * statutory system that must throw. See ADR-0012.
 */
export type Paise = bigint & { readonly [paiseBrand]: 'Paise' };

declare const basisPointsBrand: unique symbol;

/**
 * A rate in basis points. 1 bp = 0.01%, so 100% = 10_000 bp.
 *
 * Integer basis points represent every rate this domain currently needs
 * exactly: TDS 194Q 0.1% = 10 bp, the 194C non-PAN/lower rate 0.75% = 75 bp,
 * GST 18% = 1800 bp, 206AA 20% = 2000 bp.
 *
 * Rates are not money and are never multiplied by each other here — a rate
 * applied to a rate (surcharge on tax) is a `packages/money` operation, because
 * the intermediate is a monetary amount with its own rounding boundary.
 */
export type BasisPoints = number & { readonly [basisPointsBrand]: 'BasisPoints' };

// --- Wire shapes --------------------------------------------------------

/**
 * Money on the wire: a digit-only string of paise, optionally negative.
 * `"1234500"` is ₹12,345.00. `"-5000"` is −₹50.00 (a credit note).
 *
 * JSON has no bigint, and `JSON.stringify` throws on one, so money crosses the
 * boundary as a string. This is NOT the round-trip ADR-0012 forbids: what it
 * forbids is a *formatted* string (`₹12,345.00`, Indian digit grouping) going
 * through `parseFloat`. This shape is canonical and unformatted by construction
 * — the regex rejects separators, decimal points, leading zeros and whitespace,
 * so a formatted string cannot be mistaken for one.
 *
 * Returns `string`. Converting to `Paise` is `fromWire` in `packages/money`.
 */
export const paiseWire = z
  .string()
  .regex(
    /^-?(0|[1-9][0-9]*)$/,
    'money must be a digit-only string of paise, e.g. "1234500" — no separators, decimal point, or currency symbol',
  );

export type PaiseWire = z.infer<typeof paiseWire>;

/**
 * A rate on the wire: a non-negative integer number of basis points.
 *
 * The upper bound is a sanity limit (10_000% ), not a statutory one. Rates above
 * 100% are real — s.201(1A) interest accrues at 1.5% per month and a long
 * default compounds past 100% — so capping at 10_000 bp would be wrong.
 */
export const basisPointsWire = z
  .number()
  .int('a rate must be a whole number of basis points (1 bp = 0.01%)')
  .min(0)
  .max(1_000_000);

export type BasisPointsWire = z.infer<typeof basisPointsWire>;

// --- Exact rates --------------------------------------------------------

/**
 * An exact rate, as a rational.
 *
 * **D1 amendment (2026-09-03).** `BasisPoints` remains the everyday form and
 * covers GST 18% = 1800 bp, TDS 194Q 0.1% = 10 bp and the rest. It cannot
 * represent three kinds of rate this domain reaches, and each of them is exact
 * as a ratio:
 *
 *   - **Sec 195 / Form 27Q composite rates.** A 10% base with 2% surcharge and
 *     4% cess is 10 x 1.02 x 1.04 = 10.608%, i.e. 1060.8 bp — not an integer.
 *     The 27Q return format's own rate field carries four decimals.
 *   - **Rule 35, CGST Rules** — tax from a tax-inclusive value is
 *     `rate / (100 + rate)`; 18/118 is recurring.
 *   - **Per-day interest** (Sec 50 CGST, Sec 201(1A)) — 18%/365 is recurring.
 *
 * A ratio is exact for all three. `den` must be positive; the sign lives in
 * `num`.
 */
export interface Ratio {
  readonly num: bigint;
  readonly den: bigint;
}

/** Wire form of an exact rate: both parts as digit-only strings. */
export const ratioWire = z.object({
  num: z.string().regex(/^-?(?:0|[1-9][0-9]*)$/),
  den: z.string().regex(/^[1-9][0-9]*$/, 'denominator must be a positive integer'),
});

export type RatioWire = z.infer<typeof ratioWire>;

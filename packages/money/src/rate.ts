import type { BasisPoints, Paise, Ratio } from '@cog/contracts';
import type { RoundingBoundary } from './rounding.js';

/** Basis points in 100%. */
const BP_SCALE = 10_000n;

/**
 * Construct an exact rate.
 *
 * The sign lives in `num`; `den` must be positive, so that "is this negative"
 * is one comparison rather than two.
 */
export function ratio(num: bigint, den: bigint): Ratio {
  if (typeof num !== 'bigint' || typeof den !== 'bigint') {
    throw new TypeError('ratio() takes bigints');
  }
  if (den <= 0n) {
    throw new RangeError(`ratio denominator must be positive, got ${den.toString()}`);
  }
  return { num, den };
}

/**
 * Apply an exact rate to an amount, rounding at a named statutory boundary.
 *
 * **This is the only multiplication of money in the system**, and the only
 * division. `mulRate` below is sugar over it.
 *
 * `boundary` is required and has no default. ADR-0012 asked that rounding
 * boundaries be "named, and carry the citation in a comment"; a comment is a
 * convention a hurried change can drop, whereas a required parameter is a
 * compiler error. It is not possible to multiply money in this codebase without
 * saying, at the call site, which statute governs the rounding.
 *
 * The product is formed exactly and handed to the boundary undivided, so
 * rounding happens exactly once — never in an intermediate. The legacy
 * estimation engine rounds `baseRate` mid-formula and then applies GST to the
 * rounded figure, which is how its client and server implementations diverge on
 * 132 of 300 sampled inputs.
 */
export function mulRatio(amount: Paise, rate: Ratio, boundary: RoundingBoundary): Paise {
  if (typeof amount !== 'bigint') {
    throw new TypeError(`amount must be Paise (a bigint), got ${typeof amount}`);
  }
  if (rate.den <= 0n) {
    throw new RangeError('ratio denominator must be positive');
  }
  return boundary(amount * rate.num, rate.den);
}

/**
 * Apply a basis-point rate. Sugar for the common case.
 *
 * Basis points cover almost everything — GST 18% = 1800 bp, 194Q 0.1% = 10 bp,
 * 206AA 20% = 2000 bp. Where a rate is not a whole number of basis points (a
 * Sec 195 composite such as 10.608%, Rule 35's `rate/(100+rate)`, per-day
 * interest), use `mulRatio` with an exact `ratio` instead of rounding the rate.
 */
export function mulRate(
  amount: Paise,
  rate: BasisPoints,
  boundary: RoundingBoundary,
): Paise {
  if (!Number.isInteger(rate)) {
    throw new RangeError(`rate must be whole basis points, got ${String(rate)}`);
  }
  return mulRatio(amount, { num: BigInt(rate), den: BP_SCALE }, boundary);
}

/**
 * Divide money by money, exactly, yielding a dimensionless rate.
 *
 * This is where proration lives: an RA bill's share of a contract, a payment's
 * share of an invoice, exempt turnover over total turnover for a Rule 42 ITC
 * reversal. The result is a `Ratio`, not a number, so nothing is lost at the
 * point of division — the loss happens once, later, at a named boundary.
 */
export function ratioOf(numerator: Paise, denominator: Paise): Ratio {
  if (denominator === 0n) {
    throw new RangeError('cannot form a ratio with a zero denominator');
  }
  // Keep `den` positive by moving the sign into `num`.
  return denominator < 0n
    ? { num: -numerator, den: -denominator }
    : { num: numerator, den: denominator };
}

/**
 * How far `actual` sits above `baseline`, in whole basis points.
 *
 * `baseline` ₹100, `actual` ₹112.50 → `1250` (12.5%). Negative when `actual` is
 * below the baseline, which is a purchase order priced UNDER its rate contract
 * and is not a problem to report — the sign is kept so the caller decides, and
 * so a defect that flips the comparison shows up as a negative rather than as
 * silence.
 *
 * **Here rather than in a service, because this is a division of money.** The
 * ESLint guard bans `/` next to a money-named identifier in `apps/` and
 * `services/` alike, and the reason is not style: `excess / contractedRate` on
 * two `bigint`s type-checks, returns a `bigint`, and truncates — so a 250 bp
 * deviation and a 299 bp deviation both read as 2%. Doing it once, exactly,
 * where the type is understood is the alternative.
 *
 * **Truncated toward zero, and that is stated because it is not a statutory
 * boundary.** This figure is compared and displayed, never filed: it is not an
 * amount, it is not summed, and no rounding rule governs it. A deviation of
 * 249.9 bp reporting as 249 costs nothing; the same truncation applied to a tax
 * amount would be a short deduction, which is why `mulRatio` demands a named
 * boundary and this does not.
 */
export function excessBasisPoints(baseline: Paise, actual: Paise): number {
  if (typeof baseline !== 'bigint' || typeof actual !== 'bigint') {
    throw new TypeError('excessBasisPoints() takes Paise (bigints)');
  }
  if (baseline <= 0n) {
    // A zero or negative baseline has no meaningful percentage above it, and
    // returning 0 would read as "priced exactly on contract".
    throw new RangeError('a baseline of zero or less has no basis-point excess');
  }
  return Number(((actual - baseline) * 10_000n) / baseline);
}

/**
 * How much of `whole` is `part`, in whole basis points, FLOORED.
 *
 * `part` ₹73.5070 of every ₹100 → `7350`. The companion of
 * `excessBasisPoints`, for the case where the figure is a share rather than
 * an excess — a bar's width, a project's ordered-against-contract percent —
 * and where truncation toward zero would be the wrong direction: an excess of
 * −1500.01 bp truncates to −1500, which reads a project at 84.999% of its
 * contract as exactly at the 85% band that `projectHealth` says it has not
 * reached. Flooring the share keeps the two answers consistent.
 *
 * Display only, like `excessBasisPoints`: never summed, never filed, no
 * rounding boundary governs it. A `part` above `whole` reports above 10 000.
 */
export function shareBasisPoints(part: Paise, whole: Paise): number {
  if (typeof part !== 'bigint' || typeof whole !== 'bigint') {
    throw new TypeError('shareBasisPoints() takes Paise (bigints)');
  }
  if (whole <= 0n) {
    throw new RangeError('a whole of zero or less has no share');
  }
  if (part < 0n) {
    throw new RangeError('a negative part has no share');
  }
  return Number((part * 10_000n) / whole);
}

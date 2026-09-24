import type { BasisPoints, Paise } from '@cog/contracts';

/**
 * Construction, parsing and exact arithmetic for `Paise`.
 *
 * Note the import above is `import type`. With `verbatimModuleSyntax` it is
 * erased entirely, so this package has no *runtime* dependency on
 * `packages/contracts` at all — which is what keeps ADR-0012's split (branded
 * type in contracts, arithmetic here) from being a circular dependency.
 *
 * Nothing in this file rounds. Addition and subtraction of exact integers are
 * exact, so they need no statutory boundary; only `mulRate` does.
 */

/** Zero rupees. */
export const ZERO = 0n as Paise;

/** Paise per rupee. */
export const RUPEE = 100n as Paise;

/**
 * Assert a `bigint` is an amount of paise.
 *
 * Deliberately accepts only `bigint`. There is no `fromNumber`, because a JS
 * number cannot represent every paise value a crore-scale purchase order
 * reaches, and offering one would make the unsafe path the convenient one.
 */
export function paise(value: bigint): Paise {
  if (typeof value !== 'bigint') {
    throw new TypeError(`paise() takes a bigint, got ${typeof value}`);
  }
  return value as Paise;
}

/**
 * A rate in basis points. 1 bp = 0.01%.
 *
 * Throws on a fractional or non-finite rate rather than truncating it. The
 * legacy guard was `Number(value) || 0`, which turned corrupt input into a
 * silent zero — in a statutory system that must throw (ADR-0012).
 */
export function bp(value: number): BasisPoints {
  if (!Number.isInteger(value)) {
    throw new RangeError(
      `a rate must be a whole number of basis points (1 bp = 0.01%), got ${String(value)}`,
    );
  }
  if (value < 0) {
    throw new RangeError(`a rate must not be negative, got ${String(value)}`);
  }
  return value as BasisPoints;
}

// --- Wire ---------------------------------------------------------------

/** Canonical wire form: digits only, optional leading '-', no leading zeros. */
const WIRE = /^-?(?:0|[1-9][0-9]*)$/;

/**
 * Parse the canonical wire form into `Paise`.
 *
 * Rejects anything that is not exactly canonical — formatted rupees, Indian
 * digit grouping, decimal points, leading zeros, whitespace, scientific
 * notation and `-0`. A formatted string must never be mistaken for a wire
 * value, because that is precisely the round-trip ADR-0012 forbids.
 */
export function fromWire(value: string): Paise {
  if (typeof value !== 'string' || !WIRE.test(value) || value === '-0') {
    throw new TypeError(
      `not a canonical paise string: ${JSON.stringify(value)} — expected digits only, e.g. "1234500"`,
    );
  }
  return BigInt(value) as Paise;
}

/** Render to the canonical wire form. Safe to put in JSON. */
export function toWire(value: Paise): string {
  return value.toString(10);
}

/** Rupees-and-paise as written by a human or a legacy column: `"1005.60"`. */
const RUPEE_STRING = /^(-)?(0|[1-9][0-9]*)(?:\.([0-9]{2}))?$/;

/**
 * Parse `"1005.60"` into 100560 paise, digit by digit — never via `parseFloat`.
 *
 * Requires exactly two decimal places when a fraction is present. `"1005.6"` is
 * rejected rather than guessed at: in a ledger the difference between ₹1005.60
 * and ₹1005.06 is not something to infer.
 */
export function fromRupeeString(value: string): Paise {
  const match = typeof value === 'string' ? RUPEE_STRING.exec(value) : null;
  if (match === null) {
    throw new TypeError(
      `not a rupee amount: ${JSON.stringify(value)} — expected e.g. "1005.60" or "1005"`,
    );
  }
  const whole = BigInt(match[2] as string);
  const fraction = match[3] === undefined ? 0n : BigInt(match[3]);
  const magnitude = whole * 100n + fraction;
  if (match[1] === '-' && magnitude === 0n) {
    throw new TypeError('negative zero is not a valid amount');
  }
  return (match[1] === '-' ? -magnitude : magnitude) as Paise;
}

/**
 * Render as plain rupees for display: `"1005.60"`.
 *
 * Display only. This value must never be parsed back into money by anything
 * other than `fromRupeeString`, and never by `parseFloat`. Indian digit
 * grouping (`₹1,23,456.78`) is a presentation concern and deliberately absent
 * here — a grouped string is not parseable by this package by design.
 */
export function toRupeeString(value: Paise): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const whole = magnitude / 100n;
  const fraction = magnitude % 100n;
  return `${negative ? '-' : ''}${whole.toString(10)}.${fraction.toString(10).padStart(2, '0')}`;
}

// --- Exact arithmetic ---------------------------------------------------

export function add(a: Paise, b: Paise): Paise {
  return (a + b) as Paise;
}

export function sub(a: Paise, b: Paise): Paise {
  return (a - b) as Paise;
}

export function negate(a: Paise): Paise {
  return -a as Paise;
}

export function abs(a: Paise): Paise {
  return (a < 0n ? -a : a) as Paise;
}

/** Exact, order-independent total. Empty sums to zero. */
export function sum(values: readonly Paise[]): Paise {
  let total = 0n;
  for (const value of values) total += value;
  return total as Paise;
}

export function compare(a: Paise, b: Paise): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isZero(a: Paise): boolean {
  return a === 0n;
}

export function isNegative(a: Paise): boolean {
  return a < 0n;
}

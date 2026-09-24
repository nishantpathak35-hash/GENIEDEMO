import { describe, expect, it } from 'vitest';
import {
  bp,
  excessBasisPoints,
  shareBasisPoints,
  mulRate,
  mulRatio,
  paise,
  ratio,
  ratioOf,
  roundGstHeadToPaise,
  roundToPaise,
  toRupeeString,
} from '../src/index.js';

/**
 * D1 amendment: rates are exact rationals. `BasisPoints` survives as sugar for
 * the common case, and `mulRate` becomes a thin wrapper over `mulRatio`.
 *
 * Integer basis points cannot represent several rates this domain reaches. The
 * consequences below are arithmetic facts; whether any of them constitutes a
 * statutory default is a question for the CA in M2.5, not a claim made here.
 */

describe('mulRate is now a wrapper over mulRatio', () => {
  it('agrees with the equivalent ratio for every basis-point rate', () => {
    const base = paise(1_234_567n);
    for (const rate of [0, 10, 75, 100, 900, 1800, 2000, 10_000]) {
      expect(mulRate(base, bp(rate), roundGstHeadToPaise)).toBe(
        mulRatio(base, ratio(BigInt(rate), 10_000n), roundGstHeadToPaise),
      );
    }
  });
});

describe('rates integer basis points cannot express', () => {
  it('Sec 195 composite rate: 10% + 2% surcharge + 4% cess = 10.608%', () => {
    // 1.02 x 1.04 = 1.0608, so a 10% base rate becomes 10.608% — 1060.8 bp,
    // which is not an integer. The 27Q return format's rate field carries four
    // decimals ("10.6080"), so the filing format itself has more resolution
    // than integer basis points do.
    const fee = paise(50_00_000_00n); // ₹50,00,000.00 = 5e8 paise

    const exact = mulRatio(fee, ratio(10_608n, 100_000n), roundToPaise);
    expect(toRupeeString(exact)).toBe('530400.00');

    // The nearest integer bp truncates the rate, not the result.
    const truncated = mulRate(fee, bp(1060), roundToPaise);
    expect(toRupeeString(truncated)).toBe('530000.00');
    expect(exact - truncated).toBe(40_000n); // ₹400.00 difference
  });

  it('Rule 35 CGST: extracting tax from a tax-inclusive value', () => {
    // tax = value x rate / (100 + rate). 18/118 is recurring, so no fixed-point
    // rate can hold it — but the ratio is exact.
    const inclusive = paise(1_18_000n); // ₹1180.00 including 18% GST
    const tax = mulRatio(inclusive, ratio(18n, 118n), roundGstHeadToPaise);
    expect(toRupeeString(tax)).toBe('180.00');
  });

  it('per-day interest: 18% per annum over 365 days', () => {
    // Sec 50 CGST accrues per day. 18/365 % per day is recurring.
    const principal = paise(10_00_000n); // ₹10,000.00
    const days = 37n;
    const perDay = ratio(18n * days, 365n * 100n);
    const interest = mulRatio(principal, perDay, roundToPaise);
    // 10000 x 0.18 x 37/365 = ₹182.4657...
    expect(toRupeeString(interest)).toBe('182.47');
  });
});

describe('ratio', () => {
  it('rejects a zero or negative denominator', () => {
    expect(() => ratio(1n, 0n)).toThrow();
    expect(() => ratio(1n, -100n)).toThrow();
  });

  it('allows rates above 100%, which s.201(1A) interest reaches', () => {
    const principal = paise(1_000_00n);
    expect(mulRatio(principal, ratio(150n, 100n), roundToPaise)).toBe(1_500_00n);
  });
});

describe('ratioOf — money divided by money, exactly', () => {
  it('is dimensionless and loses nothing', () => {
    // Proration: this RA bill is 3/8 of the contract, so recover 3/8 of the
    // mobilisation advance. Never `a / b` truncated to an integer.
    const billed = paise(37_500_00n);
    const contract = paise(1_00_000_00n);
    const share = ratioOf(billed, contract);

    const advance = paise(10_00_000n);
    const recovery = mulRatio(advance, share, roundToPaise);
    expect(toRupeeString(recovery)).toBe('3750.00');
  });

  it('throws rather than dividing by zero', () => {
    expect(() => ratioOf(paise(1n), paise(0n))).toThrow();
  });

  it('keeps precision a float would lose', () => {
    // 1/3 of ₹100 must not become 33.33333333333333.
    const third = ratioOf(paise(1n), paise(3n));
    expect(mulRatio(paise(100_00n), third, roundToPaise)).toBe(3333n);
  });
});

describe('excessBasisPoints — how far a price sits above its contract', () => {
  it('reports a plain percentage over the baseline', () => {
    // 100.00 -> 112.50 is 12.5%.
    expect(excessBasisPoints(paise(10_000n), paise(11_250n))).toBe(1250);
    expect(excessBasisPoints(paise(10_000n), paise(20_000n))).toBe(10_000);
  });

  it('is zero when the price is exactly the contracted rate', () => {
    expect(excessBasisPoints(paise(45_678n), paise(45_678n))).toBe(0);
  });

  it('KEEPS THE SIGN when the price is under contract', () => {
    // Not clamped. A negative deviation is information — and a comparison
    // written the wrong way round shows up as a negative instead of as silence.
    expect(excessBasisPoints(paise(10_000n), paise(9_000n))).toBe(-1000);
  });

  it('truncates toward zero rather than rounding', () => {
    expect(excessBasisPoints(paise(10_000n), paise(10_003n))).toBe(3);
    expect(excessBasisPoints(paise(3n), paise(4n))).toBe(3333);
    expect(excessBasisPoints(paise(3n), paise(2n))).toBe(-3333);
  });

  it('refuses a baseline that cannot have a percentage above it', () => {
    // Returning 0 here would read as "priced exactly on contract", which is the
    // one answer that must never be invented.
    expect(() => excessBasisPoints(paise(0n), paise(100n))).toThrow(/baseline/);
  });

  it('is exact for magnitudes a float would lose', () => {
    expect(excessBasisPoints(paise(1_000_000_000n), paise(1_000_000_001n))).toBe(0);
    expect(excessBasisPoints(paise(1_000_000_000n), paise(1_000_100_000n))).toBe(1);
  });
});

describe('shareBasisPoints — how much of a whole a part is, floored', () => {
  it('floors, so a share just under a band never reads as at it', () => {
    // 84.999…% must stay below 8500, where truncating a negative excess would not.
    expect(shareBasisPoints(paise(84_999n), paise(100_000n))).toBe(8499);
    expect(excessBasisPoints(paise(100_000n), paise(84_999n))).toBe(-1500); // the trap, stated
    expect(shareBasisPoints(paise(31_240_500_00n), paise(42_500_000_00n))).toBe(7350);
  });

  it('is exact at the whole and reports above it', () => {
    expect(shareBasisPoints(paise(100n), paise(100n))).toBe(10_000);
    expect(shareBasisPoints(paise(43_189_00n), paise(40_000_00n))).toBe(10_797);
    expect(shareBasisPoints(paise(0n), paise(100n))).toBe(0);
  });

  it('refuses a whole of zero and a negative part', () => {
    expect(() => shareBasisPoints(paise(1n), paise(0n))).toThrow(RangeError);
    expect(() => shareBasisPoints(paise(-1n), paise(100n))).toThrow(RangeError);
  });
});

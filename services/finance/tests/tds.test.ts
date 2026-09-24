import { describe, expect, it } from 'vitest';
import { bp, paise, roundTdsDeductionToPaise, roundToPaise, toRupeeString } from '@cog/money';
import {
  aggregate,
  computeDeduction,
  deductionBase,
  thresholdOutcome,
} from '../src/domain/tds.js';

/**
 * SYNTHETIC RATES AND THRESHOLDS THROUGHOUT.
 *
 * 10% flat, and thresholds of ₹1,000 / ₹5,000. These are not statutory values
 * and are not meant to resemble any — CA-05, CA-06 and CA-07 are all open, and
 * a plausible-looking fixture is what gets mistaken for a verified figure.
 * Their only job is to prove the mechanism.
 */
const SYNTHETIC_RATE = bp(1000);

const invoice = { taxable: paise(1_00_000n), gst: paise(18_000n) }; // ₹1000 + ₹180

describe('the deduction base', () => {
  it('excludes GST by default — CBDT Circular 23/2017', () => {
    expect(toRupeeString(deductionBase(invoice, false))).toBe('1000.00');
  });

  it('can include it, because CA-08 is not settled for works contracts', () => {
    // If the answer turns out to be "include", every deduction computed the
    // other way is understated by the tax on the tax.
    expect(toRupeeString(deductionBase(invoice, true))).toBe('1180.00');
  });

  it('is an explicit argument at every call site — there is no default', () => {
    // @ts-expect-error includeGst is required; a default would silently pick a
    // statutory answer nobody chose.
    expect(() => deductionBase(invoice)).toBeDefined();
  });
});

describe('computeDeduction', () => {
  it('withholds from the gross, not from the base', () => {
    // The vendor is owed the whole invoice including GST; the tax is withheld
    // from what they are paid, even though GST is excluded from the base it is
    // computed on.
    const d = computeDeduction({
      base: invoice,
      rate: SYNTHETIC_RATE,
      includeGst: false,
      boundary: roundToPaise,
    });
    expect(toRupeeString(d.base)).toBe('1000.00');
    expect(toRupeeString(d.tds)).toBe('100.00');
    expect(toRupeeString(d.netPayable)).toBe('1080.00'); // 1180 - 100
  });

  it('keeps a deduction to the paise — CA-03, answered', () => {
    // s.288B applies to the challan, not to each deduction (the CA answers
    // document, provisional): ₹1,004.50 at 10% is deducted as ₹100.45.
    const odd = { taxable: paise(1_00_450n), gst: paise(0n) };
    const deduction = computeDeduction({
      base: odd,
      rate: SYNTHETIC_RATE,
      includeGst: false,
      boundary: roundTdsDeductionToPaise,
    });
    expect(toRupeeString(deduction.tds)).toBe('100.45');
  });

  it('never produces a fractional paise', () => {
    const d = computeDeduction({
      base: { taxable: paise(3_33_333n), gst: paise(0n) },
      rate: bp(1n === 1n ? 333 : 0),
      includeGst: false,
      boundary: roundToPaise,
    });
    expect(typeof d.tds).toBe('bigint');
  });
});

describe('threshold tracking — new, because legacy tracks none', () => {
  const rule = { singlePayment: paise(1_000_00n), annualAggregate: paise(5_000_00n) };

  it('does not deduct below both thresholds', () => {
    const out = thresholdOutcome(paise(500_00n), rule, { aggregateSoFar: paise(0n) });
    expect(out).toEqual({ deduct: false, reason: 'below-both-thresholds' });
  });

  it('deducts once a single payment exceeds the single-payment threshold', () => {
    const out = thresholdOutcome(paise(1_000_01n), rule, { aggregateSoFar: paise(0n) });
    expect(out).toEqual({ deduct: true, reason: 'single-payment' });
  });

  it('deducts once the running aggregate crosses, even for a small payment', () => {
    // Four ₹1,200 payments sit under the single-payment threshold; the fifth
    // crosses the annual aggregate.
    const out = thresholdOutcome(paise(200_00n), rule, { aggregateSoFar: paise(4_900_00n) });
    expect(out).toEqual({ deduct: true, reason: 'annual-aggregate' });
  });

  it('treats the threshold as exclusive — exactly at it does not deduct', () => {
    // "exceeds" rather than "reaches". This is the reading of the wording, and
    // it is exactly the kind of boundary CA-06 must confirm.
    expect(thresholdOutcome(paise(1_000_00n), rule, { aggregateSoFar: paise(0n) }).deduct).toBe(
      false,
    );
    expect(
      thresholdOutcome(paise(100_00n), rule, { aggregateSoFar: paise(4_900_00n) }).deduct,
    ).toBe(false);
  });

  it('aggregates prior payments exactly', () => {
    expect(toRupeeString(aggregate([paise(100n), paise(250n), paise(1n)]))).toBe('3.51');
    expect(toRupeeString(aggregate([]))).toBe('0.00');
  });
});

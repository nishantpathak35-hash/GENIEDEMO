import { describe, expect, it } from 'vitest';
import {
  bp,
  mulRate,
  paise,
  roundChallanSec288B,
  roundToPaise,
  roundGstHeadToPaise,
  roundInvoiceTotalSec170,
  roundTdsDeductionToPaise,
  toWire,
} from '../src/index.js';

// ₹ helpers, so the intent of each case is readable.
const RUPEE = 100n;
const rupees = (n: number | bigint) => paise(BigInt(n) * RUPEE);

describe('roundInvoiceTotalSec170 — Sec 170 on the invoice total, CA-02 answered', () => {
  // "the amount of tax ... shall be rounded off to the nearest rupee", applied
  // "only to the final total invoice value" — the CA answers document.
  it('rounds to the nearest rupee', () => {
    expect(roundInvoiceTotalSec170(9049n, 1n)).toBe(9000n); // ₹90.49 -> ₹90
    expect(roundInvoiceTotalSec170(9051n, 1n)).toBe(9100n); // ₹90.51 -> ₹91
  });

  it('rounds a half-rupee up, away from zero', () => {
    // "where such part is fifty paise or more, increase to one rupee"
    expect(roundInvoiceTotalSec170(9050n, 1n)).toBe(9100n); // ₹90.50 -> ₹91
  });

});

// ---------------------------------------------------------------------------
// PROVISIONAL — our convention, NOT a statutory finding. Kept in its own block
// so it cannot be read as Sec 170 or Sec 288B. Every statute quoted in this
// file is phrased for positive amounts only; the direction for negatives is
// HUMAN(CA-01) and is unanswered. See docs/statutory/QUESTIONS-FOR-CA.md and
// packages/money/golden/sec-170-invoice-total.provisional.json.
// ---------------------------------------------------------------------------
describe('negative-amount convention — PROVISIONAL, HUMAN(CA-01)', () => {
  it('rounds a negative half-rupee away from zero, not toward +infinity', () => {
    // Math.round(-0.5) === -0 in JavaScript: it rounds half toward +infinity.
    // Credit notes and reversals are negative, so inheriting that asymmetry
    // would make a reversal disagree with the invoice it reverses by ₹1.
    expect(roundInvoiceTotalSec170(-9050n, 1n)).toBe(-9100n); // -₹90.50 -> -₹91
    expect(roundInvoiceTotalSec170(-9049n, 1n)).toBe(-9000n);
  });

  it('is symmetric: rounding a negative equals negating the rounded positive', () => {
    for (const n of [1n, 49n, 50n, 51n, 99n, 100n, 12345n, 999_999n]) {
      expect(roundInvoiceTotalSec170(-n, 1n)).toBe(-roundInvoiceTotalSec170(n, 1n));
    }
  });

  it('rounds Sec 288B negatives away from zero, after dropping the paise', () => {
    expect(roundChallanSec288B(rupees(-105), 1n)).toBe(-11000n);
    expect(roundChallanSec288B(-10460n, 1n)).toBe(-10000n); // -₹104.60 -> -₹104 -> -₹100
  });
});

describe('roundChallanSec288B — Sec 288B on the challan, CA-04 answered', () => {
  // "ignore paise first and then round the rupee amount to the nearest multiple
  // of ₹10; where the last rupee digit is 5 or more, round up to the next ₹10,
  // otherwise round down to the previous ₹10" — the CA answers document.
  it('rounds to the nearest ten rupees', () => {
    expect(roundChallanSec288B(rupees(104), 1n)).toBe(10000n); // ₹104 -> ₹100
    expect(roundChallanSec288B(rupees(106), 1n)).toBe(11000n); // ₹106 -> ₹110
  });

  it('rounds a last rupee digit of five up', () => {
    expect(roundChallanSec288B(rupees(105), 1n)).toBe(11000n); // ₹105 -> ₹110
  });

  it('ignores the paise first', () => {
    expect(roundChallanSec288B(10499n, 1n)).toBe(10000n); // ₹104.99 -> ₹104 -> ₹100
    expect(roundChallanSec288B(99540n, 1n)).toBe(100000n); // ₹995.40 -> ₹995 -> ₹1,000
    expect(roundChallanSec288B(1422999n, 1n)).toBe(1423000n); // ₹14,229.99 -> ₹14,229 -> ₹14,230
    expect(roundChallanSec288B(20999n, 2n)).toBe(10000n); // ₹104.995, exact -> ₹104 -> ₹100
  });
});

describe('roundGstHeadToPaise — CA-02, answered', () => {
  // "the GST components shall retain their calculated values and shall not be
  // individually rounded to the nearest rupee" — the CA answers document.
  it('keeps a head to the paise', () => {
    expect(mulRate(paise(1_234_56n), bp(900), roundGstHeadToPaise)).toBe(111_11n); // ₹111.1104 -> ₹111.11
    expect(mulRate(paise(500n), bp(900), roundGstHeadToPaise)).toBe(45n); // 45 paise, not ₹0
  });

  it('rounds a fraction of a paisa once, halves away from zero', () => {
    expect(roundGstHeadToPaise(9n, 2n)).toBe(5n); // 4.5p -> 5p
    expect(roundGstHeadToPaise(-9n, 2n)).toBe(-5n); // a credit note mirrors it (CA-01)
  });
});

describe('roundTdsDeductionToPaise — CA-03, answered', () => {
  // "Individual voucher deductions should retain the actual computed TDS
  // amount" — the CA answers document. Money is held in whole paise, so that is
  // as far as a deduction is rounded.
  it('keeps a deduction to the paise, never to ten rupees', () => {
    expect(roundTdsDeductionToPaise(12_965_50n, 1n)).toBe(12_965_50n); // ₹12,965.50 stays
    expect(roundTdsDeductionToPaise(620_45n, 1n)).toBe(620_45n); // not ₹620
  });

  it('rounds a fraction of a paisa once, halves away from zero', () => {
    expect(roundTdsDeductionToPaise(3n, 2n)).toBe(2n); // 1.5p -> 2p
    expect(roundTdsDeductionToPaise(1n, 3n)).toBe(0n); // 0.33p -> 0p
    expect(roundTdsDeductionToPaise(-3n, 2n)).toBe(-2n); // a reversal mirrors it (CA-01)
  });
});


describe('exactness', () => {
  it('never truncates the intermediate before the boundary applies', () => {
    // 1/3 of a rupee, expressed as an exact rational, must round to ₹0 rather
    // than being truncated to 0 paise and then rounded.
    expect(roundInvoiceTotalSec170(100n, 3n)).toBe(0n); // ₹0.333 -> ₹0
    expect(roundInvoiceTotalSec170(200n, 3n)).toBe(100n); // ₹0.667 -> ₹1
  });

  it('rounds from the exact product, not from a pre-rounded intermediate', () => {
    // The legacy estimation engine rounds baseRate to whole rupees mid-formula
    // and then applies GST to the rounded figure, which is how the client and
    // server implementations diverge on 132 of 300 sampled inputs. mulRate must
    // round exactly once, at the named boundary.
    const base = paise(100_500n); // ₹1005.00
    expect(toWire(mulRate(base, bp(900), roundInvoiceTotalSec170))).toBe('9000'); // ₹90.45 -> ₹90
  });
});

describe('roundToPaise — the missing line-level boundary', () => {
  it('rounds to whole paise, not to the rupee', () => {
    expect(roundToPaise(9045n, 1n)).toBe(9045n);
    expect(roundToPaise(100n, 3n)).toBe(33n); // ₹0.3333 -> 33p
    expect(roundToPaise(200n, 3n)).toBe(67n); // ₹0.6667 -> 67p
  });

  it('keeps a line value that Sec 170 would have destroyed', () => {
    const line = paise(500n); // ₹5.00
    expect(mulRate(line, bp(900), roundToPaise)).toBe(45n); // 45 paise
    expect(mulRate(line, bp(900), roundInvoiceTotalSec170)).toBe(0n); // ₹0
  });
});

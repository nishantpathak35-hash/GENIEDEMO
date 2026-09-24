import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  abs,
  add,
  bp,
  mulRate,
  paise,
  roundGstHeadToPaise,
  roundInvoiceTotalSec170,
  sub,
  sum,
  ZERO,
} from '../src/index.js';

/**
 * The D2 properties from docs/plans/M1.md.
 *
 * The originally specified property, `CGST + SGST === totalGST`, was replaced
 * rather than supplemented. It is definitional — trivially true wherever
 * totalGST is defined as the sum — so it passes while hiding the bug it exists
 * to catch. A definitional assertion sitting beside a real one also invites
 * someone to delete the wrong one later.
 */

/** Bases from ₹0 to ₹1 crore, in paise. */
const anyBase = fc.bigInt({ min: 0n, max: 1_00_00_000_00n }).map(paise);

const CGST_9 = bp(900);
const SGST_9 = bp(900);
const IGST_18 = bp(1800);

describe('D2.1 — intra-state halves are equal', () => {
  it('cgst === sgst for every base', () => {
    fc.assert(
      fc.property(anyBase, (base) => {
        const cgst = mulRate(base, CGST_9, roundGstHeadToPaise);
        const sgst = mulRate(base, SGST_9, roundGstHeadToPaise);
        expect(cgst).toBe(sgst);
      }),
      { numRuns: 2000 },
    );
  });
});

describe('D2.2 — the accessor guard (definitional)', () => {
  it('cgst + sgst === the sum of the two heads', () => {
    fc.assert(
      fc.property(anyBase, (base) => {
        const cgst = mulRate(base, CGST_9, roundGstHeadToPaise);
        const sgst = mulRate(base, SGST_9, roundGstHeadToPaise);
        expect(sum([cgst, sgst])).toBe(add(cgst, sgst));
      }),
      { numRuns: 500 },
    );
  });
});

describe('D2.3 — rounding placement', () => {
  /**
   * |igst(18%) − (cgst(9%) + sgst(9%))| ≤ 1 paisa.
   *
   * Each head is kept to the paise (the CA's answer to CA-02), so the bound is
   * one unit of that boundary. It is exact, tight, and independent of the
   * rounding mode. Writing R(c) = c + e with |e| ≤ ½ a unit for any nearest-mode
   * rounding:
   *
   *     2·R(c) − R(2c) = 2(c + e₁) − (2c + e₂) = 2e₁ − e₂
   *
   * so |2·R(c) − R(2c)| ≤ 1.5 units, and being a whole number of paise, ≤ 1.
   *
   * Only the GOLDEN VALUES depend on the mode being half-away-from-zero. The
   * bound itself does not.
   */
  it('holds for every base', () => {
    fc.assert(
      fc.property(anyBase, (base) => {
        const cgst = mulRate(base, CGST_9, roundGstHeadToPaise);
        const sgst = mulRate(base, SGST_9, roundGstHeadToPaise);
        const igst = mulRate(base, IGST_18, roundGstHeadToPaise);
        expect(abs(sub(add(cgst, sgst), igst)) <= 1n).toBe(true);
      }),
      { numRuns: 5000 },
    );
  });

  it('the bound is tight — one paisa of divergence is reachable, so ≤ cannot be <', () => {
    // 6 paise: 9% = 0.54p -> 1p each head, 2p in all. 18% = 1.08p -> 1p.
    const base = paise(6n);
    const cgst = mulRate(base, CGST_9, roundGstHeadToPaise);
    const sgst = mulRate(base, SGST_9, roundGstHeadToPaise);
    const igst = mulRate(base, IGST_18, roundGstHeadToPaise);
    expect(abs(sub(add(cgst, sgst), igst))).toBe(1n);
  });
});

describe('D2.3b — the invoice total is rounded once, not per line', () => {
  /**
   * A single-amount generator cannot catch this: one amount IS its own invoice,
   * so D2.3 above passes whether or not the caller rounds per line. The CA's
   * answer to CA-02 rounds "only the final total invoice value", once, and
   * rounding each line's total instead is not a rounding artefact — the drift is
   * unbounded in the number of lines.
   */
  it('drifts by ₹18 on a 40-line invoice when each line total is rounded', () => {
    // ₹5.00 a line, and 45 paise of CGST on it kept to the paise: ₹5.45.
    const lineTotals = Array.from({ length: 40 }, () =>
      add(paise(500n), mulRate(paise(500n), CGST_9, roundGstHeadToPaise)),
    );
    const perLine = sum(lineTotals.map((l) => roundInvoiceTotalSec170(l, 1n)));
    const once = roundInvoiceTotalSec170(sum(lineTotals), 1n);

    expect(perLine).toBe(20000n); // each ₹5.45 rounds to ₹5 — every line's tax is lost
    expect(once).toBe(21800n); // ₹218.00 — ₹200 and its ₹18 of tax
  });

  it('drift grows with line count, so no fixed tolerance can absorb it', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 400 }), (lineCount) => {
        const lineTotals = Array.from({ length: lineCount }, () => paise(545n));
        const perLine = sum(lineTotals.map((l) => roundInvoiceTotalSec170(l, 1n)));
        const once = roundInvoiceTotalSec170(sum(lineTotals), 1n);
        // Every line's 45 paise rounds away, so the drift is the tax itself.
        expect(perLine).toBe(paise(500n * BigInt(lineCount)));
        expect(once >= perLine).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

describe('D2.4 — nothing leaves the integer domain', () => {
  it('every result is a bigint, never a number', () => {
    fc.assert(
      fc.property(anyBase, fc.integer({ min: 0, max: 10_000 }), (base, rate) => {
        const out = mulRate(base, bp(rate), roundGstHeadToPaise);
        expect(typeof out).toBe('bigint');
        expect(Number.isInteger(Number(out))).toBe(true);
      }),
      { numRuns: 2000 },
    );
  });

  it('rejects a float rate rather than silently truncating it', () => {
    expect(() => bp(18.5)).toThrow(/whole number of basis points/);
  });

  it('rejects NaN rather than producing zero', () => {
    // The legacy guard was `Number(value) || 0`, which turns corrupt data into
    // a silent zero. In a statutory system it must throw. (ADR-0012)
    expect(() => bp(Number.NaN)).toThrow();
  });
});

describe('exact arithmetic is associative and has an identity', () => {
  it('sum is order-independent', () => {
    fc.assert(
      fc.property(fc.array(anyBase, { maxLength: 40 }), (xs) => {
        const forward = sum(xs);
        const reversed = sum([...xs].reverse());
        expect(forward).toBe(reversed);
      }),
      { numRuns: 500 },
    );
  });

  it('zero is the additive identity', () => {
    fc.assert(
      fc.property(anyBase, (x) => {
        expect(add(x, ZERO)).toBe(x);
      }),
      { numRuns: 500 },
    );
  });
});

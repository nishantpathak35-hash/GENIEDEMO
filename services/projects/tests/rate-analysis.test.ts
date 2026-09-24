import { describe, expect, it } from 'vitest';
import { bp, paise, toRupeeString } from '@cog/money';
import { analyseRate, lineAmount } from '../src/domain/rate-analysis.js';
import { calculateEstimationRateBreakdownLegacy as legacy } from '../src/domain/rate-analysis-legacy.js';

/**
 * COMMIT 2 OF 2 — the corrected engine.
 *
 * Each defect row from docs/STACK-MIGRATION.md is closed by a named test, and
 * the legacy value is kept alongside as a **recorded divergence** rather than
 * deleted. When tenant #1's historical figures are reconciled in M2.5, the
 * question "why does this differ?" has an answer in this file.
 */

const CASE = {
  materialCost: paise(240_00n),
  labourCost: paise(75_00n),
  equipmentCost: paise(20_00n),
  overheadRate: bp(600), // 6% — a tenant setting (PO-15), not a constant
  marginRate: bp(1500), // 15% — likewise
};

describe('RATE-01 — rounding no longer happens mid-formula', () => {
  it('keeps paise precision through overhead and margin', () => {
    const r = analyseRate(CASE);
    // 335.00 -> +6% = 355.10 -> +15% = 408.365 -> 408.37 at paise precision.
    expect(toRupeeString(r.directCost)).toBe('335.00');
    expect(toRupeeString(r.costWithOverhead)).toBe('355.10');
    expect(toRupeeString(r.baseRate)).toBe('408.37');
  });

  it('DIVERGES from the legacy stored figure, by design', () => {
    // Legacy rounds baseRate to whole rupees before GST: it stores 408.
    // This keeps 408.37. The ₹0.37 is not lost, and it is not a bug — it is
    // the defect being closed. Recorded here so M2.5's reconciliation can
    // attribute the difference.
    expect(legacy({ material_cost: 240, labour_cost: 75, equipment_cost: 20, overhead_pct: 6, margin_pct: 15 }).baseRate).toBe(408);
    expect(toRupeeString(analyseRate(CASE).baseRate)).toBe('408.37');
  });

  it('does not apply tax to a rounded base — there is no tax here at all', () => {
    // RATE-03 and PO-16 together: the engine returns a pre-tax rate. Whether a
    // BOQ rate should be tax-inclusive is unanswered, so it is not decided here.
    const r = analyseRate(CASE);
    expect(Object.keys(r).sort()).toEqual([
      'baseRate',
      'costWithOverhead',
      'directCost',
      'margin',
      'overhead',
    ]);
  });
});

describe('RATE-02 — bad input cannot reach the engine', () => {
  it('accepts only Paise, so there is no coercion to go wrong', () => {
    // `Number('12,500')` is NaN in the legacy engine and propagates silently
    // into a REAL column. Here the value never parses in the first place.
    // @ts-expect-error a string is not Paise
    expect(() => analyseRate({ ...CASE, materialCost: '12,500' })).toBeDefined();
  });

  it('treats an explicit zero as zero', () => {
    // The legacy `a || b || 0` skips an explicit 0 because 0 is falsy, so a
    // deliberate zero cost silently becomes whichever alternative is truthy.
    const r = analyseRate({ ...CASE, materialCost: paise(0n) });
    expect(toRupeeString(r.directCost)).toBe('95.00'); // 0 + 75 + 20
  });

  it('has no default that could mask a missing input', () => {
    const r = analyseRate({
      materialCost: paise(0n),
      labourCost: paise(0n),
      equipmentCost: paise(0n),
      overheadRate: bp(0),
      marginRate: bp(0),
    });
    expect(r.baseRate).toBe(0n);
  });
});

describe('RATE-03 — a zero rate is expressible', () => {
  it('applies a zero overhead and margin rather than substituting a default', () => {
    const r = analyseRate({ ...CASE, overheadRate: bp(0), marginRate: bp(0) });
    expect(toRupeeString(r.baseRate)).toBe('335.00');

    // The legacy substitutes 18 for an explicit GST of 0, so a zero-rated
    // supply cannot be expressed at all.
    expect(legacy({ material_cost: 100, gst_pct: 0 }).gstAmt).toBe(18);
  });
});

describe('the arithmetic is faithful where it was right', () => {
  it('is still (M + L + E) x (1 + OH) x (1 + margin)', () => {
    // The formula itself was never in doubt; only its rounding and its input
    // handling. A port that changed the formula would be a rewrite.
    const r = analyseRate({
      materialCost: paise(100_00n),
      labourCost: paise(0n),
      equipmentCost: paise(0n),
      overheadRate: bp(1000), // 10%
      marginRate: bp(2000), // 20%
    });
    expect(toRupeeString(r.overhead)).toBe('10.00');
    expect(toRupeeString(r.costWithOverhead)).toBe('110.00');
    expect(toRupeeString(r.margin)).toBe('22.00');
    expect(toRupeeString(r.baseRate)).toBe('132.00');
  });

  it('agrees with the legacy whenever the legacy did not round anything away', () => {
    // Where the intermediate happens to be a whole rupee, the two agree — which
    // is the evidence that the port preserved the formula and changed only the
    // rounding.
    const exact = analyseRate({
      materialCost: paise(100_00n),
      labourCost: paise(0n),
      equipmentCost: paise(0n),
      overheadRate: bp(0),
      marginRate: bp(0),
    });
    expect(toRupeeString(exact.baseRate)).toBe('100.00');
    expect(legacy({ material_cost: 100, overhead_pct: 0, margin_pct: 0 }).baseRate).toBe(100);
  });
});

describe('lineAmount — a rate is not a line total', () => {
  it('multiplies by quantity', () => {
    // The legacy BOQ import hardcodes quantity to 1 and uses the rate as the
    // amount, so the two concepts are the same value and neither can be
    // reasoned about (RATE-05).
    expect(toRupeeString(lineAmount(paise(408_37n), 10_000_000n))).toBe('4083.70');
  });

  it('handles a fractional quantity exactly', () => {
    // 12.375 x ₹408.37 = ₹5053.57875 -> ₹5053.58
    expect(toRupeeString(lineAmount(paise(408_37n), 12_375_000n))).toBe('5053.58');
  });

  it('refuses a negative quantity', () => {
    expect(() => lineAmount(paise(100n), -1n)).toThrow();
  });
});

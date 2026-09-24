import { describe, expect, it } from 'vitest';
import { calculateEstimationRateBreakdownLegacy as legacy } from '../src/domain/rate-analysis-legacy.js';

/**
 * COMMIT 1 OF 2 — golden values recording WHAT THE LEGACY PRODUCES.
 *
 * These are not expectations of correctness. Several are demonstrably wrong,
 * and the next commit changes them. They exist so that when a figure differs
 * from the legacy system after the fix, it is possible to say which change
 * caused it (ADR-0014 decision 5).
 *
 * Legacy output is a defect report, never an expectation — so nothing here is
 * a `golden/` file and none of it is `verified`.
 */

const CASE = {
  material_cost: 240,
  labour_cost: 75,
  equipment_cost: 20,
  overhead_pct: 6,
  margin_pct: 15,
  gst_pct: 18,
};

describe('the authoritative legacy path, reproduced exactly', () => {
  it('produces the figure the database actually stores', () => {
    // app/lib/api/estimation.js:43 stores exactly this into
    // estimation_items.base_rate and .final_rate_with_gst.
    const r = legacy(CASE);
    expect(r.baseRate).toBe(408);
    expect(r.finalRateWithGst).toBe(481);
  });

  it('disagrees with what the user is shown on screen', () => {
    // components/views/EstimationView.js:132 computes the same formula without
    // rounding baseRate before GST, and never imports the shared function. For
    // this input it displays 482 while the database stores 481.
    const displayed = (() => {
      const direct = 240 + 75 + 20;
      const cwo = direct + direct * 0.06;
      const base = cwo + cwo * 0.15;
      return Math.round(base + base * 0.18);
    })();
    expect(displayed).toBe(482);
    expect(legacy(CASE).finalRateWithGst).toBe(481);
    expect(displayed).not.toBe(legacy(CASE).finalRateWithGst);
  });

  it('disagrees with the legacy audit script, which disagrees with itself', () => {
    // scripts/audit_end_user_flows.js:122 rounds to two decimals rather than
    // whole rupees, and its own inline comment claims 481.87 while its code
    // computes 481.88.
    const direct = 240 + 75 + 20;
    const overhead = direct * 0.06;
    const margin = (direct + overhead) * 0.15;
    const base = Math.round((direct + overhead + margin) * 100) / 100;
    const final = Math.round(base * 1.18 * 100) / 100;
    expect(base).toBe(408.37);
    expect(final).toBe(481.88); // the comment in that file says 481.87
    expect(final).not.toBe(legacy(CASE).finalRateWithGst);
  });
});

describe('DEFECT 1 — mid-formula rounding (STACK-MIGRATION)', () => {
  it('applies GST to a rounded base rather than the exact one', () => {
    // The whole reason two code paths can differ: the base is rounded to whole
    // rupees, and GST is then charged on the rounded figure.
    const r = legacy({ material_cost: 100.4, overhead_pct: 0, margin_pct: 0, gst_pct: 18 });
    expect(r.baseRate).toBe(100); // 100.4 rounded
    expect(r.gstAmt).toBe(18); // 18% of 100, NOT of 100.4
  });

  it('drifts from the exact answer as inputs vary', () => {
    let divergent = 0;
    for (let mat = 100; mat < 400; mat += 1) {
      const rounded = legacy({ material_cost: mat, overhead_pct: 6, margin_pct: 15, gst_pct: 18 });
      const cwo = mat * 1.06;
      const exact = Math.round(cwo * 1.15 * 1.18);
      if (rounded.finalRateWithGst !== exact) divergent += 1;
    }
    // Recorded as a fact about the legacy engine, not as an acceptable bound.
    expect(divergent).toBeGreaterThan(0);
  });
});

describe('DEFECT 2 — Number(x || 0) mishandles bad input', () => {
  it('turns a MISSING cost into zero instead of raising', () => {
    // null and undefined are falsy, so `|| 0` catches them: the same silent-zero
    // habit as `money()`. In a system that produces quotations, an absent cost
    // becomes a free line item.
    expect(legacy({ material_cost: null }).directCost).toBe(0);
    expect(legacy({ material_cost: undefined }).directCost).toBe(0);
  });

  it('turns a MALFORMED cost into NaN, which is worse than zero', () => {
    // The `||` runs BEFORE `Number()`, so a truthy non-numeric string is not
    // caught by the `|| 0` guard at all — `Number('12,500')` is NaN, and a
    // rupee amount typed with a comma is exactly what a user enters.
    //
    // NaN then propagates through every step: Math.round(NaN) is NaN, and the
    // legacy REAL column stores it. Every comparison against it is false, so it
    // is silent all the way to a quotation.
    const r = legacy({ material_cost: '12,500' });
    expect(Number.isNaN(r.directCost)).toBe(true);
    expect(Number.isNaN(r.baseRate)).toBe(true);
    expect(Number.isNaN(r.finalRateWithGst)).toBe(true);
  });

  it('falls through an explicit zero because 0 is falsy', () => {
    // `item.material_cost || item.materialCost || 0` — an explicit 0 in the
    // snake_case field is skipped in favour of the camelCase one.
    expect(legacy({ material_cost: 0, materialCost: 999 }).directCost).toBe(999);
  });

  it('defaults GST to 18 when absent, and when explicitly zero', () => {
    // `Number(item.gst_pct || item.gstPct || 18)` means a deliberate 0% GST
    // silently becomes 18%. There is no way to express a zero-rated supply.
    expect(legacy({ material_cost: 100, gst_pct: 0 }).gstAmt).toBe(18);
  });
});

describe('DEFECT 3 — floating point', () => {
  it('produces a non-integer intermediate that a REAL column then stores', () => {
    const r = legacy({ material_cost: 0.1, labour_cost: 0.2, overhead_pct: 0, margin_pct: 0 });
    expect(r.directCost).not.toBe(0.3);
    expect(r.directCost).toBeCloseTo(0.30000000000000004, 20);
  });
});

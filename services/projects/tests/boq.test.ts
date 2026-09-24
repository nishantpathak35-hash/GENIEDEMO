import { describe, expect, it } from 'vitest';
import { paise, toRupeeString } from '@cog/money';
import { BoqError, assertLinesUnique, boqTotals, fromEstimationItem, lineAmount, type BoqLine } from '../src/domain/boq.js';

const line = (over: Partial<BoqLine> = {}): BoqLine => ({
  id: 'l1',
  description: 'Vitrified tile 600x600',
  uom: 'Sqm',
  quantity: 10_000_000n, // 10.000000
  rate: paise(50_000n), // ₹500.00
  ...over,
});

describe('line amount is computed, never accepted', () => {
  it('multiplies quantity by rate', () => {
    expect(toRupeeString(lineAmount(line()))).toBe('5000.00');
  });

  it('handles a fractional quantity exactly', () => {
    // 12.375 x ₹500.00 = ₹6187.50
    expect(toRupeeString(lineAmount(line({ quantity: 12_375_000n })))).toBe('6187.50');
  });

  it('exposes no way for a caller to assert an amount', () => {
    // boq.js:114 reads `Number(realPayload.amount) || Math.round(qty*rate*100)/100`,
    // so a client-supplied line amount wins whenever it is truthy — the same
    // hole as purchase-orders/write.js:55. Rule 3 forbids carrying it, so there
    // is no verbatim commit for this one.
    expect(Object.keys(line())).not.toContain('amount');
  });

  it('refuses a negative quantity', () => {
    expect(() => lineAmount(line({ quantity: -1n }))).toThrow(BoqError);
  });
});

describe('totals', () => {
  it('sums line amounts exactly', () => {
    const t = boqTotals([line(), line({ id: 'l2', quantity: 5_000_000n })]);
    expect(t.lineCount).toBe(2);
    expect(toRupeeString(t.value)).toBe('7500.00');
  });

  it('reports cost and margin only when EVERY line is costed', () => {
    // A partial cost total looks like a margin figure but is computed over a
    // subset, so it silently overstates profitability by however many lines
    // were missing.
    const partial = boqTotals([line({ costRate: paise(39_000n) }), line({ id: 'l2' })]);
    expect(partial.cost).toBeNull();
    expect(partial.margin).toBeNull();

    const complete = boqTotals([
      line({ costRate: paise(39_000n) }),
      line({ id: 'l2', costRate: paise(39_000n) }),
    ]);
    expect(toRupeeString(complete.cost!)).toBe('7800.00');
    expect(toRupeeString(complete.margin!)).toBe('2200.00');
  });

  it('never invents a missing cost rate', () => {
    // BoqView.js:137 derives it as 78% of the selling rate — a number with no
    // stated basis that then drives every margin figure on the screen.
    const t = boqTotals([line()]);
    expect(t.cost).toBeNull();
    // The legacy guess, for comparison: 78% of ₹5000 would be ₹3900.
    expect(t.margin).not.toBe(paise(1_10_000n));
  });

  it('returns null margin for an empty schedule rather than zero', () => {
    // Zero margin on zero lines reads as "we make nothing on this job".
    const t = boqTotals([]);
    expect(t.value).toBe(0n);
    expect(t.margin).toBeNull();
  });
});

describe('importing an estimation item', () => {
  it('requires a real quantity', () => {
    // boq.js:365 hardcodes quantity to 1 and sets amount = final_rate_with_gst,
    // so a tax-inclusive rate becomes a line total and the two concepts merge.
    expect(() =>
      fromEstimationItem({
        id: 'l1',
        description: 'x',
        uom: 'Sqm',
        quantity: 0n,
        preTaxRate: paise(100n),
      }),
    ).toThrow(/placeholder of 1/);
  });

  it('takes a PRE-TAX rate, because PO-16 is unanswered', () => {
    const imported = fromEstimationItem({
      id: 'l1',
      description: 'Tile',
      uom: 'Sqm',
      quantity: 10_000_000n,
      preTaxRate: paise(40_837n), // ₹408.37 — the corrected engine's output
    });
    expect(toRupeeString(lineAmount(imported))).toBe('4083.70');
  });
});

describe('line identity', () => {
  it('refuses duplicate ids, which make a schedule unversionable', () => {
    expect(() => assertLinesUnique([line(), line()])).toThrow(/duplicate/);
    expect(() => assertLinesUnique([line(), line({ id: 'l2' })])).not.toThrow();
  });
});

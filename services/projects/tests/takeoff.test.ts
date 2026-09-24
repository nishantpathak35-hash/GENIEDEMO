import { describe, expect, it } from 'vitest';
import { paise, toRupeeString } from '@cog/money';
import {
  TakeoffError,
  assertExportable,
  lineValue,
  orderQuantity,
  summarise,
  type TakeoffItem,
} from '../src/domain/takeoff.js';

const item = (over: Partial<TakeoffItem> = {}): TakeoffItem => ({
  id: 't1',
  description: 'Gypsum board partition',
  uom: 'Sqm',
  measuredQuantity: 100_000_000n, // 100.000000
  wastageBp: 500, // 5%
  costRate: paise(30_000n), // ₹300.00
  clientRate: paise(40_000n), // ₹400.00
  ...over,
});

describe('order quantity', () => {
  it('adds wastage to the measured quantity', () => {
    // 100 + 5% = 105
    expect(orderQuantity(item())).toBe(105_000_000n);
  });

  it('handles zero wastage', () => {
    expect(orderQuantity(item({ wastageBp: 0 }))).toBe(100_000_000n);
  });

  it('is exact where the legacy rounds a float to two decimals', () => {
    // takeoff.js:321 does Math.round(qty * 100) / 100.
    expect(orderQuantity(item({ measuredQuantity: 3_333_333n, wastageBp: 333 }))).toBe(3_444_332n);
  });

  it('refuses a negative measurement or wastage', () => {
    expect(() => orderQuantity(item({ measuredQuantity: -1n }))).toThrow(TakeoffError);
    expect(() => orderQuantity(item({ wastageBp: -1 }))).toThrow(TakeoffError);
  });
});

describe('TAKE-01…03 — a missing rate is never invented', () => {
  it('returns null for an unpriced item', () => {
    // takeoff.js:337: `it.clientRate || Math.round((it.costRate || 100) * 1.25)`.
    // A missing client rate becomes cost x 1.25 — a markup with no stated basis,
    // unrelated to the 4-factor engine the rest of the system prices with.
    const v = lineValue(item({ clientRate: undefined }));
    expect(v.value).toBeNull();
    expect(v.cost).not.toBeNull();
  });

  it('returns null for an uncosted item rather than substituting 100', () => {
    // The legacy substitutes a bare 100 for an unknown cost, then marks it up
    // and quotes it.
    const v = lineValue(item({ costRate: undefined }));
    expect(v.cost).toBeNull();
  });

  it('treats an explicit zero cost as zero, not as missing', () => {
    // `costRate || 100` means a genuine zero also falls through to 100.
    const v = lineValue(item({ costRate: paise(0n) }));
    expect(v.cost).toBe(0n);
  });

  it('computes both when both rates are present', () => {
    const v = lineValue(item());
    expect(toRupeeString(v.cost!)).toBe('31500.00'); // 105 x ₹300
    expect(toRupeeString(v.value!)).toBe('42000.00'); // 105 x ₹400
  });
});

describe('summarise', () => {
  it('names what is missing instead of quietly excluding it', () => {
    // A total computed over the priced subset looks complete and is not, which
    // is how an under-priced quotation goes out.
    const s = summarise([item(), item({ id: 't2', clientRate: undefined })]);
    expect(s.itemCount).toBe(2);
    expect(s.unpricedItems).toEqual(['t2']);
    expect(s.value).toBeNull();
    expect(s.cost).not.toBeNull();
  });

  it('totals only when every item is priced', () => {
    const s = summarise([item(), item({ id: 't2' })]);
    expect(toRupeeString(s.value!)).toBe('84000.00');
    expect(toRupeeString(s.cost!)).toBe('63000.00');
  });

  it('gives null rather than zero for an empty sheet', () => {
    const s = summarise([]);
    expect(s.value).toBeNull();
    expect(s.itemCount).toBe(0);
  });
});

describe('export to BOQ', () => {
  it('refuses a sheet with unpriced items, naming them', () => {
    // The legacy exports regardless, inventing a rate for anything missing one.
    expect(() => assertExportable([item(), item({ id: 't2', clientRate: undefined })])).toThrow(
      /t2/,
    );
  });

  it('allows a fully priced sheet', () => {
    expect(() => assertExportable([item(), item({ id: 't2' })])).not.toThrow();
  });

  it('refuses an empty sheet', () => {
    expect(() => assertExportable([])).toThrow(/empty takeoff/);
  });
});

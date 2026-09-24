import { describe, expect, it } from 'vitest';
import { fromRupeeString, fromWire, paise, toRupeeString, toWire } from '../src/index.js';

describe('fromWire', () => {
  it('parses a canonical paise string', () => {
    expect(fromWire('1234500')).toBe(1_234_500n);
    expect(fromWire('0')).toBe(0n);
    expect(fromWire('-5000')).toBe(-5000n);
  });

  it('round-trips through toWire', () => {
    for (const s of ['0', '1', '-1', '1234500', '9007199254740993']) {
      expect(toWire(fromWire(s))).toBe(s);
    }
  });

  it('survives magnitudes that would lose precision as a JS number', () => {
    // 2^53 + 1 paise. As a float this is indistinguishable from 2^53.
    const beyondSafe = '9007199254740993';
    expect(toWire(fromWire(beyondSafe))).toBe(beyondSafe);
    expect(String(Number(beyondSafe))).not.toBe(beyondSafe); // the failure being avoided
  });

  it.each([
    ['a formatted rupee string', '₹12,345.00'],
    ['Indian digit grouping', '1,23,456'],
    ['a decimal point', '1234.50'],
    ['a leading zero', '0123'],
    ['whitespace', ' 1234 '],
    ['an empty string', ''],
    ['a float in disguise', '1.0'],
    ['scientific notation', '1e5'],
    ['a negative zero', '-0'],
  ])('rejects %s', (_label, input) => {
    expect(() => fromWire(input)).toThrow();
  });

  it('does not silently coerce bad input to zero', () => {
    // The legacy `money()` was `Number(value) || 0`. Every one of these would
    // have become ₹0 and reconciled against nothing.
    for (const bad of ['abc', '', 'null', 'NaN']) {
      expect(() => fromWire(bad)).toThrow();
    }
  });
});

describe('fromRupeeString', () => {
  it('parses rupees and paise exactly', () => {
    expect(fromRupeeString('1005.60')).toBe(100_560n);
    expect(fromRupeeString('1005')).toBe(100_500n);
    expect(fromRupeeString('0.01')).toBe(1n);
    expect(fromRupeeString('-1005.60')).toBe(-100_560n);
  });

  it('parses without going through a float', () => {
    // 0.1 + 0.2 !== 0.3 is the defect ADR-0012 exists to remove. Parsing the
    // digits directly means the classic float cases are exact here.
    expect(fromRupeeString('0.10') + fromRupeeString('0.20')).toBe(fromRupeeString('0.30'));
  });

  it('requires exactly two decimal places when a fraction is given', () => {
    expect(() => fromRupeeString('1005.6')).toThrow();
    expect(() => fromRupeeString('1005.600')).toThrow();
  });
});

describe('toRupeeString', () => {
  it('formats for display only', () => {
    expect(toRupeeString(paise(100_560n))).toBe('1005.60');
    expect(toRupeeString(paise(1n))).toBe('0.01');
    expect(toRupeeString(paise(-100_560n))).toBe('-1005.60');
    expect(toRupeeString(paise(0n))).toBe('0.00');
  });
});

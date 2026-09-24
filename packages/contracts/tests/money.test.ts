import { describe, expect, it } from 'vitest';
import { basisPointsWire, paiseWire } from '../src/index.js';

describe('paiseWire', () => {
  it('accepts the canonical form', () => {
    for (const good of ['0', '1', '-1', '1234500', '9007199254740993']) {
      expect(paiseWire.safeParse(good).success).toBe(true);
    }
  });

  it.each([
    ['a formatted rupee string', '₹12,345.00'],
    ['Indian digit grouping', '1,23,456'],
    ['a decimal point', '1234.50'],
    ['a leading zero', '0123'],
    ['whitespace', ' 1234 '],
    ['scientific notation', '1e5'],
    ['a number rather than a string', 1234],
  ])('rejects %s', (_label, bad) => {
    expect(paiseWire.safeParse(bad).success).toBe(false);
  });

  it('returns a string, never a Paise', () => {
    // The schema validates the WIRE SHAPE only. If it transformed into Paise it
    // would need the parser, which lives in packages/money — and contracts
    // depends on nothing. Converting is `fromWire` in packages/money.
    const parsed = paiseWire.parse('1234500');
    expect(typeof parsed).toBe('string');
  });
});

describe('basisPointsWire', () => {
  it('accepts whole basis points', () => {
    for (const good of [0, 10, 75, 1800, 2000]) {
      expect(basisPointsWire.safeParse(good).success).toBe(true);
    }
  });

  it('rejects a fractional rate', () => {
    expect(basisPointsWire.safeParse(18.5).success).toBe(false);
  });

  it('rejects a negative rate', () => {
    expect(basisPointsWire.safeParse(-1).success).toBe(false);
  });

  it('allows rates above 100%, because s.201(1A) interest compounds past it', () => {
    expect(basisPointsWire.safeParse(15_000).success).toBe(true);
  });
});

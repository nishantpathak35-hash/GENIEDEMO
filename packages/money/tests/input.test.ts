import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  MoneyInputError,
  parsePercentToBasisPoints,
  parseQuantityToParts,
  parseRupeesToWire,
  parseWholeNumber,
} from '../src/input.js';
import { formatIndianRupees } from '../src/format.js';

/**
 * These exist so that `eslint.config.mjs` can ban `Number`, `parseInt` and
 * `parseFloat` under `apps/` outright. A ban with no alternative gets worked
 * around; the alternative has to land first.
 *
 * The assertion that carries the file is the round trip: rupees typed, sent as
 * paise, formatted back, identical. `Number("1234.56") * 100` is
 * `123455.99999999999`, so a float implementation fails it at the fourth case.
 */

describe('parseRupeesToWire', () => {
  it.each([
    ['50', '5000'],
    ['0', '0'],
    ['0.01', '1'],
    ['1234.56', '123456'],
    ['1,23,456.78', '12345678'],
    ['123456.7', '12345670'],
    ['-12.5', '-1250'],
    ['  1,000.00  ', '100000'],
    ['.5', '50'],
    ['1.', '100'],
    ['007', '700'],
    ['-0', '0'],
    // A PASTED AMOUNT ARRIVES DECORATED. `₹50` was on the refusal list below
    // until it cost a feature: the approval-chain editor prefilled a ceiling
    // with the symbol and the chain could then never be saved. The symbol is a
    // decoration on a number, so it is stripped where a symbol can appear —
    // and `'12 34'` stays on the refusal list, which is what shows the strip
    // is anchored rather than a blanket whitespace removal.
    ['₹50', '5000'],
    ['₹1,80,000.00', '18000000'],
    ['-₹50.00', '-5000'],
    ['1,000.00 ₹', '100000'],
    ['₹\u00A0250', '25000'],
  ])('parses %o as %o paise', (typed, wire) => {
    expect(parseRupeesToWire(typed)).toBe(wire);
  });

  it('is exact where a float is not', () => {
    // Number('1234.56') * 100 === 123455.99999999999, and Math.round hides it
    // for this value while failing for others. The string shift cannot.
    expect(parseRupeesToWire('1234.56')).toBe('123456');
    expect(parseRupeesToWire('8.29')).toBe('829');
  });

  it.each(['', '   ', 'abc', '12.345', '1e5', '12-3', '1..2', '-', '12 34', '5₹0'])(
    'refuses %o rather than coercing it to zero',
    (bad) => {
      expect(() => parseRupeesToWire(bad)).toThrow(MoneyInputError);
    },
  );

  it('refuses more precision than paise, rather than rounding it silently', () => {
    expect(() => parseRupeesToWire('10.005')).toThrow(/more precision/);
  });

  it('round-trips through the formatter for any amount', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 18n }), (paise) => {
        const typed = formatIndianRupees(paise.toString(10)).replace('₹', '');
        expect(parseRupeesToWire(typed)).toBe(paise.toString(10));
      }),
    );
  });
});

describe('parseQuantityToParts', () => {
  it.each([
    ['12.375', 12, 375_000],
    ['108', 108, 0],
    ['0.000001', 0, 1],
    ['1,000.5', 1000, 500_000],
    ['0', 0, 0],
  ])('parses %o as %i and %i millionths', (typed, whole, millionths) => {
    expect(parseQuantityToParts(typed)).toEqual({
      quantityWhole: whole,
      quantityMillionths: millionths,
    });
  });

  it('refuses a seventh decimal rather than truncating it', () => {
    expect(() => parseQuantityToParts('1.0000001')).toThrow(/more precision/);
  });

  it('refuses a negative quantity', () => {
    expect(() => parseQuantityToParts('-1')).toThrow(MoneyInputError);
  });
});

describe('parseWholeNumber', () => {
  it.each([
    ['12', 12],
    ['0', 0],
    ['-3', -3],
    ['1,000', 1000],
  ])('parses %o as %i', (typed, value) => {
    expect(parseWholeNumber(typed)).toBe(value);
  });

  it('refuses a decimal rather than truncating it, unlike parseInt', () => {
    // parseInt('12.9') is 12 and reports no problem.
    expect(() => parseWholeNumber('12.9')).toThrow(MoneyInputError);
  });

  it('refuses a value too large to send exactly', () => {
    // Number('9007199254740993') is 9007199254740992 — silently off by one.
    expect(() => parseWholeNumber('9007199254740993')).toThrow(/too large/);
  });
});

describe('parsePercentToBasisPoints', () => {
  it.each([
    ['18', 1800],
    ['0.1', 10],
    ['0.75', 75],
    ['100', 10_000],
    ['0', 0],
    ['6', 600],
  ])('parses %o%% as %i bp', (typed, bp) => {
    expect(parsePercentToBasisPoints(typed)).toBe(bp);
  });

  it('refuses a rate finer than a basis point', () => {
    // 10.608% is a real Sec 195 composite. It is not an integer number of
    // basis points, so it belongs in an exact Ratio decided server-side.
    expect(() => parsePercentToBasisPoints('10.608')).toThrow(/more precision/);
  });

  it('refuses a negative rate', () => {
    expect(() => parsePercentToBasisPoints('-1')).toThrow(MoneyInputError);
  });
});

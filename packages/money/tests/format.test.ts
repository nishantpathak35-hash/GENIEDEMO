import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  MoneyFormatError,
  formatBasisPoints,
  formatIndianRupees,
  formatCompactRupees,
  formatIndianRupeesOrDash,
  formatRupeesOrEmpty,
  formatQuantity,
  formatRupees,
} from '../src/format.js';
import { parseRupeesToWire } from '../src/input.js';

/**
 * Display formatting is the only operation an app performs on money, so these
 * tests are the whole of what an app is allowed to do with a monetary value.
 *
 * The case that earns its place is `"100000"`. Thousands grouping renders it
 * `₹1,000.00` too — the two conventions only diverge at the *lakh*, so a test
 * that checks only `₹1,23,45,678.90` would pass against a `toLocaleString`
 * implementation that is wrong for every figure between ₹1 lakh and ₹1 crore.
 */

describe('formatIndianRupees', () => {
  it('groups the last three digits, then twos', () => {
    // ₹1,23,45,678.90 — the brief's example, and the shape a crore reads in.
    expect(formatIndianRupees('1234567890')).toBe('₹1,23,45,678.90');
  });

  it.each([
    ['0', '₹0.00'],
    ['1', '₹0.01'],
    ['99', '₹0.99'],
    ['100', '₹1.00'],
    ['99999', '₹999.99'],
    ['100000', '₹1,000.00'],
    ['999999', '₹9,999.99'],
    ['10000000', '₹1,00,000.00'],
    ['1000000000', '₹1,00,00,000.00'],
    ['100000000000', '₹1,00,00,00,000.00'],
  ])('formats %s as %s', (wire, expected) => {
    expect(formatIndianRupees(wire)).toBe(expected);
  });

  it('puts the sign outside the symbol', () => {
    // A credit note. `₹-50.00` reads as a typo; `-₹50.00` reads as a credit.
    expect(formatIndianRupees('-5000')).toBe('-₹50.00');
    expect(formatIndianRupees('-12345678')).toBe('-₹1,23,456.78');
  });

  it('never renders a negative zero', () => {
    expect(formatIndianRupees('0')).toBe('₹0.00');
  });

  it('does not lose precision beyond Number.MAX_SAFE_INTEGER', () => {
    // ₹12,34,56,78,90,12,34,567.89. `Number('1234567890123456789')` is
    // 1234567890123456800 — the last three digits are already gone before any
    // formatting happens. The grouping is on the digit string so it cannot be.
    expect(formatIndianRupees('1234567890123456789')).toBe(
      '₹12,34,56,78,90,12,34,567.89',
    );
  });

  it.each([
    '',
    ' 100',
    '100 ',
    '1,000',
    '12.34',
    '₹100',
    '0100',
    '-0100',
    '1e5',
    'NaN',
    '+100',
  ])('refuses %o rather than coercing it', (bad) => {
    expect(() => formatIndianRupees(bad)).toThrow(MoneyFormatError);
  });

  it('refuses a number, which is the shape the legacy passed everywhere', () => {
    // `money()` in the legacy is `Number(value) || 0`. A number arriving here
    // means a float has already been through the value.
    expect(() => formatIndianRupees(1234 as unknown as string)).toThrow(MoneyFormatError);
  });

  it('is never lossy: the digits come back out', () => {
    fc.assert(
      fc.property(fc.bigInt(), (value) => {
        const wire = value.toString(10);
        const formatted = formatIndianRupees(wire);
        const recovered = formatted.replace(/[₹,.]/g, '');
        // Reconstructing the digits proves nothing was rounded, truncated or
        // re-based — only that separators were inserted.
        const expected = (value < 0n ? -value : value).toString(10).padStart(3, '0');
        expect(recovered.replace(/^-/, '')).toBe(expected);
      }),
    );
  });
});

describe('formatRupees', () => {
  it('omits the symbol for a column that carries it in the header', () => {
    expect(formatRupees('1234567890')).toBe('1,23,45,678.90');
    expect(formatRupees('-5000')).toBe('-50.00');
  });
});

describe('formatIndianRupeesOrDash', () => {
  it('renders an absent figure as an absence, never as zero', () => {
    // A takeoff cost is null when any item is uncosted (TAKE-01) and a project
    // has no health band without a contract value. `₹0.00` would read as a
    // real total over the priced subset, which is how an under-priced
    // quotation goes out.
    expect(formatIndianRupeesOrDash(null)).toBe('—');
    expect(formatIndianRupeesOrDash(undefined)).toBe('—');
    expect(formatIndianRupeesOrDash('0')).toBe('₹0.00');
  });
});

describe('formatQuantity', () => {
  it.each([
    ['12375000', '12.375'],
    ['108000000', '108'],
    ['0', '0'],
    ['1', '0.000001'],
    ['1000000000', '1,000'],
    ['-2500000', '-2.5'],
  ])('formats %s micros as %s', (micros, expected) => {
    expect(formatQuantity(micros)).toBe(expected);
  });

  it('refuses a non-canonical quantity', () => {
    expect(() => formatQuantity('12.375')).toThrow(MoneyFormatError);
  });
});

describe('formatBasisPoints', () => {
  it.each([
    [1800, '18%'],
    [10, '0.1%'],
    [75, '0.75%'],
    [0, '0%'],
    [10_000, '100%'],
    [5, '0.05%'],
    [600, '6%'],
  ])('formats %i bp as %s', (bp, expected) => {
    expect(formatBasisPoints(bp)).toBe(expected);
  });

  it('refuses a fractional rate rather than truncating it', () => {
    // 1060.8 bp is a real Sec 195 composite. It is not an integer bp and must
    // not silently become 1060.
    expect(() => formatBasisPoints(1060.8)).toThrow(MoneyFormatError);
  });
});

describe('formatRupeesOrEmpty — the default for an editable money field', () => {
  it('formats to RUPEES, because a money input is labelled rupees', () => {
    expect(formatRupeesOrEmpty('18000000')).toBe('1,80,000.00');
    expect(formatRupeesOrEmpty('1')).toBe('0.01');
  });

  it('gives EMPTY for an absent amount, not a dash', () => {
    // A dash typed back into a rupee input is not a number. Empty is the
    // absence the form already means by empty.
    expect(formatRupeesOrEmpty(null)).toBe('');
    expect(formatRupeesOrEmpty(undefined)).toBe('');
    expect(formatRupeesOrEmpty('')).toBe('');
  });

  it('DOES NOT PASS THE WIRE FORM THROUGH — that was the bug', () => {
    // Handing a `PaiseWire` to a rupee input typechecks, lints, and renders a
    // plausible number. Saving it re-reads the digits as rupees.
    expect(formatRupeesOrEmpty('18000000')).not.toBe('18000000');
  });

  it('still refuses input that is not a wire amount', () => {
    expect(() => formatRupeesOrEmpty('1,800.00')).toThrow();
    expect(() => formatRupeesOrEmpty('18.5')).toThrow();
  });
});

/**
 * The invariant a money FIELD has to hold, as opposed to a money label.
 *
 * A label is read. A field is read, edited and sent back, so whatever prefills
 * it must survive the parser on the way in. Two formatters failed this and both
 * failures shipped:
 *
 *   - a `PaiseWire` handed straight to a rupee input, which parses as a number
 *     a hundred times too large — silent, and the worse of the two;
 *   - `formatIndianRupees`, whose ₹ the input parser does not strip, so the
 *     save throws `"₹1,80,000.00" is not a number`.
 *
 * Asserting the round trip is what distinguishes "renders plausibly" from
 * "goes back where it came from".
 */
describe('a money field default survives the parser', () => {
  it('round-trips exactly, for the awkward magnitudes', () => {
    for (const wire of ['1', '99', '100', '100000', '18000000', '123456789012', '-5000']) {
      expect(parseRupeesToWire(formatRupeesOrEmpty(wire)), wire).toBe(wire);
    }
  });

  it('holds for any amount', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -100000000000000n, max: 100000000000000n }), (value) => {
        const wire = String(value);
        expect(parseRupeesToWire(formatRupeesOrEmpty(wire))).toBe(wire);
      }),
    );
  });

  it('and `formatIndianRupees` round-trips too, now that the symbol is tolerated', () => {
    // This assertion used to be `.toThrow(/is not a number/)`, and it was
    // right at the time: a ceiling prefilled with the symbol could not be
    // saved. The fix belonged in the parser — a person pastes `₹1,80,000.00`
    // whatever we prefill — so the symbol is now stripped on the way in.
    //
    // `formatRupeesOrEmpty` is still what a FIELD gets, for a different and
    // smaller reason: a field shows an undecorated number, because the label
    // beside it already says rupees.
    for (const wire of ['18000000', '-5000', '1']) {
      expect(parseRupeesToWire(formatIndianRupees(wire)), wire).toBe(wire);
    }
  });

  it('takes the symbol where a paste actually puts it, and nowhere else', () => {
    // Leading, trailing, and after the sign — `formatIndianRupees` emits
    // `-₹50.00`, and a spreadsheet emits the symbol on the right.
    expect(parseRupeesToWire('₹1,80,000.00')).toBe('18000000');
    expect(parseRupeesToWire('1,80,000.00 ₹')).toBe('18000000');
    expect(parseRupeesToWire('-₹50.00')).toBe('-5000');
    expect(parseRupeesToWire('₹-50.00')).toBe('-5000');

    // The space a paste brings with the symbol, in all three widths.
    expect(parseRupeesToWire('₹\u00A01,80,000.00')).toBe('18000000');
    expect(parseRupeesToWire('₹\u202F1,80,000.00')).toBe('18000000');
    expect(parseRupeesToWire('₹ 1,80,000.00')).toBe('18000000');

    // AND NOWHERE ELSE. Stripping whitespace globally to catch the pasted
    // space would have made the first of these a number.
    expect(() => parseRupeesToWire('1 2 3')).toThrow(/is not a number/);
    expect(() => parseRupeesToWire('50₹00')).toThrow(/is not a number/);
    expect(() => parseRupeesToWire('₹₹50')).toThrow(/is not a number/);
    expect(() => parseRupeesToWire('₹')).toThrow(/is not a number/);
  });
});

describe('formatCompactRupees — a chart axis tick', () => {
  it('prints rupees whole below a lakh, lakhs and crores to one decimal', () => {
    expect(formatCompactRupees('850000')).toBe('₹8,500');
    expect(formatCompactRupees('9999900')).toBe('₹99,999');
    expect(formatCompactRupees('10000000')).toBe('₹1L');
    expect(formatCompactRupees('400000000')).toBe('₹40L');
    expect(formatCompactRupees('425000000')).toBe('₹42.5L');
    expect(formatCompactRupees('2400000000')).toBe('₹2.4Cr');
    expect(formatCompactRupees('1000000000')).toBe('₹1Cr');
    expect(formatCompactRupees('4000000000')).toBe('₹4Cr');
  });

  it('rounds the decimal half up on the integer, never through a float', () => {
    expect(formatCompactRupees('425500000')).toBe('₹42.6L');
    expect(formatCompactRupees('425499999')).toBe('₹42.5L');
  });

  it('keeps the sign outside the symbol, and refuses a formatted string', () => {
    expect(formatCompactRupees('-400000000')).toBe('-₹40L');
    expect(formatCompactRupees('0')).toBe('₹0');
    expect(() => formatCompactRupees('₹40L')).toThrow();
  });
});

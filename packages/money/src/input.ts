/**
 * Parsing what a person typed — the counterpart of `format.ts`.
 *
 * A form collects rupees, a quantity like `12.375`, a percentage. Every one of
 * those has to become an exact integer before it can be sent, and every obvious
 * way to do it in a browser is wrong:
 *
 *   - `Number("1234.56") * 100` is `123455.99999999999`.
 *   - `parseInt("12.375")` is `12`, silently.
 *   - `parseFloat("1,23,456")` is `1`, silently.
 *
 * So the conversion lives here, in the module that owns exactness, and
 * `eslint.config.mjs` bans `Number`, `parseInt` and `parseFloat` outright under
 * `apps/`. Every function below works on the digit STRING and throws on
 * anything it cannot represent exactly — the legacy `money()` guard returns
 * `Number(value) || 0`, which turns a typo into a silent zero, and in a
 * statutory system that must throw (ADR-0012).
 *
 * These are inputs, not amounts: nothing here rounds, so nothing here needs a
 * statutory boundary. A value with more precision than the field holds is
 * refused rather than rounded, because rounding a person's input without
 * telling them is how ₹1,234.567 becomes a figure nobody typed.
 */

export class MoneyInputError extends Error {
  override readonly name = 'MoneyInputError';
}

/** Split a typed decimal into sign, whole digits and fraction digits. */
function decompose(
  text: string,
  field: string,
  maxFractionDigits: number,
): { negative: boolean; whole: string; fraction: string } {
  if (typeof text !== 'string') {
    throw new MoneyInputError(`${field}: expected the typed text, got ${typeof text}`);
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new MoneyInputError(`${field}: nothing was entered`);

  // Separators a person types are removed; a separator in the WIRE form is
  // rejected by `format.ts`. The two directions are deliberately asymmetric —
  // this side is human input, that side is a canonical value.
  //
  // A PASTED CURRENCY SYMBOL IS IN THAT CATEGORY, and leaving it out cost a
  // feature: the approval-chain editor prefilled a ceiling with
  // `formatIndianRupees`, so a chain that had a ceiling set could not be saved
  // again — `"₹1,80,000.00" is not a number`. Rupees arrive decorated from a
  // spreadsheet, a bank statement and our own display formatter, and the sign
  // goes OUTSIDE the symbol (`-₹50.00`), so the sign is preserved across the
  // strip rather than being stripped with it.
  //
  // The symbol is removed only WHERE ONE CAN ACTUALLY APPEAR — before the
  // digits, after an optional sign, or trailing — together with any space that
  // came with it, `\s` covering the non-breaking (U+00A0) and narrow
  // non-breaking (U+202F) spaces a paste brings along. Stripping whitespace
  // everywhere instead would quietly accept `"1 2 3"` as a hundred and
  // twenty-three, and this parser exists to refuse what it cannot represent.
  const cleaned = trimmed
    .replace(/^([+-]?)\s*\u20B9\s*/, '$1')
    .replace(/\s*\u20B9\s*$/, '')
    .replace(/,/g, '')
    .replace(/^\+/, '');
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(cleaned);
  if (match === null) {
    throw new MoneyInputError(`${field}: "${trimmed}" is not a number`);
  }
  const negative = match[1] === '-';
  const whole = match[2] ?? '';
  const fraction = match[3] ?? '';
  if (whole.length === 0 && fraction.length === 0) {
    throw new MoneyInputError(`${field}: "${trimmed}" is not a number`);
  }
  if (fraction.length > maxFractionDigits) {
    throw new MoneyInputError(
      `${field}: "${trimmed}" has more precision than this field holds ` +
        `(${String(maxFractionDigits)} decimal places)`,
    );
  }
  return { negative, whole, fraction };
}

/** Strip a leading run of zeros without turning "0" into "". */
function canonical(digits: string): string {
  const stripped = digits.replace(/^0+/, '');
  return stripped.length === 0 ? '0' : stripped;
}

/**
 * Rupees as typed → the canonical wire string of paise.
 *
 * `"1,23,456.78"` → `"12345678"`. `"50"` → `"5000"`. `"-12.5"` → `"-1250"`.
 *
 * The ×100 is a decimal shift on a string, which is why this function is in
 * this package: multiplying money is a `packages/money` operation whatever the
 * multiplier, and doing it as `value * 100` in a form handler is both a lint
 * violation and a float.
 */
export function parseRupeesToWire(text: string, field = 'amount'): string {
  const { negative, whole, fraction } = decompose(text, field, 2);
  const paise = `${canonical(whole)}${fraction.padEnd(2, '0')}`;
  const value = canonical(paise);
  return negative && value !== '0' ? `-${value}` : value;
}

/**
 * A measured quantity as typed → the exact whole/millionths pair the API takes.
 *
 * `"12.375"` → `{ quantityWhole: 12, quantityMillionths: 375_000 }`.
 *
 * Six decimal places, because that is what the column stores. A seventh is
 * refused rather than truncated: a quantity that silently loses a digit reaches
 * every figure derived from it.
 */
export function parseQuantityToParts(
  text: string,
  field = 'quantity',
): { quantityWhole: number; quantityMillionths: number } {
  const { negative, whole, fraction } = decompose(text, field, 6);
  if (negative) throw new MoneyInputError(`${field}: a quantity must not be negative`);
  const wholeDigits = canonical(whole);
  if (wholeDigits.length > 15) {
    throw new MoneyInputError(`${field}: "${text}" is too large to be a quantity`);
  }
  return {
    // Both are exact: the whole part is bounded above and the fraction is at
    // most six digits, so neither goes near Number.MAX_SAFE_INTEGER.
    quantityWhole: digitsToInt(wholeDigits, field),
    quantityMillionths: digitsToInt(canonical(fraction.padEnd(6, '0')), field),
  };
}

/**
 * A whole number as typed — a count, a head count, a page size.
 *
 * Refuses a decimal rather than truncating it, which is the difference between
 * this and `parseInt("12.9")`.
 */
export function parseWholeNumber(text: string, field = 'value'): number {
  const { negative, whole, fraction } = decompose(text, field, 0);
  if (fraction.length > 0) throw new MoneyInputError(`${field}: must be a whole number`);
  const value = digitsToInt(canonical(whole), field);
  return negative ? -value : value;
}

/**
 * A percentage as typed → basis points. `"18"` → `1800`, `"0.1"` → `10`.
 *
 * The everyday rates are exact here: GST 18% = 1800 bp, TDS 194Q 0.1% = 10 bp,
 * the 194C lower rate 0.75% = 75 bp. A rate needing more precision than two
 * decimals — the Sec 195 composite 10.608% — is refused rather than rounded,
 * because such a rate is not an integer number of basis points and belongs in
 * an exact `Ratio`, decided server-side.
 */
export function parsePercentToBasisPoints(text: string, field = 'rate'): number {
  const { negative, whole, fraction } = decompose(text, field, 2);
  if (negative) throw new MoneyInputError(`${field}: a rate must not be negative`);
  return digitsToInt(canonical(`${canonical(whole)}${fraction.padEnd(2, '0')}`), field);
}

/**
 * Digits → a safe integer, without `Number` or `parseInt`.
 *
 * `BigInt` parses the digit string exactly and the bound is checked before the
 * conversion to `number`, so a value too large to represent is an error rather
 * than a rounded approximation. `Number(9007199254740993n)` is
 * `9007199254740992` and reports no problem at all.
 */
function digitsToInt(digits: string, field: string): number {
  const value = BigInt(digits);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new MoneyInputError(`${field}: "${digits}" is too large to send exactly`);
  }
  return Number(value);
}

/**
 * Display formatting — the ONLY operation an app may perform on money.
 *
 * Every other export of this package produces or consumes a `Paise`. This one
 * takes the **wire string** and returns a display string, and that signature is
 * the point rather than a convenience:
 *
 *   - `toRupeeString(fromWire(x))` puts `fromWire` — a `Paise` *constructor* —
 *     inside an app. Once an app holds a `Paise`, it holds a `bigint`, and
 *     `bigint * bigint` type-checks. The narrow function removes the reason for
 *     an app to ever name a money type.
 *   - The parse happens here, in the one module permitted to reason about
 *     money, and it THROWS on anything that is not canonical. The legacy guard
 *     was `Number(value) || 0`, which turns corrupt data into a silent zero
 *     (ADR-0012).
 *
 * Indian digit grouping is last three, then twos: 12345678 paise is
 * `₹1,23,456.78`. Getting `100000` right (`₹1,000.00`, not `₹100,000.00`) is
 * what distinguishes this from `Intl`-style thousands grouping, and it is why
 * this is written rather than delegated to `toLocaleString` — that call takes a
 * `number`, and a crore-scale paise figure does not survive one.
 */

/** Canonical wire form: digits only, optional leading '-', no leading zeros. */
const WIRE = /^-?(?:0|[1-9][0-9]*)$/;

export class MoneyFormatError extends Error {
  override readonly name = 'MoneyFormatError';
}

/**
 * Group the whole-rupee part the Indian way: the last three digits, then twos.
 *
 * Operates on the digit STRING, never on a number — the input routinely exceeds
 * `Number.MAX_SAFE_INTEGER` on a crore-scale contract and there is no reason to
 * go anywhere near that limit for a grouping operation.
 */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const pairs: string[] = [];
  let index = rest.length;
  while (index > 2) {
    pairs.unshift(rest.slice(index - 2, index));
    index -= 2;
  }
  if (index > 0) pairs.unshift(rest.slice(0, index));
  return `${pairs.join(',')},${last3}`;
}

/** Split a canonical wire string into sign and absolute digits. */
function parseWire(wire: string, caller: string): { negative: boolean; digits: string } {
  if (typeof wire !== 'string') {
    throw new MoneyFormatError(`${caller} takes the wire string of paise, got ${typeof wire}`);
  }
  if (!WIRE.test(wire)) {
    throw new MoneyFormatError(
      `${caller}: "${wire}" is not a canonical amount of paise — digits only, ` +
        'no separators, decimal point or currency symbol',
    );
  }
  const negative = wire.startsWith('-');
  const digits = negative ? wire.slice(1) : wire;
  // "-0" is rejected by the regex above via the no-leading-zeros branch only
  // for multi-digit forms, so normalise the one remaining case rather than
  // rendering "-₹0.00".
  return { negative: negative && digits !== '0', digits };
}

/** Rupees and paise as two digit strings, from an absolute paise digit string. */
function split(digits: string): { rupees: string; paise: string } {
  const padded = digits.padStart(3, '0');
  return { rupees: padded.slice(0, -2), paise: padded.slice(-2) };
}

/**
 * `"12345678"` → `"1,23,456.78"`. No currency symbol.
 *
 * Use when the symbol is supplied by the surrounding markup — a column header
 * reading "Amount (₹)", for instance — so it is not repeated on every row.
 */
export function formatRupees(wire: string): string {
  const { negative, digits } = parseWire(wire, 'formatRupees');
  const { rupees, paise } = split(digits);
  return `${negative ? '-' : ''}${groupIndian(rupees)}.${paise}`;
}

/**
 * `"12345678"` → `"₹1,23,456.78"`. A negative amount reads `-₹50.00`.
 *
 * The sign goes OUTSIDE the symbol. `₹-50.00` is read as a typo; `-₹50.00` is
 * read as a credit.
 */
export function formatIndianRupees(wire: string): string {
  const { negative, digits } = parseWire(wire, 'formatIndianRupees');
  const { rupees, paise } = split(digits);
  return `${negative ? '-' : ''}₹${groupIndian(rupees)}.${paise}`;
}

/**
 * The same, but `null` renders as a stated absence rather than as zero.
 *
 * Several server figures are **nullable on purpose**: a takeoff total is `null`
 * when any item is uncosted, and a project has no health band without a
 * contract value. Rendering those as `₹0.00` is the failure this exists to
 * prevent — an absent total that looks like a real one is how an under-priced
 * quotation goes out (TAKE-01).
 */
export function formatIndianRupeesOrDash(wire: string | null | undefined): string {
  if (wire === null || wire === undefined) return '—';
  return formatIndianRupees(wire);
}

/**
 * A tick on a chart's axis: `"850000"` → `"₹8,500"`, `"4000000000"` → `"₹40L"`,
 * `"240000000000"` → `"₹2.4Cr"`. One decimal in lakhs and crores, the paise
 * dropped — a chart's axis has room for a magnitude and the full figure lives
 * in the tooltip and the table beside it (the design's chart grammar,
 * `docs/design/build/charts.mjs`). Axes only: never a figure in a cell, never
 * summed, never filed. It rounds because a magnitude is what it is for, and it
 * lives here because this is the one module that formats money.
 */
export function formatCompactRupees(wire: string): string {
  const { negative, digits } = parseWire(wire, 'formatCompactRupees');
  const { rupees } = split(digits);
  const sign = negative ? '-' : '';
  const whole = BigInt(rupees);
  const scaled = (unit: bigint, suffix: string): string => {
    // one decimal, rounded half up on the integer, so no float touches money
    const tenths = (whole * 10n + unit / 2n) / unit;
    const text = tenths % 10n === 0n ? String(tenths / 10n) : `${String(tenths / 10n)}.${String(tenths % 10n)}`;
    return `${sign}₹${text}${suffix}`;
  };
  if (whole >= 1_00_00_000n) return scaled(1_00_00_000n, 'Cr');
  if (whole >= 1_00_000n) return scaled(1_00_000n, 'L');
  return `${sign}₹${groupIndian(rupees)}`;
}

/**
 * A measured quantity, from the micros string the API returns.
 *
 * Not money, and deliberately in this module anyway: it is the other exact
 * fixed-point value that crosses the wire as a string, and the failure mode is
 * identical — `Number("12375000") / 1e6` in a table cell. Trailing zeros are
 * trimmed, so 12.375000 reads `12.375` and 108.000000 reads `108`.
 */
/**
 * `"12345678"` → `"1,23,456.78"`, and an absent amount → `""`.
 *
 * **For an editable field, which is why it is empty rather than a dash.** A
 * dash typed back into a rupee input is not a number; an empty field is the
 * absence the form already means by empty.
 *
 * This exists because the alternative is what a form does when nobody supplies
 * it: hand `MoneyField` — labelled *rupees, up to two decimals* — a `PaiseWire`
 * straight from the API. It is a digit string either way, so it is type-correct
 * and lint-clean, it renders as a plausible number, and the browser guard
 * cannot see it because an `<input value>` is not `innerText`. Saving then
 * re-reads those digits as rupees and multiplies the amount by a hundred, once
 * per round trip.
 *
 * Every default for a money input goes through this or through `formatRupees`.
 */
export function formatRupeesOrEmpty(wire: string | null | undefined): string {
  return wire === null || wire === undefined || wire === '' ? '' : formatRupees(wire);
}

export function formatQuantity(micros: string): string {
  const { negative, digits } = parseWire(micros, 'formatQuantity');
  const padded = digits.padStart(7, '0');
  const whole = padded.slice(0, -6);
  const fraction = padded.slice(-6).replace(/0+$/, '');
  const sign = negative ? '-' : '';
  return fraction.length === 0
    ? `${sign}${groupIndian(whole)}`
    : `${sign}${groupIndian(whole)}.${fraction}`;
}

/**
 * A rate in basis points, as a percentage: `1800` → `"18%"`, `10` → `"0.1%"`.
 *
 * A rate is not money, but it reaches a screen beside money and the same
 * temptation applies — `bp / 100` in a cell. Exact: the division is by a power
 * of ten on a digit string, so 1060.8 bp cannot be produced by an integer input
 * and 75 bp reads `0.75%` rather than `0.75000000000000001%`.
 */
export function formatBasisPoints(bp: number): string {
  if (!Number.isInteger(bp)) {
    throw new MoneyFormatError(`a rate must be a whole number of basis points, got ${String(bp)}`);
  }
  const negative = bp < 0;
  const digits = String(negative ? -bp : bp).padStart(3, '0');
  const whole = digits.slice(0, -2);
  const fraction = digits.slice(-2).replace(/0+$/, '');
  const sign = negative ? '-' : '';
  return fraction.length === 0 ? `${sign}${whole}%` : `${sign}${whole}.${fraction}%`;
}

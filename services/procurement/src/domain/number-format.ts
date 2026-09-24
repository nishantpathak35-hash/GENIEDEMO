/**
 * The Indian financial year, and how a document number is spelled.
 *
 * Ported from `src/modules/core/services/NumberSeriesService.ts`
 * (`getFinancialYear:16`, `formatNumber:35`, `preview:65`). The rule is real and
 * it is one of the few pieces of that file that is: the Indian financial year
 * runs 1 April to 31 March, so a purchase order raised on 31 March 2027 belongs
 * to 2026-27 and one raised the next morning belongs to 2027-28.
 *
 * **One deliberate divergence, recorded rather than smuggled.** The legacy calls
 * `new Date()` and reads `getMonth()` in whatever timezone the process happens
 * to run in — a browser in Dubai, a server in UTC. Our containers run UTC, and
 * under UTC every document raised between midnight and 05:29 IST on 1 April
 * would be filed in the year that ended the night before. The year is therefore
 * computed from a date in **Asia/Kolkata**, explicitly. See the defect table in
 * `docs/STACK-MIGRATION.md`.
 */

export const FY_FORMATS = ['YYYY-YY', 'YY-YY', 'YYYY', 'YY'] as const;
export type FyFormat = (typeof FY_FORMATS)[number];

export function isFyFormat(value: string): value is FyFormat {
  return (FY_FORMATS as readonly string[]).includes(value);
}

/**
 * The calendar date in India, as `[year, month]` with month 1-indexed.
 *
 * `en-CA` because it formats as `YYYY-MM-DD`, and `timeZone` because the
 * process timezone is not a business fact. No library: `Intl` is in the
 * runtime and a date library here would be a dependency carrying one function.
 */
function istParts(at: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
  const [year, month] = parts.split('-');
  return { year: Number(year), month: Number(month) };
}

/**
 * Which financial year a moment falls in, written the way the tenant asked.
 *
 * The year a financial year is NAMED BY is the calendar year it starts in:
 * 2026-27 begins on 1 April 2026. April onwards is the current year; January to
 * March belongs to the one before.
 */
export function financialYear(format: FyFormat, at: Date = new Date()): string {
  const { year, month } = istParts(at);
  const start = month >= 4 ? year : year - 1;
  const end = start + 1;

  switch (format) {
    case 'YYYY-YY':
      return `${start}-${String(end).slice(2)}`;
    case 'YY-YY':
      return `${String(start).slice(2)}-${String(end).slice(2)}`;
    case 'YYYY':
      return String(start);
    case 'YY':
      return String(start).slice(2);
  }
}

export interface SeriesFormat {
  readonly prefix: string;
  readonly separator: string;
  readonly padding: number;
  readonly includeFy: boolean;
  readonly fyFormat: FyFormat;
}

/**
 * Spell one number.
 *
 * The parts are joined by the separator, so `PO` + `2026-27` + `0042` with a
 * separator of `/` reads `PO/2026-27/0042`. A trailing separator on the prefix
 * is dropped, because somebody who types `PO/` into a prefix field means `PO`
 * and the legacy handles that (`formatNumber:41`) — the one piece of its
 * defensive coding worth keeping.
 *
 * `fy` is passed in rather than computed here. The allocation already had to
 * decide which financial year the counter belongs to, and computing it a second
 * time would let the two disagree across a midnight.
 */
export function formatSeriesNumber(
  format: SeriesFormat,
  sequence: number,
  fy: string,
): string {
  const separator = format.separator === '' ? '/' : format.separator;
  const parts: string[] = [];

  if (format.prefix !== '') {
    parts.push(
      format.prefix.endsWith(separator)
        ? format.prefix.slice(0, -separator.length)
        : format.prefix,
    );
  }
  if (format.includeFy) parts.push(fy);
  parts.push(String(sequence).padStart(format.padding, '0'));

  return parts.join(separator);
}

/**
 * Three examples of what this format produces, for a settings screen.
 *
 * Three rather than one because the interesting part of a numbering scheme is
 * what it looks like as it runs on, and a single sample hides a padding that is
 * about to overflow.
 */
export function previewSeries(
  format: SeriesFormat,
  from: number,
  at: Date = new Date(),
): readonly string[] {
  const fy = financialYear(format.fyFormat, at);
  return [0, 1, 2].map((offset) => formatSeriesNumber(format, from + offset, fy));
}

/** Statute text, CGST Rule 46(b) — provisional (CA-17). */
export const STATUTORY_NUMBER_MAX_LENGTH = 16;
const STATUTORY_CHARACTERS = /^[A-Za-z0-9/-]+$/;

/**
 * Why a payment voucher or tax invoice number is refused, or `null`.
 *
 * Our reading of CGST Rule 46(b) (statute text, provisional, CA-17): at most
 * sixteen characters, of letters, digits, hyphen and slash. Payment vouchers are
 * held to the same until the CA says otherwise.
 */
export function statutoryNumberProblem(number: string): string | null {
  if (!STATUTORY_CHARACTERS.test(number)) {
    return `A payment voucher or tax invoice number uses only letters, digits, hyphen and slash; ${number} does not.`;
  }
  if (number.length > STATUTORY_NUMBER_MAX_LENGTH) {
    return `A payment voucher or tax invoice number is at most sixteen characters; ${number} has ${String(number.length)}.`;
  }
  return null;
}

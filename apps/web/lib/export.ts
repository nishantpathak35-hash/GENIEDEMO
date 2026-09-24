import { formatIndianRupeesOrDash, formatQuantity } from '@cog/money';

/**
 * CSV export, on the server, of exactly what a list shows.
 *
 * The rows are read through the same API the screen reads, one window at a
 * time until the list ends — never the first page passed off as the whole —
 * and written with the screen's own formatters: rupees in Indian grouping,
 * quantities as a person measured them. The file is built in the web app's
 * server, where display formatting already lives; the API still computes every
 * figure in it.
 *
 * **A cap, not a job.** A list past `EXPORT_ROW_CAP` rows is refused with a
 * message to narrow the filters. No list on this product comes near it for a
 * single organisation, and a background job with a stored file and a download
 * link is a feature with its own retention and access questions — built when a
 * list first needs it, not before.
 */

export const EXPORT_ROW_CAP = 20_000;

type Outcome<T> =
  | { readonly kind: 'ok'; readonly data: T }
  | { readonly kind: 'refused'; readonly error: { readonly code: string; readonly message: string } }
  | { readonly kind: 'unreachable' };

export type ExportResult =
  | { readonly kind: 'ok'; readonly rows: ReadonlyArray<readonly string[]>; readonly headers?: readonly string[] }
  | { readonly kind: 'refused'; readonly error: { readonly code: string; readonly message: string } }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'too-many' };

/** Follow a paged list to its end, one window after another, up to the cap. */
export async function everyRow<T>(
  fetchPage: (cursor: string | undefined) => Promise<
    Outcome<{ readonly items: readonly T[]; readonly nextCursor: string | null }>
  >,
): Promise<Outcome<T[]> | { readonly kind: 'too-many' }> {
  const rows: T[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await fetchPage(cursor);
    if (page.kind !== 'ok') return page;
    rows.push(...page.data.items);
    if (rows.length > EXPORT_ROW_CAP) return { kind: 'too-many' };
    if (page.data.nextCursor === null) return { kind: 'ok', data: rows };
    cursor = page.data.nextCursor;
  }
}

/** Rupees in Indian grouping, without the symbol; an absent figure is an empty cell. */
export function rupees(wire: string | null): string {
  const text = formatIndianRupeesOrDash(wire);
  return wire === null ? '' : text.replace(/\u20B9/g, '').trim();
}

export function quantity(micros: string | null): string {
  return micros === null ? '' : formatQuantity(micros);
}

/**
 * Free text from a record — a name, a description, a note. A cell that begins
 * with `=`, `+`, `-` or `@` is a formula to a spreadsheet, and text somebody
 * typed into a form must not run as one on the machine that opens the file.
 */
export function text(value: string | null | undefined): string {
  const v = value ?? '';
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

function cell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The whole file: a byte-order mark so a spreadsheet reads UTF-8, CRLF line ends. */
export function toCsv(headers: readonly string[], rows: ReadonlyArray<readonly string[]>): string {
  return `\uFEFF${[headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

/** The screen's Export link: the same filters the list is showing, and only those. */
export function exportHref(
  list: string,
  params: Readonly<Record<string, string | string[] | undefined>>,
  keys: readonly string[],
): string {
  const qs = new URLSearchParams();
  for (const key of keys) {
    const value = params[key];
    if (typeof value === 'string' && value !== '') qs.set(key, value);
  }
  const query = qs.toString();
  return query === '' ? `/export/${list}` : `/export/${list}?${query}`;
}

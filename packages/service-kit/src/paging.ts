/**
 * Keyset paging, written once.
 *
 * Every list used to end in `LIMIT 200` and answer `nextCursor: null`, so a
 * tenant with 201 orders saw 200 and was told that was everything. A page is
 * now a window over a stable order — a sort column and the row id as the
 * tiebreak, which is sound inside a tenant because the primary key is
 * `(tenant_id, id)` — and the cursor is the key of the last row shown. No
 * OFFSET: an offset drifts when a row is inserted ahead of it and skips or
 * repeats a row across the boundary, which is exactly the kind of "missing
 * order" nobody can reproduce.
 *
 * A cursor is opaque to the client — base64url of the key and the id — and is
 * only ever handed back to the endpoint that issued it. A cursor from a list
 * sorted one way is meaningless to the same list sorted another, so a screen
 * drops the cursor whenever it changes the sort or a filter.
 *
 * The count is the total under the same filter, answered by the endpoint with
 * a second query; the range a screen prints ("Showing 51–100 of 250") comes
 * from the client's own `from` parameter, not from anything computed here —
 * a keyset page does not know its ordinal, and a screen does.
 */
import type { Context } from 'hono';

export interface Cursor {
  /** The sort column's value, as text, exactly as Postgres printed it. */
  readonly key: string;
  readonly id: string;
}

export interface PageQuery {
  readonly limit: number;
  readonly cursor: Cursor | null;
  /** `true` when the client asked for the page BEFORE the cursor (a "previous" link). */
  readonly before: boolean;
}

export interface PageLimits {
  readonly defaultLimit?: number;
  readonly maxLimit?: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify([cursor.key, cursor.id]), 'utf8').toString('base64url');
}

/** `null` for anything that is not a cursor this module wrote. */
export function decodeCursor(text: string): Cursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [key, id] = parsed as [unknown, unknown];
    if (typeof key !== 'string' || typeof id !== 'string') return null;
    if (!/^[0-9a-f-]{36}$/.test(id)) return null;
    return { key, id };
  } catch {
    return null;
  }
}

/**
 * Read `limit`, `cursor` and `dir` off the request. A limit outside the bounds
 * is clamped, not refused — a client asking for 10,000 rows gets the maximum
 * and a `nextCursor`, which is the answer it needed. A cursor that does not
 * decode IS refused, because acting on garbage would silently answer page one
 * and a caller walking the list would loop forever.
 */
export function readPage(c: Context, limits: PageLimits = {}): PageQuery | { readonly error: string } {
  const max = limits.maxLimit ?? MAX_LIMIT;
  const requested = Number.parseInt(c.req.query('limit') ?? '', 10);
  const limit = Number.isNaN(requested)
    ? (limits.defaultLimit ?? DEFAULT_LIMIT)
    : Math.min(Math.max(requested, 1), max);
  const raw = c.req.query('cursor');
  if (raw === undefined || raw === '') {
    return { limit, cursor: null, before: false };
  }
  const cursor = decodeCursor(raw);
  if (cursor === null) return { error: 'cursor is not one this list issued' };
  return { limit, cursor, before: c.req.query('dir') === 'before' };
}

export type KeyType = 'timestamptz' | 'date' | 'text' | 'numeric' | 'int';

export interface Keyset {
  /** A boolean SQL expression over the sort column and id; `TRUE` on the first page. */
  readonly where: string;
  /** `col DESC, id DESC` or the reverse — already flipped when walking backwards. */
  readonly orderBy: string;
  /** Bind values for `where`, to be appended after the caller's own parameters. */
  readonly params: readonly unknown[];
}

/**
 * The SQL for one page over `column` (tiebroken by `idColumn`), sorted
 * descending when `desc` is true. `firstParam` is the number the first cursor
 * bind should take, so the fragment composes with whatever filter parameters
 * the endpoint already binds.
 *
 * Walking backwards flips both the comparator and the order, so the query
 * still returns the nearest rows first; `finishPage` puts them back in list
 * order.
 */
export function keyset(
  page: PageQuery,
  column: string,
  idColumn: string,
  keyType: KeyType,
  desc: boolean,
  firstParam: number,
): Keyset {
  const forward = desc !== page.before;
  const orderBy = forward ? `${column} DESC, ${idColumn} DESC` : `${column} ASC, ${idColumn} ASC`;
  if (page.cursor === null) return { where: 'TRUE', orderBy, params: [] };
  const comparator = forward ? '<' : '>';
  return {
    where: `(${column}, ${idColumn}) ${comparator} ($${firstParam}::${keyType}, $${firstParam + 1}::uuid)`,
    orderBy,
    params: [page.cursor.key, page.cursor.id],
  };
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly prevCursor: string | null;
}

/**
 * Trim a fetch of `limit + 1` rows to the page and name its edges. Fetching
 * one row past the limit is how the endpoint knows a further page exists
 * without counting; the extra row is never returned.
 *
 * Both cursors are the keys of rows on THIS page — the last row for "next",
 * the first row for "previous" — so a client walking either way lands on the
 * adjacent window with no gap and no overlap. `prevCursor` is null on the
 * first page (no cursor was given) and, walking backwards, when the fetch
 * came up short of the start.
 */
export function finishPage<T>(
  rows: readonly T[],
  page: PageQuery,
  keyOf: (row: T) => Cursor,
): Page<T> {
  const more = rows.length > page.limit;
  const window = more ? rows.slice(0, page.limit) : [...rows];
  const items = page.before ? window.reverse() : window;
  const first = items[0];
  const last = items[items.length - 1];
  if (first === undefined || last === undefined) {
    return { items, nextCursor: null, prevCursor: null };
  }
  if (page.before) {
    return {
      items,
      nextCursor: encodeCursor(keyOf(last)),
      prevCursor: more ? encodeCursor(keyOf(first)) : null,
    };
  }
  return {
    items,
    nextCursor: more ? encodeCursor(keyOf(last)) : null,
    prevCursor: page.cursor === null ? null : encodeCursor(keyOf(first)),
  };
}

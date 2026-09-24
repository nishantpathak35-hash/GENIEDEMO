/**
 * Cursor paging as URL state.
 *
 * A list screen carries three parameters: `cursor` (opaque, issued by the
 * endpoint), `dir` (`before` when walking back) and `from` — the ordinal of
 * the first row on this window, which only the screen knows: a keyset page
 * has no idea it is rows 51–100, and the server is not asked to count rows
 * behind a cursor just to print a range. `limit` is the window size, one
 * number for every list so the ordinals stay honest across pages.
 *
 * Changing a filter or a sort drops the cursor: a cursor is a position in
 * ONE order, and the same position in another order is a different row.
 *
 * A copy of `apps/web/lib/paging.ts` — apps do not import one another, so
 * each app carries its own.
 */

import { parseWholeNumber } from "@cog/money";

export const PAGE_SIZE = 50;

export interface PageState {
  /** The query to send with the list request. */
  readonly query: Readonly<Record<string, string>>;
  /** The ordinal of the first row on this window. */
  readonly from: number;
  /** The URL parameter names this list's window lives under. */
  readonly keys: {
    readonly cursor: string;
    readonly dir: string;
    readonly from: string;
  };
}

/**
 * Read the paging state off a screen's search params. A screen with two
 * lists gives each its own `prefix`, so the windows do not share a cursor.
 */
export function pageState(
  params: Readonly<Record<string, string | undefined>>,
  prefix = "",
): PageState {
  const keys = {
    cursor: `${prefix}cursor`,
    dir: `${prefix}dir`,
    from: `${prefix}from`,
  };
  const cursor = params[keys.cursor];
  const dir = params[keys.dir];
  // an ordinal, read the way every typed number is read here — never Number()
  const fromText = params[keys.from] ?? "";
  const from = /^[1-9][0-9]{0,8}$/.test(fromText) ? parseWholeNumber(fromText, "from") : 1;
  return {
    query: {
      limit: String(PAGE_SIZE),
      ...(cursor === undefined || cursor === "" ? {} : { cursor }),
      ...(dir === "before" ? { dir } : {}),
    },
    from: cursor === undefined || cursor === "" ? 1 : from,
    keys,
  };
}

export interface PageLinks {
  readonly shown: { readonly from: number; readonly to: number };
  readonly next: string | null;
  readonly prev: string | null;
}

/**
 * The pager's range and its two hrefs. `hrefFor` is the screen's own
 * URL builder (it keeps the filters and the sort); this only decides the
 * three paging parameters for each neighbour.
 */
export function pageLinks(
  state: PageState,
  page: {
    readonly items: readonly unknown[];
    readonly nextCursor: string | null;
    readonly prevCursor: string | null;
  },
  hrefFor: (overrides: Record<string, string | undefined>) => string,
): PageLinks {
  const shownCount = page.items.length;
  const to = shownCount === 0 ? state.from : state.from + shownCount - 1;
  const before = state.from - PAGE_SIZE;
  return {
    shown: { from: state.from, to },
    next:
      page.nextCursor === null
        ? null
        : hrefFor({
            [state.keys.cursor]: page.nextCursor,
            [state.keys.dir]: undefined,
            [state.keys.from]: String(to + 1),
          }),
    prev:
      page.prevCursor === null
        ? null
        : hrefFor({
            [state.keys.cursor]: page.prevCursor,
            [state.keys.dir]: "before",
            [state.keys.from]: String(before < 1 ? 1 : before),
          }),
  };
}

import { parseWholeNumber } from '@cog/money';

/**
 * A list's address — what every list keeps in the URL and how it builds the
 * next one (`docs/design/13-decisions.html`, "four thousand of them": the
 * filters, the sort and the page are in the address, so a sorted, filtered
 * page can be sent to somebody, and the server answers it).
 *
 * `hrefFor` merges an override into the current query, drops the paging
 * parameters on any change that is not itself a paging change — a cursor is
 * a position in one order, and the same position in another order is a
 * different row — and leaves out empty values so the address stays short.
 */
export type Params = Readonly<Record<string, string | undefined>>;

export const PAGE_SIZES = [12, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;

/** The page size the address asks for, one of the sizes the pager offers. */
export function pageSizeOf(params: Params): number {
  const text = params['limit'] ?? '';
  if (!/^[0-9]{1,3}$/.test(text)) return DEFAULT_PAGE_SIZE;
  const n = parseWholeNumber(text, 'limit');
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
}

const PAGING_KEYS = ['cursor', 'dir', 'from'];

export function listAddress(base: string, params: Params, keys: readonly string[]) {
  const current: Record<string, string | undefined> = {};
  for (const key of [...keys, 'limit', 'view', ...PAGING_KEYS]) current[key] = params[key];
  const hrefFor = (overrides: Record<string, string | undefined>): string => {
    const pagingChange = PAGING_KEYS.some((k) => k in overrides);
    const merged: Record<string, string | undefined> = {
      ...current,
      ...(pagingChange ? {} : { cursor: undefined, dir: undefined, from: undefined }),
      ...overrides,
    };
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== '') next.set(key, value);
    }
    const qs = next.toString();
    return qs === '' ? base : `${base}?${qs}`;
  };
  return {
    hrefFor,
    /** The page-size control's hrefs, one per size. */
    perPageHrefs: PAGE_SIZES.map((size) => [size, hrefFor({ limit: size === DEFAULT_PAGE_SIZE ? undefined : String(size) })] as const),
    /** The address with every filter dropped, for Clear all. */
    clearAll: hrefFor(Object.fromEntries(keys.map((k) => [k, undefined]))),
    /** The filter keys and values on, as a saved view would keep them. */
    criteria: Object.fromEntries(keys.filter((k) => (params[k] ?? '') !== '').map((k) => [k, params[k] as string])),
  };
}

/** An applied filter as the tag row shows it. */
export function applied(
  hrefFor: (o: Record<string, string | undefined>) => string,
  entries: ReadonlyArray<{ key: string; label: string; value: string | undefined; show?: (v: string) => string }>,
): ReadonlyArray<{ key: string; label: string; value: string; removeHref: string }> {
  return entries
    .filter((e): e is typeof e & { value: string } => e.value !== undefined && e.value !== '')
    .map((e) => ({ key: e.key, label: e.label, value: e.show === undefined ? e.value : e.show(e.value), removeHref: hrefFor({ [e.key]: undefined }) }));
}

/** A saved view's criteria fill the address in where the address is silent. */
export function withView(params: Params, criteria: Readonly<Record<string, string>> | null): Params {
  if (criteria === null) return params;
  const out: Record<string, string | undefined> = { ...params };
  for (const [k, v] of Object.entries(criteria)) if (out[k] === undefined) out[k] = v;
  return out;
}

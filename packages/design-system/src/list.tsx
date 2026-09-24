import type { ReactNode } from 'react';

/**
 * The furniture around a server-paginated, server-sorted, server-filtered
 * list: a toolbar, what a filter did, the row count and its pages, the bar
 * that appears once something is selected, a header that sorts, and the
 * loading state that is the table rather than a spinner over it.
 *
 * Every link here is a real `<a href>`. `13-decisions.html` is explicit that
 * sorting and filtering the visible page in the browser is the defect that
 * looks like a feature — it silently reorders 50 of 4,000 rows and presents
 * the answer as if it were the whole set — so a page number, a sort
 * direction and a filter removal are all navigations the server answers,
 * never a click handler that reorders what is already on screen.
 */

/* --- Toolbar ------------------------------------------------------------ */

/**
 * The row above a table: search, filter controls, a spacer to push
 * something to the trailing edge. A thin wrapper on purpose — the controls
 * inside it are the caller's, this only lays them out and loses the field
 * margin that would otherwise stack them.
 */
export function Toolbar({ children }: { children: ReactNode }): ReactNode {
  return <div className="toolbar">{children}</div>;
}

export namespace Toolbar {
  /** `<Toolbar.Spacer />` — pushes what follows it to the trailing edge. */
  export function Spacer(): ReactNode {
    return <div className="spacer" />;
  }
}

/* --- FilterChips --------------------------------------------------------- */

export interface FilterChip {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  /** Where removing just this filter goes. The URL carries the state. */
  readonly removeHref: string;
}

/**
 * What is applied, each one removable, plus a way to clear all of it.
 *
 * Links, not buttons with client state — removing a filter is a navigation
 * to the URL without it, the same as applying one was. Renders nothing when
 * nothing is applied, so a screen with no active filters does not carry an
 * empty bar above its table.
 */
export function FilterChips({
  applied,
  clearAllHref,
  count,
}: {
  applied: readonly FilterChip[];
  clearAllHref: string;
  count?: { shown: number; of: number };
}): ReactNode {
  if (applied.length === 0) return null;
  return (
    <div className="chips">
      <span className="chips-l">
        {count === undefined ? 'Filtered by' : `Filtered by ${count.shown} of ${count.of}`}
      </span>
      {applied.map((chip) => (
        <a
          key={chip.key}
          className="chip"
          href={chip.removeHref}
          aria-label={`${chip.label} ${chip.value}, remove this filter`}
        >
          {chip.label} <b>{chip.value}</b>
          <span className="ico" aria-hidden="true">
            ×
          </span>
        </a>
      ))}
      <a className="btn sm ghost" href={clearAllHref}>
        Clear all
      </a>
    </div>
  );
}

/* --- Pager ---------------------------------------------------------------- */

/**
 * Which page numbers to draw around the current one: the first, the last,
 * one on each side of the current page, and a gap wherever that leaves a
 * hole — the same shape as the design's `1 · 2 · … · 7`.
 */
function pageTokens(current: number, total: number): ReadonlyArray<number | 'gap'> {
  const keep = new Set<number>([1, total, current]);
  if (current > 1) keep.add(current - 1);
  if (current < total) keep.add(current + 1);
  const sorted = [...keep].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);

  const tokens: Array<number | 'gap'> = [];
  let prev: number | undefined;
  for (const p of sorted) {
    if (prev !== undefined && p - prev > 1) tokens.push('gap');
    tokens.push(p);
    prev = p;
  }
  return tokens;
}

/**
 * "All 1 orders" is a count that reads as a bug. Callers pass the plural noun;
 * for exactly one the plural loses its ending — `entries` → `entry`,
 * `orders` → `order`. A caller with an irregular noun passes the singular
 * itself when it knows the count is one.
 */
function nounFor(count: number, plural: string): string {
  if (count !== 1) return plural;
  if (plural.endsWith('ies')) return `${plural.slice(0, -3)}y`;
  return plural.endsWith('s') ? plural.slice(0, -1) : plural;
}

function pagerCount({
  shown,
  of,
  filteredFrom,
  unit: plural,
  pages,
  windowed,
}: {
  shown: { from: number; to: number };
  of: number;
  filteredFrom?: number;
  unit: string;
  pages?: number;
  /** A cursor-paged list: this is one window over the count, not the whole. */
  windowed?: boolean;
}): ReactNode {
  if (of === 0) {
    return (
      <>
        <b>No items</b>
        {filteredFrom === undefined ? null : <span className="of"> of {filteredFrom} match</span>}
      </>
    );
  }
  // The server has already declared the list complete — nothing paginated,
  // so there is no range to report, only the whole of it. Not when a filter
  // is in play, though: "All 3 items" would hide the fact that a filter is
  // what got it down to 3, which is exactly the distinction filteredFrom
  // exists to keep visible.
  const unit = nounFor(of, plural);
  if (pages === undefined && filteredFrom === undefined && windowed !== true) {
    return (
      <>
        All <b>{of}</b> {unit}
      </>
    );
  }
  return (
    <>
      Showing{' '}
      <b>
        {shown.from}–{shown.to}
      </b>{' '}
      of <b>{of}</b> {unit}
      {filteredFrom === undefined ? null : <span className="of"> filtered from {filteredFrom}</span>}
    </>
  );
}

/**
 * The row count, always stated, plus page links.
 *
 * `of === 0` reads "No items", never `0–0 of 0` — a count built from
 * arithmetic on absent data looks like a real answer. `pages` left
 * `undefined` means the server has already declared the list complete (the
 * one case `13-decisions.html` allows a client-sorted table: under ~200
 * rows), and the count reads "All N …" rather than a range. Page buttons are
 * links via `hrefFor`; an end with nowhere to go renders with no `href` at
 * all, which is what makes it un-followable rather than merely styled as
 * disabled.
 *
 * A cursor-paged list passes `next` and `prev` instead — the hrefs of the
 * adjacent windows, `null` at either end. A keyset page has no ordinal, so
 * there are no page numbers to draw; the range, the count and the two arrows
 * are the whole control, and the count is the server's total under the same
 * filter, never the length of the window.
 */
export function Pager({
  shown,
  of,
  filteredFrom,
  unit,
  page,
  pages,
  hrefFor,
  next,
  prev,
}: {
  shown: { from: number; to: number };
  of: number;
  filteredFrom?: number;
  unit: string;
  page?: number;
  pages?: number;
  hrefFor?: (page: number) => string;
  /** Cursor paging: the next window's href, `null` at the end. */
  next?: string | null;
  /** Cursor paging: the previous window's href, `null` at the start. */
  prev?: string | null;
}): ReactNode {
  const windowed = next !== undefined || prev !== undefined;
  // One window that is the whole list reads "All N", the same as an unpaged list.
  const whole = windowed && (next ?? null) === null && (prev ?? null) === null;
  return (
    <div className="pager">
      <p className="count">
        {pagerCount({
          shown,
          of,
          unit,
          ...(filteredFrom === undefined ? {} : { filteredFrom }),
          ...(pages === undefined ? {} : { pages }),
          ...(windowed && !whole ? { windowed: true } : {}),
        })}
      </p>
      {windowed && !whole ? (
        <nav className="pages" aria-label="Pages">
          <a
            className="pg"
            aria-label="Previous page"
            {...(prev !== undefined && prev !== null ? { href: prev } : { 'aria-disabled': 'true' as const })}
          >
            <span aria-hidden="true">‹</span>
          </a>
          <a
            className="pg"
            aria-label="Next page"
            {...(next !== undefined && next !== null ? { href: next } : { 'aria-disabled': 'true' as const })}
          >
            <span aria-hidden="true">›</span>
          </a>
        </nav>
      ) : null}
      {page === undefined || pages === undefined || hrefFor === undefined || pages <= 1 ? null : (
        <nav className="pages" aria-label="Pages">
          <a
            className="pg"
            aria-label="Previous page"
            {...(page > 1 ? { href: hrefFor(page - 1) } : { 'aria-disabled': 'true' as const })}
          >
            <span aria-hidden="true">‹</span>
          </a>
          {pageTokens(page, pages).map((token, index) =>
            token === 'gap' ? (
              <span key={`gap-${index}`} className="gap">
                …
              </span>
            ) : (
              <a
                key={token}
                className={token === page ? 'pg on' : 'pg'}
                href={hrefFor(token)}
                {...(token === page ? { 'aria-current': 'page' as const } : {})}
              >
                {token}
              </a>
            ),
          )}
          <a
            className="pg"
            aria-label="Next page"
            {...(page < pages ? { href: hrefFor(page + 1) } : { 'aria-disabled': 'true' as const })}
          >
            <span aria-hidden="true">›</span>
          </a>
        </nav>
      )}
    </div>
  );
}

/* --- BulkBar --------------------------------------------------------------- */

/**
 * The selection count, the actions that apply to a set, and a way out.
 *
 * Visually above the table, but this only renders the bar itself — the
 * DOM/visual split is `ListFrame`'s job, not this component's, so a caller
 * using `BulkBar` outside a `ListFrame` still gets a correct (if plainly
 * ordered) result. Hidden entirely at zero: a bulk bar with nothing selected
 * is a bar that says nothing.
 */
export function BulkBar({
  count,
  children,
  onClear,
  clearLabel,
}: {
  count: number;
  children: ReactNode;
  onClear?: () => void;
  clearLabel: string;
}): ReactNode {
  if (count === 0) return null;
  return (
    <div className="bulkbar" role="region" aria-label={`${count} selected`}>
      <span className="n">
        <b>{count}</b> selected
      </span>
      <div className="ba">{children}</div>
      <button type="button" className="btn sm ghost" onClick={onClear}>
        {clearLabel}
      </button>
    </div>
  );
}

/* --- SortableHeader -------------------------------------------------------- */

export type SortDir = 'asc' | 'desc';

/**
 * A `<th>` whose label is a link that toggles direction.
 *
 * Server-side, like everything else here: the link changes the URL and the
 * server returns the sorted page, so there is never a moment where the
 * visible rows and the sort indicator disagree. `aria-sort` on the `<th>`
 * carries the state for assistive tech regardless of how the direction is
 * drawn. The icon is a slot — icons are another agent's build — and a plain
 * ↑/↓ stands in until one is passed.
 */
export function SortableHeader({
  label,
  sortKey,
  current,
  hrefFor,
  numeric,
  icon,
}: {
  label: string;
  sortKey: string;
  current: { key: string; dir: SortDir } | null;
  hrefFor: (key: string, dir: SortDir) => string;
  numeric?: boolean;
  icon?: ReactNode;
}): ReactNode {
  const dir: SortDir | undefined = current !== null && current.key === sortKey ? current.dir : undefined;
  const nextDir: SortDir = dir === 'asc' ? 'desc' : 'asc';
  const ariaSort = dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none';

  return (
    <th {...(numeric ? { className: 'num' } : {})} aria-sort={ariaSort}>
      <a className="sort" href={hrefFor(sortKey, nextDir)}>
        <span>{label}</span>
        {dir === undefined ? null : (
          <span className="ico" aria-hidden="true">
            {icon ?? (dir === 'asc' ? '↑' : '↓')}
          </span>
        )}
      </a>
    </th>
  );
}

/* --- Skeleton ---------------------------------------------------------------- */

export interface SkeletonColumn {
  readonly label: string;
  readonly numeric?: boolean;
}

/**
 * The table itself, while it loads — not a spinner over it.
 *
 * A real `thead` with the real column names, real rows at real cell padding,
 * and a shimmer sized to a line box in place of the text. That is the whole
 * point: it must be the SAME table, or the page changes height the moment
 * the data arrives and the pager jumps out from under the pointer. `aria-busy`
 * marks the table as updating; the caption is the visually-hidden text a
 * screen reader gets, and `.skel-note` beside it is the sighted equivalent.
 */
export function Skeleton({
  columns,
  rows = 6,
  note = 'Loading…',
}: {
  columns: readonly SkeletonColumn[];
  rows?: number;
  note?: string;
}): ReactNode {
  return (
    <div className="tbl-wrap">
      <table className="tbl skel" aria-busy="true">
        <caption className="sr-only">Loading…</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.label} {...(column.numeric ? { className: 'num' } : {})}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, row) => (
            <tr key={row}>
              {columns.map((column) => (
                <td key={column.label} {...(column.numeric ? { className: 'num' } : {})}>
                  <Skeleton.Line />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="skel-note muted">{note}</p>
    </div>
  );
}

export namespace Skeleton {
  /** One shimmer line, sized to a line box — for a stat or any figure that loads on its own. */
  export function Line(): ReactNode {
    return <span className="skeleton" />;
  }
}

/* --- ListFrame --------------------------------------------------------------- */

/**
 * Holds a toolbar, filter chips, a bulk bar, a table and a pager in the
 * order the design draws them, while keeping the bulk bar after the table
 * in the DOM.
 *
 * `13-decisions.html` ("Keyboard") is explicit: the bulk bar is reached by
 * tabbing forward FROM the table, not tabbed through to reach the rows —
 * "it appears above it visually but after it in the DOM". CSS `order`
 * changes paint order, never focus order, so this wrapper is what makes
 * both true at once. Render `Toolbar`, `FilterChips`, the table (inside
 * `.table-scroll`, as shipped) and `Pager` in whatever order is convenient;
 * render `BulkBar` after the table. This component supplies no state of its
 * own — it is a layout device, not a data holder.
 */
export function ListFrame({ children }: { children: ReactNode }): ReactNode {
  return <div className="list-frame">{children}</div>;
}

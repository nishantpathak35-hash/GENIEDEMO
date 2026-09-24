import type { ReactNode } from 'react';
import { Icon } from './sprite.js';
import { ListRows } from './list-rows.js';

/**
 * The list pattern — one list for every list screen (`docs/design/00-
 * foundations.html`, "The patterns"; `build/patterns.mjs` listView).
 *
 * A card leading with its full width in the reference's columns: the
 * toolbar (search, then `View by:` and every filter as its field and value,
 * a spacer, the column control, Export), the applied filters as removable
 * tags, the table with a checkbox column and sortable heads, the bulk bar —
 * after the table in the DOM and above it on screen — and the pager with the
 * count. A row opens its record in a pane BESIDE the list, and the list
 * stays live; the overlay drawer is kept for a step in a flow.
 *
 * Columns carry a priority. 1 is identity or the decision and never drops;
 * 2 is money or status; 3 is reference, and a priority-3 cell folds into the
 * row's detail line when the list is narrow — which it is whenever a record
 * is open beside it. Beside a record the list keeps number, status and
 * amount as columns; only reference folds. The stylesheet does the folding
 * from the `p2`/`p3` classes; this component only declares them.
 *
 * Every link here is a real `<a href>`: sorting, filtering and paging are
 * navigations the server answers, never a click handler that reorders what
 * is on screen (13-decisions, "four thousand of them").
 */

export type ColumnPriority = 1 | 2 | 3;
export type SortDir = 'asc' | 'desc';

export interface Column {
  readonly key: string;
  readonly label: string;
  readonly p: ColumnPriority;
  readonly num?: boolean;
  /** The attachment clip's column: no label, a paperclip in the head. */
  readonly clip?: boolean;
  /** `null`: sortable, not sorted; a direction: sorted; absent: not sortable. */
  readonly sort?: SortDir | null;
  readonly sortHref?: string;
}

export interface Row {
  readonly key: string;
  /** Where the row opens — its record in the pane beside the list, or the full page. Enter and a click both go there. */
  readonly href?: string;
  readonly cells: readonly ReactNode[];
  /** What the reference columns fold into, under the identity cell, when the list is narrow. */
  readonly detail?: ReactNode;
  /** The same, beside an open record, where only reference folds. */
  readonly detailPane?: ReactNode;
  readonly open?: boolean;
  /** Waiting on this person: the purple tint. */
  readonly mine?: boolean;
  readonly selectLabel?: string;
}

export interface ToolbarFilter {
  readonly key: string;
  readonly label: string;
  /** The value on, or `null` for All. */
  readonly value: string | null;
  readonly control: ReactNode;
}

/** The toolbar: search, View by: and the filters, a spacer, Columns, Export. */
export function ListToolbar({
  search,
  filters = [],
  columns,
  exportHref,
  compact,
  formAction,
  hidden = {},
}: {
  search?: {
    readonly name: string;
    readonly placeholder: string;
    readonly value: string;
    readonly label?: string;
  };
  filters?: readonly ToolbarFilter[];
  columns?: ReactNode;
  exportHref?: string;
  /** Beside a record the Columns and Export controls fold to their icons. */
  compact?: boolean;
  formAction: string;
  /** The rest of the address the toolbar's form must keep (sort, a saved view). */
  hidden?: Readonly<Record<string, string>>;
}): ReactNode {
  // The search and the filters are one GET form; Columns and Export sit
  // beside it in the same toolbar, each its own control, so no form nests.
  return (
    <div className="toolbar lv-tb">
      <form method="get" action={formAction} className="lv-q">
        {search === undefined ? null : (
          <div className="search">
            <Icon name="search" />
            <input type="search" name={search.name} defaultValue={search.value} aria-label={search.label ?? search.placeholder} placeholder={search.placeholder} />
          </div>
        )}
        {filters.length === 0 ? null : <span className="viewby">View by:</span>}
        {filters.map((f) => (
          <details key={f.key} className="fwrap">
            <summary className={f.value === null ? 'fbtn' : 'fbtn on'} aria-haspopup="dialog">
              <span>
                {f.label}: <b>{f.value ?? 'All'}</b>
              </span>
              <Icon name="chevron" size="sm" />
            </summary>
            <div className="popup filter-pop" role="dialog" aria-label={f.label}>
              {f.control}
              <div className="filter-foot">
                <button type="submit" className="btn sm primary">
                  Apply
                </button>
              </div>
            </div>
          </details>
        ))}
        {Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      </form>
      <span className="spacer" />
      {columns === undefined ? null : <div className="colwrap">{columns}</div>}
      {exportHref === undefined ? null : compact ? (
        <a className="btn icon" href={exportHref} aria-label="Export">
          <Icon name="download" />
        </a>
      ) : (
        <a className="btn" href={exportHref}>
          <Icon name="download" />
          Export
        </a>
      )}
    </div>
  );
}

/** A removable applied filter, and the row of them. */
export function AppliedFilters({
  applied,
  clearAllHref,
}: {
  applied: ReadonlyArray<{
    readonly key: string;
    readonly label: string;
    readonly value: string;
    readonly removeHref: string;
  }>;
  clearAllHref: string;
}): ReactNode {
  if (applied.length === 0) return null;
  return (
    <div className="chips">
      <span className="chips-l">Filtered by</span>
      {applied.map((a) => (
        <span key={a.key} className="tag removable">
          <span className="tk">{a.label}</span>
          <b>{a.value}</b>
          <a className="tag-x" href={a.removeHref} aria-label={`Remove the filter ${a.label}: ${a.value}`}>
            <Icon name="x" size="sm" />
          </a>
        </span>
      ))}
      <a className="btn sm ghost" href={clearAllHref}>
        Clear all
      </a>
    </div>
  );
}

const cls = (c: Column): string => [c.num === true ? 'num' : '', c.p === 3 ? 'p3' : '', c.p === 2 ? 'p2' : '', c.clip === true ? 'clipc' : ''].filter(Boolean).join(' ');

/** The table on the pattern: a checkbox column, sortable heads, the detail line under the identity. */
export function ListTable({ columns, rows, select = true, label }: { columns: readonly Column[]; rows: readonly Row[]; select?: boolean; label: string }): ReactNode {
  const idCol = Math.max(
    0,
    columns.findIndex((c) => c.p === 1),
  );
  return (
    <div className="tbl-wrap">
      <table className="tbl lv-t" aria-label={label}>
        <thead>
          <tr>
            {select ? (
              <th className="check">
                <input type="checkbox" aria-label="Select every row on this page" />
              </th>
            ) : null}
            {columns.map((c) => {
              const k = cls(c);
              if (c.clip === true) {
                return (
                  <th key={c.key} className={k}>
                    <span className="sr-only">Attachment</span>
                    <Icon name="paperclip" size="sm" />
                  </th>
                );
              }
              if (c.sort === undefined) {
                return (
                  <th key={c.key} {...(k === '' ? {} : { className: k })}>
                    {c.label}
                  </th>
                );
              }
              const ariaSort = c.sort === 'asc' ? 'ascending' : c.sort === 'desc' ? 'descending' : 'none';
              return (
                <th key={c.key} {...(k === '' ? {} : { className: k })} aria-sort={ariaSort}>
                  <a className="sort" href={c.sortHref ?? '#'}>
                    {c.label}
                    {c.sort === null ? (
                      // the unsorted column's glyph shows on hover and focus only (`.sort .i.off`)
                      <svg className="i sm off" aria-hidden="true">
                        <use href="#i-sort" />
                      </svg>
                    ) : (
                      <Icon name={c.sort === 'asc' ? 'up' : 'down'} size="sm" bare />
                    )}
                  </a>
                </th>
              );
            })}
          </tr>
        </thead>
        <ListRows
          rows={rows.map((r) => ({
            key: r.key,
            ...(r.href === undefined ? {} : { href: r.href }),
            open: r.open === true,
            mine: r.mine === true,
            selectLabel: r.selectLabel ?? 'this row',
            cells: r.cells.map((cell, i) => ({
              cell,
              className: columns[i] === undefined ? '' : cls(columns[i] as Column),
              detail: i === idCol ? r.detail : undefined,
              detailPane: i === idCol ? r.detailPane : undefined,
            })),
          }))}
          select={select}
        />
      </table>
    </div>
  );
}

/**
 * The card that holds a list, and the record beside it.
 *
 * `pane` present puts the list and the record side by side (`.lv.with-pane`),
 * folds priority-3 columns into the detail line and the toolbar's Columns and
 * Export to icons; below 760px the pane takes the screen with Back to the list.
 */
export function ListCard({
  label,
  toolbar,
  applied,
  children,
  bulk,
  pager,
  pane,
}: {
  label: string;
  toolbar?: ReactNode;
  applied?: ReactNode;
  /** The table, or one of the six states in its place. */
  children: ReactNode;
  bulk?: ReactNode;
  pager?: ReactNode;
  pane?: ReactNode;
}): ReactNode {
  return (
    <div className={pane === undefined ? 'lv' : 'lv with-pane'}>
      <section className="card lv-list" aria-label={label}>
        {toolbar}
        {applied}
        {children}
        {bulk}
        {pager}
      </section>
      {pane}
    </div>
  );
}

/** The count line and the pages: `Total 41 orders · 50 per page · 1–12`, previous and next. */
export function ListPager({
  from,
  to,
  total,
  unit,
  perPage,
  filteredFrom,
  prevHref,
  nextHref,
  perPageHrefs,
}: {
  from: number;
  to: number;
  total: number;
  unit: string;
  perPage: number;
  filteredFrom?: number;
  prevHref: string | null;
  nextHref: string | null;
  /** The page-size control: each size and the address that shows it. */
  perPageHrefs?: ReadonlyArray<readonly [number, string]>;
}): ReactNode {
  const n = (v: number): string => v.toLocaleString('en-IN');
  return (
    <div className="pager">
      <div className="count">
        {total === 0 ? (
          <>
            <b>No {unit}</b>
            {filteredFrom === undefined ? null : <span className="of"> of {n(filteredFrom)} match</span>}
          </>
        ) : (
          <>
            Total <b>{n(total)}</b> {unit}
            {filteredFrom === undefined ? null : <span className="of"> filtered from {n(filteredFrom)}</span>} ·{' '}
            {perPageHrefs === undefined ? (
              <>{n(perPage)} per page</>
            ) : (
              <details className="per-wrap">
                <summary className="per">{n(perPage)} per page</summary>
                <div className="popup per-pop" role="dialog" aria-label="Rows per page">
                  {perPageHrefs.map(([size, href]) => (
                    <a key={size} href={href} {...(size === perPage ? { 'aria-current': 'true' as const } : {})}>
                      {n(size)} per page
                    </a>
                  ))}
                </div>
              </details>
            )}{' '}
            ·{' '}
            <b>
              {n(from)}–{n(to)}
            </b>
          </>
        )}
      </div>
      {total === 0 ? null : (
        <nav className="pages" aria-label="Pages">
          <a className="pg" aria-label="Previous page" {...(prevHref === null ? { 'aria-disabled': 'true' as const } : { href: prevHref })}>
            <Icon name="left" size="sm" />
          </a>
          <a className="pg" aria-label="Next page" {...(nextHref === null ? { 'aria-disabled': 'true' as const } : { href: nextHref })}>
            <Icon name="right" size="sm" />
          </a>
        </nav>
      )}
    </div>
  );
}

/** The record beside the list: its own header, the two ways out, its facts and body, its actions docked at the foot. */
export function RecordPane({
  title,
  status,
  sub,
  backHref,
  fullHref,
  closeHref,
  children,
  actions,
  top,
}: {
  title: ReactNode;
  status?: ReactNode;
  sub?: ReactNode;
  backHref: string;
  fullHref?: string;
  closeHref: string;
  children: ReactNode;
  /** Docked at the foot: the primary at the far right, a secondary beside it, the destructive action at the far left. */
  actions?: ReactNode;
  /** PDF and Send, at the top of a document's pane. */
  top?: ReactNode;
}): ReactNode {
  return (
    <aside className="pane" aria-label={typeof title === 'string' ? title : 'Record'}>
      <div className="pane-h">
        <a className="pane-back link-btn" href={backHref}>
          <Icon name="left" size="sm" />
          Back to the list
        </a>
        <div>
          <h2 className="pane-t">
            {title}
            {status}
          </h2>
          {sub === undefined ? null : <small>{sub}</small>}
        </div>
        {fullHref === undefined ? null : (
          <a className="btn icon ghost" href={fullHref} aria-label="Open the full page">
            <Icon name="expand" size="sm" />
          </a>
        )}
        <a className="btn icon ghost" href={closeHref} aria-label="Close the record">
          <Icon name="x" size="sm" />
        </a>
      </div>
      {top === undefined ? null : <div className="pane-top">{top}</div>}
      <div className="pane-b">{children}</div>
      {actions === undefined ? null : <div className="pane-f">{actions}</div>}
    </aside>
  );
}

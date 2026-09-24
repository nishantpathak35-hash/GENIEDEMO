'use client';

import type { ReactNode } from 'react';
import { useRowSelection } from './row-selection.js';

/**
 * The rows of a list, as the one client island a list needs: the keyboard
 * model (13-decisions, "Keyboard" — a table is one tab stop, ↑↓ move the row,
 * Enter opens it, Space selects, Shift+↑↓ extends, Ctrl+A selects the page)
 * and the click that opens a row's record. Everything else on the list — the
 * toolbar, the head, the pager — is server-rendered around this.
 *
 * A row opens by NAVIGATING to its `href` — the list's address plus the
 * record's key (`?order=…`), or the full page — never by a click handler
 * that shows something the address does not name. The cells arrive already
 * rendered; nothing here formats, counts or decides.
 */
export interface RowCell {
  readonly cell: ReactNode;
  readonly className: string;
  readonly detail?: ReactNode;
  readonly detailPane?: ReactNode;
}

export interface ListRow {
  readonly key: string;
  readonly href?: string;
  readonly open: boolean;
  readonly mine: boolean;
  readonly selectLabel: string;
  readonly cells: readonly RowCell[];
}

export function ListRows({ rows, select }: { rows: readonly ListRow[]; select: boolean }): ReactNode {
  const hrefOf = new Map(rows.filter((r) => r.href !== undefined).map((r) => [r.key, r.href as string]));
  const selection = useRowSelection(
    rows.map((r) => r.key),
    (key) => {
      const href = hrefOf.get(key);
      if (href !== undefined) window.location.assign(href);
    },
  );
  return (
    <tbody>
      {rows.map((r) => (
        <tr
          key={r.key}
          className={`row-link${r.open ? ' open' : ''}${r.mine ? ' mine' : ''}`}
          {...(r.open ? { 'aria-current': 'true' as const } : {})}
          {...selection.rowProps(r.key)}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            // a link or a control inside the row keeps its own click
            if (target.closest('a, button, input, label, details') !== null) return;
            const href = hrefOf.get(r.key);
            if (href !== undefined) window.location.assign(href);
          }}
        >
          {select ? (
            <td className="check">
              <input
                type="checkbox"
                aria-label={`Select ${r.selectLabel}`}
                checked={selection.selected.has(r.key)}
                onChange={() => selection.toggle(r.key)}
              />
            </td>
          ) : null}
          {r.cells.map((c, i) => (
            <td key={i} {...(c.className === '' ? {} : { className: c.className })}>
              {c.cell}
              {c.detail === undefined ? null : <span className="sub alt">{c.detail}</span>}
              {c.detailPane === undefined ? null : <span className="sub alt-pane">{c.detailPane}</span>}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

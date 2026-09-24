'use client';

import { useTransition, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { BulkBar, Icon, ListFrame, useRowSelection } from '@cog/design-system';
import { bulkDeleteDocuments } from './actions';

export interface DocRow {
  readonly id: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly entityType: string;
  readonly entityId: string;
  readonly createdAt: string;
  /** The project's code at the firm level; null inside a project, or for a file with none. */
  readonly projectCode: string | null;
}

/**
 * The vault list — `docs/design/06-projects.html`'s "Project · Documents"
 * frame, `.docs.sel` with a checkbox column and a bulk bar. A client island
 * for `useRowSelection`, same reason `OrdersTable` and the BOQ `LinesTable`
 * are: nothing here fetches, `rows` is what `page.tsx` already loaded.
 *
 * No row "opens" anything — there is no per-document detail page (VAULT-01's
 * fix is exactly that there is no permanent, session-free URL to a document),
 * so `useRowSelection` runs with no `onOpen`; Enter does nothing, which is
 * correct rather than absent.
 */
export function DocsList({ rows }: { rows: readonly DocRow[] }): ReactNode {
  const [pending, startTransition] = useTransition();
  const ids = rows.map((r) => r.id);
  const selection = useRowSelection(ids);

  return (
    <ListFrame>
      <ul className="docs sel">
        {rows.map((row) => {
          // `rowProps` is documented for a `<tr>`; every field but `ref` and
          // `onKeyDown` is a plain HTML attribute that works the same on an
          // `<li>`. Both of those only ever touch generic `HTMLElement`
          // members (`.focus()`, `.key`) internally, so the casts below are
          // safe — this is a list, not a table, and there is no
          // table-row-shaped element the design gives it instead.
          const { ref, onKeyDown, ...rest } = selection.rowProps(row.id);
          return (
            <li
              key={row.id}
              {...(selection.selected.has(row.id) ? { className: 'picked' } : {})}
              {...rest}
              ref={(node) => {
                ref(node as unknown as HTMLTableRowElement | null);
              }}
              onKeyDown={(event: ReactKeyboardEvent<HTMLLIElement>) => {
                onKeyDown(event as unknown as ReactKeyboardEvent<HTMLTableRowElement>);
              }}
            >
              <input
                type="checkbox"
                aria-label={`Select ${row.fileName}`}
                checked={selection.selected.has(row.id)}
                onChange={() => selection.toggle(row.id)}
              />
              <Icon name="doc" />
              <div>
                <b>{row.fileName}</b>
                <small>
                  {row.contentType} · {row.sizeBytes} bytes · {row.entityType} {row.entityId.slice(0, 8)}
                  {row.projectCode === null ? '' : ` · ${row.projectCode}`}
                </small>
              </div>
              <span>{row.createdAt.slice(0, 10)}</span>
            </li>
          );
        })}
      </ul>

      <BulkBar count={selection.selected.size} onClear={selection.clear} clearLabel="Clear selection">
        <button
          type="button"
          className="btn sm danger"
          disabled={pending}
          onClick={() => {
            const chosen = [...selection.selected];
            startTransition(async () => {
              await bulkDeleteDocuments(chosen);
              selection.clear();
            });
          }}
        >
          {pending ? 'Deleting…' : 'Delete'}
        </button>
      </BulkBar>
    </ListFrame>
  );
}


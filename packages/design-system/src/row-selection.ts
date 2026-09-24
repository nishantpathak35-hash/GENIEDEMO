'use client';

import { useCallback, useRef, useState, type KeyboardEvent } from 'react';

/**
 * Keyboard row selection for a table that is one tab stop.
 *
 * `13-decisions.html` ("Keyboard") is explicit about the shape: tabbing
 * through 50 rows × 6 cells is why people give up on the keyboard, so a table
 * is a single stop and ↑↓ move a roving focus between rows instead. Space
 * toggles the row under that focus, Shift+↑↓ extends the run from wherever
 * selection last started, Ctrl+A selects every id passed in — the current
 * page, deliberately not the whole filtered set, which is why the pager
 * offers "select all 4,000" as its own explicit action rather than this
 * hook reaching past what it was given. Enter opens the row; what "open"
 * means is the caller's business (routing is not this package's job), so it
 * is a callback rather than a behaviour built in here.
 *
 * Pure client state — nothing here fetches, and the ids it manages are
 * whatever the caller is already rendering. It does not decide what a row
 * IS, only which of the given ids are marked.
 */

export interface RowSelection {
  readonly selected: ReadonlySet<string>;
  toggle(id: string): void;
  clear(): void;
  /** Spread onto the `<tr>` for that id. */
  rowProps(id: string): {
    readonly tabIndex: number;
    readonly 'aria-selected': boolean;
    readonly 'data-row': string;
    readonly ref: (node: HTMLTableRowElement | null) => void;
    readonly onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => void;
  };
}

export function useRowSelection(ids: readonly string[], onOpen?: (id: string) => void): RowSelection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | undefined>(ids[0]);
  const anchorRef = useRef<string | undefined>(undefined);
  const nodes = useRef(new Map<string, HTMLTableRowElement>());

  const toggle = useCallback((id: string) => {
    anchorRef.current = id;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSelected(new Set());
  }, []);

  const moveTo = useCallback((id: string | undefined) => {
    if (id === undefined) return;
    setActiveId(id);
    nodes.current.get(id)?.focus();
  }, []);

  const extendTo = useCallback(
    (from: string, to: string | undefined) => {
      if (to === undefined) return;
      const anchor = anchorRef.current ?? from;
      anchorRef.current = anchor;
      const a = ids.indexOf(anchor);
      const b = ids.indexOf(to);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setSelected(new Set(ids.slice(lo, hi + 1)));
    },
    [ids],
  );

  const rowProps = useCallback(
    (id: string) => ({
      tabIndex: id === (activeId ?? ids[0]) ? 0 : -1,
      'aria-selected': selected.has(id),
      'data-row': id,
      ref: (node: HTMLTableRowElement | null) => {
        if (node === null) nodes.current.delete(id);
        else nodes.current.set(id, node);
      },
      onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
        const index = ids.indexOf(id);
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
          event.preventDefault();
          setSelected(new Set(ids));
          return;
        }
        switch (event.key) {
          case ' ': {
            event.preventDefault();
            toggle(id);
            break;
          }
          case 'Enter': {
            onOpen?.(id);
            break;
          }
          case 'ArrowDown': {
            event.preventDefault();
            const next = ids[index + 1];
            if (event.shiftKey) extendTo(id, next);
            moveTo(next);
            break;
          }
          case 'ArrowUp': {
            event.preventDefault();
            const prev = ids[index - 1];
            if (event.shiftKey) extendTo(id, prev);
            moveTo(prev);
            break;
          }
          case 'Escape': {
            if (selected.size > 0) {
              event.preventDefault();
              clear();
            }
            break;
          }
          default:
            break;
        }
      },
    }),
    [ids, activeId, selected, toggle, clear, moveTo, extendTo, onOpen],
  );

  return { selected, toggle, clear, rowProps };
}

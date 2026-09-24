'use client';

import { forwardRef, type ReactNode } from 'react';

/**
 * The list `?` opens (`docs/design/13-decisions.html`, "Keyboard"). With
 * single-key shortcuts off (Your preferences › Keyboard, WCAG 2.1.4) `/` and
 * `?` type themselves and this list is reached from the account menu instead;
 * the list says which is the case, so nobody presses a key that no longer
 * does anything and wonders why.
 */
export const KeyboardHelp = forwardRef<HTMLDialogElement, { singleKey: boolean }>(function KeyboardHelp({ singleKey }, ref): ReactNode {
  return (
    <dialog ref={ref} className="help" aria-labelledby="kbd-help-title">
      <div className="card-b">
        <h2 id="kbd-help-title">Keyboard</h2>
        {singleKey ? null : (
          <p className="muted">
            Single-key shortcuts are off for you, so <kbd>/</kbd> and <kbd>?</kbd> type themselves. Turn them on under Your preferences › Keyboard.
          </p>
        )}
        <dl className="kbd-help">
          <dt>/</dt>
          <dd>{singleKey ? 'Focus the search' : 'Focus the search — off for you'}</dd>
          <dt>?</dt>
          <dd>{singleKey ? 'This list' : 'This list — off for you; it is in the account menu'}</dd>
          <dt>Esc</dt>
          <dd>Close the top-most thing — never navigates</dd>
          <dt>Tab</dt>
          <dd>Skip link, search, the page’s primary action, the toolbar, then the table. The navigation comes last.</dd>
          <dt>↑ ↓</dt>
          <dd>Move the row in a table; Enter opens it. In the sidebar, move between what is visible.</dd>
          <dt>Space</dt>
          <dd>Select a row; Shift+↑↓ extends; Ctrl+A selects the page</dd>
        </dl>
        <p className="muted">Approve and Decline have no shortcut. A decision is never a single keystroke.</p>
        <div className="actions">
          <button type="button" className="btn" onClick={(e) => (e.currentTarget.closest('dialog') as HTMLDialogElement | null)?.close()}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
});

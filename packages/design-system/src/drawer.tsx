'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * A side panel on `--elevated`, for a step in a flow — raising an order,
 * handing over a lead. Not a modal built from scratch each time a screen
 * needs one.
 *
 * `role="dialog"` and `aria-modal` are on the panel itself; `aria-labelledby`
 * points at the rendered title rather than duplicating it into an
 * `aria-label`, so the visible heading and the accessible name can never
 * drift apart. Opening moves focus into the panel; closing — by Esc, by the
 * close button, or by a click on the scrim — returns it to whatever had
 * focus before the drawer opened, so the caller does not have to track that
 * itself. No animation logic lives here: the slide-in is CSS, and
 * `prefers-reduced-motion` already turns every animation and transition off
 * for the whole package (`styles.css`).
 */
export function Drawer({
  title,
  sub,
  open,
  onClose,
  children,
  footer,
}: {
  title: string;
  sub?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}): ReactNode {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      openerRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="scrim" aria-hidden="true" onClick={onClose} />
      <div ref={panelRef} className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="drawer-h">
          <div>
            <h5 id={titleId} className="ct">
              {title}
            </h5>
            {sub === undefined ? null : <p className="ps">{sub}</p>}
          </div>
          <button type="button" className="btn icon ghost" aria-label="Close" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="drawer-b">{children}</div>
        {footer === undefined ? null : <div className="drawer-f">{footer}</div>}
      </div>
    </>
  );
}

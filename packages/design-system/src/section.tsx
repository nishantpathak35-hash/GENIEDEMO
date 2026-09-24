import type { ReactNode } from 'react';

/**
 * A record page's card (`build/shell.mjs` `card()`): the 48px header with the
 * title and, beside it in the faint ink, what the card is counted against;
 * one action at the header's right; then the body — padded, or bare when the
 * body is a table that carries its own inset.
 */
export function Section({
  title,
  sub,
  action,
  bare = false,
  children,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
  /** The body is a `.tbl-wrap` or a `.list` that pads itself. */
  bare?: boolean;
  children: ReactNode;
}): ReactNode {
  return (
    <section className="card">
      <div className="card-h">
        <h2 className="ct">
          {title}
          {sub === undefined ? null : <span className="sub">{sub}</span>}
        </h2>
        {action}
      </div>
      {bare ? children : <div className="card-b">{children}</div>}
    </section>
  );
}

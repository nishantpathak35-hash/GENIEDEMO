import type { ReactNode } from 'react';
import { Icon } from './sprite.js';

/**
 * One header for every screen (`docs/design/00-foundations.html`, "The
 * patterns"; `build/patterns.mjs` pageHead).
 *
 * Crumbs above the title — the project first when there is a scope, then the
 * destination, then the list a record came from; ancestors only, the page
 * itself is the title. The title and the record's status on one row with the
 * actions right-aligned and centred on it: secondary actions first, then
 * More, then the ONE primary, always last. One line under the title for a
 * list — the count and what it is counted against — or a record's facts, up
 * to five. Then the tabs. A screen does not get to put its actions anywhere
 * else, and the frame gate measures the title's edge, the actions' edge and
 * that the primary is last.
 *
 * `help` is the screen's value line (VALUE-MAP), under its help icon: an
 * icon button whose accessible name IS the sentence, so a reader gets it
 * without a tooltip and the gate can read it from the button.
 */
export interface Crumb {
  readonly href: string;
  readonly label: string;
}

export function PageHeader({
  crumbs = [],
  title,
  status,
  sub,
  facts,
  actions,
  more,
  primary,
  tabs,
  help,
}: {
  crumbs?: readonly Crumb[];
  /** Plain text, or a `ViewSwitch` on a list page. */
  title: ReactNode;
  /** The record's lozenge, beside the title. A list has none. */
  status?: ReactNode;
  /** One line under a list's title: the count and what it is counted against. */
  sub?: ReactNode;
  /** A record's key facts, up to five, in place of the line. */
  facts?: ReadonlyArray<readonly [string, ReactNode]>;
  /** Secondary actions, before More. */
  actions?: ReactNode;
  /** The kebab, or any More control. */
  more?: ReactNode;
  /** The one primary action, last. */
  primary?: ReactNode;
  tabs?: ReactNode;
  help?: string;
}): ReactNode {
  return (
    <header className="pgh">
      {crumbs.length === 0 ? null : (
        <nav className="pgh-c" aria-label="Breadcrumb">
          <ol>
            {crumbs.map((c) => (
              <li key={`${c.href}-${c.label}`}>
                <a href={c.href}>{c.label}</a>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="pgh-t">
        <h1 className="pt">{title}</h1>
        {status}
        {help === undefined ? null : (
          <button type="button" className="btn icon ghost help" aria-label={help} title={help}>
            <Icon name="help" size="sm" />
          </button>
        )}
      </div>
      {actions === undefined && more === undefined && primary === undefined ? null : (
        <div className="pgh-a">
          {actions}
          {more}
          {primary}
        </div>
      )}
      {sub === undefined ? null : <p className="ps">{sub}</p>}
      {facts === undefined ? null : (
        <dl className="pgh-f">
          {facts.slice(0, 5).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {tabs}
    </header>
  );
}

/** The crumbs a screen under a project carries: the project first, then the rest. */
export function crumbsFor(project: { readonly id: string; readonly code: string } | null, ...rest: Crumb[]): Crumb[] {
  return project === null ? rest : [{ href: `/projects/${project.id}`, label: project.code }, ...rest];
}

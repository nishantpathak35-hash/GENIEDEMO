'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon, Money, Pill, type PillTone, type Terms } from '@cog/design-system';
import { currentEntry, navFor, projectIdOf, type Entitled, type NavCounts, type NavLink, type NavNode } from '../../lib/nav';
import { rememberCollapse, rememberOpen } from '../actions/preferences';

/**
 * The sidebar: two trees, one shell (`docs/design/03-navigation.html`).
 *
 * At the firm level it is the firm's functions; inside a project — any
 * pathname under `/projects/[id]` — it becomes that project's lifecycle under
 * ◂ All projects and the project's block, with Approvals pinned at the foot
 * because a scope narrows what you browse, never what you owe. Both trees are
 * generated from modules × roles by `navFor`; this component only draws the
 * tree it is given and marks the current page.
 *
 * A section is a DISCLOSURE — a button with `aria-expanded` over a list of
 * links — never a menu or a tree: Tab through what is visible, Enter or Space
 * opens and folds, ↑↓ move between visible entries and stop at the ends, Home
 * and End, ← → do nothing (13-decisions, Keyboard). A section is shut
 * unless it holds the current page or this person opened it; what they
 * opened is remembered per person on the server, never in the browser
 * (COMPONENT-MAP §6).
 *
 * The current page is a solid pill carrying a `+` for its module's
 * quick-create; a record opened from a list marks that list with
 * `aria-current="true"`. Every count is the server's, passed in — nothing here
 * counts anything.
 */

export interface ProjectLite {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly clientName: string;
  readonly state: string;
  readonly originalValue: string | null;
}

const STATE_LABEL: Readonly<Record<string, readonly [string, PillTone]>> = {
  lead: ['Lead', 'idle'],
  won: ['Won', 'ok'],
  in_progress: ['In progress', 'active'],
  handed_over: ['Handed over', 'ok'],
  closed: ['Closed', 'idle'],
  lost: ['Lost', 'bad'],
};

export function SideNav({
  who,
  counts,
  projects,
  open,
  collapsed,
  configureHref,
  terms,
}: {
  who: Entitled;
  counts: NavCounts | null;
  projects: readonly ProjectLite[];
  /** Section ids this person opened and left open, from the preference store. */
  open: readonly string[];
  collapsed: boolean;
  configureHref: string;
  /** The firm's words, read once by the layout: every entry is drawn in them. */
  terms: Terms;
}): ReactNode {
  const pathname = usePathname();
  const projectId = projectIdOf(pathname);
  const project = projectId === null ? null : (projects.find((p) => p.id === projectId) ?? null);
  const level = project === null ? 'firm' : 'project';
  const tree = navFor(level, who, project?.id, terms);
  const current = currentEntry(pathname, tree);
  const uid = useId();

  // which sections are open: the ones this person opened, and always the one
  // holding the current page on arrival
  const [openNow, setOpenNow] = useState<readonly string[]>(open);
  useEffect(() => {
    const holding = current?.sectionId ?? null;
    if (holding !== null && !openNow.includes(holding)) setOpenNow((o) => [...o, holding]);
    // only when the page changes; a fold the person makes on this page stands
  }, [pathname]);

  const toggle = (id: string): void => {
    const next = openNow.includes(id) ? openNow.filter((o) => o !== id) : [...openNow, id];
    setOpenNow(next);
    void rememberOpen(next, collapsed);
  };

  const countOf = (key: keyof NavCounts | undefined): number => (key === undefined || counts === null ? 0 : counts[key]);

  const link = (node: NavLink): ReactNode => {
    const here = current?.href === node.href;
    const n = countOf(node.count);
    const a = (
      <Link href={node.href} title={node.label} {...(here ? { 'aria-current': current.exact ? ('page' as const) : ('true' as const) } : {})}>
        {node.icon === undefined ? null : <Icon name={node.icon} />}
        <span className="nav-t">{node.label}</span>
        {n > 0 ? (
          <span className="badge" title={`${String(n)} ${node.say ?? ''}`.trim()}>
            {n}
            <span className="sr-only"> {node.say}</span>
          </span>
        ) : null}
      </Link>
    );
    const create = here && current.exact ? node.create : undefined;
    return create === undefined ? (
      a
    ) : (
      <div className="nav-cur">
        {a}
        <Link className="nav-plus" href={`${node.href}${node.href.includes('?') ? '&' : '?'}new=1`} aria-label={create}>
          <Icon name="plus" size="sm" bare />
        </Link>
      </div>
    );
  };

  const nodes = tree.map((node, index) => {
    if (node.kind === 'sep') return <div key={`sep-${String(index)}`} className="nav-sep" role="presentation" />;
    if (node.kind === 'link') return <div key={node.href}>{link(node)}</div>;
    const open = openNow.includes(node.id);
    const holds = current?.sectionId === node.id;
    const total = node.pages.reduce((s, p) => s + countOf(p.count), 0);
    const id = `${uid}-${node.id}`;
    return (
      <div key={node.id} className={open ? 'nav-sec open' : 'nav-sec'}>
        <button
          className={holds ? 'nav-h has-current' : 'nav-h'}
          type="button"
          aria-expanded={open}
          aria-controls={id}
          title={node.label}
          onClick={() => toggle(node.id)}
        >
          <Icon name={node.icon} />
          <span className="nav-t">{node.label}</span>
          {total > 0 && !open ? (
            <span className="badge nav-sum" title={`${String(total)} need attention inside`}>
              {total}
              <span className="sr-only"> need attention inside</span>
            </span>
          ) : null}
          <span className="nav-chev">
            <Icon name="caret" size="sm" />
          </span>
        </button>
        <ul className="nav-pages" id={id} hidden={!open}>
          {node.pages.map((p) => (
            <li key={p.href}>{link(p)}</li>
          ))}
        </ul>
      </div>
    );
  });

  const head =
    project === null ? null : (
      <>
        <Link className="nav-back" href="/projects">
          <Icon name="left" size="sm" />
          <span className="nav-t">All projects</span>
        </Link>
        <div className="nav-proj">
          <b className="code">{project.code}</b>
          <span className="name">{project.name}</span>
          <Pill tone={STATE_LABEL[project.state]?.[1] ?? 'idle'}>{STATE_LABEL[project.state]?.[0] ?? project.state}</Pill>
          <small>
            {project.clientName.replace(/ Private Limited| LLP| Pvt\.? Ltd\.?$/i, '')} · <Money wire={project.originalValue} />
          </small>
        </div>
      </>
    );

  // inside a project Approvals stays pinned, firm-wide, at the foot
  const pinned = project !== null && who.modules.includes('purchase_orders') && who.actions.includes('approve_po');

  return (
    <aside className={collapsed ? 'side rail' : 'side'}>
      <nav className="side-nav" aria-label="Main" onKeyDown={arrowKeys}>
        {head}
        {nodes}
      </nav>
      <div className="foot">
        {pinned ? (
          <nav className="side-nav" aria-label="Firm-wide">
            <Link href="/approvals" title="Approvals">
              <Icon name="check-sq" />
              <span className="nav-t">Approvals</span>
              {counts !== null && counts.approvals > 0 ? (
                <span className="badge" title={`${String(counts.approvals)} waiting on you, firm-wide`}>
                  {counts.approvals}
                  <span className="sr-only"> waiting on you, firm-wide</span>
                </span>
              ) : null}
            </Link>
          </nav>
        ) : null}
        <Link className="nav-foot" href={configureHref} title="Configure features">
          <Icon name="cog" />
          <span className="nav-t">Configure features</span>
        </Link>
        <button
          className="nav-collapse"
          type="button"
          aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar to its icons'}
          onClick={() => void rememberCollapse(!collapsed, openNow)}
        >
          <Icon name="collapse" />
          <span className="nav-t">{collapsed ? 'Expand' : 'Collapse'}</span>
        </button>
      </div>
    </aside>
  );
}

/** The sidebar's keyboard: ↑↓ move between what is visible and stop at the ends; Home and End; ← → do nothing. */
function arrowKeys(event: KeyboardEvent<HTMLElement>): void {
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  const nav = event.currentTarget;
  const focusable = [...nav.querySelectorAll<HTMLElement>('a[href], button')].filter((el) => el.offsetParent !== null);
  const at = focusable.indexOf(document.activeElement as HTMLElement);
  if (at === -1) return;
  event.preventDefault();
  const last = focusable.length - 1;
  const next =
    event.key === 'ArrowUp' ? (at > 0 ? at - 1 : 0) : event.key === 'ArrowDown' ? (at < last ? at + 1 : last) : event.key === 'Home' ? 0 : last;
  focusable[next]?.focus();
}

export type { NavNode };

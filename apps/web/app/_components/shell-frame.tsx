'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { HistoryItem, Preferences, QuickCreateResponse } from '@cog/contracts';
import type { Terms } from '@cog/design-system';
import type { Entitled, NavCounts } from '../../lib/nav';
import { projectIdOf } from '../../lib/nav';
import { ScopeSwitcher } from './scope-switcher';
import { Search } from './search';
import { SideNav, type ProjectLite } from './side-nav';
import { TopBar } from './top-bar';
import { KeyboardHelp } from './keyboard-help';

/**
 * The frame: the bar across the window, the sidebar beside the page, the
 * sidebar as a sheet under a phone width, and the keyboard model's global keys.
 *
 * `13-decisions.html`, "Keyboard": `/` focuses the search (owned by `Search`),
 * `?` opens the list, Esc closes the top-most thing and never navigates. Both
 * single-character keys obey the person's switch (Your preferences › Keyboard,
 * WCAG 2.1.4): with it off they type themselves and the list stays in the
 * account menu. A decision is never a single keystroke — nothing here binds
 * Approve or Decline.
 */
export function ShellFrame({
  who,
  counts,
  projects,
  projectsRead,
  mine,
  recent,
  history,
  prefs,
  quickCreate,
  tenantName,
  demo,
  unread,
  inbox,
  person,
  terms,
  children,
}: {
  who: Entitled;
  counts: NavCounts | null;
  projects: readonly ProjectLite[];
  projectsRead: 'ok' | 'refused' | 'unreachable';
  mine: readonly string[];
  recent: readonly string[];
  history: readonly HistoryItem[];
  prefs: Preferences | null;
  quickCreate: QuickCreateResponse | null;
  tenantName: string;
  demo: boolean;
  unread: number;
  /** The panel the bell opens, rendered by the layout; null when the inbox could not be read. */
  inbox: ReactNode;
  person: { readonly name: string; readonly role: string };
  /** The firm's words (Settings › Terminology), read once by the layout. */
  terms: Terms;
  children: ReactNode;
}): ReactNode {
  const [menu, setMenu] = useState(false);
  const help = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const singleKey = prefs?.singleKeyShortcuts ?? true;

  useEffect(() => setMenu(false), [pathname]);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const editing =
        target !== null &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (event.key === '?' && !editing && singleKey) {
        event.preventDefault();
        help.current?.showModal();
      } else if (event.key === 'Escape') {
        if (help.current?.open === true) help.current.close();
        else if (menu) setMenu(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu, singleKey]);

  // the address names a project the server would not resolve: the switcher holds the server's words
  const projectId = projectIdOf(pathname);
  const held =
    projectId === null || projects.some((p) => p.id === projectId)
      ? null
      : projectsRead === 'unreachable'
        ? 'Can’t reach the server'
        : projectsRead === 'refused'
          ? 'A project you can’t open'
          : 'Project not found';

  return (
    <div className="app" {...(menu ? { 'data-menu': 'open' } : {})} data-shortcuts={singleKey ? 'on' : 'off'}>
      <a className="skip" href="#content">
        Skip to content
      </a>
      <TopBar
        switcher={<ScopeSwitcher projects={projects} mine={mine} recent={recent} held={held} />}
        search={<Search projects={projects} singleKey={singleKey} terms={terms} />}
        tenantName={tenantName}
        demo={demo}
        unread={unread}
        inbox={inbox}
        history={history}
        quickCreate={quickCreate}
        who={person}
        onMenu={() => setMenu((m) => !m)}
        menuOpen={menu}
      />
      <div className="body">
        {/* the page first, the sidebar after it in the DOM and before it on screen (`.side { order: -1 }`) —
            a person who lives on one screen tabs into the work far more often than into the navigation */}
        <div className="main">
          <main className="page" id="content" tabIndex={-1}>
            {children}
          </main>
        </div>
        <SideNav
          who={who}
          counts={counts}
          projects={projects}
          open={prefs?.sidebar.open ?? []}
          collapsed={prefs?.sidebar.collapsed ?? false}
          configureHref="/settings/modules"
          terms={terms}
        />
      </div>
      {menu ? <div className="scrim" aria-hidden="true" onClick={() => setMenu(false)} /> : null}
      <KeyboardHelp ref={help} singleKey={singleKey} />
    </div>
  );
}

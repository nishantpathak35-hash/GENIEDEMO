'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, NotificationBell } from '@cog/design-system';
import type { HistoryItem, QuickCreateResponse } from '@cog/contracts';
import { projectIdOf } from '../../lib/nav';
import { ThemeControl } from './theme';
import { signOut } from '../actions/session';

/**
 * The top bar — a 48px dark island across the whole window
 * (`docs/design/03-navigation.html`, `build/css-shell.mjs`).
 *
 * It carries `data-theme="dark"`, so every token on it resolves to the dark
 * set in both themes: navy from the brand's subtlest dark surface, the lifted
 * fill an alpha neutral over it. Left to right: the menu button (under 640px),
 * a 200px brand column over the sidebar, the project switcher, the recent
 * history clock, the search on the lifted fill with its scope; then at the
 * right the demo notice when the tenant is one, the tenant's name, a divider,
 * the quick-create square (the brand's mark colour under the light set's
 * inverse ink — two islands), the bell with its count, the gear, and a 28px
 * avatar opening the account menu.
 *
 * Every count on the bar is the server's, passed in. The three popovers here
 * — history, the square's menu, the account menu — are the browser's three
 * pieces of state; the switcher and the search own theirs.
 *
 * The bar folds on its own width (styles.css, the bar's ladder): under 1300
 * the tenant's name is only in the account menu and the demo note is its
 * dot; under 1000 the history goes; under 760 the search is its button;
 * under 640 the phone bar — menu, the project's code, search, bell, avatar.
 */
export function TopBar({
  switcher,
  search,
  tenantName,
  demo,
  unread,
  inbox,
  history,
  quickCreate,
  who,
  onMenu,
  menuOpen,
}: {
  switcher: ReactNode;
  search: ReactNode;
  tenantName: string;
  demo: boolean;
  unread: number;
  inbox: ReactNode;
  history: readonly HistoryItem[];
  quickCreate: QuickCreateResponse | null;
  who: { readonly name: string; readonly role: string };
  onMenu: () => void;
  menuOpen: boolean;
}): ReactNode {
  const pathname = usePathname();
  const projectId = projectIdOf(pathname);
  return (
    <header className="topbar" data-theme="dark" data-app="web">
      <button
        className="btn icon ghost nav-open"
        type="button"
        aria-label={menuOpen ? 'Close the menu' : 'Open menu'}
        aria-expanded={menuOpen}
        onClick={onMenu}
      >
        <Icon name={menuOpen ? 'x' : 'menu'} />
      </button>
      <Link className="brand-bar" href="/" aria-label="Construct-O-Genie, home">
        <span className="mark" aria-hidden="true">
          <Icon name="mark" />
        </span>
        <span className="brand-t">Construct-O-Genie</span>
      </Link>
      {switcher}
      <Popover
        className="history-wrap"
        button={(open, toggle) => (
          <button className="btn icon ghost history" type="button" aria-haspopup="dialog" aria-expanded={open} aria-label="Recent history" onClick={toggle}>
            <Icon name="clock" />
          </button>
        )}
      >
        <div className="popup history-pop page-theme" role="dialog" aria-label="Recent history">
          <p className="menu-t">Recently opened</p>
          {history.length === 0 ? (
            <p className="menu-none">Nothing opened yet. The records you open appear here, newest first.</p>
          ) : (
            <ul className="menu">
              {history.map((h) => (
                <li key={`${h.kind}-${h.id}`} role="none">
                  <Link className="menu-i" role="menuitem" href={h.href}>
                    <Icon name={ICON_OF[h.kind] ?? 'doc'} />
                    <span className="menu-c">
                      <span>{h.title}</span>
                      <small>
                        {[h.subtitle, h.projectCode].filter((s) => s !== null && s !== '').join(' · ')}
                      </small>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Popover>
      {search}
      <span className="spacer" />
      {demo ? (
        <span className="demo-note" title="This organisation is a demonstration. Nothing in it is real.">
          <i className="dot" aria-hidden="true" />
          <span className="demo-t">Demo organisation</span>
        </span>
      ) : null}
      <span className="tenant" title="The organisation signed in">
        {tenantName}
      </span>
      <span className="bar-div" role="presentation" />
      <Popover
        className="new-wrap"
        button={(open, toggle) => (
          <button className="new-sq" type="button" aria-haspopup="menu" aria-expanded={open} aria-label="New · C" title="New · C" onClick={toggle}>
            <span className="ico" data-theme="light">
              <Icon name="plus" />
            </span>
          </button>
        )}
      >
        <div className="popup new-menu page-theme" role="menu" aria-label="New">
          {quickCreate === null || quickCreate.groups.length === 0 ? (
            <p className="menu-none">Nothing you can create from here.</p>
          ) : (
            quickCreate.groups.map((g) => (
              <div key={g.section}>
                <p className="menu-t">{g.section}</p>
                <ul className="menu">
                  {g.items.map((item) => (
                    <li key={item.key} role="none">
                      <Link className="menu-i" role="menuitem" href={item.href}>
                        <span className="menu-c">
                          <span>{item.label}</span>
                          <small>{item.projectScoped ? (projectId === null ? 'on a project — you choose which' : 'on this project') : 'the firm’s'}</small>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </Popover>
      {inbox === null ? (
        <NotificationBell count={unread} href="/notifications" />
      ) : (
        <Popover
          className="bell-wrap"
          button={(open, toggle) => (
            <button className="btn icon ghost bell" type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={`Notifications, ${String(unread)} unread`} onClick={toggle}>
              <Icon name="bell" />
              {unread === 0 ? null : (
                <span className="badge important" aria-hidden="true">
                  {unread}
                </span>
              )}
            </button>
          )}
        >
          <div className="page-theme bell-pop">{inbox}</div>
        </Popover>
      )}
      <Link className="btn icon ghost settings-link" href="/settings" aria-label="Settings" {...(pathname.startsWith('/settings') ? { 'aria-current': 'page' as const } : {})}>
        <Icon name="settings" />
      </Link>
      <Popover
        className="me-wrap"
        button={(open, toggle) => (
          <button className="me" type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`Account menu for ${who.name}, ${who.role}`} onClick={toggle}>
            <span className="avatar">{who.name.slice(0, 1).toUpperCase()}</span>
          </button>
        )}
      >
        <div className="popup me-pop page-theme" role="menu" aria-label="Account">
          <p className="menu-t">{who.name}</p>
          <p className="menu-sub">{who.role}</p>
          <p className="menu-org" title="The organisation signed in">
            {tenantName}
          </p>
          <ul className="menu">
            <li role="none">
              <Link className="menu-i" role="menuitem" href="/preferences">
                <Icon name="cog" />
                <span className="menu-c">
                  <span>Your preferences</span>
                  <small>Keyboard, columns, the sidebar</small>
                </span>
              </Link>
            </li>
          </ul>
          <div className="menu-theme">
            <ThemeControl />
          </div>
          <form action={signOut} className="menu-foot">
            <button type="submit" className="btn sm ghost">
              Sign out
            </button>
          </form>
        </div>
      </Popover>
    </header>
  );
}

const ICON_OF: Readonly<Record<string, 'cart' | 'bill' | 'projects' | 'users' | 'doc' | 'sales' | 'rupee' | 'site' | 'check-sq'>> = {
  order: 'cart',
  bill: 'bill',
  invoice: 'bill',
  payment: 'rupee',
  holding: 'rupee',
  project: 'projects',
  vendor: 'users',
  lead: 'sales',
  document: 'doc',
  report: 'site',
  task: 'check-sq',
  'boq-line': 'doc',
  page: 'doc',
};

/** A button and the popover it opens; Esc or a click outside closes it and Esc returns focus. */
function Popover({
  className,
  button,
  children,
}: {
  className: string;
  button: (open: boolean, toggle: () => void) => ReactNode;
  children: ReactNode;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (wrap.current !== null && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false);
        wrap.current?.querySelector<HTMLElement>('button')?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={wrap} className={className}>
      {button(open, () => setOpen((o) => !o))}
      {open ? children : null}
    </div>
  );
}

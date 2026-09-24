import type { ReactNode } from 'react';
import { Icon } from './sprite.js';

/**
 * The portal's chrome — `docs/design/10-portals.html`, "both on the quiet
 * drawing under the same bar": the same dark bar as the staff app, with what
 * a portal has and nothing it does not (`build/shell.mjs` topBar, app
 * `vendor` or `client`): the product's mark, a search over the portal's own
 * screens, whose portal this is — the firm's name — the bell, and the
 * person. No menu button, no switcher (a client with one project), no
 * square, no gear: there is no sidebar behind any of them.
 *
 * Then `.p-head`: the person's organisation and what this screen is, with
 * the client's tabs where the portal has them; `.p-body` holds the screen.
 */
export function PortalBar({
  app,
  who,
  firm,
  searchLabel,
  unread,
  menu,
}: {
  /** `operator` is the back office's bar: the same drawing, no search, no bell (`build/shell.mjs` app operator). */
  app: 'vendor' | 'client' | 'operator';
  /** The person signed in — their name, or address. */
  who: string;
  /** Whose portal this is. */
  firm: string;
  /** "Search in Orders" — the screen the search would cover. The box is drawn; the portal's search is recorded, not built. Absent: no box. */
  searchLabel?: string;
  /** Absent: no bell. */
  unread?: number;
  /** The account menu's items — at least Sign out — as the caller draws them. */
  menu: ReactNode;
}): ReactNode {
  return (
    <header className="topbar" data-theme="dark" data-app={app}>
      <a className="brand-bar" href="/" aria-label="Construct-O-Genie, home">
        <span className="mark" aria-hidden="true">
          <Icon name="mark" />
        </span>
        <span className="brand-t">Construct-O-Genie</span>
      </a>
      {searchLabel === undefined ? null : (
        <>
          <div className="search">
            <Icon name="search" />
            <input type="search" aria-label={searchLabel} placeholder={searchLabel} disabled title="Search on the portal is not built yet" />
          </div>
          <button type="button" className="btn icon ghost search-btn" aria-label="Search" disabled title="Search on the portal is not built yet">
            <Icon name="search" />
          </button>
        </>
      )}
      <span className="spacer" />
      <span className="tenant" title={app === 'operator' ? 'The back office' : 'Whose portal this is'}>
        {firm}
      </span>
      {unread === undefined ? null : (
        <span className="btn icon ghost bell" aria-label={`Notifications, ${String(unread)} unread`} role="img">
          <Icon name="bell" />
          {unread === 0 ? null : (
            <span className="badge important" aria-hidden="true">
              {unread}
            </span>
          )}
        </span>
      )}
      <details className="me-wrap">
        <summary className="me" aria-haspopup="menu" aria-label={`Account menu for ${who}`}>
          <span className="avatar">{who.slice(0, 1).toUpperCase()}</span>
        </summary>
        <div className="popup me-pop page-theme" role="menu" aria-label="Account">
          <p className="menu-t">{who}</p>
          {menu}
        </div>
      </details>
    </header>
  );
}

/** The portal's head under the bar: the organisation, what this screen is, and the client's tabs when it has them. */
export function PortalHead({ organisation, sub, tabs }: { organisation: string; sub: string; tabs?: ReactNode }): ReactNode {
  return (
    <header className="p-head">
      <div>
        <b>{organisation}</b>
        <small>{sub}</small>
      </div>
      {tabs}
    </header>
  );
}

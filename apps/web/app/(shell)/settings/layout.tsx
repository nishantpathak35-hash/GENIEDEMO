import type { ReactNode } from 'react';

/**
 * Settings — the hub the gear opens, and the pages its cards open
 * (`docs/design/11-settings.html`). Settings has left the sidebar: the gear
 * on the top bar opens the hub, *Configure features* at the sidebar's foot
 * opens Modules directly, and every page carries the crumb back.
 *
 * **What is here, and what is `apps/admin`.** The repaired legacy tree has
 * eighteen files under `components/views/settings/`, and a good half of them
 * are platform administration wearing a tenant screen's clothes: user creation
 * with a temporary password, cache clearing, a project merger, and a "Legacy
 * Correction" tab that edits a purchase order's paid amount. Those are
 * `apps/admin`, behind a platform-scoped principal — not a screen every member
 * of a tenant can open.
 *
 * The one line worth quoting from the legacy's version is its gate:
 * `isSuperAdmin(user?.email) || user?.roles?.includes('director')`
 * (`SettingsView.js:141`), evaluated in the browser. An address in a hardcoded
 * list is not an authorisation, and a check in a browser is not a control.
 * Every card is always drawn; the server refuses what it refuses and says why.
 */
export default function SettingsLayout({ children }: { children: ReactNode }): ReactNode {
  return children;
}

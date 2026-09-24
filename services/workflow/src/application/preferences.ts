import type { TxLike } from './approve-in-transaction.js';

/**
 * A person's preferences — theirs, on the server, never in a browser
 * (`docs/design/COMPONENT-MAP.md` §6): the column choice per list, the
 * sidebar's collapse and the sections left open, the last project opened, starred views and
 * reports, the single-key switch (WCAG 2.1.4). One document per person, read
 * once on sign-in, merged on every change. Nothing here is a permission; the
 * route takes the principal from the resolved identity, never from the body.
 */

export interface Preferences {
  readonly columns: Readonly<Record<string, readonly string[]>>;
  readonly sidebar: { readonly collapsed: boolean; readonly open: readonly string[] };
  readonly lastProjectId: string | null;
  readonly starredViews: readonly string[];
  readonly starredReports: readonly string[];
  readonly singleKeyShortcuts: boolean;
}

/** What a person has before they change anything. */
export const DEFAULT_PREFERENCES: Preferences = {
  columns: {},
  sidebar: { collapsed: false, open: [] },
  lastProjectId: null,
  starredViews: [],
  starredReports: [],
  singleKeyShortcuts: true,
};

/** The document as stored, filled to the full shape so a screen never reads `undefined`. */
function fill(stored: Record<string, unknown>): Preferences {
  const sidebar = (stored['sidebar'] ?? {}) as Partial<Preferences['sidebar']>;
  return {
    columns: (stored['columns'] as Preferences['columns'] | undefined) ?? {},
    sidebar: {
      collapsed: sidebar.collapsed ?? false,
      open: sidebar.open ?? [],
    },
    lastProjectId: (stored['lastProjectId'] as string | null | undefined) ?? null,
    starredViews: (stored['starredViews'] as readonly string[] | undefined) ?? [],
    starredReports: (stored['starredReports'] as readonly string[] | undefined) ?? [],
    singleKeyShortcuts: (stored['singleKeyShortcuts'] as boolean | undefined) ?? true,
  };
}

export async function readPreferences(tx: TxLike, principalId: string): Promise<Preferences> {
  const rows = await tx.query<{ preferences: Record<string, unknown> }>(
    `SELECT preferences FROM workflow.person_preferences WHERE principal_id = $1`,
    [principalId],
  );
  return fill(rows[0]?.preferences ?? {});
}

/**
 * Merge a change in. A key the caller did not send is untouched; a key sent
 * as `null` (the last project) is stored as null. One write per change, as
 * the design asks — the row is created on the first.
 */
export async function updatePreferences(
  tx: TxLike,
  principalId: string,
  change: Partial<Preferences>,
): Promise<Preferences> {
  const rows = await tx.query<{ preferences: Record<string, unknown> }>(
    `INSERT INTO workflow.person_preferences (tenant_id, principal_id, preferences)
     VALUES (tenancy.current_tenant_id(), $1, $2::jsonb)
     ON CONFLICT (tenant_id, principal_id)
       DO UPDATE SET preferences = workflow.person_preferences.preferences || EXCLUDED.preferences,
                     updated_at = now()
     RETURNING preferences`,
    [principalId, JSON.stringify(change)],
  );
  return fill(rows[0]?.preferences ?? {});
}


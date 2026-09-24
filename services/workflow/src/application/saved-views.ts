import type { TxLike } from './approve-in-transaction.js';

/**
 * Saved views of a list: the firm's and this person's (`docs/design/07-buying.html`,
 * the saved views under the title). A view is the list's own filter keys and
 * values as the address carries them — where `?project=` lives at the firm
 * level — never a query. The firm's views need the settings action, which the
 * route checks; a person's need nothing.
 */

export interface SavedView {
  readonly id: string;
  readonly listKey: string;
  readonly name: string;
  readonly ownerId: string | null;
  readonly criteria: Readonly<Record<string, string>>;
  readonly columns: readonly string[] | null;
}

export class SavedViewNotFound extends Error {
  override readonly name = 'SavedViewNotFound';
}
export class SavedViewNameTaken extends Error {
  override readonly name = 'SavedViewNameTaken';
}

const UNIQUE_VIOLATION = '23505';

type ViewRow = {
  id: string;
  list_key: string;
  name: string;
  owner_id: string | null;
  criteria: Record<string, string>;
  columns: string[] | null;
};
const toView = (r: ViewRow): SavedView => ({
  id: r.id,
  listKey: r.list_key,
  name: r.name,
  ownerId: r.owner_id,
  criteria: r.criteria,
  columns: r.columns,
});

/** The firm's views of a list, then this person's, each by name. */
export async function listSavedViews(tx: TxLike, principalId: string, listKey: string): Promise<readonly SavedView[]> {
  const rows = await tx.query<ViewRow>(
    `SELECT id, list_key, name, owner_id, criteria, columns
       FROM workflow.saved_views
      WHERE list_key = $1 AND (owner_id IS NULL OR owner_id = $2)
      ORDER BY (owner_id IS NOT NULL), lower(name)`,
    [listKey, principalId],
  );
  return rows.map(toView);
}

export async function createSavedView(
  tx: TxLike,
  principalId: string,
  view: { listKey: string; name: string; shared: boolean; criteria: Record<string, string>; columns: readonly string[] | null },
): Promise<SavedView> {
  try {
    const rows = await tx.query<ViewRow>(
      `INSERT INTO workflow.saved_views (tenant_id, list_key, name, owner_id, criteria, columns, created_by)
       VALUES (tenancy.current_tenant_id(), $1, $2, $3, $4::jsonb, $5::jsonb, $6)
       RETURNING id, list_key, name, owner_id, criteria, columns`,
      [
        view.listKey,
        view.name.trim(),
        view.shared ? null : principalId,
        JSON.stringify(view.criteria),
        view.columns === null ? null : JSON.stringify(view.columns),
        principalId,
      ],
    );
    const row = rows[0];
    if (row === undefined) throw new Error('INSERT returned no row');
    return toView(row);
  } catch (e) {
    if ((e as { code?: string }).code === UNIQUE_VIOLATION) throw new SavedViewNameTaken(view.name);
    throw e;
  }
}

/** A person deletes their own view; the firm's needs the settings action, which the route checks. */
export async function deleteSavedView(
  tx: TxLike,
  principalId: string,
  id: string,
  maySharedDelete: boolean,
): Promise<void> {
  const rows = await tx.query<{ id: string }>(
    `DELETE FROM workflow.saved_views
      WHERE id = $1 AND (owner_id = $2 OR (owner_id IS NULL AND $3))
      RETURNING id`,
    [id, principalId, maySharedDelete],
  );
  if (rows.length === 0) throw new SavedViewNotFound(id);
}

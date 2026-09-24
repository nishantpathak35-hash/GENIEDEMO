import type { TxLike } from './approve-in-transaction.js';

/**
 * The records a person opened last — the bar's history popover and the
 * switcher's Recent (`docs/design/03-navigation.html`). Written when a record
 * page opens; every read is the caller's own trail, which the route filters
 * to the principal the identity resolved.
 */

export const HISTORY_KINDS = [
  'project',
  'order',
  'vendor',
  'lead',
  'bill',
  'payment',
  'invoice',
  'holding',
  'document',
  'report',
  'task',
  'boq-line',
  'page',
] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];

/** How many records the trail keeps per person: the popover draws a handful, the switcher's Recent fewer. */
export const HISTORY_KEEP = 30;

export interface HistoryEntry {
  readonly kind: HistoryKind;
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly href: string;
  readonly projectId: string | null;
  readonly openedAt: string;
}

export interface RecordOpened {
  readonly kind: HistoryKind;
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly href: string;
  readonly projectId: string | null;
}

/** Opening the same record again moves it up; the trail is trimmed to `HISTORY_KEEP`. */
export async function recordOpened(tx: TxLike, principalId: string, opened: RecordOpened): Promise<void> {
  await tx.query(
    `INSERT INTO workflow.recent_history
       (tenant_id, principal_id, kind, record_id, title, subtitle, href, project_id)
     VALUES (tenancy.current_tenant_id(), $1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (tenant_id, principal_id, kind, record_id)
       DO UPDATE SET title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, href = EXCLUDED.href,
                     project_id = EXCLUDED.project_id, opened_at = now()`,
    [principalId, opened.kind, opened.id, opened.title, opened.subtitle, opened.href, opened.projectId],
  );
  await tx.query(
    `DELETE FROM workflow.recent_history
      WHERE principal_id = $1
        AND id IN (SELECT id FROM workflow.recent_history
                    WHERE principal_id = $1 ORDER BY opened_at DESC OFFSET $2)`,
    [principalId, HISTORY_KEEP],
  );
}

export async function recentHistory(tx: TxLike, principalId: string, limit = 10): Promise<readonly HistoryEntry[]> {
  const rows = await tx.query<{
    kind: HistoryKind;
    record_id: string;
    title: string;
    subtitle: string;
    href: string;
    project_id: string | null;
    opened_at: string;
  }>(
    `SELECT kind, record_id, title, subtitle, href, project_id, opened_at::text AS opened_at
       FROM workflow.recent_history
      WHERE principal_id = $1
      ORDER BY opened_at DESC
      LIMIT $2`,
    [principalId, limit],
  );
  return rows.map((r) => ({
    kind: r.kind,
    id: r.record_id,
    title: r.title,
    subtitle: r.subtitle,
    href: r.href,
    projectId: r.project_id,
    openedAt: r.opened_at,
  }));
}

/** The projects opened last, newest first — a project itself, or a record on one. */
export async function recentProjects(tx: TxLike, principalId: string, limit = 5): Promise<readonly string[]> {
  const rows = await tx.query<{ project_id: string }>(
    `SELECT project_id
       FROM (SELECT COALESCE(project_id, CASE WHEN kind = 'project' THEN record_id::uuid END) AS project_id,
                    max(opened_at) AS last_opened
               FROM workflow.recent_history
              WHERE principal_id = $1
              GROUP BY 1) t
      WHERE project_id IS NOT NULL
      ORDER BY last_opened DESC
      LIMIT $2`,
    [principalId, limit],
  );
  return rows.map((r) => r.project_id);
}


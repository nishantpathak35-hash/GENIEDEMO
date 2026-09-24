import type { TenantContext } from '@cog/contracts';
import type { TxLike } from './project-team.js';

/**
 * Workflow 1: the client brief.
 *
 * **The rule this exists for:** a brief the client has acknowledged is frozen.
 * Changing the scope after that produces a NEW VERSION with its own number, and
 * an in-place edit is refused. The legacy does this too (`design-build.js:222`,
 * `:242`) and it is the reason this workflow was judged solid — a signed scope
 * that changes silently is where the variation argument three months later
 * comes from.
 *
 * Everything else here is ordinary. The versioning is the point.
 */

export class BriefRefused extends Error {
  override readonly name = 'BriefRefused';
}

export const BRIEF_STATUSES = ['draft', 'issued', 'acknowledged', 'superseded'] as const;
export type BriefStatus = (typeof BRIEF_STATUSES)[number];

export const STATEMENT_KINDS = [
  'decision_maker',
  'client_supplied',
  'assumption',
  'exclusion',
] as const;
export type StatementKind = (typeof STATEMENT_KINDS)[number];

export interface BriefStatement {
  readonly id: string;
  readonly kind: StatementKind;
  readonly body: string;
  readonly position: number;
}

export interface BriefRoom {
  readonly id: string;
  readonly roomName: string;
  readonly areaSqft: number | null;
  readonly headcount: number | null;
  readonly purpose: string;
  readonly requirements: string;
  readonly position: number;
}

export interface ClientBrief {
  readonly id: string;
  readonly projectId: string;
  readonly version: number;
  readonly status: BriefStatus;
  readonly engagementType: string;
  readonly scopeSummary: string;
  /** Wire paise, or null when nobody has said. Null is not zero. */
  readonly budgetMinPaise: string | null;
  readonly budgetMaxPaise: string | null;
  readonly targetStartDate: string | null;
  readonly targetCompletionDate: string | null;
  readonly approvalAuthority: string;
  readonly acknowledgedAt: string | null;
  readonly acknowledgedBy: string | null;
  readonly statements: readonly BriefStatement[];
  readonly rooms: readonly BriefRoom[];
}

const BRIEF_COLUMNS = `id, project_id, version, status, engagement_type, scope_summary,
  budget_min_paise::text AS budget_min_paise, budget_max_paise::text AS budget_max_paise,
  target_start_date::text AS target_start_date,
  target_completion_date::text AS target_completion_date,
  approval_authority, acknowledged_at::text AS acknowledged_at, acknowledged_by`;

interface BriefRow extends Record<string, unknown> {
  id: string;
  project_id: string;
  version: number;
  status: string;
  engagement_type: string;
  scope_summary: string;
  budget_min_paise: string | null;
  budget_max_paise: string | null;
  target_start_date: string | null;
  target_completion_date: string | null;
  approval_authority: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

/**
 * Every version of a project's brief, newest first.
 *
 * All of them, not just the current one. A superseded version is what the
 * client agreed to before the scope changed, and the whole value of versioning
 * is being able to read it.
 */
export async function listBriefs(tx: TxLike, projectId: string): Promise<readonly ClientBrief[]> {
  const rows = await tx.query<BriefRow>(
    `SELECT ${BRIEF_COLUMNS} FROM projects.client_briefs
      WHERE project_id = $1
      ORDER BY version DESC`,
    [projectId],
  );
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const statements = await tx.query<{
    id: string;
    brief_id: string;
    kind: string;
    body: string;
    position: number;
  }>(
    `SELECT id, brief_id, kind, body, position FROM projects.brief_statements
      WHERE brief_id = ANY($1::uuid[])
      ORDER BY kind, position`,
    [ids],
  );
  const rooms = await tx.query<{
    id: string;
    brief_id: string;
    room_name: string;
    area_sqft: number | null;
    headcount: number | null;
    purpose: string;
    requirements: string;
    position: number;
  }>(
    `SELECT id, brief_id, room_name, area_sqft, headcount, purpose, requirements, position
       FROM projects.brief_rooms
      WHERE brief_id = ANY($1::uuid[])
      ORDER BY position, room_name`,
    [ids],
  );

  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    version: row.version,
    status: row.status as BriefStatus,
    engagementType: row.engagement_type,
    scopeSummary: row.scope_summary,
    budgetMinPaise: row.budget_min_paise,
    budgetMaxPaise: row.budget_max_paise,
    targetStartDate: row.target_start_date,
    targetCompletionDate: row.target_completion_date,
    approvalAuthority: row.approval_authority,
    acknowledgedAt: row.acknowledged_at,
    acknowledgedBy: row.acknowledged_by,
    statements: statements
      .filter((s) => s.brief_id === row.id)
      .map((s) => ({
        id: s.id,
        kind: s.kind as StatementKind,
        body: s.body,
        position: s.position,
      })),
    rooms: rooms
      .filter((r) => r.brief_id === row.id)
      .map((r) => ({
        id: r.id,
        roomName: r.room_name,
        areaSqft: r.area_sqft,
        headcount: r.headcount,
        purpose: r.purpose,
        requirements: r.requirements,
        position: r.position,
      })),
  }));
}

export interface BriefInput {
  readonly engagementType?: string | undefined;
  readonly scopeSummary?: string | undefined;
  readonly budgetMinPaise?: string | null | undefined;
  readonly budgetMaxPaise?: string | null | undefined;
  readonly targetStartDate?: string | null | undefined;
  readonly targetCompletionDate?: string | null | undefined;
  readonly approvalAuthority?: string | undefined;
}

/**
 * Write the brief for a project.
 *
 * **This is where the rule lives.**
 *
 *   No brief yet            → version 1, draft.
 *   Latest is draft/issued  → edited in place.
 *   Latest is ACKNOWLEDGED  → a new version, and the acknowledged one is marked
 *                             superseded. It keeps its own row, its statements,
 *                             its rooms, and the record of who acknowledged it.
 *
 * A new version starts as a **copy** of the acknowledged one, statements and
 * rooms included. Anything else would mean re-typing the whole scope to change
 * one line, which is how people end up editing the frozen version instead.
 */
export async function saveBrief(
  tx: TxLike,
  ctx: TenantContext,
  projectId: string,
  input: BriefInput,
): Promise<ClientBrief> {
  const current = await tx.query<BriefRow>(
    `SELECT ${BRIEF_COLUMNS} FROM projects.client_briefs
      WHERE project_id = $1
      ORDER BY version DESC
      LIMIT 1`,
    [projectId],
  );
  const latest = current[0];

  if (latest === undefined) {
    return await insertBrief(tx, ctx, projectId, 1, input, null);
  }

  if (latest.status !== 'acknowledged') {
    const rows = await tx.query<BriefRow>(
      `UPDATE projects.client_briefs
          SET engagement_type        = COALESCE($2, engagement_type),
              scope_summary          = COALESCE($3, scope_summary),
              budget_min_paise       = $4,
              budget_max_paise       = $5,
              target_start_date      = $6::date,
              target_completion_date = $7::date,
              approval_authority     = COALESCE($8, approval_authority),
              updated_at             = now()
        WHERE id = $1
       RETURNING ${BRIEF_COLUMNS}`,
      [
        latest.id,
        input.engagementType ?? null,
        input.scopeSummary ?? null,
        input.budgetMinPaise ?? null,
        input.budgetMaxPaise ?? null,
        input.targetStartDate ?? null,
        input.targetCompletionDate ?? null,
        input.approvalAuthority ?? null,
      ],
    );
    if (rows[0] === undefined) throw new BriefRefused('That brief was not saved.');
    return (await listBriefs(tx, projectId))[0] as ClientBrief;
  }

  // Acknowledged. A new version, carrying everything across.
  const next = await insertBrief(tx, ctx, projectId, latest.version + 1, input, latest);

  await tx.query(
    `UPDATE projects.client_briefs SET status = 'superseded', updated_at = now() WHERE id = $1`,
    [latest.id],
  );

  return next;
}

async function insertBrief(
  tx: TxLike,
  ctx: TenantContext,
  projectId: string,
  version: number,
  input: BriefInput,
  copyFrom: BriefRow | null,
): Promise<ClientBrief> {
  const rows = await tx.query<{ id: string }>(
    `INSERT INTO projects.client_briefs
       (tenant_id, project_id, version, status, engagement_type, scope_summary,
        budget_min_paise, budget_max_paise, target_start_date, target_completion_date,
        approval_authority, created_by)
     VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, $8::date, $9::date, $10, $11)
     RETURNING id`,
    [
      ctx.tenantId,
      projectId,
      version,
      input.engagementType ?? copyFrom?.engagement_type ?? '',
      input.scopeSummary ?? copyFrom?.scope_summary ?? '',
      input.budgetMinPaise ?? copyFrom?.budget_min_paise ?? null,
      input.budgetMaxPaise ?? copyFrom?.budget_max_paise ?? null,
      input.targetStartDate ?? copyFrom?.target_start_date ?? null,
      input.targetCompletionDate ?? copyFrom?.target_completion_date ?? null,
      input.approvalAuthority ?? copyFrom?.approval_authority ?? '',
      ctx.principal.id,
    ],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new BriefRefused('That brief was not saved.');

  if (copyFrom !== null) {
    // Statements and rooms come across with the new version. Re-typing the
    // whole scope to change one line is how somebody ends up editing the frozen
    // version instead of superseding it.
    await tx.query(
      `INSERT INTO projects.brief_statements (tenant_id, brief_id, kind, body, position)
       SELECT tenant_id, $1, kind, body, position
         FROM projects.brief_statements WHERE brief_id = $2`,
      [id, copyFrom.id],
    );
    await tx.query(
      `INSERT INTO projects.brief_rooms
         (tenant_id, brief_id, room_name, area_sqft, headcount, purpose, requirements, position)
       SELECT tenant_id, $1, room_name, area_sqft, headcount, purpose, requirements, position
         FROM projects.brief_rooms WHERE brief_id = $2`,
      [id, copyFrom.id],
    );
  }

  const all = await listBriefs(tx, projectId);
  const made = all.find((b) => b.id === id);
  if (made === undefined) throw new BriefRefused('That brief was not saved.');
  return made;
}

/**
 * Issue a brief to the client, or record that the client accepted it.
 *
 * **Acknowledgement records WHO and WHEN, or it does not happen.** The legacy
 * writes `session?.name || session?.email || 'Client'` — so a session with no
 * name acknowledges a scope in the name of the string "Client", which reads as
 * settled and identifies nobody. Here it is the calling principal, and the
 * database refuses the row without one.
 */
export async function setBriefStatus(
  tx: TxLike,
  ctx: TenantContext,
  briefId: string,
  status: 'issued' | 'acknowledged',
): Promise<ClientBrief> {
  const rows = await tx.query<{ project_id: string; status: string }>(
    `SELECT project_id, status FROM projects.client_briefs WHERE id = $1`,
    [briefId],
  );
  const found = rows[0];
  if (found === undefined) throw new BriefRefused('no such brief');

  if (found.status === 'superseded') {
    throw new BriefRefused('That version has been superseded. Work on the current one.');
  }
  if (found.status === 'acknowledged') {
    throw new BriefRefused(
      'The client has already acknowledged this version. Save a change to create the next one.',
    );
  }

  await tx.query(
    status === 'acknowledged'
      ? `UPDATE projects.client_briefs
            SET status = 'acknowledged', acknowledged_at = now(), acknowledged_by = $2,
                updated_at = now()
          WHERE id = $1`
      : `UPDATE projects.client_briefs SET status = 'issued', updated_at = now() WHERE id = $1`,
    status === 'acknowledged' ? [briefId, ctx.principal.id] : [briefId],
  );

  const all = await listBriefs(tx, found.project_id);
  const made = all.find((b) => b.id === briefId);
  if (made === undefined) throw new BriefRefused('no such brief');
  return made;
}

/**
 * The guard every write to a brief's contents goes through.
 *
 * One function rather than the same check at four call sites, because "did you
 * remember to check whether it is frozen" is a question a reviewer should not
 * have to ask four times.
 */
async function assertEditable(tx: TxLike, briefId: string): Promise<void> {
  const rows = await tx.query<{ status: string }>(
    `SELECT status FROM projects.client_briefs WHERE id = $1`,
    [briefId],
  );
  const status = rows[0]?.status;
  if (status === undefined) throw new BriefRefused('no such brief');
  if (status === 'acknowledged') {
    throw new BriefRefused(
      'The client has acknowledged this version. Save a change to the brief to create the next one, and edit that.',
    );
  }
  if (status === 'superseded') {
    throw new BriefRefused('That version has been superseded. Work on the current one.');
  }
}

export async function addStatement(
  tx: TxLike,
  ctx: TenantContext,
  briefId: string,
  input: {
    readonly kind: StatementKind;
    readonly body: string;
    readonly position?: number | undefined;
  },
): Promise<string> {
  await assertEditable(tx, briefId);
  const rows = await tx.query<{ id: string }>(
    `INSERT INTO projects.brief_statements (tenant_id, brief_id, kind, body, position)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [ctx.tenantId, briefId, input.kind, input.body.trim(), input.position ?? 0],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new BriefRefused('That statement was not saved.');
  return id;
}

export async function removeStatement(
  tx: TxLike,
  briefId: string,
  statementId: string,
): Promise<boolean> {
  await assertEditable(tx, briefId);
  const rows = await tx.query<{ id: string }>(
    `DELETE FROM projects.brief_statements WHERE id = $1 AND brief_id = $2 RETURNING id`,
    [statementId, briefId],
  );
  return rows.length > 0;
}

export interface RoomInput {
  readonly roomName: string;
  readonly areaSqft?: number | null | undefined;
  readonly headcount?: number | null | undefined;
  readonly purpose?: string | undefined;
  readonly requirements?: string | undefined;
  readonly position?: number | undefined;
}

export async function saveRoom(
  tx: TxLike,
  ctx: TenantContext,
  briefId: string,
  input: RoomInput,
): Promise<string> {
  await assertEditable(tx, briefId);
  try {
    const rows = await tx.query<{ id: string }>(
      `INSERT INTO projects.brief_rooms
         (tenant_id, brief_id, room_name, area_sqft, headcount, purpose, requirements, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (tenant_id, brief_id, room_name) DO UPDATE
          SET area_sqft    = EXCLUDED.area_sqft,
              headcount    = EXCLUDED.headcount,
              purpose      = EXCLUDED.purpose,
              requirements = EXCLUDED.requirements,
              position     = EXCLUDED.position,
              updated_at   = now()
       RETURNING id`,
      [
        ctx.tenantId,
        briefId,
        input.roomName.trim(),
        input.areaSqft ?? null,
        input.headcount ?? null,
        input.purpose ?? '',
        input.requirements ?? '',
        input.position ?? 0,
      ],
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new BriefRefused('That room was not saved.');
    return id;
  } catch (error) {
    if ((error as { code?: string }).code === '23514') {
      throw new BriefRefused('An area has to be a whole number of square feet, above zero.');
    }
    throw error;
  }
}

export async function removeRoom(tx: TxLike, briefId: string, roomId: string): Promise<boolean> {
  await assertEditable(tx, briefId);
  const rows = await tx.query<{ id: string }>(
    `DELETE FROM projects.brief_rooms WHERE id = $1 AND brief_id = $2 RETURNING id`,
    [roomId, briefId],
  );
  return rows.length > 0;
}

import type { TenantContext } from '@cog/contracts';
import type { TxLike } from './project-team.js';

/**
 * Workflow 9: warranty claims after handover.
 *
 * **Verdict: THIN**, and the defaults are the case. The legacy invents an SLA
 * of seven days from now, a category of `'Carpentry'`, a contractor called
 * `'General Works'` and a client called `'Client'` — then reads none of them.
 *
 * None of those four defaults exists here. `respondBy` is nullable and nothing
 * fills it in; when somebody sets one it is **read**, and an unresolved claim
 * past its date is reported overdue. A promised date nothing looks at is
 * decoration.
 */

export class WarrantyRefused extends Error {
  override readonly name = 'WarrantyRefused';
}

export const WARRANTY_STATUSES = ['reported', 'in_progress', 'resolved', 'rejected'] as const;
export type WarrantyStatus = (typeof WARRANTY_STATUSES)[number];

export interface WarrantyCase {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly reportedOn: string;
  /** What was promised, if anything was. Never invented. */
  readonly respondBy: string | null;
  readonly assignedTo: string;
  readonly status: WarrantyStatus;
  readonly resolutionNotes: string;
  readonly resolutionEvidenceUrl: string;
  readonly closedAt: string | null;
  /** Open, with a promised date that has passed. Computed on every read. */
  readonly overdue: boolean;
}

export async function listCases(
  tx: TxLike,
  projectId: string,
  at: Date = new Date(),
): Promise<readonly WarrantyCase[]> {
  const rows = await tx.query<{
    id: string;
    project_id: string;
    title: string;
    description: string;
    category: string;
    reported_on: string;
    respond_by: string | null;
    assigned_to: string;
    status: string;
    resolution_notes: string;
    resolution_evidence_url: string;
    closed_at: string | null;
  }>(
    `SELECT id, project_id, title, description, category,
            reported_on::text AS reported_on, respond_by::text AS respond_by,
            assigned_to, status, resolution_notes, resolution_evidence_url,
            closed_at::text AS closed_at
       FROM projects.warranty_cases
      WHERE project_id = $1
      ORDER BY reported_on DESC, created_at DESC`,
    [projectId],
  );

  const today = at.toISOString().slice(0, 10);

  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    description: r.description,
    category: r.category,
    reportedOn: r.reported_on,
    respondBy: r.respond_by,
    assignedTo: r.assigned_to,
    status: r.status as WarrantyStatus,
    resolutionNotes: r.resolution_notes,
    resolutionEvidenceUrl: r.resolution_evidence_url,
    closedAt: r.closed_at,
    // The one reader the legacy's `sla_target_date` never had.
    overdue:
      (r.status === 'reported' || r.status === 'in_progress') &&
      r.respond_by !== null &&
      r.respond_by < today,
  }));
}

export interface CaseInput {
  readonly title: string;
  readonly description?: string | undefined;
  readonly category?: string | undefined;
  readonly reportedOn?: string | undefined;
  readonly respondBy?: string | null | undefined;
  readonly assignedTo?: string | undefined;
}

export async function raiseCase(
  tx: TxLike,
  ctx: TenantContext,
  projectId: string,
  input: CaseInput,
): Promise<string> {
  try {
    const rows = await tx.query<{ id: string }>(
      `INSERT INTO projects.warranty_cases
         (tenant_id, project_id, title, description, category, reported_on,
          respond_by, assigned_to, raised_by)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, current_date), $7::date, $8, $9)
       RETURNING id`,
      [
        ctx.tenantId,
        projectId,
        input.title.trim(),
        input.description ?? '',
        // No `?? 'Carpentry'`. An electrical fault filed in a hurry is not a
        // carpentry claim.
        input.category ?? '',
        input.reportedOn ?? null,
        // No `?? now + 7 days`. A commitment the software made up is a promise
        // nobody gave.
        input.respondBy ?? null,
        // No `?? 'General Works'`. That is not a contractor.
        input.assignedTo ?? '',
        ctx.principal.id,
      ],
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new WarrantyRefused('That claim was not saved.');
    return id;
  } catch (error) {
    if ((error as { code?: string }).code === '23514') {
      throw new WarrantyRefused('A response date cannot be before the claim was reported.');
    }
    throw error;
  }
}

/**
 * Close a claim, or move it on.
 *
 * **Closing needs notes.** "Resolved" with nothing beside it is the row a
 * client asks about six months later and nobody can answer; a rejection needs a
 * reason for exactly the same reason.
 */
export async function decideCase(
  tx: TxLike,
  caseId: string,
  input: {
    readonly status: WarrantyStatus;
    readonly resolutionNotes?: string | undefined;
    readonly resolutionEvidenceUrl?: string | undefined;
  },
): Promise<void> {
  const closing = input.status === 'resolved' || input.status === 'rejected';
  if (closing && (input.resolutionNotes ?? '').trim() === '') {
    throw new WarrantyRefused(
      input.status === 'resolved'
        ? 'Say what was done about it. "Resolved" on its own answers nothing six months later.'
        : 'Say why it is being refused.',
    );
  }

  const rows = await tx.query<{ id: string }>(
    `UPDATE projects.warranty_cases
        SET status = $2,
            resolution_notes = $3,
            resolution_evidence_url = $4,
            closed_at = CASE WHEN $2 IN ('resolved', 'rejected') THEN now() ELSE NULL END,
            updated_at = now()
      WHERE id = $1
     RETURNING id`,
    [
      caseId,
      input.status,
      input.resolutionNotes ?? '',
      input.resolutionEvidenceUrl ?? '',
    ],
  );
  if (rows[0] === undefined) throw new WarrantyRefused('no such claim');
}

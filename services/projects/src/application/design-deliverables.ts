import type { TenantContext } from '@cog/contracts';
import type { TxLike } from './project-team.js';

/**
 * Workflow 2: design deliverables and their reviews.
 *
 * **The rule:** a revision past an AGREED limit is flagged, and the flag is a
 * flag — never a price. The legacy is explicit about why
 * (`design-build.js:675`): *"Variations must be authorized via change orders
 * rather than arbitrary fees."*
 *
 * **The limit is nullable and nothing defaults it.** The legacy writes
 * `included_revisions_limit ?? 2`; two included revisions is a term in
 * somebody's contract, and a `??` that supplies one makes every deliverable in
 * the system start charging on the third revision because of a keystroke.
 */

export class DeliverableRefused extends Error {
  override readonly name = 'DeliverableRefused';
}

export const DELIVERABLE_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'revision_requested',
  'rejected',
] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

export const REVIEW_DECISIONS = ['approved', 'revision_requested', 'rejected'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export interface DesignReview {
  readonly id: string;
  readonly versionLabel: string;
  readonly reviewerKind: 'internal' | 'client';
  readonly reviewerId: string | null;
  readonly decision: ReviewDecision;
  readonly feedback: string;
  readonly reviewedAt: string;
}

export interface DesignDeliverable {
  readonly id: string;
  readonly projectId: string;
  readonly briefRoomId: string | null;
  readonly stage: string;
  readonly name: string;
  readonly ownerId: string | null;
  readonly dueDate: string | null;
  readonly versionLabel: string;
  readonly revisionCount: number;
  readonly includedRevisionsLimit: number | null;
  readonly status: DeliverableStatus;
  readonly beyondIncludedRevisions: boolean;
  readonly fileUrl: string;
  readonly notes: string;
  readonly approvedAt: string | null;
  readonly reviews: readonly DesignReview[];
}

const COLUMNS = `id, project_id, brief_room_id, stage, name, owner_id,
  due_date::text AS due_date, version_label, revision_count, included_revisions_limit,
  status, beyond_included_revisions, file_url, notes,
  approved_at::text AS approved_at`;

interface Row extends Record<string, unknown> {
  id: string;
  project_id: string;
  brief_room_id: string | null;
  stage: string;
  name: string;
  owner_id: string | null;
  due_date: string | null;
  version_label: string;
  revision_count: number;
  included_revisions_limit: number | null;
  status: string;
  beyond_included_revisions: boolean;
  file_url: string;
  notes: string;
  approved_at: string | null;
}

export async function listDeliverables(
  tx: TxLike,
  projectId: string,
): Promise<readonly DesignDeliverable[]> {
  const rows = await tx.query<Row>(
    `SELECT ${COLUMNS} FROM projects.design_deliverables
      WHERE project_id = $1
      ORDER BY due_date NULLS LAST, name`,
    [projectId],
  );
  if (rows.length === 0) return [];

  const reviews = await tx.query<{
    id: string;
    deliverable_id: string;
    version_label: string;
    reviewer_kind: string;
    reviewer_id: string | null;
    decision: string;
    feedback: string;
    reviewed_at: string;
  }>(
    `SELECT id, deliverable_id, version_label, reviewer_kind, reviewer_id,
            decision, feedback, reviewed_at::text AS reviewed_at
       FROM projects.design_reviews
      WHERE deliverable_id = ANY($1::uuid[])
      ORDER BY reviewed_at DESC`,
    [rows.map((r) => r.id)],
  );

  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    briefRoomId: row.brief_room_id,
    stage: row.stage,
    name: row.name,
    ownerId: row.owner_id,
    dueDate: row.due_date,
    versionLabel: row.version_label,
    revisionCount: row.revision_count,
    includedRevisionsLimit: row.included_revisions_limit,
    status: row.status as DeliverableStatus,
    beyondIncludedRevisions: row.beyond_included_revisions,
    fileUrl: row.file_url,
    notes: row.notes,
    approvedAt: row.approved_at,
    reviews: reviews
      .filter((r) => r.deliverable_id === row.id)
      .map((r) => ({
        id: r.id,
        versionLabel: r.version_label,
        reviewerKind: r.reviewer_kind as 'internal' | 'client',
        reviewerId: r.reviewer_id,
        decision: r.decision as ReviewDecision,
        feedback: r.feedback,
        reviewedAt: r.reviewed_at,
      })),
  }));
}

export interface DeliverableInput {
  readonly stage?: string | undefined;
  readonly name: string;
  readonly briefRoomId?: string | null | undefined;
  readonly ownerId?: string | null | undefined;
  readonly dueDate?: string | null | undefined;
  readonly includedRevisionsLimit?: number | null | undefined;
  readonly fileUrl?: string | undefined;
  readonly notes?: string | undefined;
}

export async function addDeliverable(
  tx: TxLike,
  ctx: TenantContext,
  projectId: string,
  input: DeliverableInput,
): Promise<string> {
  const rows = await tx.query<{ id: string }>(
    `INSERT INTO projects.design_deliverables
       (tenant_id, project_id, brief_room_id, stage, name, owner_id, due_date,
        included_revisions_limit, file_url, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11)
     RETURNING id`,
    [
      ctx.tenantId,
      projectId,
      input.briefRoomId ?? null,
      input.stage ?? '',
      input.name.trim(),
      input.ownerId ?? null,
      input.dueDate ?? null,
      // No `?? 2`. NULL means nobody agreed a limit and the rule below never
      // fires, which is the honest state for a contract that does not say.
      input.includedRevisionsLimit ?? null,
      input.fileUrl ?? '',
      input.notes ?? '',
      ctx.principal.id,
    ],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new DeliverableRefused('That deliverable was not saved.');
  return id;
}

/** Send it out for review. Only a draft or a revised one can be submitted. */
export async function submitDeliverable(tx: TxLike, deliverableId: string): Promise<void> {
  const rows = await tx.query<{ id: string }>(
    `UPDATE projects.design_deliverables
        SET status = 'submitted', updated_at = now()
      WHERE id = $1 AND status IN ('draft', 'revision_requested', 'rejected')
     RETURNING id`,
    [deliverableId],
  );
  if (rows[0] === undefined) {
    // Either it does not exist or it is already out for review or approved.
    // Told apart below so the message is about the state rather than the id.
    const found = await tx.query<{ status: string }>(
      `SELECT status FROM projects.design_deliverables WHERE id = $1`,
      [deliverableId],
    );
    const status = found[0]?.status;
    if (status === undefined) throw new DeliverableRefused('no such deliverable');
    throw new DeliverableRefused(
      status === 'approved'
        ? 'That deliverable is approved. Issue a revision to change it.'
        : 'That deliverable is already out for review.',
    );
  }
}

export interface ReviewInput {
  readonly decision: ReviewDecision;
  readonly feedback?: string | undefined;
  readonly reviewerKind: 'internal' | 'client';
}

export interface ReviewResult {
  readonly status: DeliverableStatus;
  readonly revisionCount: number;
  /** True the moment the count passes an agreed limit. Null limit never fires. */
  readonly beyondIncludedRevisions: boolean;
}

/**
 * Record a review, and apply what it means.
 *
 * **The counting rule, and the reason it is here rather than in a screen.**
 * Asking for a revision costs the practice a revision, and the one past the
 * agreed limit is chargeable. The count moving is a consequence of the
 * decision, not a separate action somebody remembers to take — the legacy has
 * them in one function for the same reason.
 *
 * **What this does NOT do is put a number on it.** `beyond_included_revisions`
 * is a flag. A variation is priced on a change order, where it goes through the
 * approval chain; a fee written here would be a charge nobody authorised, which
 * is exactly what `design-build.js:675` says out loud.
 */
export async function reviewDeliverable(
  tx: TxLike,
  ctx: TenantContext,
  deliverableId: string,
  input: ReviewInput,
): Promise<ReviewResult> {
  const found = await tx.query<Row>(
    `SELECT ${COLUMNS} FROM projects.design_deliverables WHERE id = $1`,
    [deliverableId],
  );
  const deliverable = found[0];
  if (deliverable === undefined) throw new DeliverableRefused('no such deliverable');

  if (deliverable.status === 'approved') {
    throw new DeliverableRefused(
      'That deliverable is already approved. Issue a revision before reviewing it again.',
    );
  }
  if (deliverable.status === 'draft') {
    throw new DeliverableRefused('That deliverable has not been issued for review yet.');
  }

  // The review first, and with the label the deliverable carries NOW — the
  // label moves on below, and a review has to keep saying which revision it was
  // about.
  await tx.query(
    `INSERT INTO projects.design_reviews
       (tenant_id, deliverable_id, version_label, reviewer_kind, reviewer_id, decision, feedback)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      ctx.tenantId,
      deliverableId,
      deliverable.version_label,
      input.reviewerKind,
      ctx.principal.id,
      input.decision,
      input.feedback ?? '',
    ],
  );

  if (input.decision === 'approved') {
    await tx.query(
      `UPDATE projects.design_deliverables
          SET status = 'approved', approved_at = now(), approved_by = $2, updated_at = now()
        WHERE id = $1`,
      [deliverableId, ctx.principal.id],
    );
    return {
      status: 'approved',
      revisionCount: deliverable.revision_count,
      beyondIncludedRevisions: deliverable.beyond_included_revisions,
    };
  }

  if (input.decision === 'rejected') {
    await tx.query(
      `UPDATE projects.design_deliverables SET status = 'rejected', updated_at = now()
        WHERE id = $1`,
      [deliverableId],
    );
    return {
      status: 'rejected',
      revisionCount: deliverable.revision_count,
      beyondIncludedRevisions: deliverable.beyond_included_revisions,
    };
  }

  // A revision was asked for. This is the rule.
  const nextCount = deliverable.revision_count + 1;
  const limit = deliverable.included_revisions_limit;
  // A null limit means no limit was agreed, so nothing is beyond it. The flag
  // stays false and the database refuses it being true without a limit anyway.
  const beyond = limit !== null && nextCount > limit;

  await tx.query(
    `UPDATE projects.design_deliverables
        SET status = 'revision_requested',
            revision_count = $2,
            version_label = $3,
            beyond_included_revisions = $4,
            updated_at = now()
      WHERE id = $1`,
    [deliverableId, nextCount, `v${String(nextCount)}.0`, beyond],
  );

  return { status: 'revision_requested', revisionCount: nextCount, beyondIncludedRevisions: beyond };
}

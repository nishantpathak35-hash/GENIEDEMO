import type { TenantContext } from '@cog/contracts';
import type { TxLike } from './project-team.js';

/**
 * Workflow 3: what goes in each room, and what happens when it cannot be got.
 *
 * Three rules, all of them ported:
 *
 *   1. **Approving freezes the selection.** Procurement orders against a frozen
 *      spec, so changing it afterwards is a substitution rather than an edit.
 *      `is_frozen = (status = 'approved')` is a CHECK constraint, not a
 *      convention: two booleans that can disagree are two sources of truth.
 *
 *   2. **A substitution carries its price and lead-time impact** and needs
 *      approval before it takes effect.
 *
 *   3. **Approving one applies its delta exactly once.** The legacy learned
 *      this the hard way — `approveSelectionSubstitution:940-942` returns early
 *      with the comment "Idempotent: prevent duplicate price inflation". Here
 *      the UPDATE that approves it carries `WHERE status = 'pending'` and the
 *      price change happens only if that UPDATE moved a row, so a second
 *      approval cannot double the price even if two of them arrive at once.
 */

export class SelectionRefused extends Error {
  override readonly name = 'SelectionRefused';
}

export const SELECTION_STATUSES = [
  'proposed',
  'approved',
  'rejected',
  'alternative_requested',
] as const;
export type SelectionStatus = (typeof SELECTION_STATUSES)[number];

export interface Substitution {
  readonly id: string;
  readonly originalSpec: string;
  readonly proposedSpec: string;
  readonly reason: string;
  /** Signed wire paise. Negative is cheaper, which is the ordinary case. */
  readonly priceDeltaPaise: string;
  readonly leadTimeDeltaDays: number;
  readonly status: 'pending' | 'approved' | 'rejected';
  readonly proposedAt: string;
  readonly decidedAt: string | null;
}

export interface RoomSelection {
  readonly id: string;
  readonly projectId: string;
  readonly briefRoomId: string | null;
  readonly roomLabel: string;
  readonly category: string;
  readonly itemName: string;
  readonly modelSku: string;
  readonly finish: string;
  readonly unitPricePaise: string | null;
  readonly quantity: number | null;
  readonly leadTimeWeeks: number | null;
  readonly decisionDeadline: string | null;
  readonly status: SelectionStatus;
  readonly isFrozen: boolean;
  readonly decisionNote: string;
  readonly decidedAt: string | null;
  readonly substitutions: readonly Substitution[];
}

const COLUMNS = `id, project_id, brief_room_id, room_label, category, item_name,
  model_sku, finish, unit_price_paise::text AS unit_price_paise, quantity,
  lead_time_weeks, decision_deadline::text AS decision_deadline, status, is_frozen,
  decision_note, decided_at::text AS decided_at`;

interface Row extends Record<string, unknown> {
  id: string;
  project_id: string;
  brief_room_id: string | null;
  room_label: string;
  category: string;
  item_name: string;
  model_sku: string;
  finish: string;
  unit_price_paise: string | null;
  quantity: number | null;
  lead_time_weeks: number | null;
  decision_deadline: string | null;
  status: string;
  is_frozen: boolean;
  decision_note: string;
  decided_at: string | null;
}

export async function listSelections(
  tx: TxLike,
  projectId: string,
): Promise<readonly RoomSelection[]> {
  const rows = await tx.query<Row>(
    `SELECT ${COLUMNS} FROM projects.room_selections
      WHERE project_id = $1
      ORDER BY room_label, item_name`,
    [projectId],
  );
  if (rows.length === 0) return [];

  const subs = await tx.query<{
    id: string;
    selection_id: string;
    original_spec: string;
    proposed_spec: string;
    reason: string;
    price_delta_paise: string;
    lead_time_delta_days: number;
    status: string;
    proposed_at: string;
    decided_at: string | null;
  }>(
    `SELECT id, selection_id, original_spec, proposed_spec, reason,
            price_delta_paise::text AS price_delta_paise, lead_time_delta_days,
            status, proposed_at::text AS proposed_at, decided_at::text AS decided_at
       FROM projects.selection_substitutions
      WHERE selection_id = ANY($1::uuid[])
      ORDER BY proposed_at DESC`,
    [rows.map((r) => r.id)],
  );

  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    briefRoomId: row.brief_room_id,
    roomLabel: row.room_label,
    category: row.category,
    itemName: row.item_name,
    modelSku: row.model_sku,
    finish: row.finish,
    unitPricePaise: row.unit_price_paise,
    quantity: row.quantity,
    leadTimeWeeks: row.lead_time_weeks,
    decisionDeadline: row.decision_deadline,
    status: row.status as SelectionStatus,
    isFrozen: row.is_frozen,
    decisionNote: row.decision_note,
    decidedAt: row.decided_at,
    substitutions: subs
      .filter((s) => s.selection_id === row.id)
      .map((s) => ({
        id: s.id,
        originalSpec: s.original_spec,
        proposedSpec: s.proposed_spec,
        reason: s.reason,
        priceDeltaPaise: s.price_delta_paise,
        leadTimeDeltaDays: s.lead_time_delta_days,
        status: s.status as 'pending' | 'approved' | 'rejected',
        proposedAt: s.proposed_at,
        decidedAt: s.decided_at,
      })),
  }));
}

export interface SelectionInput {
  readonly briefRoomId?: string | null | undefined;
  readonly roomLabel?: string | undefined;
  readonly category?: string | undefined;
  readonly itemName: string;
  readonly modelSku?: string | undefined;
  readonly finish?: string | undefined;
  readonly unitPricePaise?: string | null | undefined;
  readonly quantity?: number | null | undefined;
  readonly leadTimeWeeks?: number | null | undefined;
  readonly decisionDeadline?: string | null | undefined;
}

export async function addSelection(
  tx: TxLike,
  ctx: TenantContext,
  projectId: string,
  input: SelectionInput,
): Promise<string> {
  const rows = await tx.query<{ id: string }>(
    `INSERT INTO projects.room_selections
       (tenant_id, project_id, brief_room_id, room_label, category, item_name,
        model_sku, finish, unit_price_paise, quantity, lead_time_weeks,
        decision_deadline, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::date, $13)
     RETURNING id`,
    [
      ctx.tenantId,
      projectId,
      input.briefRoomId ?? null,
      input.roomLabel ?? '',
      input.category ?? '',
      input.itemName.trim(),
      input.modelSku ?? '',
      input.finish ?? '',
      input.unitPricePaise ?? null,
      input.quantity ?? null,
      input.leadTimeWeeks ?? null,
      input.decisionDeadline ?? null,
      ctx.principal.id,
    ],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new SelectionRefused('That selection was not saved.');
  return id;
}

/**
 * The client's answer.
 *
 * Approving freezes it; rejecting or asking for an alternative unfreezes it.
 * `is_frozen` is written in the same statement as the status because the CHECK
 * constraint requires them to agree — which is the point of the constraint.
 */
export async function decideSelection(
  tx: TxLike,
  ctx: TenantContext,
  selectionId: string,
  decision: Exclude<SelectionStatus, 'proposed'>,
  note: string,
): Promise<void> {
  const rows = await tx.query<{ id: string }>(
    `UPDATE projects.room_selections
        SET status = $2,
            is_frozen = ($2 = 'approved'),
            decision_note = $3,
            decided_at = now(),
            decided_by = $4,
            updated_at = now()
      WHERE id = $1
     RETURNING id`,
    [selectionId, decision, note, ctx.principal.id],
  );
  if (rows[0] === undefined) throw new SelectionRefused('no such selection');
}

export interface SubstitutionInput {
  readonly proposedSpec: string;
  readonly reason?: string | undefined;
  /** Signed wire paise, as a string. Zero is a real answer and the default. */
  readonly priceDeltaPaise?: string | undefined;
  readonly leadTimeDeltaDays?: number | undefined;
}

/**
 * Propose an alternative.
 *
 * Only against a FROZEN selection: an item nobody has approved yet does not
 * need a substitution, it needs editing. That distinction is what keeps the
 * price delta meaningful — a delta against a spec that is still moving is a
 * delta against nothing.
 */
export async function proposeSubstitution(
  tx: TxLike,
  ctx: TenantContext,
  selectionId: string,
  input: SubstitutionInput,
): Promise<string> {
  const found = await tx.query<{ status: string; model_sku: string; item_name: string }>(
    `SELECT status, model_sku, item_name FROM projects.room_selections WHERE id = $1`,
    [selectionId],
  );
  const selection = found[0];
  if (selection === undefined) throw new SelectionRefused('no such selection');
  if (selection.status !== 'approved') {
    throw new SelectionRefused(
      'That selection has not been approved yet, so there is nothing to substitute. Edit it instead.',
    );
  }

  try {
    const rows = await tx.query<{ id: string }>(
      `INSERT INTO projects.selection_substitutions
         (tenant_id, selection_id, original_spec, proposed_spec, reason,
          price_delta_paise, lead_time_delta_days, proposed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        ctx.tenantId,
        selectionId,
        // Copied now. The selection's own spec changes when this is approved, so
        // a live join would show the answer rather than the question.
        selection.model_sku === '' ? selection.item_name : selection.model_sku,
        input.proposedSpec.trim(),
        input.reason ?? '',
        input.priceDeltaPaise ?? '0',
        input.leadTimeDeltaDays ?? 0,
        ctx.principal.id,
      ],
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new SelectionRefused('That substitution was not saved.');
    return id;
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new SelectionRefused(
        'There is already an alternative waiting for a decision on this item.',
      );
    }
    throw error;
  }
}

export interface SubstitutionResult {
  readonly applied: boolean;
  readonly newUnitPricePaise: string | null;
}

/**
 * Approve or refuse an alternative.
 *
 * **The delta is applied exactly once, and the mechanism is the WHERE clause.**
 *
 * `UPDATE ... WHERE status = 'pending' RETURNING id` moves the substitution out
 * of pending and tells us whether it was this call that moved it. The price
 * change happens only in that branch. Two approvals arriving together take the
 * row's lock in turn; the second finds no pending row, changes nothing, and the
 * price is applied once.
 *
 * The legacy reaches the same place with a read-then-return guard
 * (`:940-942`), which is correct single-threaded and races under concurrency —
 * and the comment beside it says it was written because the price had already
 * been inflated twice.
 *
 * The addition is `bigint + bigint` in Postgres: exact, and not the legacy's
 * `unit_price + Number(delta)`.
 */
export async function decideSubstitution(
  tx: TxLike,
  ctx: TenantContext,
  substitutionId: string,
  approve: boolean,
): Promise<SubstitutionResult> {
  const moved = await tx.query<{
    selection_id: string;
    proposed_spec: string;
    price_delta_paise: string;
  }>(
    `UPDATE projects.selection_substitutions
        SET status = $2, decided_at = now(), decided_by = $3
      WHERE id = $1 AND status = 'pending'
     RETURNING selection_id, proposed_spec, price_delta_paise::text AS price_delta_paise`,
    [substitutionId, approve ? 'approved' : 'rejected', ctx.principal.id],
  );

  const row = moved[0];
  if (row === undefined) {
    const found = await tx.query<{ status: string }>(
      `SELECT status FROM projects.selection_substitutions WHERE id = $1`,
      [substitutionId],
    );
    const status = found[0]?.status;
    if (status === undefined) throw new SelectionRefused('no such substitution');
    throw new SelectionRefused(`That alternative was already ${status}.`);
  }

  if (!approve) return { applied: false, newUnitPricePaise: null };

  try {
    const updated = await tx.query<{ unit_price_paise: string | null }>(
      `UPDATE projects.room_selections
          SET model_sku = $2,
              unit_price_paise = COALESCE(unit_price_paise, 0) + $3::bigint,
              updated_at = now()
        WHERE id = $1
       RETURNING unit_price_paise::text AS unit_price_paise`,
      [row.selection_id, row.proposed_spec, row.price_delta_paise],
    );
    return { applied: true, newUnitPricePaise: updated[0]?.unit_price_paise ?? null };
  } catch (error) {
    // A saving larger than the price itself. The CHECK refuses it and this
    // turns the constraint name into a sentence: the delta is wrong, or the
    // price it is being applied to is.
    if ((error as { code?: string }).code === '23514') {
      throw new SelectionRefused(
        'That saving is larger than the item costs, which would make its price negative. Check the delta against the price on the selection.',
      );
    }
    throw error;
  }
}

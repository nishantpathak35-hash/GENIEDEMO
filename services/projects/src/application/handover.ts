import type { TenantContext } from '@cog/contracts';
import type { TxLike } from './project-team.js';

/**
 * Workflow 8: handing the finished job to the client.
 *
 * **The rule:** a handover cannot be issued while any critical item is still
 * open, and the refusal says how many remain. Ported from
 * `design-build.js:1604-1612`, which is the reason this workflow was judged
 * solid — a handover that can be issued over open critical defects is one
 * nobody would trust.
 *
 * **Rectification needs proof.** An after-photo and a verifier, both refused by
 * a CHECK constraint if missing. The whole value of a punch list is that items
 * cannot be ticked off to clear it.
 */

export class HandoverItemRefused extends Error {
  override readonly name = 'HandoverItemRefused';
}

export const ITEM_KINDS = ['snag', 'defect', 'incomplete'] as const;
export const SEVERITIES = ['minor', 'major', 'critical'] as const;
export const ITEM_STATUSES = ['open', 'rectified', 'accepted'] as const;

export interface HandoverItem {
  readonly id: string;
  readonly roomLabel: string;
  readonly kind: (typeof ITEM_KINDS)[number];
  readonly description: string;
  readonly severity: (typeof SEVERITIES)[number];
  readonly status: (typeof ITEM_STATUSES)[number];
  readonly beforePhotoUrl: string;
  readonly afterPhotoUrl: string;
  readonly assignedTo: string;
  readonly rectifiedAt: string | null;
  readonly notes: string;
}

export interface HandoverRecord {
  readonly id: string;
  readonly totalItems: number;
  readonly rectifiedItems: number;
  readonly openMinor: number;
  readonly notes: string;
  readonly issuedAt: string;
}

export interface HandoverState {
  readonly items: readonly HandoverItem[];
  readonly record: HandoverRecord | null;
  /** Critical items still open. Anything above zero blocks the handover. */
  readonly blocking: number;
}

export async function handoverState(tx: TxLike, projectId: string): Promise<HandoverState> {
  const items = await tx.query<{
    id: string;
    room_label: string;
    kind: string;
    description: string;
    severity: string;
    status: string;
    before_photo_url: string;
    after_photo_url: string;
    assigned_to: string;
    rectified_at: string | null;
    notes: string;
  }>(
    `SELECT id, room_label, kind, description, severity, status,
            before_photo_url, after_photo_url, assigned_to,
            rectified_at::text AS rectified_at, notes
       FROM projects.handover_items
      WHERE project_id = $1
      ORDER BY
        CASE severity WHEN 'critical' THEN 0 WHEN 'major' THEN 1 ELSE 2 END,
        room_label, created_at`,
    [projectId],
  );

  const records = await tx.query<{
    id: string;
    total_items: number;
    rectified_items: number;
    open_minor: number;
    notes: string;
    issued_at: string;
  }>(
    `SELECT id, total_items, rectified_items, open_minor, notes,
            issued_at::text AS issued_at
       FROM projects.handover_records
      WHERE project_id = $1`,
    [projectId],
  );
  const record = records[0];

  return {
    items: items.map((r) => ({
      id: r.id,
      roomLabel: r.room_label,
      kind: r.kind as (typeof ITEM_KINDS)[number],
      description: r.description,
      severity: r.severity as (typeof SEVERITIES)[number],
      status: r.status as (typeof ITEM_STATUSES)[number],
      beforePhotoUrl: r.before_photo_url,
      afterPhotoUrl: r.after_photo_url,
      assignedTo: r.assigned_to,
      rectifiedAt: r.rectified_at,
      notes: r.notes,
    })),
    record:
      record === undefined
        ? null
        : {
            id: record.id,
            totalItems: record.total_items,
            rectifiedItems: record.rectified_items,
            openMinor: record.open_minor,
            notes: record.notes,
            issuedAt: record.issued_at,
          },
    blocking: items.filter((i) => i.severity === 'critical' && i.status === 'open').length,
  };
}

export interface ItemInput {
  readonly roomLabel?: string | undefined;
  readonly kind: (typeof ITEM_KINDS)[number];
  readonly description: string;
  readonly severity: (typeof SEVERITIES)[number];
  readonly beforePhotoUrl?: string | undefined;
  readonly assignedTo?: string | undefined;
}

export async function raiseItem(
  tx: TxLike,
  ctx: TenantContext,
  projectId: string,
  input: ItemInput,
): Promise<string> {
  const rows = await tx.query<{ id: string }>(
    `INSERT INTO projects.handover_items
       (tenant_id, project_id, room_label, kind, description, severity,
        before_photo_url, assigned_to, raised_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      ctx.tenantId,
      projectId,
      input.roomLabel ?? '',
      input.kind,
      input.description.trim(),
      input.severity,
      input.beforePhotoUrl ?? '',
      input.assignedTo ?? '',
      ctx.principal.id,
    ],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new HandoverItemRefused('That item was not saved.');
  return id;
}

/**
 * Mark an item fixed.
 *
 * **The after-photo is required**, and refused here as well as by the CHECK so
 * the message is a sentence. It is the whole difference between a punch list
 * and a list of ticks: the photograph is what somebody looks at when the client
 * says it was never done.
 */
export async function rectifyItem(
  tx: TxLike,
  ctx: TenantContext,
  itemId: string,
  input: { readonly afterPhotoUrl: string; readonly notes?: string | undefined },
): Promise<void> {
  if (input.afterPhotoUrl.trim() === '') {
    throw new HandoverItemRefused(
      'Rectifying an item needs a photograph of the finished work. A tick is not evidence.',
    );
  }

  const rows = await tx.query<{ id: string }>(
    `UPDATE projects.handover_items
        SET status = 'rectified', after_photo_url = $2, notes = $3,
            rectified_at = now(), verified_by = $4, updated_at = now()
      WHERE id = $1 AND status = 'open'
     RETURNING id`,
    [itemId, input.afterPhotoUrl.trim(), input.notes ?? '', ctx.principal.id],
  );
  if (rows[0] === undefined) {
    const found = await tx.query<{ status: string }>(
      `SELECT status FROM projects.handover_items WHERE id = $1`,
      [itemId],
    );
    const status = found[0]?.status;
    if (status === undefined) throw new HandoverItemRefused('no such item');
    throw new HandoverItemRefused(`That item is already ${status}.`);
  }
}

/**
 * Issue the handover.
 *
 * **Refused while any critical item is open**, with the count in the message.
 * The counts are then copied onto the record rather than joined: the punch list
 * goes on being worked afterwards, and a minor snag closed next week must not
 * change what the handover said.
 */
export async function issueHandover(
  tx: TxLike,
  ctx: TenantContext,
  projectId: string,
  notes: string,
): Promise<HandoverRecord> {
  const state = await handoverState(tx, projectId);
  if (state.record !== null) {
    throw new HandoverItemRefused('This project has already been handed over.');
  }
  if (state.blocking > 0) {
    throw new HandoverItemRefused(
      `${String(state.blocking)} critical item${state.blocking === 1 ? '' : 's'} still open. Rectify them before the project is presented for handover.`,
    );
  }

  const rows = await tx.query<{ id: string; issued_at: string }>(
    `INSERT INTO projects.handover_records
       (tenant_id, project_id, total_items, rectified_items, open_minor, notes, issued_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, issued_at::text AS issued_at`,
    [
      ctx.tenantId,
      projectId,
      state.items.length,
      state.items.filter((i) => i.status !== 'open').length,
      state.items.filter((i) => i.status === 'open').length,
      notes,
      ctx.principal.id,
    ],
  );
  const row = rows[0];
  if (row === undefined) throw new HandoverItemRefused('That handover was not recorded.');

  return {
    id: row.id,
    totalItems: state.items.length,
    rectifiedItems: state.items.filter((i) => i.status !== 'open').length,
    openMinor: state.items.filter((i) => i.status === 'open').length,
    notes,
    issuedAt: row.issued_at,
  };
}

import type { TenantContext } from '@cog/contracts';
import type { TxLike } from './project-team.js';
import { decideSelection } from './room-selections.js';
import { reviewDeliverable } from './design-deliverables.js';

/**
 * Workflow 11: what the client is holding up, and decisions that arrived
 * somewhere else.
 *
 * **Verdict: SOLID**, on `recordExternalClientDecision:1776-1801`. Clients
 * decide on WhatsApp, in a meeting, on the phone. The decision is real, it has
 * consequences, and the system never hears about it — so somebody records it,
 * *with the channel it came through*, and it is routed to the same code the
 * in-app decision uses rather than a second path that can drift.
 *
 * The list itself (`getClientActionItems:1729`) is a union of the three things
 * a client blocks: a deliverable awaiting review, a selection awaiting a
 * decision, a variation awaiting approval.
 *
 * **The channel is a column here, not a prefix on a string.** The legacy has
 * the right idea and nowhere to put it, so it writes
 * `[External via WhatsApp] …` into a feedback field — which cannot be filtered,
 * counted or asked about.
 */

export class ClientActionRefused extends Error {
  override readonly name = 'ClientActionRefused';
}

export const DECISION_CHANNELS = ['meeting', 'whatsapp', 'email', 'phone', 'letter'] as const;
export type DecisionChannel = (typeof DECISION_CHANNELS)[number];

export const SUBJECT_KINDS = ['deliverable', 'selection', 'change_order'] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

export interface ClientActionItem {
  readonly kind: SubjectKind;
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  /** When it is needed by, when anything says. Never invented. */
  readonly dueOn: string | null;
}

export interface ClientDecisionRecord {
  readonly id: string;
  readonly subjectKind: SubjectKind;
  readonly subjectId: string;
  readonly decision: string;
  readonly channel: DecisionChannel;
  readonly saidBy: string;
  readonly note: string;
  readonly decidedOn: string;
  readonly recordedAt: string;
}

export interface ClientActionsView {
  readonly items: readonly ClientActionItem[];
  readonly recorded: readonly ClientDecisionRecord[];
}

/**
 * What the client is holding up.
 *
 * Three reads rather than a `UNION`, because the three tables have nothing in
 * common but the shape this function gives them — and a `UNION` over columns
 * renamed to line up is the query nobody can change afterwards.
 */
export async function clientActions(tx: TxLike, projectId: string): Promise<ClientActionsView> {
  const deliverables = await tx.query<{ id: string; name: string; version_label: string }>(
    `SELECT id, name, version_label FROM projects.design_deliverables
      WHERE project_id = $1 AND status = 'submitted'
      ORDER BY due_date NULLS LAST, name`,
    [projectId],
  );

  const selections = await tx.query<{
    id: string;
    item_name: string;
    room_label: string;
    decision_deadline: string | null;
  }>(
    `SELECT id, item_name, room_label, decision_deadline::text AS decision_deadline
       FROM projects.room_selections
      WHERE project_id = $1 AND status = 'proposed'
      ORDER BY decision_deadline NULLS LAST, item_name`,
    [projectId],
  );

  const changes = await tx.query<{ id: string; number: string; title: string }>(
    `SELECT id, number, title FROM projects.change_orders
      WHERE project_id = $1 AND state = 'pending_client'
      ORDER BY number`,
    [projectId],
  );

  const recorded = await tx.query<{
    id: string;
    subject_kind: string;
    subject_id: string;
    decision: string;
    channel: string;
    said_by: string;
    note: string;
    decided_on: string;
    recorded_at: string;
  }>(
    `SELECT id, subject_kind, subject_id, decision, channel, said_by, note,
            decided_on::text AS decided_on, recorded_at::text AS recorded_at
       FROM projects.client_decisions
      WHERE project_id = $1
      ORDER BY decided_on DESC, recorded_at DESC`,
    [projectId],
  );

  return {
    items: [
      ...deliverables.map((d) => ({
        kind: 'deliverable' as const,
        id: d.id,
        title: d.name,
        detail: `Review ${d.version_label} and approve it or ask for a revision`,
        dueOn: null,
      })),
      ...selections.map((s) => ({
        kind: 'selection' as const,
        id: s.id,
        title: s.room_label === '' ? s.item_name : `${s.room_label} — ${s.item_name}`,
        detail: 'Confirm the specification, or ask for an alternative',
        dueOn: s.decision_deadline,
      })),
      ...changes.map((o) => ({
        kind: 'change_order' as const,
        id: o.id,
        title: `${o.number} — ${o.title}`,
        // **No price in this string.** The legacy builds one by concatenating a
        // raw `cost_impact` column into prose inside SQL, which is both a
        // formatting bug and money as a string. The variation screen shows the
        // figure, formatted, from the column.
        detail: 'A variation is waiting for the client to authorise it',
        dueOn: null,
      })),
    ],
    recorded: recorded.map((r) => ({
      id: r.id,
      subjectKind: r.subject_kind as SubjectKind,
      subjectId: r.subject_id,
      decision: r.decision,
      channel: r.channel as DecisionChannel,
      saidBy: r.said_by,
      note: r.note,
      decidedOn: r.decided_on,
      recordedAt: r.recorded_at,
    })),
  };
}

export interface ExternalDecisionInput {
  readonly subjectKind: SubjectKind;
  readonly subjectId: string;
  readonly decision: string;
  readonly channel: DecisionChannel;
  readonly saidBy?: string | undefined;
  readonly note?: string | undefined;
  readonly decidedOn: string;
}

/**
 * Record a decision that arrived somewhere else, and apply it.
 *
 * **Both, in one transaction.** Recording it without applying it means the
 * client said yes and the system still shows it waiting; applying it without
 * recording it loses the only evidence of where the answer came from. The
 * legacy gets this right too — it calls the same decision functions — and the
 * only thing it has nowhere to put is the channel.
 *
 * A change order is **not** decided here. It has its own client-decision route
 * with its own money consequences, and a second path to authorising a variation
 * is the last thing this system needs; the decision is recorded and the note
 * says to take it through that route.
 */
export async function recordExternalDecision(
  tx: TxLike,
  ctx: TenantContext,
  projectId: string,
  input: ExternalDecisionInput,
): Promise<string> {
  const rows = await tx.query<{ id: string }>(
    `INSERT INTO projects.client_decisions
       (tenant_id, project_id, subject_kind, subject_id, decision, channel,
        said_by, note, decided_on, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10)
     RETURNING id`,
    [
      ctx.tenantId,
      projectId,
      input.subjectKind,
      input.subjectId,
      input.decision,
      input.channel,
      input.saidBy ?? '',
      input.note ?? '',
      input.decidedOn,
      ctx.principal.id,
    ],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new ClientActionRefused('That decision was not recorded.');

  const note = `Recorded from a ${input.channel}${input.saidBy === undefined || input.saidBy === '' ? '' : ` with ${input.saidBy}`} on ${input.decidedOn}. ${input.note ?? ''}`.trim();

  if (input.subjectKind === 'deliverable') {
    if (
      input.decision !== 'approved' &&
      input.decision !== 'revision_requested' &&
      input.decision !== 'rejected'
    ) {
      throw new ClientActionRefused(
        'A deliverable decision is approved, revision_requested or rejected.',
      );
    }
    await reviewDeliverable(tx, ctx, input.subjectId, {
      decision: input.decision,
      feedback: note,
      // The client's decision, even though a member of staff typed it in. That
      // is what happened, and calling it internal would make the revision count
      // read as our own review.
      reviewerKind: 'client',
    });
    return id;
  }

  if (input.subjectKind === 'selection') {
    if (
      input.decision !== 'approved' &&
      input.decision !== 'rejected' &&
      input.decision !== 'alternative_requested'
    ) {
      throw new ClientActionRefused(
        'A selection decision is approved, rejected or alternative_requested.',
      );
    }
    await decideSelection(tx, ctx, input.subjectId, input.decision, note);
    return id;
  }

  // change_order — recorded, not applied. See the doc comment.
  return id;
}

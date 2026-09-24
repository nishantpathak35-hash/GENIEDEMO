import type { TenantContext } from '@cog/contracts';
import {
  approve,
  decline,
  type AdvanceOutcome,
  type Approval,
  type ApprovalStage,
  type ChainState,
} from '../domain/approval.js';
import { auditRecord, forJsonb } from '../domain/audit.js';

/**
 * Recording an approval decision.
 *
 * **Everything happens in ONE transaction: the decision, the history row, the
 * audit row and the event.**
 *
 * That is the fix for **APPR-05**. The legacy updates the payment request
 * (`PaymentService.ts:141`) and then writes history (`:157`) with no
 * transaction between them, so a failure in between leaves a request approved
 * with no record of who approved it — and the record is the only thing a
 * dispute can be settled from.
 *
 * It also fixes half of **APPR-06**: `bulkApprovePayments` iterates with a
 * per-item `try/catch` and returns partial success, so a bulk approval can
 * leave half the batch approved and half not, with no single state to retry
 * from.
 *
 * The caller supplies the transaction. This function never opens one, because
 * it must be able to join the caller's — an approval that advances a purchase
 * order *and* stages a Tally voucher has to be one unit of work or neither.
 */

export interface TxLike {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<R[]>;
}

export interface RecordApprovalInput {
  readonly tx: TxLike;
  readonly ctx: TenantContext;
  readonly entityType: string;
  readonly entityId: string;
  readonly stages: readonly ApprovalStage[];
  readonly state: ChainState;
  readonly approverRoles: readonly string[];
  /**
   * What the subject is worth, in paise, or `null`/absent when it has no
   * amount. Compared against the stage's ceiling and used for nothing else.
   */
  readonly amountPaise?: bigint | null;
  readonly remarks?: string;
  readonly at: Date;
  /** Applies the decision to the caller's own aggregate, inside this transaction. */
  readonly applyDecision: (outcome: Extract<AdvanceOutcome, { kind: 'advanced' }>) => Promise<void>;
}

export class ApprovalRefused extends Error {
  override readonly name = 'ApprovalRefused';
  constructor(readonly reason: string) {
    super(`approval refused: ${reason}`);
  }
}

/**
 * Approve, and record it, atomically.
 *
 * Order matters. The decision is evaluated first and a refusal throws before
 * anything is written — a refused approval must leave no trace suggesting it
 * was considered, because a history row for a refused decision reads, later, as
 * an approval that was reversed.
 */
export async function recordApproval(input: RecordApprovalInput): Promise<AdvanceOutcome> {
  const outcome = approve({
    stages: input.stages,
    state: input.state,
    approverId: input.ctx.principal.id,
    approverRoles: input.approverRoles,
    amountPaise: input.amountPaise ?? null,
    at: input.at,
  });

  if (outcome.kind === 'refused') throw new ApprovalRefused(outcome.reason);

  // 1. History. The UNIQUE (tenant, entity, stage, approver) constraint makes
  //    a duplicate approval fail here rather than being absorbed silently, so
  //    two concurrent requests from the same person cannot both count toward a
  //    quorum.
  await input.tx.query(
    `INSERT INTO workflow.approval_history
       (tenant_id, id, entity_type, entity_id, stage_name, decision,
        approver_id, requester_id, remarks, occurred_at)
     VALUES (tenancy.current_tenant_id(), gen_random_uuid(), $1, $2, $3, 'approved',
             $4, $5, $6, $7)`,
    [
      input.entityType,
      input.entityId,
      input.state.currentStage,
      input.ctx.principal.id,
      input.state.requesterId,
      input.remarks ?? '',
      input.at,
    ],
  );

  // 2. The caller's own state change, in the same transaction.
  if (outcome.kind === 'advanced') await input.applyDecision(outcome);

  // 3. The audit row. Taken from the context, never from an argument.
  const record = auditRecord(input.ctx, {
    action: `${input.entityType}.approved`,
    entityType: input.entityType,
    entityId: input.entityId,
    before: { stage: input.state.currentStage },
    after: { stage: outcome.kind === 'advanced' ? outcome.stage : input.state.currentStage },
  });
  await input.tx.query(
    `INSERT INTO workflow.audit_events
       (tenant_id, id, actor_id, actor_kind, action, entity_type, entity_id,
        before, after, request_id)
     VALUES (tenancy.current_tenant_id(), gen_random_uuid(), $1, $2, $3, $4, $5,
             $6::jsonb, $7::jsonb, $8)`,
    [
      record.actorId,
      record.actorKind,
      record.action,
      record.entityType,
      record.entityId,
      JSON.stringify(forJsonb(record.before)),
      JSON.stringify(forJsonb(record.after)),
      record.requestId,
    ],
  );

  // 4. The event. Published by a trigger on commit, so a subscriber is never
  //    woken for a decision that then rolls back.
  await input.tx.query(
    `INSERT INTO workflow.events (tenant_id, entity_type, entity_id, action)
     VALUES (tenancy.current_tenant_id(), $1, $2, $3)`,
    [input.entityType, input.entityId, 'approved'],
  );

  return outcome;
}

export interface RecordDeclineInput {
  readonly tx: TxLike;
  readonly ctx: TenantContext;
  readonly entityType: string;
  readonly entityId: string;
  readonly stages: readonly ApprovalStage[];
  readonly state: ChainState;
  readonly approverRoles: readonly string[];
  /** Why — required by the route; the requester reads it. */
  readonly remarks: string;
  readonly at: Date;
  /** Applies the decline to the caller's own aggregate, inside this transaction. */
  readonly applyDecline: (stage: string) => Promise<void>;
}

/**
 * Decline, and record it, atomically — the same shape as `recordApproval`.
 *
 * The rule is `decline()`; a refusal throws before anything is written. The
 * history row says `rejected` at the stage it happened, with the reason, and
 * the audit and event rows name it — so a request that ended in a "no" is as
 * traceable as one that ended in a "yes".
 */
export async function recordDecline(input: RecordDeclineInput): Promise<{ stage: string }> {
  const outcome = decline({
    stages: input.stages,
    state: input.state,
    approverId: input.ctx.principal.id,
    approverRoles: input.approverRoles,
    at: input.at,
  });
  if (outcome.kind === 'refused') throw new ApprovalRefused(outcome.reason);

  await input.tx.query(
    `INSERT INTO workflow.approval_history
       (tenant_id, id, entity_type, entity_id, stage_name, decision,
        approver_id, requester_id, remarks, occurred_at)
     VALUES (tenancy.current_tenant_id(), gen_random_uuid(), $1, $2, $3, 'rejected',
             $4, $5, $6, $7)`,
    [
      input.entityType,
      input.entityId,
      outcome.stage,
      input.ctx.principal.id,
      input.state.requesterId,
      input.remarks,
      input.at,
    ],
  );

  await input.applyDecline(outcome.stage);

  const record = auditRecord(input.ctx, {
    action: `${input.entityType}.declined`,
    entityType: input.entityType,
    entityId: input.entityId,
    before: { stage: outcome.stage },
    after: { stage: outcome.stage, declined: true },
  });
  await input.tx.query(
    `INSERT INTO workflow.audit_events
       (tenant_id, id, actor_id, actor_kind, action, entity_type, entity_id,
        before, after, request_id)
     VALUES (tenancy.current_tenant_id(), gen_random_uuid(), $1, $2, $3, $4, $5,
             $6::jsonb, $7::jsonb, $8)`,
    [
      record.actorId,
      record.actorKind,
      record.action,
      record.entityType,
      record.entityId,
      JSON.stringify(forJsonb(record.before)),
      JSON.stringify(forJsonb(record.after)),
      record.requestId,
    ],
  );

  await input.tx.query(
    `INSERT INTO workflow.events (tenant_id, entity_type, entity_id, action)
     VALUES (tenancy.current_tenant_id(), $1, $2, $3)`,
    [input.entityType, input.entityId, 'declined'],
  );

  return { stage: outcome.stage };
}

/**
 * Load a chain's stages, and the approvals already recorded for one entity.
 *
 * These are workflow's own tables, so the queries live here rather than in the
 * composition root. `services/host` assembles a `ChainState` from what these
 * return plus what the owning service knows (its current stage, and who raised
 * the request) — but it decides nothing: every rule about whether an approval
 * is valid stays in `approve()`.
 */
export async function loadStages(
  tx: TxLike,
  entityType: string,
): Promise<readonly ApprovalStage[]> {
  const rows = await tx.query<{
    name: string;
    sequence: number;
    approver_role: string;
    min_approvals: number;
    // `bigint` comes back as a string from pg — it does not fit a JS number, and
    // silently losing precision on a spending limit is the whole reason money is
    // bigint paise here (ADR-0012). `null` when unconfigured, which is always,
    // until somebody sets one.
    approval_ceiling_paise: string | null;
  }>(
    `SELECT s.name, s.sequence, s.approver_role, s.min_approvals, s.approval_ceiling_paise
       FROM workflow.approval_stages s
       JOIN workflow.approval_chains c
         ON c.tenant_id = s.tenant_id AND c.id = s.chain_id
      WHERE c.entity_type = $1 AND c.is_active
      ORDER BY s.sequence`,
    [entityType],
  );
  return rows.map((r) => ({
    name: r.name,
    sequence: r.sequence,
    approverRole: r.approver_role,
    minApprovals: r.min_approvals,
    approvalCeilingPaise:
      r.approval_ceiling_paise === null ? null : BigInt(r.approval_ceiling_paise),
  }));
}

export async function loadApprovals(
  tx: TxLike,
  entityType: string,
  entityId: string,
): Promise<readonly Approval[]> {
  const rows = await tx.query<{ stage_name: string; approver_id: string; occurred_at: string }>(
    `SELECT stage_name, approver_id, occurred_at::text AS occurred_at
       FROM workflow.approval_history
      WHERE entity_type = $1 AND entity_id = $2 AND decision = 'approved'
      ORDER BY occurred_at`,
    [entityType, entityId],
  );
  return rows.map((r) => ({
    stage: r.stage_name,
    approverId: r.approver_id,
    at: new Date(r.occurred_at),
  }));
}

/**
 * Whether a chain is configured at all for this entity type.
 *
 * Separated so a caller can tell "no chain configured" from "the chain refused".
 * They are different answers and PO-13 makes the distinction live: the real
 * chain has not been decided yet, so the correct behaviour today is to refuse
 * every approval — **not** to fall through to approving one because no chain
 * was found. An unconfigured control must fail closed.
 */
export function assertChainConfigured(stages: readonly ApprovalStage[], entityType: string): void {
  if (stages.length === 0) {
    throw new ApprovalRefused(`no active approval chain is configured for ${entityType}`);
  }
}

import type { PoState } from '../domain/purchase-order.js';

/**
 * What `services/host` needs in order to submit a purchase order to the
 * approval engine — and what it does with the engine's answer.
 *
 * Both halves live **here**, in the service that owns the aggregate, not in the
 * composition root. Host may orchestrate: call workflow for the decision, call
 * this to apply it. It must not contain a rule about what an approval means,
 * because the moment it does, domain logic has moved into the composition layer
 * and the one-way dependency rule is decorative.
 *
 * The rule below — *what a purchase order's state becomes once the chain
 * advances* — is procurement's, because procurement owns the state machine.
 * Workflow decides whether the approval is legitimate; procurement decides what
 * its own aggregate does about it.
 */

export interface TxLike {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<R[]>;
}

export const PURCHASE_ORDER_ENTITY_TYPE = 'purchase_order';

export interface ApprovalSubject {
  readonly entityId: string;
  /** The stage the chain is currently at for this order. */
  readonly currentStage: string;
  /** Who raised it. Compared against every approver, so self-approval is refused. */
  readonly requesterId: string;
  readonly state: PoState;
  /** Gross, in paise. The figure a value ceiling is compared against. */
  readonly amountPaise: bigint;
}

export class PurchaseOrderNotFound extends Error {
  override readonly name = 'PurchaseOrderNotFound';
}

/**
 * Read the order's approval-relevant facts.
 *
 * `created_by` is the requester. It is read from the row rather than accepted
 * from the request: **APPR-02** records that the legacy's only creator
 * comparison is client-side and gates loading a summary rather than the approve
 * action, so a caller could approve their own request by calling the endpoint
 * directly.
 */
export async function loadApprovalSubject(tx: TxLike, id: string): Promise<ApprovalSubject> {
  const rows = await tx.query<{
    id: string;
    state: string;
    approval_stage: string | null;
    created_by: string | null;
    gross: string;
  }>(
    `SELECT id, state, approval_stage, created_by, gross
       FROM procurement.purchase_orders
      WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  // Another tenant's order is indistinguishable from a missing one, because RLS
  // has already made the row invisible and the response must not be more
  // specific than the policy.
  if (row === undefined) throw new PurchaseOrderNotFound(`no such purchase order: ${id}`);

  return {
    entityId: row.id,
    currentStage: row.approval_stage ?? '',
    requesterId: row.created_by ?? '',
    state: row.state as PoState,
    // What the approver is actually authorising. Compared against the stage's
    // value ceiling by the engine and used for nothing else — as a string from
    // pg, because a rupee-crore figure in paise has no business in a JS number.
    amountPaise: BigInt(row.gross),
  };
}

/**
 * Apply an advanced chain to the order.
 *
 * `complete` means the chain has no further stage. Only then does the order
 * become `approved`; otherwise it stays `pending_approval` and records which
 * stage it has reached.
 *
 * **This is the rule that must not live in host.** It is one line of policy —
 * "an order is approved when the chain completes, not when a stage passes" —
 * and it is exactly the kind of thing that ends up duplicated in a composition
 * layer and then diverges from the aggregate it describes.
 */
export async function applyChainAdvance(
  tx: TxLike,
  id: string,
  stage: string,
  complete: boolean,
): Promise<void> {
  await tx.query(
    `UPDATE procurement.purchase_orders
        SET approval_stage = $2,
            state          = CASE WHEN $3 THEN 'approved' ELSE 'pending_approval' END,
            version        = version + 1,
            updated_at     = now()
      WHERE id = $1`,
    [id, stage, complete],
  );
}

/**
 * A declined order is cancelled — terminal, by design. A decline ends the
 * request; trying again is a new order, raised and approved from the start,
 * rather than the old one reopened with approvals from a round that said no.
 * Returns whether it moved: an order somebody else decided first does not.
 */
export async function cancelDeclinedOrder(tx: TxLike, id: string): Promise<boolean> {
  const rows = await tx.query<{ id: string }>(
    `UPDATE procurement.purchase_orders
        SET state = 'cancelled', version = version + 1, updated_at = now()
      WHERE id = $1 AND state = 'pending_approval'
      RETURNING id`,
    [id],
  );
  return rows.length > 0;
}

export class PurchaseOrderStaleWrite extends Error {
  override readonly name = 'PurchaseOrderStaleWrite';
}

/**
 * Send a draft order for approval.
 *
 * **This route did not exist, and its absence made the approval chain
 * unreachable.** `canTransition` has permitted `draft -> pending_approval`
 * since M1 and the engine has been complete for as long, but nothing over HTTP
 * could move an order into the state the engine acts on: a purchase order was
 * created as a draft and stayed one forever. Found by writing a demo seed that
 * tried to show an approval part-way through a chain.
 *
 * The state machine is consulted rather than bypassed — `WHERE state = 'draft'`
 * is `canTransition` expressed as a predicate, so a concurrent cancel or a
 * second submit loses rather than both winning.
 *
 * `expectedVersion` is required. Submitting an order somebody has edited under
 * you sends a different order for approval than the one that was read.
 */
export async function submitForApproval(
  tx: TxLike,
  id: string,
  expectedVersion: number,
): Promise<{ id: string; state: PoState; version: number }> {
  const rows = await tx.query<{ id: string; state: string; version: number }>(
    `UPDATE procurement.purchase_orders
        SET state = 'pending_approval', version = version + 1, updated_at = now()
      WHERE id = $1 AND version = $2 AND state = 'draft'
      RETURNING id, state, version`,
    [id, expectedVersion],
  );
  const row = rows[0];
  if (row !== undefined) {
    return { id: row.id, state: row.state as PoState, version: row.version };
  }

  // Which of the three reasons it failed for. A single "conflict" would leave
  // somebody guessing whether the order is gone, moved on, or edited.
  const current = await tx.query<{ state: string; version: number }>(
    `SELECT state, version FROM procurement.purchase_orders WHERE id = $1`,
    [id],
  );
  const found = current[0];
  if (found === undefined) throw new PurchaseOrderNotFound(`no such purchase order: ${id}`);
  if (found.state !== 'draft') {
    throw new PurchaseOrderStaleWrite(
      `this order is already ${found.state.replace(/_/g, ' ')}`,
    );
  }
  throw new PurchaseOrderStaleWrite(
    `this order was modified by someone else (expected version ${expectedVersion}, found ${found.version})`,
  );
}

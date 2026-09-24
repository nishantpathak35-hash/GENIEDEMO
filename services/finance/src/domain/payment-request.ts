import type { Paise } from '@cog/contracts';
import { ZERO, compare, sub, sum } from '@cog/money';

/**
 * The payment request aggregate.
 *
 * **This service owns the lifecycle state. It does not own entitlement.**
 *
 * Whether a given person may approve at a given stage — which roles must sign,
 * in what order, above what amount — is configuration, it is generic across
 * purchase orders, payment requests, change orders and imprest, and it belongs
 * to `services/workflow` in M4. Nothing in this file knows a role name or an
 * approval threshold; if it ever does, the boundary has slipped.
 *
 * So `approve()` takes the approver as an input and validates only that the
 * transition is legal. The caller is responsible for having checked that the
 * approver was entitled to make it.
 *
 * ---
 *
 * **Which accounting view this is.** The legacy code contains two, and they can
 * disagree. `calculateProjectOutflowSnapshots` carries a comment asserting a
 * "single-leg approach: ALL payments flow through system_payments", while
 * `summarizeRequests` in the same file simultaneously buckets requests by
 * substring-matching their `stage` column. Tenant #1's historical totals were
 * produced by whichever path each screen happened to call.
 *
 * This model is the **request-ledger** view: a payment request has one explicit
 * state at a time, and outflow is the sum of amounts on requests in a remitted
 * state. There is no second leg and no substring matching. The reconciliation
 * against the legacy figures is M2.5 and is expected to differ; that difference
 * is the archaeology ADR-0014 requires be agreed with the customer before
 * go-live, not a bug to be papered over here.
 */

export const PR_STATES = [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'remitted',
  'cancelled',
] as const;

export type PrState = (typeof PR_STATES)[number];

/**
 * Declared transitions.
 *
 * An explicit table, because the legacy engine decides state by
 * `stage.includes('reject')` — under which "Rejected", "rejected by finance"
 * and, fatally, "not rejected" are the same state.
 */
const TRANSITIONS: Readonly<Record<PrState, readonly PrState[]>> = Object.freeze({
  draft: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'rejected', 'cancelled'],
  approved: ['remitted', 'cancelled'],
  rejected: ['draft', 'cancelled'],
  remitted: [],
  cancelled: [],
});

/** States whose amounts count toward money actually going out of the door. */
const OUTFLOW_STATES: ReadonlySet<PrState> = new Set<PrState>(['remitted']);

/** States that are still live — neither settled nor abandoned. */
const OPEN_STATES: ReadonlySet<PrState> = new Set<PrState>([
  'draft',
  'pending_approval',
  'approved',
]);

export class PaymentRequestError extends Error {
  override readonly name = 'PaymentRequestError';
}

export interface PaymentRequest {
  readonly id: string;
  readonly purchaseOrderId: string;
  readonly vendorId: string;
  readonly state: PrState;

  /** What was asked for. Never changes after creation. */
  readonly amountRequested: Paise;

  /**
   * What was actually approved, when it differs.
   *
   * `null` until someone approves. Kept separate from `amountRequested` rather
   * than overwriting it, because "approved for less than requested" is a real
   * and common outcome, and collapsing the two makes it inexpressible — and
   * unauditable.
   *
   * This models the legacy `approved_amount ?? amount_requested` precedence,
   * which ADR-0011 names as a rule that exists only in the legacy source and
   * nowhere in any document. `effectiveAmount()` below is that expression, in
   * one place, instead of repeated at every call site as it is today.
   */
  readonly amountApproved: Paise | null;

  /** Tax withheld at remittance. Null until computed. */
  readonly tdsAmount: Paise | null;

  readonly version: number;
}

/**
 * The amount that counts: approved when set, otherwise requested.
 *
 * Ported faithfully from `paymentCalculations.js`, where the expression
 * `money(request.approved_amount ?? request.amount_requested)` appears at four
 * separate call sites. One function, so a change is one change.
 */
export function effectiveAmount(pr: PaymentRequest): Paise {
  return pr.amountApproved ?? pr.amountRequested;
}

/** What the vendor actually receives: the effective amount less tax withheld. */
export function netPayable(pr: PaymentRequest): Paise {
  return sub(effectiveAmount(pr), pr.tdsAmount ?? ZERO);
}

export function canTransition(from: PrState, to: PrState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function submit(pr: PaymentRequest): PaymentRequest {
  return moveTo(pr, 'pending_approval');
}

export interface ApproveInput {
  /** Who approved. Recorded by the caller; entitlement is NOT checked here. */
  readonly approverId: string;
  /**
   * Approve for less than requested, if that is the decision. Omitted means
   * approving the requested amount in full.
   */
  readonly amountApproved?: Paise;
}

export function approve(pr: PaymentRequest, input: ApproveInput): PaymentRequest {
  if (input.approverId.trim() === '') {
    throw new PaymentRequestError('an approval must record who made it');
  }

  const approved = input.amountApproved ?? pr.amountRequested;
  if (compare(approved, ZERO) <= 0) {
    throw new PaymentRequestError('an approved amount must be positive');
  }
  if (compare(approved, pr.amountRequested) > 0) {
    // Approving MORE than was asked for is a different document — a revised
    // request — not an approval. Silently allowing it would let an approval
    // step increase an outflow without anyone raising anything.
    throw new PaymentRequestError('cannot approve more than the amount requested');
  }

  return { ...moveTo(pr, 'approved'), amountApproved: approved };
}

export function reject(pr: PaymentRequest, approverId: string): PaymentRequest {
  if (approverId.trim() === '') {
    throw new PaymentRequestError('a rejection must record who made it');
  }
  return moveTo(pr, 'rejected');
}

export interface RemitInput {
  /** Tax withheld. Computed by the TDS domain and passed in, never derived here. */
  readonly tdsAmount: Paise;
}

export function remit(pr: PaymentRequest, input: RemitInput): PaymentRequest {
  if (compare(input.tdsAmount, ZERO) < 0) {
    throw new PaymentRequestError('withheld tax cannot be negative');
  }
  if (compare(input.tdsAmount, effectiveAmount(pr)) > 0) {
    throw new PaymentRequestError('withheld tax cannot exceed the amount being paid');
  }
  return { ...moveTo(pr, 'remitted'), tdsAmount: input.tdsAmount };
}

export function cancel(pr: PaymentRequest): PaymentRequest {
  return moveTo(pr, 'cancelled');
}

function moveTo(pr: PaymentRequest, to: PrState): PaymentRequest {
  if (!canTransition(pr.state, to)) {
    throw new PaymentRequestError(`cannot move a payment request from ${pr.state} to ${to}`);
  }
  return { ...pr, state: to, version: pr.version + 1 };
}

// ------------------------------------------------------------- roll-ups ---

export interface OutflowSummary {
  /** Money that has actually left: remitted requests, net of withheld tax. */
  readonly remitted: Paise;
  /** Committed but not yet paid: approved and not remitted. */
  readonly committed: Paise;
  /** Raised and not yet decided. */
  readonly pending: Paise;
}

/**
 * Roll up a set of requests.
 *
 * One pass, one classification per request, from its explicit state. The legacy
 * equivalent buckets by substring and can therefore count one request into two
 * buckets — `stage` values like "Pending approval - not rejected" match both
 * `includes('pending')` and `includes('reject')`.
 */
export function summarise(requests: readonly PaymentRequest[]): OutflowSummary {
  const inState = (predicate: (s: PrState) => boolean, value: (pr: PaymentRequest) => Paise) =>
    sum(requests.filter((r) => predicate(r.state)).map(value));

  return {
    remitted: inState((s) => OUTFLOW_STATES.has(s), netPayable),
    committed: inState((s) => s === 'approved', effectiveAmount),
    pending: inState((s) => s === 'pending_approval' || s === 'draft', effectiveAmount),
  };
}

/** Whether a request is still live. Used to block closing a purchase order. */
export function isOpen(pr: PaymentRequest): boolean {
  return OPEN_STATES.has(pr.state);
}

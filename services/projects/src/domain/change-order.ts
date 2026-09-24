import type { Paise } from '@cog/contracts';
import { ZERO, add, compare } from '@cog/money';

/**
 * Change orders — a variation to an agreed contract value.
 *
 * **A replacement.** The legacy `approveChangeOrder` (`change-orders.js:62-94`)
 * sets a status string directly and then, in the same call, rewrites the linked
 * client BOQ's contract value. Three things are wrong with that and none is a
 * rounding detail:
 *
 *   **CO-01** It bypasses the approval engine entirely. Change orders, site
 *   imprest and DPRs each have their own mini-engine, so "who may approve
 *   what" has four different answers in one codebase.
 *
 *   **CO-02** It mutates the contract value in place, so the agreed figure and
 *   the varied figure are the same field. After two variations nobody can say
 *   what was originally signed.
 *
 *   **CO-03** `approveChangeOrderAsClient` decides by `decision === 'Reject'`
 *   and treats **everything else** — including a typo, an empty string, or a
 *   missing field — as approval. A client portal that approves a contract
 *   variation by default is not a signature.
 */

export const CO_STATES = [
  'draft',
  'pending_client',
  'client_approved',
  'client_rejected',
  'withdrawn',
] as const;

export type ChangeOrderState = (typeof CO_STATES)[number];

const TRANSITIONS: Readonly<Record<ChangeOrderState, readonly ChangeOrderState[]>> = Object.freeze({
  draft: ['pending_client', 'withdrawn'],
  pending_client: ['client_approved', 'client_rejected', 'withdrawn'],
  client_approved: [],
  client_rejected: ['draft', 'withdrawn'],
  withdrawn: [],
});

export class ChangeOrderError extends Error {
  override readonly name = 'ChangeOrderError';
}

export interface ChangeOrder {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly state: ChangeOrderState;
  /** Signed, may be positive (addition) or negative (omission). */
  readonly costImpact: Paise;
  readonly decidedBy: string | null;
  readonly decidedAt: Date | null;
}

/**
 * A client decision.
 *
 * **Fixes CO-03.** The decision is an explicit closed union. There is no
 * default branch and no "anything that is not a rejection is an approval" — a
 * malformed decision is refused, not treated as a signature.
 */
export type ClientDecision = 'approve' | 'reject';

export function decide(
  co: ChangeOrder,
  decision: ClientDecision,
  by: string,
  at: Date,
): ChangeOrder {
  if (decision !== 'approve' && decision !== 'reject') {
    throw new ChangeOrderError('a client decision must be an explicit approve or reject');
  }
  if (by.trim() === '') {
    throw new ChangeOrderError('a client decision must record who made it');
  }
  const to: ChangeOrderState = decision === 'approve' ? 'client_approved' : 'client_rejected';
  if (!TRANSITIONS[co.state].includes(to)) {
    throw new ChangeOrderError(`a change order in ${co.state} cannot be ${to}`);
  }
  return { ...co, state: to, decidedBy: by, decidedAt: at };
}

export function submitToClient(co: ChangeOrder): ChangeOrder {
  if (!TRANSITIONS[co.state].includes('pending_client')) {
    throw new ChangeOrderError(`a change order in ${co.state} cannot be sent to the client`);
  }
  if (compare(co.costImpact, ZERO) === 0) {
    // A variation worth nothing is either a mistake or a scope change that
    // should be priced. Either way it should not go to a client for signature.
    throw new ChangeOrderError('a change order with no cost impact cannot be sent for approval');
  }
  return { ...co, state: 'pending_client' };
}

export interface ContractValue {
  /** What was signed. Never changes. */
  readonly original: Paise;
  /** Original plus every approved variation. */
  readonly current: Paise;
  readonly approvedVariations: number;
}

/**
 * The contract value, derived rather than mutated.
 *
 * **Fixes CO-02.** The legacy rewrites the BOQ's `contract_value` in place, so
 * after two variations the originally agreed figure is gone and a dispute about
 * what was signed cannot be settled from the data. Here the original is
 * immutable and the current value is computed from it plus the approved
 * variations — which also means the arithmetic can be re-checked at any time.
 *
 * Only `client_approved` variations count. A pending one is not a commitment.
 */
export function contractValue(
  original: Paise,
  changeOrders: readonly ChangeOrder[],
): ContractValue {
  const approved = changeOrders.filter((co) => co.state === 'client_approved');
  const current = approved.reduce<Paise>((acc, co) => add(acc, co.costImpact), original);
  return { original, current, approvedVariations: approved.length };
}

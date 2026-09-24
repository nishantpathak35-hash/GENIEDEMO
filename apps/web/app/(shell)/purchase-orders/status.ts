import type { PillTone } from '@cog/design-system';

/**
 * The order-state vocabulary — `docs/design/00-foundations.html` ("Status —
 * the same closed sets, in the customer's words") and `13-decisions.html`
 * ("Words — the label map"). Never the raw enum with underscores replaced:
 * `pending_approval` is a database value, not a sentence a buyer reads.
 */
const STATE_LABEL: Readonly<Record<string, string>> = {
  draft: 'Draft',
  pending_approval: 'Waiting for approval',
  approved: 'Approved',
  cancelled: 'Cancelled',
  rejected: 'Declined',
};

const STATE_TONE: Readonly<Record<string, PillTone>> = {
  draft: 'idle',
  pending_approval: 'waiting',
  approved: 'ok',
  cancelled: 'idle',
  rejected: 'bad',
};

/** The word a buyer reads, for a state the server stored. Never the raw enum. */
export function orderStateLabel(state: string): string {
  return STATE_LABEL[state] ?? state;
}

export function orderStateTone(state: string): PillTone {
  return STATE_TONE[state] ?? 'idle';
}

export const ORDER_STATE_OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ['draft', 'Draft'],
  ['pending_approval', 'Waiting for approval'],
  ['approved', 'Approved'],
  ['cancelled', 'Cancelled'],
];

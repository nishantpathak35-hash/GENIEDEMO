'use client';

import type { ReactNode } from 'react';
import { useActionState } from 'react';
import { Notice, Refusal, UnreachableState } from '@cog/design-system';
import { decideOrder, type DecisionState } from './actions';

const IDLE: DecisionState = { message: null, refusal: null, unreachable: false };

/**
 * The decision, on the pane. Two submit buttons in one form, so the note goes
 * with whichever was pressed and both are reachable by Tab and Enter.
 *
 * Your own order offers no buttons at all — the server would refuse, and a
 * button that can only be refused is a trap. What shows instead is why.
 */
export function DecisionPane({
  orderId,
  after,
  ownOrder,
}: {
  orderId: string;
  /** Where a decision that lands goes next. */
  after: string;
  ownOrder: boolean;
}): ReactNode {
  const [state, dispatch, pending] = useActionState(decideOrder.bind(null, orderId, after), IDLE);

  if (ownOrder) {
    return (
      <Notice tone="neutral" title="Not possible right now">
        You raised this order, so someone else needs to approve it.
      </Notice>
    );
  }

  return (
    <form action={dispatch} className="stack">
      <div className="field">
        <label htmlFor={`note-${orderId}`}>A note (needed to decline)</label>
        <textarea id={`note-${orderId}`} name="remarks" rows={2} />
      </div>
      {state.unreachable ? <UnreachableState /> : null}
      {state.refusal === null ? null : <Refusal error={state.refusal} />}
      {state.message === null ? null : <Notice tone="warn" title={state.message}>Nothing was recorded.</Notice>}
      <div className="actions">
        <button type="submit" name="decision" value="approve" className="btn primary lg" disabled={pending}>
          {pending ? 'Recording…' : 'Approve'}
        </button>
        <button type="submit" name="decision" value="decline" className="btn danger lg" disabled={pending}>
          Decline
        </button>
      </div>
    </form>
  );
}

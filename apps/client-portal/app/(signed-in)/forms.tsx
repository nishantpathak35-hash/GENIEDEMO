'use client';

import type { ReactNode } from 'react';
import { useActionState } from 'react';
import { Icon, IDLE, Notice } from '@cog/design-system';
import type { ActionState } from '@cog/design-system';
import { decideVariation } from './actions';

/**
 * Approve or decline, as two buttons — `10-portals.html`'s variation card.
 *
 * Two submit buttons on one form, not a `Choice` select: the design shows
 * "Approve CO-03" (primary, a pen) and "Decline" (danger) side by side, and
 * `apps/vendor-portal`'s `AcceptOrderForm` is the same shape for the same
 * reason — a decision this consequential reads better as two distinct
 * commitments than as one dropdown plus a generic submit.
 */
export function DecideVariationForm({
  projectId,
  changeOrderId,
  changeOrderNumber,
  version,
}: {
  projectId: string;
  changeOrderId: string;
  changeOrderNumber: string;
  version: number;
}): ReactNode {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(
    decideVariation.bind(null, projectId, changeOrderId),
    IDLE,
  );

  return (
    <form action={dispatch}>
      <input type="hidden" name="expectedVersion" defaultValue={String(version)} />
      <div className="field">
        <label htmlFor={`sign-${changeOrderId}`}>Your name, as on the agreement</label>
        <input id={`sign-${changeOrderId}`} name="signedBy" type="text" required placeholder="R. Menon" />
      </div>
      <div className="actions">
        <button type="submit" name="decision" value="approve" className="btn primary lg" disabled={pending}>
          <Icon name="pen" />
          Approve {changeOrderNumber}
        </button>
        <button type="submit" name="decision" value="reject" className="btn danger lg" disabled={pending}>
          Decline
        </button>
      </div>
      {state.error === null ? null : <Notice tone="bad">{state.error}</Notice>}
      {state.ok === null ? null : <Notice tone="neutral">{state.ok}</Notice>}
      <p className="muted">A decision is final — it goes straight into the contract value.</p>
    </form>
  );
}

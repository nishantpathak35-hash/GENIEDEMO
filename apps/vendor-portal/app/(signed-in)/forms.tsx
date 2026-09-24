'use client';

import type { ReactNode } from 'react';
import { useActionState } from 'react';
import { Choice, Field, Form, Icon, MoneyField, Notes, IDLE } from '@cog/design-system';
import type { ActionState } from '@cog/design-system';
import { acceptOrder, submitBill } from './actions';

/**
 * Accept or decline, as two buttons — `10-portals.html`'s Orders card.
 *
 * `10-portals.html` calls the decline word "Decline"; the value posted is
 * still `rejected`, the wire enum `acceptOrderInput` declares. Only the label
 * moves — 00-foundations' vocabulary map is words over the wire value, never
 * a second enum for the same fact.
 */
export function AcceptOrderForm({ orderId }: { orderId: string }): ReactNode {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(
    acceptOrder.bind(null, orderId),
    IDLE,
  );

  return (
    <form action={dispatch} className="row">
      <button type="submit" name="decision" value="accepted" className="btn primary lg" disabled={pending}>
        <Icon name="check" />
        Accept
      </button>
      <button type="submit" name="decision" value="rejected" className="btn lg" disabled={pending}>
        <Icon name="x" />
        Decline
      </button>
      {state.error === null ? null : <span className="muted">{state.error}</span>}
    </form>
  );
}

/**
 * "Send a bill" — against an accepted order, amount in rupees, an optional
 * period. `id="send-a-bill"` is the anchor a returned bill's "Submit a
 * corrected bill" link points at: `submitBill` has no update path, only this
 * same create — see the bills page for why.
 */
export function SubmitBillForm({
  orders,
}: {
  orders: ReadonlyArray<readonly [string, string]>;
}): ReactNode {
  return (
    <div id="send-a-bill">
      <Form action={submitBill} submitLabel="Send bill" pendingLabel="Sending…">
        <Choice name="purchaseOrderId" label="For order" required options={orders} />
        <Field name="billNumber" label="Your bill number" required placeholder="RA-01" />
        <MoneyField name="amountClaimed" label="Amount" required />
        <div className="row">
          <Field name="periodFrom" label="From" type="date" />
          <Field name="periodTo" label="To" type="date" />
        </div>
        <Notes name="narrative" label="What this bill covers" rows={2} />
        <p className="hint u-m0">
          This records what you are claiming, exactly as entered. Nothing is deducted from it here.
        </p>
      </Form>
    </div>
  );
}

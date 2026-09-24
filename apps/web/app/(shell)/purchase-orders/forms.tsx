'use client';

import type { ReactNode } from 'react';
import { useActionState, useState } from 'react';
import { formatIndianRupees } from '@cog/money';
import { Choice, Field, Form, Refusal, UnreachableState } from '@cog/design-system';
import { PRICED_IDLE } from '@cog/design-system';
import {
  APPROVAL_IDLE,
  approveOrder,
  createOrder,
  priceOrder,
  renameOrder,
  type ApprovalState,
} from './actions';

/**
 * The order form.
 *
 * Lines are added and removed in browser state — that is layout, not
 * arithmetic. **The Amount column is deliberately not here.** The legacy shows
 * one per row from `calcItem` (`POsView.js:45-52`), then an Order Summary with
 * Subtotal, GST, TDS and Net PO Value, all computed in the browser
 * (`POFormModal.js:382-404`), and sends the browser's `netPayable` as the
 * order's value. Here "Price it" asks the server, and the answer that appears
 * is the answer that will be stored.
 */
export function NewOrderForm({
  vendors,
  projects,
}: {
  vendors: ReadonlyArray<readonly [string, string]>;
  projects: ReadonlyArray<readonly [string, string]>;
}): ReactNode {
  const [rowCount, setRowCount] = useState(1);
  const [priced, priceAction, pricing] = useActionState(priceOrder, PRICED_IDLE);
  const [created, createAction, creating] = useActionState(createOrder, PRICED_IDLE);

  const rows = Array.from({ length: rowCount }, (_, index) => index);
  const totals = created.totals ?? priced.totals;

  return (
    <form className="stack">
      <div className="row">
        <Choice name="vendorId" label="Vendor" required options={vendors} />
        <Choice
          name="projectId"
          label="Project (optional)"
          options={projects}
          hint="Attaching the order is what lets spend group by project id rather than by a LIKE on a name (PROJ-02)."
        />
        <Field
          name="number"
          label="Order number (optional)"
          hint="Leave blank and the server allocates the next one, reserving it in the same transaction."
        />
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Description</th>
              <th>HSN/SAC</th>
              <th className="num">Quantity</th>
              <th className="num">Unit rate</th>
              <th className="num">GST %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((index) => (
              <tr key={index}>
                <td>
                  <input name="lineDescription" aria-label={`Line ${index + 1} description`} />
                </td>
                <td>
                  <input name="lineHsnSac" size={8} aria-label={`Line ${index + 1} HSN or SAC`} />
                </td>
                <td>
                  <input
                    name="lineQuantity"
                    size={8}
                    defaultValue="1"
                    aria-label={`Line ${index + 1} quantity`}
                  />
                </td>
                <td>
                  <input
                    name="lineUnitRate"
                    size={10}
                    placeholder="0.00"
                    aria-label={`Line ${index + 1} unit rate`}
                  />
                </td>
                <td>
                  <input
                    name="lineGstPct"
                    size={5}
                    defaultValue="18"
                    aria-label={`Line ${index + 1} GST rate`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="actions">
        <button type="button" className="btn" onClick={() => setRowCount(rowCount + 1)}>
          Add a line
        </button>
        {rowCount > 1 ? (
          <button type="button" className="btn" onClick={() => setRowCount(rowCount - 1)}>
            Remove the last line
          </button>
        ) : null}
      </div>

      {totals === null ? null : (
        <div className="panel">
          <header>
            <h2>Server-computed totals</h2>
          </header>
          <div className="card-b">
            <dl className="kv">
              <dt>Taxable</dt>
              <dd className="num">{formatIndianRupees(totals.taxable)}</dd>
              <dt>GST</dt>
              <dd className="num">{formatIndianRupees(totals.gst)}</dd>
              <dt>Gross</dt>
              <dd className="num">{formatIndianRupees(totals.gross)}</dd>
            </dl>
            <p className="muted u-mb0">
              Gross is taxable plus GST. It is <strong>not</strong> net of TDS — PO-23: the
              legacy stores <code>subt + gstSum - tdsAmt</code> as the order value, so every
              existing row is net of a deduction that has not been made.
            </p>
          </div>
        </div>
      )}

      {priced.error === null && created.error === null ? null : (
        <div className="notice refused">
          <p>{created.error ?? priced.error}</p>
        </div>
      )}
      {created.ok === null ? null : (
        <div className="notice">
          <p>{created.ok}</p>
        </div>
      )}

      <div className="actions">
        <button type="submit" className="btn" formAction={priceAction} disabled={pricing || creating}>
          {pricing ? 'Pricing…' : 'Price it'}
        </button>
        <button type="submit" className="btn primary" formAction={createAction} disabled={creating}>
          {creating ? 'Creating…' : 'Create a draft order'}
        </button>
      </div>
    </form>
  );
}

export function RenameOrderForm({
  id,
  number,
  version,
}: {
  id: string;
  number: string;
  version: number;
}): ReactNode {
  return (
    <Form action={renameOrder.bind(null, id)} submitLabel="Rename" pendingLabel="Renaming…">
      <input type="hidden" name="expectedVersion" defaultValue={String(version)} />
      <Field
        name="number"
        label="Order number"
        required
        defaultValue={number}
        hint="One row changes. The number is not the key — the id is."
      />
    </Form>
  );
}

/**
 * Submit an approval decision.
 *
 * Always rendered, never hidden by a role the browser worked out — the
 * server refuses what it refuses, and the refusal says why: `<Refusal>`
 * (S4-buying), not a generic notice, with `approveOrder`'s own reason
 * sentence in its body (see that function's doc comment).
 */
export function ApproveForm({ id }: { id: string }): ReactNode {
  const [state, dispatch, pending] = useActionState<ApprovalState, FormData>(
    approveOrder.bind(null, id),
    APPROVAL_IDLE,
  );

  return (
    <form action={dispatch} className="stack">
      <Field name="remarks" label="Remarks (optional)" />
      {state.unreachable ? <UnreachableState /> : null}
      {state.refusal === null ? null : <Refusal error={state.refusal} />}
      {state.ok === null ? null : (
        <div className="notice">
          <p>{state.ok}</p>
        </div>
      )}
      <div className="actions">
        <button type="submit" className="btn primary" disabled={pending}>
          {pending ? 'Recording…' : 'Record my approval'}
        </button>
      </div>
    </form>
  );
}

'use client';

import type { ReactNode } from 'react';
import { useActionState } from 'react';
import { formatIndianRupeesOrDash, formatQuantity } from '@cog/money';
import { Choice, Field, Form, MoneyField } from '@cog/design-system';
import { IDLE, type ActionState } from '@cog/design-system';
import { addBoqLine, raisePurchaseOrderFromBoq } from './actions';

export interface BoqRow {
  readonly id: string;
  readonly section: string;
  readonly itemNo: number;
  readonly description: string;
  readonly uom: string;
  readonly quantityMicros: string;
  readonly rate: string;
  readonly costRate: string | null;
  readonly amount: string;
  readonly version: number;
}

export function AddBoqLineForm({ projectId }: { projectId: string }): ReactNode {
  const action = addBoqLine.bind(null, projectId);
  return (
    <Form action={action} submitLabel="Add line" pendingLabel="Adding…">
      <div className="row">
        <Field name="section" label="Section" required placeholder="Flooring" />
        <Field name="itemNo" label="Item no." required type="text" placeholder="1" />
        <Field name="uom" label="Unit" required placeholder="sqm" />
      </div>
      <Field name="description" label="Description" required />
      <div className="row">
        <Field
          name="quantity"
          label="Quantity"
          required
          placeholder="12.375"
          hint="Up to six decimals, exactly. A seventh is refused rather than truncated."
        />
        <MoneyField
          name="rate"
          label="Client rate"
          required
          hint="Pre-tax. Whether a BOQ rate carries GST is PO-16 and unanswered."
        />
        <MoneyField
          name="costRate"
          label="Cost rate (optional)"
          hint="Leave blank if unknown. Blank stays blank — no margin is assumed."
        />
      </div>
    </Form>
  );
}

/**
 * Choose lines, choose a vendor, raise a DRAFT order.
 *
 * The value is not a field. The server prices the selected lines from their
 * stored cost rates, and refuses any line that has none — which is BOQ-06, the
 * legacy pricing a purchase-order line at the *client-facing* rate when the
 * cost is unknown and at zero when neither is.
 *
 * The selected line count and the fact that nothing here adds up money is the
 * point: the legacy's equivalent bar shows
 * `Estimated PO Budget: ₹{selectedItemsTotalCost}` from a browser `reduce`
 * (`BoqView.js:249`), and that figure is what gets sent as the order value.
 */
export function RaiseOrderFromBoq({
  projectId,
  rows,
  vendors,
}: {
  projectId: string;
  rows: readonly BoqRow[];
  vendors: ReadonlyArray<readonly [string, string]>;
}): ReactNode {
  const action = raisePurchaseOrderFromBoq.bind(null, projectId);
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(action, IDLE);

  const orderable = rows.filter((r) => r.costRate !== null);
  const notOrderable = rows.length - orderable.length;

  return (
    <form action={dispatch} className="stack">
      {orderable.length === 0 ? (
        <p className="muted">
          No line here has a cost rate, so no order can be priced from one. Add cost rates first.
        </p>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th />
                <th>Item</th>
                <th>Description</th>
                <th className="num">Quantity</th>
                <th className="num">Cost rate</th>
              </tr>
            </thead>
            <tbody>
              {orderable.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input type="checkbox" name="boqItemId" value={r.id} />
                  </td>
                  <td>
                    {r.section} · {r.itemNo}
                  </td>
                  <td>{r.description}</td>
                  <td className="num">
                    {formatQuantity(r.quantityMicros)} {r.uom}
                  </td>
                  <td className="num">{formatIndianRupeesOrDash(r.costRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {notOrderable > 0 ? (
        <p className="muted">
          {notOrderable} line{notOrderable === 1 ? ' is' : 's are'} not listed because
          {notOrderable === 1 ? ' it has' : ' they have'} no cost rate. A purchase-order rate
          cannot be derived from a client rate.
        </p>
      ) : null}

      <div className="row">
        <Choice
          name="vendorId"
          label="Vendor"
          required
          options={vendors}
          hint="The order is raised against this vendor."
        />
        <Field
          name="gstPct"
          label="GST rate (%)"
          required
          defaultValue="18"
          hint="Applied by the server to the priced lines."
        />
      </div>

      {state.error === null ? null : (
        <div className="notice refused">
          <p>{state.error}</p>
        </div>
      )}
      {state.ok === null ? null : (
        <div className="notice">
          <p>{state.ok}</p>
        </div>
      )}

      <div className="actions">
        <button type="submit" className="btn primary" disabled={pending || orderable.length === 0}>
          {pending ? 'Raising…' : 'Raise a draft order'}
        </button>
        <span className="hint">
          It is created as a draft and enters the approval chain like any other order.
        </span>
      </div>
    </form>
  );
}

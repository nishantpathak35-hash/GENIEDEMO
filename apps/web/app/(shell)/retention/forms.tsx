'use client';

import type { ReactNode } from 'react';
import { Choice, Field, Form } from '@cog/design-system';
import { recordRetention, releaseRetention } from './actions';

export function RecordRetentionForm({
  orders,
}: {
  orders: ReadonlyArray<readonly [string, string]>;
}): ReactNode {
  return (
    <Form action={recordRetention} submitLabel="Record holding" pendingLabel="Recording…">
      <div className="row">
        <Choice name="purchaseOrderId" label="Purchase order" required options={orders} />
        <Field
          name="retentionPct"
          label="Retention rate (%)"
          required
          defaultValue="5"
          hint="The rate is the input. What is withheld is computed from each bill as it is paid — typing an amount would be a monetary figure decided in a browser."
        />
      </div>
    </Form>
  );
}

/** Releasing what is held. The amount is the server's: everything withheld and not yet released. */
export function ReleaseRetentionForm({ holdingId }: { holdingId: string }): ReactNode {
  return (
    <Form
      action={releaseRetention.bind(null, holdingId)}
      submitLabel="Release retention"
      pendingLabel="Releasing…"
    >
      <div className="row">
        <Field name="releasedOn" label="Released on" type="date" required />
        <Field name="reference" label="Bank reference" hint="The UTR or cheque number." />
      </div>
      <p className="hint u-m0">
        Everything withheld and not yet released is paid out as one voucher, with nothing further
        deducted — a provisional reading.
      </p>
    </Form>
  );
}

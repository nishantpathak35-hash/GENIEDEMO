'use client';

import type { ReactNode } from 'react';
import { Field, Form, MoneyField } from '@cog/design-system';
import { acknowledgeBill, payBill } from './actions';

/**
 * Acknowledging a bill: the split the invoice shows, and when it is due.
 * The server refuses a split that does not add up to what was claimed.
 */
export function AcknowledgeBillForm({ billId }: { billId: string }): ReactNode {
  return (
    <Form action={acknowledgeBill.bind(null, billId)} submitLabel="Acknowledge the bill" pendingLabel="Saving…">
      <div className="row">
        <MoneyField name="taxableAmount" label="Taxable value" required />
        <MoneyField
          name="gstAmount"
          label="GST shown on the invoice"
          required
          hint="The two together must equal what the vendor claimed."
        />
      </div>
      <Field name="dueOn" label="Due on" type="date" required hint="The date it is payable. Due this week is read from this." />
    </Form>
  );
}

/**
 * Paying an acknowledged bill in full. The tax, the retention and the net are
 * the server's, worked out on the provisional rates and shown on the voucher.
 */
export function PayBillForm({ billId }: { billId: string }): ReactNode {
  return (
    <Form action={payBill.bind(null, billId)} submitLabel="Pay this bill" pendingLabel="Paying…">
      <div className="row">
        <Field name="paidOn" label="Paid on" type="date" required />
        <Field name="reference" label="Bank reference" hint="The UTR or cheque number." />
      </div>
      <p className="hint u-m0">
        Tax is deducted and retention withheld at the provisional rates; the voucher shows how.
      </p>
    </Form>
  );
}

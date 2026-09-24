'use client';

import type { ReactNode } from 'react';
import { Choice, Field, Form, MoneyField, Notes } from '@cog/design-system';
import { cancelInvoice, raiseInvoice, recordReceipt } from './actions';

/**
 * Raising a tax invoice. The taxable value and where the site is are the
 * inputs; the GST, which heads it falls under and the number are the server's.
 */
export function RaiseInvoiceForm({
  projects,
}: {
  projects: ReadonlyArray<readonly [string, string]>;
}): ReactNode {
  return (
    <Form action={raiseInvoice} submitLabel="Raise the invoice" pendingLabel="Raising…">
      <Choice name="projectId" label="Project" required options={projects} />
      <div className="row">
        <MoneyField name="taxableAmount" label="Taxable value" required hint="Before GST." />
        <Field
          name="placeOfSupply"
          label="Site's state code"
          required
          hint="Two digits, the way a GSTIN begins — 29 is Karnataka, 27 Maharashtra."
        />
      </div>
      <div className="row">
        <Field name="invoiceDate" label="Dated" type="date" required />
        <Field name="expectedOn" label="Payment expected" type="date" required />
        <Field name="certifiedOn" label="Work certified on" type="date" hint="Optional." />
      </div>
      <Field name="clientGstin" label="Client's GSTIN" hint="Optional. Fifteen characters." />
      <Notes name="description" label="What it bills" rows={2} />
    </Form>
  );
}

export function RecordReceiptForm({ invoiceId }: { invoiceId: string }): ReactNode {
  return (
    <Form action={recordReceipt.bind(null, invoiceId)} submitLabel="Record a receipt" pendingLabel="Recording…">
      <div className="row">
        <MoneyField name="amount" label="Received" required hint="Never more than is still due." />
        <Field name="receivedOn" label="Received on" type="date" required />
        <Field name="reference" label="Bank reference" />
      </div>
    </Form>
  );
}

export function CancelInvoiceForm({ invoiceId }: { invoiceId: string }): ReactNode {
  return (
    <Form action={cancelInvoice.bind(null, invoiceId)} submitLabel="Cancel this invoice" pendingLabel="Cancelling…">
      <Field
        name="reason"
        label="Why it is cancelled"
        required
        hint="The number stays with this invoice. Once anything is received it cannot be cancelled."
      />
    </Form>
  );
}

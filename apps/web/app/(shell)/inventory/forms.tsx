'use client';

import type { ReactNode } from 'react';
import { Choice, Field, Form } from '@cog/design-system';
import { checkInReceipt, createStockItem, issueStock, receiveStock, transferStock } from './actions';

type Options = ReadonlyArray<readonly [string, string]>;

export function NewStockItemForm(): ReactNode {
  return (
    <Form action={createStockItem} submitLabel="Define item" pendingLabel="Defining…">
      <div className="row">
        <Field name="name" label="Item name" required />
        <Field name="category" label="Category" />
        <Field name="uom" label="Unit" required placeholder="nos" />
        <Field
          name="reorderWhole"
          label="Reorder level"
          hint="Whole units. Below this the balance is flagged."
        />
      </div>
    </Form>
  );
}

export function ReceiveForm({ items }: { items: Options }): ReactNode {
  return (
    <Form action={receiveStock} submitLabel="Record receipt" pendingLabel="Recording…">
      <div className="row">
        <Choice name="stockItemId" label="Item" required options={items} />
        <Field name="warehouse" label="Warehouse" required />
        <Field name="quantity" label="Quantity" required placeholder="1" />
        <Field name="reference" label="Reference" hint="A delivery note, an order number." />
      </div>
      <Choice
        name="checkedIn"
        label="Counted into the store?"
        defaultValue="yes"
        options={[
          ['yes', 'Yes — counted in as it arrived'],
          ['no', 'Not yet — it is at the gate, count it in later'],
        ]}
        hint="A delivery left at the gate is recorded but stays out of the balance until someone counts it in, so nothing is issued against goods nobody has checked."
      />
    </Form>
  );
}

/** The storekeeper's count, one receipt at a time. */
export function CheckInButton({ movementId }: { movementId: string }): ReactNode {
  return (
    <form action={checkInReceipt.bind(null, movementId)} className="inline">
      <button type="submit" className="btn sm">
        Check in
      </button>
    </form>
  );
}

export function IssueForm({ items }: { items: Options }): ReactNode {
  return (
    <Form action={issueStock} submitLabel="Record issue" pendingLabel="Recording…">
      <div className="row">
        <Choice name="stockItemId" label="Item" required options={items} />
        <Field name="warehouse" label="Warehouse" required />
        <Field name="quantity" label="Quantity" required placeholder="1" />
        <Field name="reference" label="Reference" />
      </div>
      <p className="hint u-m0">
        Refused if it would take the balance below zero. The balance is the sum of the ledger, so
        there is no stored number to go negative behind its back.
      </p>
    </Form>
  );
}

export function TransferForm({ items }: { items: Options }): ReactNode {
  return (
    <Form action={transferStock} submitLabel="Transfer" pendingLabel="Transferring…">
      <div className="row">
        <Choice name="stockItemId" label="Item" required options={items} />
        <Field name="fromWarehouse" label="From" required />
        <Field name="toWarehouse" label="To" required />
        <Field name="quantity" label="Quantity" required placeholder="1" />
      </div>
      <Field name="reference" label="Reference" />
      <p className="hint u-m0">
        Two movements sharing one id, which must sum to zero, in one transaction. INV-01: the
        legacy writes a transfer record and moves no stock at all.
      </p>
    </Form>
  );
}

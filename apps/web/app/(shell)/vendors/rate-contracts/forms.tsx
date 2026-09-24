'use client';

import type { ReactNode } from 'react';
import { Choice, Field, Form, MoneyField, Picker } from '@cog/design-system';
import { createRateContract } from './actions';

/**
 * One contract, one rate.
 *
 * The vendor is CHOSEN and its id is submitted. Until the picker existed this
 * field asked for a uuid to be typed in by hand — deliberately, because the
 * alternative on offer was a name, and a contract keyed by a vendor name is
 * the identity failure this system exists to remove. `Picker` is what makes
 * both true at once: the person reads a name, the form carries the id.
 */
export function NewRateContractForm({
  vendors,
}: {
  vendors: ReadonlyArray<{ readonly id: string; readonly name: string }>;
}): ReactNode {
  return (
    <Form action={createRateContract} submitLabel="Record contract" pendingLabel="Recording…">
      <div className="row">
        <Picker
          name="vendorId"
          label="Vendor"
          options={vendors}
          required
          hint="Search by name. What is saved is the vendor's id, never the text you typed."
        />
        <Field name="number" label="Contract number" required hint="Yours to choose, and yours to correct later." />
      </div>

      <Field name="title" label="Title" required />

      <div className="row">
        <Choice
          name="status"
          label="Status"
          defaultValue="draft"
          options={[
            ['draft', 'Draft — not yet in force, prices nothing'],
            ['active', 'Active — orders are measured against it'],
          ]}
          hint="A draft is a negotiation. Only an active contract prices anything."
        />
        <Field
          name="paymentTerms"
          label="Payment terms"
          hint="Left empty if not agreed. No default — nobody negotiated “30 Days Net”."
        />
      </div>

      <div className="row">
        <Field
          name="tradeCode"
          label="Trade"
          required
          hint="The trade package code, e.g. ELEC. Uppercased for you."
        />
        <Field name="uom" label="Unit" required hint="What the rate is per: m, sqft, no." />
      </div>

      <Field name="description" label="What is contracted" required />

      <div className="row">
        <MoneyField
          name="contractRate"
          label="Contracted rate"
          hint="Rupees per unit, up to two decimals. No GST — that is carried on the order line."
        />
      </div>

      <div className="row">
        <Field name="validFrom" label="Valid from" type="date" required />
        <Field
          name="validTo"
          label="Valid to"
          type="date"
          required
          hint="Inclusive. Required — the previous system defaults it to 31 December 2026, so a rate outlives its agreement."
        />
      </div>
    </Form>
  );
}

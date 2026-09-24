'use client';

import type { ReactNode } from 'react';
import { Field, Form, MoneyField } from '@cog/design-system';
import { updateBoqLine } from '../actions';

export interface LineDefaults {
  readonly section: string;
  readonly itemNo: string;
  readonly description: string;
  readonly uom: string;
  readonly quantity: string;
  readonly rate: string;
  readonly costRate: string;
  readonly version: string;
}

export function EditBoqLineForm({
  projectId,
  itemId,
  line,
}: {
  projectId: string;
  itemId: string;
  line: LineDefaults;
}): ReactNode {
  const action = updateBoqLine.bind(null, projectId, itemId);
  return (
    <Form action={action} submitLabel="Save the line" pendingLabel="Saving…">
      {/* The version this form was built from. The write is refused if the line
          moved underneath it — BOQ-04. */}
      <input type="hidden" name="expectedVersion" defaultValue={line.version} />
      <div className="row">
        <Field name="section" label="Section" required defaultValue={line.section} />
        <Field name="itemNo" label="Item no." required defaultValue={line.itemNo} />
        <Field name="uom" label="Unit" required defaultValue={line.uom} />
      </div>
      <Field name="description" label="Description" required defaultValue={line.description} />
      <div className="row">
        <Field name="quantity" label="Quantity" required defaultValue={line.quantity} />
        <MoneyField name="rate" label="Client rate" required defaultValue={line.rate} />
        <MoneyField
          name="costRate"
          label="Cost rate"
          defaultValue={line.costRate}
          hint="Blank means unknown. Blank stays blank — no margin is assumed."
        />
      </div>
    </Form>
  );
}

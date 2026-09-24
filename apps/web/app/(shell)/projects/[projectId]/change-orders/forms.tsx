'use client';

import type { ReactNode } from 'react';
import { Choice, Field, Form, MoneyField, Notes } from '@cog/design-system';
import { createChangeOrder, decideChangeOrder, submitChangeOrder } from './actions';

export function NewChangeOrderForm({ projectId }: { projectId: string }): ReactNode {
  return (
    <Form
      action={createChangeOrder.bind(null, projectId)}
      submitLabel="Raise variation"
      pendingLabel="Raising…"
    >
      <div className="row">
        <Field name="number" label="Variation number" required />
        <Field name="title" label="Title" required />
        <MoneyField
          name="costImpact"
          label="Cost impact"
          required
          hint="Signed. A credit to the client is entered as a negative amount — not as a positive one labelled differently."
        />
      </div>
      <Notes name="description" label="Rationale" rows={2} />
    </Form>
  );
}

export function SubmitChangeOrderForm({
  projectId,
  changeOrderId,
  version,
}: {
  projectId: string;
  changeOrderId: string;
  version: number;
}): ReactNode {
  return (
    <Form
      action={submitChangeOrder.bind(null, projectId, changeOrderId)}
      submitLabel="Send to the client"
      pendingLabel="Sending…"
    >
      <input type="hidden" name="expectedVersion" defaultValue={String(version)} />
      <p className="hint u-m0">
        A zero-value variation is refused: a variation that changes nothing is a note, and it
        would still enter the contract-value arithmetic as a decided item.
      </p>
    </Form>
  );
}

export function DecideChangeOrderForm({
  projectId,
  changeOrderId,
  version,
}: {
  projectId: string;
  changeOrderId: string;
  version: number;
}): ReactNode {
  return (
    <Form
      action={decideChangeOrder.bind(null, projectId, changeOrderId)}
      submitLabel="Record the decision"
      pendingLabel="Recording…"
    >
      <input type="hidden" name="expectedVersion" defaultValue={String(version)} />
      <div className="row">
        <Choice
          name="decision"
          label="Decision"
          required
          options={[
            ['approve', 'Client approved'],
            ['reject', 'Client rejected'],
          ]}
        />
        <Field
          name="signedBy"
          label="Signed by"
          required
          hint="Who at the client signed. Required — a decided variation with no signatory is not evidence of one."
        />
      </div>
      <p className="hint u-m0">
        Recorded once. A second decision is refused rather than applied — CO-04: approving twice
        in the legacy adds the cost twice.
      </p>
    </Form>
  );
}

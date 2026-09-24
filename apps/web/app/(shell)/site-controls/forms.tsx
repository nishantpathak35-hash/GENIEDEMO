'use client';

import type { ReactNode } from 'react';
import { Choice, Field, Form, MoneyField, Notes } from '@cog/design-system';
import {
  recordMeasurement,
  reconcileImprest,
  requestImprest,
  sanctionImprest,
} from './actions';

export function RequestImprestForm({ projectId }: { projectId: string }): ReactNode {
  return (
    <Form
      action={requestImprest.bind(null, projectId)}
      submitLabel="Request"
      pendingLabel="Requesting…"
    >
      <div className="row">
        <MoneyField name="amountRequested" label="Amount requested" required />
      </div>
      <Notes name="purpose" label="Purpose" rows={2} />
    </Form>
  );
}

export function SanctionImprestForm({
  projectId,
  imprestId,
  version,
  requested,
}: {
  projectId: string;
  imprestId: string;
  version: number;
  requested: string;
}): ReactNode {
  return (
    <Form
      action={sanctionImprest.bind(null, projectId, imprestId)}
      submitLabel="Sanction"
      pendingLabel="Sanctioning…"
    >
      <input type="hidden" name="expectedVersion" defaultValue={String(version)} />
      <MoneyField
        name="amountSanctioned"
        label="Amount sanctioned"
        required
        defaultValue={requested}
        hint="May be less than was asked for. Prefilled with the request, not fixed to it — the legacy sends the requested amount with no field to change it."
      />
    </Form>
  );
}

export function ReconcileImprestForm({
  projectId,
  imprestId,
  version,
}: {
  projectId: string;
  imprestId: string;
  version: number;
}): ReactNode {
  return (
    <Form
      action={reconcileImprest.bind(null, projectId, imprestId)}
      submitLabel="Reconcile"
      pendingLabel="Reconciling…"
    >
      <input type="hidden" name="expectedVersion" defaultValue={String(version)} />
      <MoneyField
        name="amountReconciled"
        label="Amount actually spent"
        required
        hint="Cannot exceed the sanction — a CHECK constraint, not only a branch."
      />
    </Form>
  );
}

export function RecordMeasurementForm({
  projectId,
  boqLines,
}: {
  projectId: string;
  boqLines: ReadonlyArray<readonly [string, string]>;
}): ReactNode {
  return (
    <Form
      action={recordMeasurement.bind(null, projectId)}
      submitLabel="Record measurement"
      pendingLabel="Recording…"
    >
      <div className="row">
        <Field name="description" label="Item measured" required />
        <Field name="quantity" label="Quantity" required placeholder="12.375" />
        <Field name="uom" label="Unit" required placeholder="sqm" />
        <Field name="measuredOn" label="Measured on" type="date" required />
      </div>
      <div className="row">
        <Field name="location" label="Location or zone" />
        <Field
          name="signedByClient"
          label="Signed by, for the client"
          required
          hint="Required. A joint measurement with no client signatory is not a joint measurement."
        />
        <Choice name="boqItemId" label="Against BOQ line (optional)" options={boqLines} />
      </div>
      <p className="hint u-m0">
        Append-only. There is no edit and no delete: a measurement the client signed is evidence.
      </p>
    </Form>
  );
}

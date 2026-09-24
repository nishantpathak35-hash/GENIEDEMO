'use client';

import type { ReactNode } from 'react';
import { Choice, Field, Form, MoneyField, Notes } from '@cog/design-system';
import { formatBasisPoints } from '@cog/money';
import { saveAgreement, setStages, setStatus } from './actions';

export function AgreementForm({
  projectId,
  engagementType = '',
  contractValue = '',
  notes = '',
}: {
  projectId: string;
  engagementType?: string;
  /** RUPEES, already formatted for an input. Never a `PaiseWire`. */
  contractValue?: string;
  notes?: string;
}): ReactNode {
  return (
    <Form action={saveAgreement} submitLabel="Save the agreement" pendingLabel="Saving…">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="row">
        <Field name="engagementType" label="Engagement" defaultValue={engagementType} />
        <MoneyField
          name="contractValue"
          label="Contract value"
          defaultValue={contractValue}
          hint="Leave empty while it is still being negotiated. Empty is not zero."
        />
      </div>
      <Notes name="notes" label="Anything the agreement says that matters here" defaultValue={notes} />
    </Form>
  );
}

/**
 * The whole schedule, in one field.
 *
 * Five rows of inputs would be a nicer form and a worse control: the rule is
 * that the stages **total** the contract, so they are edited as a set. One line
 * per stage, `name | share | trigger`, parsed on the server — which also means
 * a schedule can be pasted out of the document it came from.
 */
export function StagesForm({
  projectId,
  stages,
}: {
  projectId: string;
  stages: readonly { name: string; shareBp: number; trigger: string }[];
}): ReactNode {
  const existing = stages
    .map((s) => `${s.name} | ${formatBasisPoints(s.shareBp).replace('%', '')} | ${s.trigger}`)
    .join('\n');

  return (
    <Form action={setStages} submitLabel="Replace the schedule" pendingLabel="Saving…">
      <input type="hidden" name="projectId" value={projectId} />
      <Notes
        name="stages"
        label="One stage per line: name | share % | what releases it"
        rows={6}
        defaultValue={existing}
        hint="They have to come to 100% before the agreement can be signed. Anything less is money that never gets billed."
      />
    </Form>
  );
}

export function AgreementStatusForm({
  projectId,
  allocatedBp,
}: {
  projectId: string;
  allocatedBp: number;
}): ReactNode {
  return (
    <Form action={setStatus} submitLabel="Record it" pendingLabel="Recording…">
      <input type="hidden" name="projectId" value={projectId} />
      <Choice
        name="status"
        label="Where it has got to"
        required
        defaultValue="issued"
        options={[
          ['issued', 'Issued to the client'],
          ['signed', 'Signed'],
        ]}
        hint={
          allocatedBp === 10_000
            ? 'The stages come to 100%, so it can be signed.'
            : `The stages come to ${formatBasisPoints(allocatedBp)}. Signing is refused until they come to 100%.`
        }
      />
      <Field name="signedOn" label="Signed on" type="date" hint="Required to record it as signed." />
    </Form>
  );
}

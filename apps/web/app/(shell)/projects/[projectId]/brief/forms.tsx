'use client';

import type { ReactNode } from 'react';
import { Choice, Field, Form, MoneyField, Notes } from '@cog/design-system';
import { acknowledgeBrief, addStatement, saveBrief, saveRoom } from './actions';

/**
 * Write the brief.
 *
 * When the current version is frozen the submit label says what will happen —
 * a new version — rather than "Save". A control that does something other than
 * what its label says is the one people press by accident, and here the accident
 * is a scope somebody thought they were editing.
 */
export function BriefForm({
  projectId,
  engagementType = '',
  scopeSummary = '',
  budgetMin = '',
  budgetMax = '',
  targetStartDate = null,
  targetCompletionDate = null,
  approvalAuthority = '',
  frozen = false,
}: {
  projectId: string;
  engagementType?: string;
  scopeSummary?: string;
  /** RUPEES, already formatted for an input. Never a `PaiseWire`. */
  budgetMin?: string;
  budgetMax?: string;
  targetStartDate?: string | null;
  targetCompletionDate?: string | null;
  approvalAuthority?: string;
  frozen?: boolean;
}): ReactNode {
  return (
    <Form
      action={saveBrief}
      submitLabel={frozen ? 'Save as the next version' : 'Save the brief'}
      pendingLabel="Saving…"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <div className="row">
        <Field
          name="engagementType"
          label="Engagement"
          defaultValue={engagementType}
          hint="Turnkey, design only, fit-out only — however this one is being run."
        />
        <Field
          name="approvalAuthority"
          label="Who signs off on the client side"
          defaultValue={approvalAuthority}
        />
      </div>
      <Notes name="scopeSummary" label="The scope, in the client's words" defaultValue={scopeSummary} />
      <div className="row">
        <MoneyField
          name="budgetMin"
          label="Budget from"
          defaultValue={budgetMin}
          hint="Leave empty if it has not been discussed. Empty is not zero."
        />
        <MoneyField name="budgetMax" label="Budget to" defaultValue={budgetMax} />
        <Field name="targetStartDate" label="Target start" type="date" defaultValue={targetStartDate ?? ''} />
        <Field
          name="targetCompletionDate"
          label="Target completion"
          type="date"
          defaultValue={targetCompletionDate ?? ''}
        />
      </div>
    </Form>
  );
}

/**
 * Issue it, or record that the client said yes.
 *
 * **Acknowledgement is one-way.** There is no control to un-acknowledge,
 * because the client's agreement is a thing that happened. Changing the scope
 * afterwards makes a new version, which is what the save form does.
 */
export function AcknowledgeBriefForm({
  briefId,
  projectId,
  status,
}: {
  briefId: string;
  projectId: string;
  status: string;
}): ReactNode {
  return (
    <Form action={acknowledgeBrief} submitLabel="Record it" pendingLabel="Recording…">
      <input type="hidden" name="briefId" value={briefId} />
      <input type="hidden" name="projectId" value={projectId} />
      <Choice
        name="status"
        label="Where this version has got to"
        required
        defaultValue={status === 'issued' ? 'acknowledged' : 'issued'}
        options={[
          ['issued', 'Issued to the client'],
          ['acknowledged', 'The client has acknowledged it'],
        ]}
        hint="Acknowledging freezes this version. Changing the scope after that creates the next one."
      />
    </Form>
  );
}

export function BriefRoomForm({
  briefId,
  projectId,
}: {
  briefId: string;
  projectId: string;
}): ReactNode {
  return (
    <Form action={saveRoom} submitLabel="Save this room" pendingLabel="Saving…">
      <input type="hidden" name="briefId" value={briefId} />
      <input type="hidden" name="projectId" value={projectId} />
      <div className="row">
        <Field name="roomName" label="Room" required placeholder="Boardroom" />
        <Field
          name="areaSqft"
          label="Area (sq ft)"
          type="number"
          hint="Whole square feet. Nothing in a brief needs a fraction of one."
        />
        <Field name="headcount" label="People" type="number" />
        <Field name="purpose" label="What it is for" />
      </div>
      <Field name="requirements" label="What it needs" hint="In the client's words, not a spec." />
    </Form>
  );
}

export function BriefStatementForm({
  briefId,
  projectId,
}: {
  briefId: string;
  projectId: string;
}): ReactNode {
  return (
    <Form action={addStatement} submitLabel="Add it" pendingLabel="Adding…">
      <input type="hidden" name="briefId" value={briefId} />
      <input type="hidden" name="projectId" value={projectId} />
      <div className="row">
        <Choice
          name="kind"
          label="Kind"
          required
          defaultValue="assumption"
          options={[
            ['decision_maker', 'Who decides'],
            ['client_supplied', 'The client supplies'],
            ['assumption', 'Assumed'],
            ['exclusion', 'Excluded'],
          ]}
        />
        <Field name="body" label="In one line" required placeholder="Power shutdowns are the client's" />
      </div>
    </Form>
  );
}

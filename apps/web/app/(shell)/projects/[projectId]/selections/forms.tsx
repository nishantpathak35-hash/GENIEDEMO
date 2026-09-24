'use client';

import type { ReactNode } from 'react';
import { Choice, Field, Form, MoneyField } from '@cog/design-system';
import { addSelection, decideSelection, decideSubstitution, proposeSubstitution } from './actions';

export function NewSelectionForm({ projectId }: { projectId: string }): ReactNode {
  return (
    <Form action={addSelection} submitLabel="Propose it" pendingLabel="Saving…">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="row">
        <Field name="roomLabel" label="Room" placeholder="Boardroom" />
        <Field name="itemName" label="Item" required placeholder="Task chair" />
        <Field name="modelSku" label="Model" placeholder="Herman Miller Aeron" />
        <Field name="finish" label="Finish" />
      </div>
      <div className="row">
        <MoneyField
          name="unitPrice"
          label="Unit price"
          hint="Leave empty if the price is not known yet. Empty is not zero."
        />
        <Field name="quantity" label="How many" type="number" />
        <Field
          name="leadTimeWeeks"
          label="Lead time (weeks)"
          type="number"
          hint="What procurement planning reads to find the items that will be late."
        />
        <Field name="decisionDeadline" label="Decision needed by" type="date" />
      </div>
    </Form>
  );
}

/**
 * The client's answer.
 *
 * Approving **freezes** it. The hint says so before the decision rather than
 * after it, because the frozen state is the one that changes how the item can
 * be edited afterwards.
 */
export function DecideSelectionForm({
  selectionId,
  projectId,
}: {
  selectionId: string;
  projectId: string;
}): ReactNode {
  return (
    <Form action={decideSelection} submitLabel="Record" pendingLabel="Recording…">
      <input type="hidden" name="selectionId" value={selectionId} />
      <input type="hidden" name="projectId" value={projectId} />
      <Choice
        name="decision"
        label="Decision"
        required
        defaultValue="approved"
        options={[
          ['approved', 'Approved — freeze it'],
          ['alternative_requested', 'Show me something else'],
          ['rejected', 'Rejected'],
        ]}
      />
      <Field name="note" label="Why" />
    </Form>
  );
}

/**
 * Propose an alternative to a frozen item.
 *
 * The price change is typed as a **saving or an addition**, separately from its
 * amount, because a minus sign in a money field is the thing people miss. A
 * saving larger than the item costs is refused by the server: it would make the
 * price negative.
 */
export function SubstitutionForm({
  selectionId,
  projectId,
}: {
  selectionId: string;
  projectId: string;
}): ReactNode {
  return (
    <Form action={proposeSubstitution} submitLabel="Propose an alternative" pendingLabel="Saving…">
      <input type="hidden" name="selectionId" value={selectionId} />
      <input type="hidden" name="projectId" value={projectId} />
      <Field name="proposedSpec" label="Instead, use" required placeholder="Featherlite Optima" />
      <Field name="reason" label="Why" placeholder="14-week lead time on the original" />
      <div className="row">
        <Choice
          name="direction"
          label="Price"
          required
          defaultValue="more"
          options={[
            ['more', 'Costs more'],
            ['less', 'Costs less'],
          ]}
        />
        <MoneyField name="priceDelta" label="By" hint="The difference, not the new price." />
        <Field
          name="leadTimeDeltaDays"
          label="Days later (negative for sooner)"
          type="number"
          defaultValue="0"
        />
      </div>
    </Form>
  );
}

export function DecideSubstitutionForm({
  substitutionId,
  projectId,
}: {
  substitutionId: string;
  projectId: string;
}): ReactNode {
  return (
    <Form action={decideSubstitution} submitLabel="Record" pendingLabel="Recording…">
      <input type="hidden" name="substitutionId" value={substitutionId} />
      <input type="hidden" name="projectId" value={projectId} />
      <Choice
        name="approve"
        label="Decision"
        required
        defaultValue="yes"
        options={[
          ['yes', 'Approve — apply the price change'],
          ['no', 'Refuse it'],
        ]}
        hint="Approving applies the price change once. Pressing it twice does not apply it twice."
      />
    </Form>
  );
}

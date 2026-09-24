'use client';

import type { ReactNode } from 'react';
import { Choice, Field, Form, Notes } from '@cog/design-system';
import { addDeliverable, reviewDeliverable, submitDeliverable } from './actions';

/**
 * A new deliverable.
 *
 * **The included-revision count has no default and no placeholder.** Leaving it
 * empty means no limit was agreed, which is the honest state for a contract
 * that does not say — and it is what stops the revision-count rule from firing
 * against a number nobody chose.
 */
export function NewDeliverableForm({ projectId }: { projectId: string }): ReactNode {
  return (
    <Form action={addDeliverable} submitLabel="Add it" pendingLabel="Adding…">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="row">
        <Field name="name" label="Deliverable" required placeholder="Ground floor layout" />
        <Field name="stage" label="Stage" placeholder="Concept, GFC" />
        <Field name="dueDate" label="Due" type="date" />
        <Field
          name="includedRevisionsLimit"
          label="Revisions included in the fee"
          type="number"
          hint="From the contract. Leave empty if it does not say — nothing is assumed."
        />
      </div>
      <Notes name="notes" label="Notes" />
    </Form>
  );
}

export function SubmitDeliverableButton({
  deliverableId,
  projectId,
}: {
  deliverableId: string;
  projectId: string;
}): ReactNode {
  return (
    <form
      action={submitDeliverable.bind(null, deliverableId, projectId)}
      className="inline"
    >
      <button type="submit" className="btn sm">
        Issue for review
      </button>
    </form>
  );
}

/**
 * Record what the reviewer said.
 *
 * **Asking for a revision moves the count**, which is why the decision and the
 * count are one action rather than two. A screen that let somebody record a
 * revision request and forget to increment the count is a screen that makes the
 * included-revisions rule advisory.
 */
export function ReviewForm({
  deliverableId,
  projectId,
}: {
  deliverableId: string;
  projectId: string;
}): ReactNode {
  return (
    <Form action={reviewDeliverable} submitLabel="Record it" pendingLabel="Recording…">
      <input type="hidden" name="deliverableId" value={deliverableId} />
      <input type="hidden" name="projectId" value={projectId} />
      <Choice
        name="decision"
        label="Decision"
        required
        defaultValue="approved"
        options={[
          ['approved', 'Approved'],
          ['revision_requested', 'Revision asked for'],
          ['rejected', 'Rejected'],
        ]}
        hint="Asking for a revision moves the revision count on."
      />
      <Field name="feedback" label="What was said" />
    </Form>
  );
}

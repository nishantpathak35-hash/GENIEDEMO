'use client';

import type { ReactNode } from 'react';
import { Choice, Field, Form, Notes } from '@cog/design-system';
import { decideCase, raiseCase } from './actions';

export function NewCaseForm({ projectId }: { projectId: string }): ReactNode {
  return (
    <Form action={raiseCase} submitLabel="Raise it" pendingLabel="Raising…">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="row">
        <Field name="title" label="What is wrong" required placeholder="Boardroom door not closing" />
        <Field name="category" label="Trade" placeholder="Joinery, electrical…" />
        <Field name="reportedOn" label="Reported on" type="date" />
        <Field
          name="respondBy"
          label="Promised by"
          type="date"
          hint="Only if something was actually promised. Nothing is filled in for you."
        />
      </div>
      <Field name="assignedTo" label="Who is dealing with it" />
      <Notes name="description" label="What the client said" />
    </Form>
  );
}

/**
 * Move a claim on, or close it.
 *
 * **Closing needs notes**, refused without them. &ldquo;Resolved&rdquo; on its
 * own answers nothing when the client asks about it six months later, and a
 * rejection with no reason is worse.
 */
export function DecideCaseForm({
  caseId,
  projectId,
}: {
  caseId: string;
  projectId: string;
}): ReactNode {
  return (
    <Form action={decideCase} submitLabel="Record" pendingLabel="Recording…">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="projectId" value={projectId} />
      <Choice
        name="status"
        label="Where it is"
        required
        defaultValue="in_progress"
        options={[
          ['in_progress', 'Being dealt with'],
          ['resolved', 'Resolved'],
          ['rejected', 'Not covered'],
        ]}
      />
      <Field
        name="resolutionNotes"
        label="What was done, or why not"
        hint="Required to resolve or refuse it."
      />
      <Field name="resolutionEvidenceUrl" label="Evidence" placeholder="Link to the photo" />
    </Form>
  );
}

'use client';

import type { ReactNode } from 'react';
import { Choice, Field, Form } from '@cog/design-system';
import { addMilestone, recordProgress } from './actions';

export function NewMilestoneForm({ projectId }: { projectId: string }): ReactNode {
  return (
    <Form action={addMilestone} submitLabel="Add it" pendingLabel="Adding…">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="row">
        <Field name="name" label="Milestone" required placeholder="Ceiling grid complete" />
        <Field name="trade" label="Trade" placeholder="False ceiling" />
        <Field name="plannedStart" label="Planned start" type="date" required />
        <Field name="plannedFinish" label="Planned finish" type="date" required />
      </div>
      <Field name="responsibleParty" label="Who is responsible" />
    </Form>
  );
}

/**
 * Move a milestone on.
 *
 * **Choosing Delayed without a reason is refused**, by the server and by the
 * database. The hint says so before the choice is made rather than after it is
 * rejected.
 */
export function ProgressForm({
  milestoneId,
  projectId,
  status,
}: {
  milestoneId: string;
  projectId: string;
  status: string;
}): ReactNode {
  return (
    <Form action={recordProgress} submitLabel="Record" pendingLabel="Recording…">
      <input type="hidden" name="milestoneId" value={milestoneId} />
      <input type="hidden" name="projectId" value={projectId} />
      <Choice
        name="status"
        label="Where it is"
        required
        defaultValue={status === 'not_started' ? 'in_progress' : status}
        options={[
          ['not_started', 'Not started'],
          ['in_progress', 'In progress'],
          ['delayed', 'Delayed'],
          ['complete', 'Complete'],
        ]}
      />
      <div className="row">
        <Field name="actualStart" label="Actually started" type="date" />
        <Field
          name="actualFinish"
          label="Actually finished"
          type="date"
          hint="Required to record it complete."
        />
      </div>
      <Field
        name="delayReason"
        label="Why it slipped"
        hint="Required for a delay. A red flag with nothing beside it tells nobody anything."
      />
      <Field name="recoveryPlan" label="What is being done about it" />
    </Form>
  );
}

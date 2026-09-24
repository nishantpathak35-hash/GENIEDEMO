'use client';

import type { ReactNode } from 'react';
import { Choice, Field, Form, Notes } from '@cog/design-system';
import { issueHandover, raiseItem, rectifyItem } from './actions';

/**
 * Raise a punch-list item.
 *
 * **Severity has no default.** The previous system defaults it to Minor, so an
 * item raised in a hurry stops blocking a handover it should have blocked.
 */
export function NewItemForm({ projectId }: { projectId: string }): ReactNode {
  return (
    <Form action={raiseItem} submitLabel="Raise it" pendingLabel="Raising…">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="row">
        <Field name="roomLabel" label="Where" placeholder="Boardroom" />
        <Choice
          name="kind"
          label="What kind"
          required
          defaultValue="snag"
          options={[
            ['snag', 'Snag'],
            ['defect', 'Defect'],
            ['incomplete', 'Not finished'],
          ]}
        />
        <Choice
          name="severity"
          label="How bad"
          required
          options={[
            ['minor', 'Minor'],
            ['major', 'Major'],
            ['critical', 'Critical — blocks the handover'],
          ]}
          hint="Nothing is assumed here. Critical stops the job being handed over."
        />
        <Field name="assignedTo" label="Who is fixing it" />
      </div>
      <Field name="description" label="What is wrong" required />
      <Field name="beforePhotoUrl" label="Photograph" placeholder="Link to the photo as found" />
    </Form>
  );
}

/**
 * Mark an item fixed.
 *
 * The photograph is **required**. A tick is not evidence, and the after-photo
 * is what somebody looks at when the client says it was never done.
 */
export function RectifyForm({
  itemId,
  projectId,
}: {
  itemId: string;
  projectId: string;
}): ReactNode {
  return (
    <Form action={rectifyItem} submitLabel="Mark it fixed" pendingLabel="Recording…">
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="projectId" value={projectId} />
      <Field
        name="afterPhotoUrl"
        label="Photograph of the finished work"
        required
        hint="Required. A tick on its own is not evidence."
      />
      <Field name="notes" label="What was done" />
    </Form>
  );
}

export function IssueHandoverForm({
  projectId,
  blocking,
}: {
  projectId: string;
  blocking: number;
}): ReactNode {
  return (
    <Form action={issueHandover} submitLabel="Hand it over" pendingLabel="Recording…">
      <input type="hidden" name="projectId" value={projectId} />
      <Notes
        name="notes"
        label="Anything to record about the handover"
        hint={
          blocking === 0
            ? 'Nothing critical is open, so this can be recorded.'
            : `${String(blocking)} critical item${blocking === 1 ? '' : 's'} still open. This will be refused.`
        }
      />
    </Form>
  );
}

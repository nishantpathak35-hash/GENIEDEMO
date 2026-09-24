'use client';

import type { ReactNode } from 'react';
import { Field, Form, Notes } from '@cog/design-system';
import { addPackage, advanceStage } from './actions';

export function NewPackageForm({ projectId }: { projectId: string }): ReactNode {
  return (
    <Form action={addPackage} submitLabel="Start it" pendingLabel="Starting…">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="row">
        <Field name="name" label="Package" required placeholder="Reception desk" />
        <Field name="roomLabel" label="Where" placeholder="Reception" />
        <Field name="workshop" label="Workshop" placeholder="Who is making it" />
        <Field name="targetInstallDate" label="Install by" type="date" />
      </div>
      <Notes name="notes" label="Anything the workshop needs to know" />
      <p className="hint u-m0">
        All nine stages are created with it, so the shape of the process is visible from day one.
      </p>
    </Form>
  );
}

/**
 * Sign one stage off.
 *
 * The button carries the stage&rsquo;s own name. Nine identical buttons in a
 * column is how the wrong one gets pressed, and this one is a quality sign-off.
 */
export function AdvanceStageForm({
  stageId,
  stageName,
  projectId,
}: {
  stageId: string;
  stageName: string;
  projectId: string;
}): ReactNode {
  return (
    <Form action={advanceStage} submitLabel={`Sign off ${stageName}`} pendingLabel="Recording…">
      <input type="hidden" name="stageId" value={stageId} />
      <input type="hidden" name="projectId" value={projectId} />
      <Field name="evidenceUrl" label="Evidence" placeholder="Link to the photo or the drawing" />
      <Field name="notes" label="Note" />
    </Form>
  );
}

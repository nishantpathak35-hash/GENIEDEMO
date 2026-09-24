'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../../lib/api';
import { failed, load, messageFor, succeeded, text, type ActionState } from '@cog/design-system';

export async function addPackage(_previous: ActionState, form: FormData): Promise<ActionState> {
  const projectId = text(form, 'projectId');
  const name = text(form, 'name');
  if (projectId === '') return failed('A project is required.');
  if (name === '') return failed('A package needs a name.');

  const install = text(form, 'targetInstallDate');
  const result = await load(await apiAsCaller(), API_ROUTES.addJoineryPackage, {
    params: { projectId },
    body: {
      name,
      roomLabel: text(form, 'roomLabel'),
      workshop: text(form, 'workshop'),
      targetInstallDate: install === '' ? null : install,
      notes: text(form, 'notes'),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/joinery`);
  return succeeded(`${name} started, at site measurement.`);
}

/**
 * Sign a stage off.
 *
 * The message says what the package is waiting on NOW, because that is the
 * question the person asking has — not confirmation that the button worked.
 */
export async function advanceStage(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const stageId = text(form, 'stageId');
  const projectId = text(form, 'projectId');
  if (stageId === '' || projectId === '') return failed('A stage is required.');

  const result = await load(await apiAsCaller(), API_ROUTES.advanceJoineryStage, {
    params: { stageId },
    body: { evidenceUrl: text(form, 'evidenceUrl'), notes: text(form, 'notes') },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/joinery`);
  return succeeded(
    result.data.currentStage === 'Completed'
      ? `${result.data.completedStage} signed off. The package is complete.`
      : `${result.data.completedStage} signed off. Next: ${result.data.currentStage}.`,
  );
}

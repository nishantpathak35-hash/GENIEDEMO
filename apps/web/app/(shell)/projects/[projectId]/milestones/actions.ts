'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../../lib/api';
import { failed, load, messageFor, succeeded, text, type ActionState } from '@cog/design-system';

export async function addMilestone(_previous: ActionState, form: FormData): Promise<ActionState> {
  const projectId = text(form, 'projectId');
  const name = text(form, 'name');
  const plannedStart = text(form, 'plannedStart');
  const plannedFinish = text(form, 'plannedFinish');
  if (projectId === '') return failed('A project is required.');
  if (name === '') return failed('A milestone needs a name.');
  if (plannedStart === '' || plannedFinish === '') return failed('Both planned dates are needed.');

  const result = await load(await apiAsCaller(), API_ROUTES.addMilestone, {
    params: { projectId },
    body: {
      name,
      trade: text(form, 'trade'),
      plannedStart,
      plannedFinish,
      responsibleParty: text(form, 'responsibleParty'),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/milestones`);
  return succeeded(`${name} added.`);
}

export async function recordProgress(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const milestoneId = text(form, 'milestoneId');
  const projectId = text(form, 'projectId');
  const status = text(form, 'status');
  if (milestoneId === '' || projectId === '') return failed('A milestone is required.');
  if (
    status !== 'not_started' &&
    status !== 'in_progress' &&
    status !== 'delayed' &&
    status !== 'complete'
  ) {
    return failed('Say where the milestone is.');
  }

  const start = text(form, 'actualStart');
  const finish = text(form, 'actualFinish');
  const result = await load(await apiAsCaller(), API_ROUTES.recordMilestoneProgress, {
    params: { milestoneId },
    body: {
      status,
      actualStart: start === '' ? null : start,
      actualFinish: finish === '' ? null : finish,
      delayReason: text(form, 'delayReason'),
      recoveryPlan: text(form, 'recoveryPlan'),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/milestones`);
  return succeeded('Recorded.');
}

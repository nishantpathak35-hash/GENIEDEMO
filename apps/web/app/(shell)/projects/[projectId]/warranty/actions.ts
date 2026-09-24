'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../../lib/api';
import { failed, load, messageFor, succeeded, text, type ActionState } from '@cog/design-system';

export async function raiseCase(_previous: ActionState, form: FormData): Promise<ActionState> {
  const projectId = text(form, 'projectId');
  const title = text(form, 'title');
  if (projectId === '') return failed('A project is required.');
  if (title === '') return failed('Say what is wrong.');

  const reportedOn = text(form, 'reportedOn');
  const respondBy = text(form, 'respondBy');

  const result = await load(await apiAsCaller(), API_ROUTES.raiseWarrantyCase, {
    params: { projectId },
    body: {
      title,
      description: text(form, 'description'),
      category: text(form, 'category'),
      // Both absent rather than invented. The legacy supplies a response date
      // of seven days from now whenever this is empty.
      ...(reportedOn === '' ? {} : { reportedOn }),
      respondBy: respondBy === '' ? null : respondBy,
      assignedTo: text(form, 'assignedTo'),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/warranty`);
  return succeeded(
    respondBy === ''
      ? 'Raised. Nothing has been promised about when it will be dealt with.'
      : `Raised, promised by ${respondBy}.`,
  );
}

export async function decideCase(_previous: ActionState, form: FormData): Promise<ActionState> {
  const caseId = text(form, 'caseId');
  const projectId = text(form, 'projectId');
  const status = text(form, 'status');
  if (caseId === '' || projectId === '') return failed('A claim is required.');
  if (status !== 'in_progress' && status !== 'resolved' && status !== 'rejected') {
    return failed('Say where the claim has got to.');
  }

  const result = await load(await apiAsCaller(), API_ROUTES.decideWarrantyCase, {
    params: { caseId },
    body: {
      status,
      resolutionNotes: text(form, 'resolutionNotes'),
      resolutionEvidenceUrl: text(form, 'resolutionEvidenceUrl'),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/warranty`);
  return succeeded('Recorded.');
}

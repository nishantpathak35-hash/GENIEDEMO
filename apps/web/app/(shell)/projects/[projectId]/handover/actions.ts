'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../../lib/api';
import { failed, load, messageFor, succeeded, text, type ActionState } from '@cog/design-system';

export async function raiseItem(_previous: ActionState, form: FormData): Promise<ActionState> {
  const projectId = text(form, 'projectId');
  const description = text(form, 'description');
  const kind = text(form, 'kind');
  const severity = text(form, 'severity');
  if (projectId === '') return failed('A project is required.');
  if (description === '') return failed('Say what is wrong.');
  if (kind !== 'snag' && kind !== 'defect' && kind !== 'incomplete') {
    return failed('Say what kind of item it is.');
  }
  if (severity !== 'minor' && severity !== 'major' && severity !== 'critical') {
    return failed('Say how bad it is. Nothing is assumed.');
  }

  const result = await load(await apiAsCaller(), API_ROUTES.raiseHandoverItem, {
    params: { projectId },
    body: {
      kind,
      severity,
      description,
      roomLabel: text(form, 'roomLabel'),
      beforePhotoUrl: text(form, 'beforePhotoUrl'),
      assignedTo: text(form, 'assignedTo'),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/handover`);
  return succeeded(
    severity === 'critical'
      ? 'Raised. The handover is blocked until this is rectified.'
      : 'Raised.',
  );
}

export async function rectifyItem(_previous: ActionState, form: FormData): Promise<ActionState> {
  const itemId = text(form, 'itemId');
  const projectId = text(form, 'projectId');
  const afterPhotoUrl = text(form, 'afterPhotoUrl');
  if (itemId === '' || projectId === '') return failed('An item is required.');
  if (afterPhotoUrl === '') {
    return failed('A photograph of the finished work is required. A tick is not evidence.');
  }

  const result = await load(await apiAsCaller(), API_ROUTES.rectifyHandoverItem, {
    params: { itemId },
    body: { afterPhotoUrl, notes: text(form, 'notes') },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/handover`);
  return succeeded('Recorded, with the photograph and who verified it.');
}

export async function issueHandover(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const projectId = text(form, 'projectId');
  if (projectId === '') return failed('A project is required.');

  const result = await load(await apiAsCaller(), API_ROUTES.issueHandover, {
    params: { projectId },
    body: { notes: text(form, 'notes') },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/handover`);
  return succeeded(
    `Handed over. ${String(result.data.rectifiedItems)} of ${String(result.data.totalItems)} items rectified, recorded as it stood.`,
  );
}

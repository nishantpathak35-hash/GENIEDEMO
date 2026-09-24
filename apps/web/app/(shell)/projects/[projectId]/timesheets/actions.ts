'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../../lib/api';
import {
  checked,
  failed,
  load,
  messageFor,
  succeeded,
  text,
  type ActionState,
} from '@cog/design-system';
import { parseWholeNumber } from '@cog/money';

export async function bookTime(_previous: ActionState, form: FormData): Promise<ActionState> {
  const projectId = text(form, 'projectId');
  const workDate = text(form, 'workDate');
  if (projectId === '') return failed('A project is required.');
  if (workDate === '') return failed('Say which day.');

  const minutes = parseWholeNumber(text(form, 'minutes'));
  if (minutes === null) return failed('Choose how long it took.');

  const result = await load(await apiAsCaller(), API_ROUTES.bookTime, {
    params: { projectId },
    body: {
      workDate,
      minutes,
      stage: text(form, 'stage'),
      description: text(form, 'description'),
      additionalService: checked(form, 'additionalService'),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/timesheets`);
  return succeeded('Booked against your name.');
}

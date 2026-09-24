'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../../lib/api';
import { failed, load, messageFor, succeeded, text, type ActionState } from '@cog/design-system';

/**
 * Record a decision that arrived somewhere else.
 *
 * The subject arrives as `kind:id` from one control, so the two cannot disagree
 * — a pair of fields would let somebody pick a deliverable and paste a
 * selection's id, and the server would then apply a design decision to a
 * finish.
 */
export async function recordDecision(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const projectId = text(form, 'projectId');
  const subject = text(form, 'subject');
  const decision = text(form, 'decision');
  const channel = text(form, 'channel');
  const decidedOn = text(form, 'decidedOn');
  if (projectId === '') return failed('A project is required.');
  if (subject === '') return failed('Say what they decided about.');
  if (decidedOn === '') return failed('Say when they said it.');

  const separator = subject.indexOf(':');
  const subjectKind = subject.slice(0, separator);
  const subjectId = subject.slice(separator + 1);
  if (
    subjectKind !== 'deliverable' &&
    subjectKind !== 'selection' &&
    subjectKind !== 'change_order'
  ) {
    return failed('That is not something a client decides about.');
  }
  if (
    channel !== 'meeting' &&
    channel !== 'whatsapp' &&
    channel !== 'email' &&
    channel !== 'phone' &&
    channel !== 'letter'
  ) {
    return failed('Say how the decision came in.');
  }

  const result = await load(await apiAsCaller(), API_ROUTES.recordExternalDecision, {
    params: { projectId },
    body: {
      subjectKind,
      subjectId,
      decision,
      channel,
      saidBy: text(form, 'saidBy'),
      note: text(form, 'note'),
      decidedOn,
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/client-actions`);
  revalidatePath(`/projects/${projectId}/design`);
  revalidatePath(`/projects/${projectId}/selections`);
  return succeeded(
    subjectKind === 'change_order'
      ? 'Recorded. A variation still has to be authorised on its own screen — this is the note of what they said, not the authorisation.'
      : 'Recorded, and applied. The item is no longer waiting on them.',
  );
}

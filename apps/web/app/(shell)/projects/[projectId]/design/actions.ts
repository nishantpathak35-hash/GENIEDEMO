'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../../lib/api';
import { failed, load, messageFor, succeeded, text, type ActionState } from '@cog/design-system';
import { parseWholeNumber } from '@cog/money';

export async function addDeliverable(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const projectId = text(form, 'projectId');
  const name = text(form, 'name');
  if (projectId === '') return failed('A project is required.');
  if (name === '') return failed('A deliverable needs a name.');

  const limitRaw = text(form, 'includedRevisionsLimit');
  // Empty means no limit was agreed. `parseWholeNumber` on an empty string
  // would be an error; treating it as null is the whole point.
  const limit = limitRaw === '' ? null : parseWholeNumber(limitRaw);
  if (limitRaw !== '' && limit === null) {
    return failed('An included-revision count is a whole number.');
  }

  const due = text(form, 'dueDate');
  const result = await load(await apiAsCaller(), API_ROUTES.addDeliverable, {
    params: { projectId },
    body: {
      name,
      stage: text(form, 'stage'),
      dueDate: due === '' ? null : due,
      includedRevisionsLimit: limit,
      notes: text(form, 'notes'),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/design`);
  return succeeded(
    limit === null
      ? `${name} added. No revision limit is set, so nothing will be flagged as extra.`
      : `${name} added, with ${String(limit)} revisions included.`,
  );
}

export async function submitDeliverable(
  deliverableId: string,
  projectId: string,
): Promise<void> {
  await load(await apiAsCaller(), API_ROUTES.submitDeliverable, {
    params: { deliverableId },
  });
  revalidatePath(`/projects/${projectId}/design`);
}

/**
 * Record a review.
 *
 * The message says what happened to the COUNT, because that is the part with a
 * consequence — and the part somebody needs to see before they find out from an
 * invoice conversation.
 */
export async function reviewDeliverable(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const deliverableId = text(form, 'deliverableId');
  const projectId = text(form, 'projectId');
  const decision = text(form, 'decision');
  if (deliverableId === '' || projectId === '') return failed('A deliverable is required.');
  if (decision !== 'approved' && decision !== 'revision_requested' && decision !== 'rejected') {
    return failed('Say what the decision is.');
  }

  const result = await load(await apiAsCaller(), API_ROUTES.reviewDeliverable, {
    params: { deliverableId },
    body: { decision, feedback: text(form, 'feedback') },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/design`);
  if (result.data.status === 'approved') return succeeded('Approved, and frozen.');
  if (result.data.status === 'rejected') return succeeded('Recorded as rejected.');
  return succeeded(
    result.data.beyondIncludedRevisions
      ? `Recorded. This is revision ${String(result.data.revisionCount)}, which is past what the fee includes — raise a change order if it is to be billed.`
      : `Recorded. This is revision ${String(result.data.revisionCount)}.`,
  );
}

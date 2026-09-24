'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../../lib/api';
import { load } from '@cog/design-system';
import {
  failed,
  messageFor,
  optionalText,
  succeeded,
  text,
  type ActionState,
} from '@cog/design-system';

const CATEGORIES = ['architectural', 'structural', 'mep', 'interior', 'other'] as const;
type Category = (typeof CATEGORIES)[number];

export async function issueDrawing(
  projectId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const drawingNo = text(form, 'drawingNo');
  const title = text(form, 'title');
  const revision = text(form, 'revision');
  if (drawingNo.length === 0 || title.length === 0 || revision.length === 0) {
    return failed('A number, a title and a revision are all required.');
  }

  const typedCategory = text(form, 'category');
  const category = (CATEGORIES as readonly string[]).includes(typedCategory)
    ? (typedCategory as Category)
    : undefined;

  const result = await load(await apiAsCaller(), API_ROUTES.issueDrawing, {
    params: { projectId },
    body: {
      projectId,
      drawingNo,
      title,
      revision,
      ...(category === undefined ? {} : { category }),
      ...(optionalText(form, 'documentId') === undefined
        ? {}
        : { documentId: text(form, 'documentId') }),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/drawings`);
  return succeeded(
    `${result.data.drawingNo} ${result.data.revision} issued. Any previous active revision of ` +
      'the same number was superseded in the same transaction.',
  );
}

/**
 * Withdraw, not delete. An issued drawing was on site, and a record that it
 * once was is the point of the status column.
 */
export async function withdrawDrawing(projectId: string, drawingId: string): Promise<void> {
  await load(await apiAsCaller(), API_ROUTES.withdrawDrawing, {
    params: { projectId, drawingId },
  });
  revalidatePath(`/projects/${projectId}/drawings`);
}

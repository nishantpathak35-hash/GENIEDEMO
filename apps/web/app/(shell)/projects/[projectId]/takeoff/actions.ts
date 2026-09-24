'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import { MoneyInputError, parseWholeNumber } from '@cog/money';
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

/**
 * Takeoff sheets.
 *
 * **A scale is both halves or neither.** `scalePxNum` per `scalePxDen` is an
 * exact rational, not a `REAL`: every measured quantity on a sheet is divided
 * by it, so a float there reaches every figure derived from the sheet. Half a
 * scale is refused rather than stored, because half a scale reads as
 * calibrated.
 */
export async function createSheet(
  projectId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const title = text(form, 'title');
  if (title.length === 0) return failed('A title is required.');

  const num = optionalText(form, 'scalePxNum');
  const den = optionalText(form, 'scalePxDen');
  if ((num === undefined) !== (den === undefined)) {
    return failed('A scale needs both a pixel count and a unit count, or neither.');
  }

  let scalePxNum: number | undefined;
  let scalePxDen: number | undefined;
  try {
    scalePxNum = num === undefined ? undefined : parseWholeNumber(num, 'Scale pixels');
    scalePxDen = den === undefined ? undefined : parseWholeNumber(den, 'Scale units');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.createTakeoffSheet, {
    params: { projectId },
    body: {
      projectId,
      title,
      ...(optionalText(form, 'floorName') === undefined
        ? {}
        : { floorName: text(form, 'floorName') }),
      ...(scalePxNum === undefined ? {} : { scalePxNum }),
      ...(scalePxDen === undefined ? {} : { scalePxDen }),
      ...(optionalText(form, 'scaleUnit') === undefined
        ? {}
        : { scaleUnit: text(form, 'scaleUnit') }),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/takeoff`);
  return succeeded(`${result.data.title} created.`);
}

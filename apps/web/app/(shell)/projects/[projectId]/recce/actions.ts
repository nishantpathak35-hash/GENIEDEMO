'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import { MoneyInputError, parseQuantityToParts, parseWholeNumber } from '@cog/money';
import { apiAsCaller } from '../../../../../lib/api';
import { load } from '@cog/design-system';
import {
  failed,
  checked,
  messageFor,
  optionalText,
  succeeded,
  text,
  type ActionState,
} from '@cog/design-system';

const CONDITIONS = ['bare_shell', 'warm_shell', 'fitted', 'occupied'] as const;
type Condition = (typeof CONDITIONS)[number];

/**
 * A site survey.
 *
 * **Areas are exact integers of millionths of a unit**, not floats. A built-up
 * area in a float reaches the efficiency ratio, the rate analysis and every
 * quantity derived from the survey. The legacy stores `bua_sqft` and
 * `carpet_sqft` as numbers and computes the efficiency ratio three separate
 * times, at two different precisions — `.toFixed(0)` on the card
 * (`SiteRecceView.js:128`) and `.toFixed(1)` in the form and the report
 * (`:496`, `:810`) — so the same survey reads 78% in one place and 78.3% in
 * another.
 *
 * **`conductedBy` is the authenticated principal**, never a name typed into a
 * field. The legacy takes it from a text input.
 */
export async function createRecce(
  projectId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const recceOn = text(form, 'recceOn');
  if (recceOn.length === 0) return failed('A survey date is required.');

  const typedCondition = text(form, 'siteCondition');
  const siteCondition = (CONDITIONS as readonly string[]).includes(typedCondition)
    ? (typedCondition as Condition)
    : undefined;

  function area(name: string): { whole?: number; millionths?: number } {
    const typed = optionalText(form, name);
    if (typed === undefined) return {};
    const parts = parseQuantityToParts(typed, name);
    return { whole: parts.quantityWhole, millionths: parts.quantityMillionths };
  }

  let bua: { whole?: number; millionths?: number };
  let carpet: { whole?: number; millionths?: number };
  let height: { whole?: number; millionths?: number };
  let numFloors: number | undefined;
  try {
    bua = area('bua');
    carpet = area('carpet');
    height = area('floorHeight');
    const typedFloors = optionalText(form, 'numFloors');
    numFloors = typedFloors === undefined ? undefined : parseWholeNumber(typedFloors, 'Floors');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.createRecce, {
    body: {
      projectId,
      recceOn,
      clientPresent: checked(form, 'clientPresent'),
      ...(bua.whole === undefined
        ? {}
        : { buaWhole: bua.whole, buaMillionths: bua.millionths ?? 0 }),
      ...(carpet.whole === undefined
        ? {}
        : { carpetWhole: carpet.whole, carpetMillionths: carpet.millionths ?? 0 }),
      ...(height.whole === undefined
        ? {}
        : { floorHeightWhole: height.whole, floorHeightMillionths: height.millionths ?? 0 }),
      ...(numFloors === undefined ? {} : { numFloors }),
      ...(siteCondition === undefined ? {} : { siteCondition }),
      ...(optionalText(form, 'floorNumber') === undefined
        ? {}
        : { floorNumber: text(form, 'floorNumber') }),
      ...(optionalText(form, 'handoverOn') === undefined
        ? {}
        : { handoverOn: text(form, 'handoverOn') }),
      ...(optionalText(form, 'keyChallenges') === undefined
        ? {}
        : { keyChallenges: text(form, 'keyChallenges') }),
      ...(optionalText(form, 'observations') === undefined
        ? {}
        : { observations: text(form, 'observations') }),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/recce`);
  return succeeded('Survey recorded.');
}

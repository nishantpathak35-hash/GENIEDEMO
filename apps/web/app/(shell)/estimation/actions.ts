'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import { MoneyInputError, parsePercentToBasisPoints, parseRupeesToWire } from '@cog/money';
import { apiAsCaller } from '../../../lib/api';
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
 * Rate analysis.
 *
 * **The rate is the answer, not an input.** The form sends the four factors and
 * two rates; the server computes the breakdown and stores it. Sending a
 * `baseRate` is refused — the endpoint has no field for one and a test asserts
 * a supplied rate is ignored.
 *
 * **Rounding happens once per component.** EST-01: the legacy rounds `baseRate`
 * to whole rupees mid-formula and then applies GST to the rounded figure and
 * rounds again (`estimationCalculations.js:20-23`), on floats. That is why the
 * same four factors give three different answers in three places, and why
 * PO-17 — which of the three figures the customer has been quoted — is still
 * open.
 *
 * **There is no GST field.** RATE-03 is fixed by omission: whether a BOQ rate
 * carries GST is PO-16, and a default of 18% would settle it by accident.
 */
export async function createEstimationItem(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const itemName = text(form, 'itemName');
  const uom = text(form, 'uom');
  if (itemName.length === 0 || uom.length === 0) {
    return failed('An item name and a unit are both required.');
  }

  let materialCost: string;
  let labourCost: string;
  let equipmentCost: string;
  let overheadBp: number;
  let marginBp: number;
  try {
    materialCost = parseRupeesToWire(text(form, 'materialCost'), 'Material cost');
    labourCost = parseRupeesToWire(text(form, 'labourCost'), 'Labour cost');
    equipmentCost = parseRupeesToWire(text(form, 'equipmentCost'), 'Equipment cost');
    overheadBp = parsePercentToBasisPoints(text(form, 'overheadPct'), 'Overhead');
    marginBp = parsePercentToBasisPoints(text(form, 'marginPct'), 'Margin');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.createEstimationItem, {
    body: {
      itemName,
      uom,
      materialCost,
      labourCost,
      equipmentCost,
      overheadBp,
      marginBp,
      ...(optionalText(form, 'trade') === undefined ? {} : { trade: text(form, 'trade') }),
      ...(optionalText(form, 'benchmark') === undefined
        ? {}
        : { benchmark: text(form, 'benchmark') }),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/estimation');
  return succeeded('Analysed and stored.');
}

export async function deleteEstimationItem(itemId: string): Promise<void> {
  await load(await apiAsCaller(), API_ROUTES.deleteEstimationItem, { params: { itemId } });
  revalidatePath('/estimation');
}

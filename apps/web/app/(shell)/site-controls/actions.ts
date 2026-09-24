'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import {
  MoneyInputError,
  parseQuantityToParts,
  parseRupeesToWire,
  parseWholeNumber,
} from '@cog/money';
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
 * Site cash and joint measurement.
 *
 * Moved here from `projects/[projectId]/site/actions.ts` in the Stage 4
 * re-skin: `listImprest` and `listMeasurements` are both `:projectId`-scoped,
 * so this screen is a project chooser plus, once a project is picked (via
 * `?projectId=`), the ledger and the sheet for it — the design's four
 * "Site" tabs collapse to two shipped ones (Daily reports, Measurements and
 * imprest), and this is the second.
 *
 * **Sanctioning records who sanctioned it, separately from who asked.** Today
 * the same principal may legitimately be both — there is no separation-of-duty
 * rule to enforce until PO-13 answers who may sanction — but the two columns
 * exist so that such a rule is writable later. IMP-02: the legacy has no gate
 * on sanctioning at all.
 *
 * **Reconciling cannot exceed the sanction**, as a CHECK constraint as well as
 * a branch. IMP-01: `reconcileSiteImprest` marks an imprest reconciled and
 * compares nothing.
 */

export async function requestImprest(
  projectId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const purpose = text(form, 'purpose');
  if (purpose.length === 0) return failed('Say what the cash is for.');

  let amountRequested: string;
  try {
    amountRequested = parseRupeesToWire(text(form, 'amountRequested'), 'Amount');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.requestImprest, {
    body: { projectId, purpose, amountRequested },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/site-controls');
  return succeeded('Requested.');
}

export async function sanctionImprest(
  _projectId: string,
  imprestId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  let amountSanctioned: string;
  let expectedVersion: number;
  try {
    amountSanctioned = parseRupeesToWire(text(form, 'amountSanctioned'), 'Amount');
    expectedVersion = parseWholeNumber(text(form, 'expectedVersion'), 'Version');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.sanctionImprest, {
    params: { imprestId },
    body: { amountSanctioned, expectedVersion },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/site-controls');
  return succeeded('Sanctioned.');
}

export async function reconcileImprest(
  _projectId: string,
  imprestId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  let amountReconciled: string;
  let expectedVersion: number;
  try {
    amountReconciled = parseRupeesToWire(text(form, 'amountReconciled'), 'Amount');
    expectedVersion = parseWholeNumber(text(form, 'expectedVersion'), 'Version');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.reconcileImprest, {
    params: { imprestId },
    body: { amountReconciled, expectedVersion },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/site-controls');
  return succeeded('Reconciled.');
}

/**
 * Record a joint measurement.
 *
 * Append-only: there is no edit and no delete. A measurement the client signed
 * is evidence, and an editable record of it is not one.
 */
export async function recordMeasurement(
  projectId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const description = text(form, 'description');
  const uom = text(form, 'uom');
  const signedByClient = text(form, 'signedByClient');
  const measuredOn = text(form, 'measuredOn');
  if (
    description.length === 0 ||
    uom.length === 0 ||
    signedByClient.length === 0 ||
    measuredOn.length === 0
  ) {
    return failed('A description, a unit, the client signatory and a date are all required.');
  }

  let quantity: { quantityWhole: number; quantityMillionths: number };
  try {
    quantity = parseQuantityToParts(text(form, 'quantity'));
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.recordMeasurement, {
    body: {
      projectId,
      description,
      uom,
      signedByClient,
      measuredOn,
      ...quantity,
      ...(optionalText(form, 'location') === undefined
        ? {}
        : { location: text(form, 'location') }),
      ...(optionalText(form, 'boqItemId') === undefined
        ? {}
        : { boqItemId: text(form, 'boqItemId') }),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/site-controls');
  return succeeded('Recorded. It cannot be edited or deleted.');
}

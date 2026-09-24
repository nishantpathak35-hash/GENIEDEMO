'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { API_ROUTES } from '@cog/contracts';
import {
  MoneyInputError,
  parsePercentToBasisPoints,
  parseQuantityToParts,
  parseRupeesToWire,
  parseWholeNumber,
} from '@cog/money';
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
 * BOQ writes.
 *
 * **Nothing here computes an amount.** The legacy's add form shows a live
 * "Projected Margin" computed as
 * `((clientRate - costRate) / clientRate) * 100` and
 * `(clientRate - costRate) * qty` (`BoqView.js:917-918`), then sends the rates
 * and lets the server compute a different total. Here the quantity and the two
 * rates are sent, and the line amount comes back from the server.
 *
 * The quantity is split into whole units and millionths by
 * `parseQuantityToParts`, exactly. `12.375` through a float and back is not
 * reliably `12.375`, and a takeoff quantity reaches every figure derived from
 * it.
 */

export async function addBoqLine(
  projectId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const section = text(form, 'section');
  const description = text(form, 'description');
  const uom = text(form, 'uom');
  if (section.length === 0 || description.length === 0 || uom.length === 0) {
    return failed('Section, description and unit are all required.');
  }

  let itemNo: number;
  let quantity: { quantityWhole: number; quantityMillionths: number };
  let rate: string;
  let costRate: string | undefined;
  try {
    itemNo = parseWholeNumber(text(form, 'itemNo'), 'Item number');
    quantity = parseQuantityToParts(text(form, 'quantity'));
    rate = parseRupeesToWire(text(form, 'rate'), 'Client rate');
    const typedCost = optionalText(form, 'costRate');
    costRate = typedCost === undefined ? undefined : parseRupeesToWire(typedCost, 'Cost rate');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.addBoqLines, {
    params: { projectId },
    body: {
      lines: [
        {
          section,
          itemNo,
          description,
          uom,
          ...quantity,
          rate,
          ...(costRate === undefined ? {} : { costRate }),
        },
      ],
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/boq`);
  return succeeded(`Line ${String(itemNo)} added.`);
}

export async function updateBoqLine(
  projectId: string,
  itemId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const section = text(form, 'section');
  const description = text(form, 'description');
  const uom = text(form, 'uom');

  let itemNo: number;
  let expectedVersion: number;
  let quantity: { quantityWhole: number; quantityMillionths: number };
  let rate: string;
  let costRate: string | undefined;
  try {
    itemNo = parseWholeNumber(text(form, 'itemNo'), 'Item number');
    // BOQ-04, closed. Two people editing the same line used to lose one edit
    // silently, because `boq_items` had no version column at all.
    expectedVersion = parseWholeNumber(text(form, 'expectedVersion'), 'Version');
    quantity = parseQuantityToParts(text(form, 'quantity'));
    rate = parseRupeesToWire(text(form, 'rate'), 'Client rate');
    const typedCost = optionalText(form, 'costRate');
    costRate = typedCost === undefined ? undefined : parseRupeesToWire(typedCost, 'Cost rate');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.updateBoqLine, {
    params: { projectId, itemId },
    body: {
      section,
      itemNo,
      description,
      uom,
      ...quantity,
      rate,
      ...(costRate === undefined ? {} : { costRate }),
      expectedVersion,
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/boq`);
  redirect(`/projects/${projectId}/boq`);
}

export async function deleteBoqLine(projectId: string, itemId: string): Promise<void> {
  await load(await apiAsCaller(), API_ROUTES.deleteBoqLine, { params: { projectId, itemId } });
  revalidatePath(`/projects/${projectId}/boq`);
}

/**
 * Raise a purchase order from BOQ lines.
 *
 * **The order is born `draft`.** This is the BOQ-03 replacement: the legacy's
 * `shootPOFromBOQItems` inserts `status` and `approval_status` as `'Approved'`
 * for a value the caller supplies, gated only by a check that `session.email`
 * is truthy. There is no path in this system that creates an approved order.
 *
 * The caller chooses lines, a vendor and a GST rate. The caller does **not**
 * choose the value: the server prices the lines from their stored cost rates
 * and refuses a line that has none (BOQ-06 — the legacy falls back to the
 * client-facing rate, then to zero).
 */
export async function raisePurchaseOrderFromBoq(
  projectId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const boqItemIds = form.getAll('boqItemId').map((v) => String(v));
  if (boqItemIds.length === 0) return failed('Select at least one BOQ line.');

  const vendorId = text(form, 'vendorId');
  if (vendorId.length === 0) return failed('Choose a vendor.');

  let gstRate: number;
  try {
    gstRate = parsePercentToBasisPoints(text(form, 'gstPct'), 'GST rate');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.purchaseOrderFromBoq, {
    body: { projectId, vendorId, boqItemIds, gstRate },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/boq`);
  revalidatePath('/purchase-orders');
  return succeeded(
    `${result.data.number} raised as a DRAFT for ${String(boqItemIds.length)} line(s). ` +
      'It has to go through the approval chain like any other order.',
  );
}

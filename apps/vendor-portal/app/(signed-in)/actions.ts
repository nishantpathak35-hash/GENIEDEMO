'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import { MoneyInputError, parseRupeesToWire } from '@cog/money';
import {
  failed,
  load,
  messageFor,
  optionalText,
  succeeded,
  text,
  type ActionState,
} from '@cog/design-system';
import { apiAsCaller } from '../../lib/api';

/**
 * A vendor's two write paths.
 *
 * Neither carries a vendor id. The server reads the entitlement from
 * `identity.principal_links`, so an order that is not this vendor's is refused
 * by the write itself rather than by a check the caller could have skipped.
 */
export async function acceptOrder(
  orderId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const decision = text(form, 'decision');
  if (decision !== 'accepted' && decision !== 'rejected') return failed('Choose an answer.');

  const result = await load(await apiAsCaller(), API_ROUTES.vendorPortalAcceptOrder, {
    params: { orderId },
    body: {
      decision,
      ...(optionalText(form, 'remarks') === undefined
        ? {}
        : { remarks: text(form, 'remarks') }),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/');
  return succeeded(decision === 'accepted' ? 'Accepted.' : 'Rejected.');
}

/**
 * Submit a running-account bill.
 *
 * The amount is what you are claiming, typed in rupees and shifted exactly by
 * `parseRupeesToWire`. **Nothing is deducted from it here or anywhere else in
 * this system yet** — no TDS, no retention, no netting. What is finally paid is
 * agreed outside the system until CA-01..CA-08 are answered.
 */
export async function submitBill(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const purchaseOrderId = text(form, 'purchaseOrderId');
  const billNumber = text(form, 'billNumber');
  if (purchaseOrderId.length === 0 || billNumber.length === 0) {
    return failed('Choose an order and give the bill a number.');
  }

  let amountClaimed: string;
  try {
    amountClaimed = parseRupeesToWire(text(form, 'amountClaimed'), 'Claim');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }
  if (amountClaimed === '0' || amountClaimed.startsWith('-')) {
    return failed('A claim must be a positive amount.');
  }

  const from = optionalText(form, 'periodFrom');
  const to = optionalText(form, 'periodTo');
  if ((from === undefined) !== (to === undefined)) {
    return failed('Give both ends of the period, or neither.');
  }

  const result = await load(await apiAsCaller(), API_ROUTES.vendorPortalSubmitBill, {
    body: {
      purchaseOrderId,
      billNumber,
      amountClaimed,
      ...(from === undefined ? {} : { periodFrom: from }),
      ...(to === undefined ? {} : { periodTo: to }),
      ...(optionalText(form, 'narrative') === undefined
        ? {}
        : { narrative: text(form, 'narrative') }),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/bills');
  return succeeded(`${result.data.billNumber} submitted.`);
}

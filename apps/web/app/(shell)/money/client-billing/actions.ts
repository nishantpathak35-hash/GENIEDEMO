'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { API_ROUTES } from '@cog/contracts';
import { MoneyInputError, parseRupeesToWire } from '@cog/money';
import { apiAsCaller } from '../../../../lib/api';
import { failed, load, messageFor, optionalText, succeeded, text, type ActionState } from '@cog/design-system';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Raise a tax invoice, then open it. Rupees typed are parsed to paise here and
 * nowhere else; the GST, the heads and the number are the server's, and so is
 * every refusal — no GSTIN on file, no rate loaded, production refusing a
 * provisional rate.
 */
export async function raiseInvoice(_previous: ActionState, form: FormData): Promise<ActionState> {
  let taxableAmount: string;
  try {
    taxableAmount = parseRupeesToWire(text(form, 'taxableAmount'), 'Taxable value');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }
  const projectId = text(form, 'projectId');
  const invoiceDate = text(form, 'invoiceDate');
  const expectedOn = text(form, 'expectedOn');
  const certifiedOn = optionalText(form, 'certifiedOn');
  if (projectId === '') return failed('Choose the project this invoice bills.');
  if (!ISO_DATE.test(invoiceDate) || !ISO_DATE.test(expectedOn)) {
    return failed('The invoice date and the date payment is expected are both required.');
  }
  const gstin = optionalText(form, 'clientGstin');

  const result = await load(await apiAsCaller(), API_ROUTES.raiseClientInvoice, {
    body: {
      projectId,
      invoiceDate,
      expectedOn,
      certifiedOn: certifiedOn ?? null,
      description: text(form, 'description'),
      taxableAmount,
      placeOfSupply: text(form, 'placeOfSupply'),
      clientGstin: gstin === undefined ? null : gstin.toUpperCase(),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/money/client-billing');
  redirect(`/money/client-billing?invoice=${result.data.id}`);
}

export async function recordReceipt(invoiceId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  let amount: string;
  try {
    amount = parseRupeesToWire(text(form, 'amount'), 'Received');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }
  const receivedOn = text(form, 'receivedOn');
  if (!ISO_DATE.test(receivedOn)) return failed('The date it was received is required.');

  const result = await load(await apiAsCaller(), API_ROUTES.recordClientReceipt, {
    params: { invoiceId },
    body: { receivedOn, amount, reference: text(form, 'reference') },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/money/client-billing');
  return succeeded(`Recorded against ${result.data.number}.`);
}

export async function cancelInvoice(invoiceId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  const reason = text(form, 'reason');
  if (reason === '') return failed('Say why it is cancelled.');

  const result = await load(await apiAsCaller(), API_ROUTES.cancelClientInvoice, {
    params: { invoiceId },
    body: { reason },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/money/client-billing');
  return succeeded(`${result.data.number} is cancelled. Its number is not issued again.`);
}

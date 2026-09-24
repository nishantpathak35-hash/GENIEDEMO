'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { API_ROUTES } from '@cog/contracts';
import { MoneyInputError, parseRupeesToWire } from '@cog/money';
import { apiAsCaller } from '../../../../lib/api';
import { failed, load, messageFor, succeeded, text, type ActionState } from '@cog/design-system';

/**
 * Acknowledge a bill. Rupees typed are parsed to paise here and nowhere else;
 * whether the split adds up to the claim is the server's to say.
 */
export async function acknowledgeBill(
  billId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  let taxableAmount: string;
  let gstAmount: string;
  try {
    taxableAmount = parseRupeesToWire(text(form, 'taxableAmount'), 'Taxable value');
    gstAmount = parseRupeesToWire(text(form, 'gstAmount'), 'GST');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }
  const dueOn = text(form, 'dueOn');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return failed('A due date is required.');

  const result = await load(await apiAsCaller(), API_ROUTES.acknowledgeBill, {
    params: { billId },
    body: { taxableAmount, gstAmount, dueOn },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/money/bills');
  revalidatePath('/');
  return succeeded(`${result.data.billNumber} is payable on ${result.data.dueOn ?? dueOn}.`);
}

/**
 * Pay an acknowledged bill, then open its voucher. Every figure on it is the
 * server's; a refusal — including production refusing a provisional rate — is
 * said back on the form.
 */
export async function payBill(billId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  const paidOn = text(form, 'paidOn');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return failed('The date it was paid is required.');

  const result = await load(await apiAsCaller(), API_ROUTES.payBill, {
    params: { billId },
    body: { paidOn, reference: text(form, 'reference') },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/money/bills');
  revalidatePath('/money/payments');
  revalidatePath('/');
  redirect(`/money/payments?payment=${result.data.id}`);
}

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { API_ROUTES } from '@cog/contracts';
import { MoneyInputError, parsePercentToBasisPoints } from '@cog/money';
import { apiAsCaller } from '../../../lib/api';
import { load } from '@cog/design-system';
import { failed, messageFor, succeeded, text, type ActionState } from '@cog/design-system';

/**
 * Record what is held back from a vendor.
 *
 * **The rate is the input; nothing is typed as an amount.** What is withheld is
 * computed from each bill as it is paid.
 *
 * **RET-01: nothing in the legacy ever recorded this at all.** Nothing INSERTs
 * into `vendor_retention_ledger` — it is only ever read and released — so money
 * withheld from vendors had no system record. Recording it is new, not ported.
 */
export async function recordRetention(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const purchaseOrderId = text(form, 'purchaseOrderId');
  if (purchaseOrderId.length === 0) return failed('Choose the order money is held against.');

  let retentionRateBp: number;
  try {
    retentionRateBp = parsePercentToBasisPoints(text(form, 'retentionPct'), 'Retention rate');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.recordRetention, {
    body: { purchaseOrderId, retentionRateBp },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/retention');
  return succeeded('Recorded against the order.');
}

/**
 * Release what is held, then open its voucher.
 *
 * A release is a payment (RET-02: the legacy's release moved a ledger and paid
 * nobody). The amount is the server's — everything withheld and not released.
 */
export async function releaseRetention(
  holdingId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const releasedOn = text(form, 'releasedOn');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(releasedOn)) return failed('The date it was released is required.');

  const result = await load(await apiAsCaller(), API_ROUTES.releaseRetention, {
    params: { holdingId },
    body: { releasedOn, reference: text(form, 'reference') },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/retention');
  revalidatePath('/money/payments');
  redirect(`/money/payments?payment=${result.data.id}`);
}

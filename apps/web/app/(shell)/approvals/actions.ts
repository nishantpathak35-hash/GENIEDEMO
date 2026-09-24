'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { API_ROUTES, type ApiError } from '@cog/contracts';
import { apiAsCaller } from '../../../lib/api';
import { load, optionalText, reasonSentence, text } from '@cog/design-system';

export interface DecisionState {
  readonly message: string | null;
  readonly refusal: ApiError | null;
  readonly unreachable: boolean;
}

function refused(error: ApiError): DecisionState {
  // The engine's reason travels as the message; the screen gets the sentence.
  const sentence = reasonSentence(error.message);
  return { message: null, unreachable: false, refusal: sentence === undefined ? error : { ...error, message: sentence } };
}

/**
 * One decision, then on to `after` — the next order in the queue from the
 * approvals pane, the order itself from its own page.
 *
 * Approve or Decline is the submit button that was pressed. The server holds
 * every rule — who may decide, never your own, a decline needs a reason — and
 * a refusal comes back as its own sentence on the pane.
 */
export async function decideOrder(
  orderId: string,
  after: string,
  _previous: DecisionState,
  form: FormData,
): Promise<DecisionState> {
  const decision = text(form, 'decision');
  const remarks = optionalText(form, 'remarks');
  const client = await apiAsCaller();

  if (decision === 'decline') {
    if (remarks === undefined) {
      return { message: 'Say why it is declined — the person who raised it reads this.', refusal: null, unreachable: false };
    }
    const result = await load(client, API_ROUTES.declinePurchaseOrder, { params: { id: orderId }, body: { remarks } });
    if (result.kind === 'unreachable') return { message: null, refusal: null, unreachable: true };
    if (result.kind === 'refused') return refused(result.error);
  } else if (decision === 'approve') {
    const result = await load(client, API_ROUTES.approvePurchaseOrder, {
      params: { id: orderId },
      body: remarks === undefined ? {} : { remarks },
    });
    if (result.kind === 'unreachable') return { message: null, refusal: null, unreachable: true };
    if (result.kind === 'refused') return refused(result.error);
  } else {
    return { message: 'Choose Approve or Decline.', refusal: null, unreachable: false };
  }

  revalidatePath('/approvals');
  revalidatePath('/purchase-orders');
  revalidatePath('/');
  revalidatePath(`/purchase-orders/${orderId}`);
  redirect(after);
}

'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import { MoneyInputError, parseRupeesToWire, parseWholeNumber } from '@cog/money';
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
 * Variations.
 *
 * **`costImpact` is signed.** A credit is a negative number, entered as one.
 * The legacy has a `cost_impact` and a separate `vendor_po_impact`, both
 * displayed with a hardcoded `+` prefix (`ChangeOrdersView.js:240-241`), so a
 * variation that reduces the contract reads as one that increases it.
 *
 * **The decision is recorded once.** CO-04: approving a variation twice in the
 * legacy adds its cost twice, because approval is an update with no guard on
 * the state it is leaving. Here an already-decided variation has no legal
 * transition, so the second attempt is refused with a message rather than
 * silently doubling a contract value.
 */

export async function createChangeOrder(
  projectId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const number = text(form, 'number');
  const title = text(form, 'title');
  if (number.length === 0 || title.length === 0) {
    return failed('A number and a title are both required.');
  }

  let costImpact: string;
  try {
    costImpact = parseRupeesToWire(text(form, 'costImpact'), 'Cost impact');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.createChangeOrder, {
    params: { projectId },
    body: {
      projectId,
      number,
      title,
      costImpact,
      ...(optionalText(form, 'description') === undefined
        ? {}
        : { description: text(form, 'description') }),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/change-orders`);
  return succeeded(`${result.data.number} raised as a draft.`);
}

export async function submitChangeOrder(
  projectId: string,
  changeOrderId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  let expectedVersion: number;
  try {
    expectedVersion = parseWholeNumber(text(form, 'expectedVersion'), 'Version');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.submitChangeOrder, {
    params: { projectId, changeOrderId },
    body: { expectedVersion },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/change-orders`);
  return succeeded('Sent to the client.');
}

export async function decideChangeOrder(
  projectId: string,
  changeOrderId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const decision = text(form, 'decision');
  const signedBy = text(form, 'signedBy');
  if (decision !== 'approve' && decision !== 'reject') return failed('Choose a decision.');
  if (signedBy.length === 0) return failed('Record who signed it.');

  let expectedVersion: number;
  try {
    expectedVersion = parseWholeNumber(text(form, 'expectedVersion'), 'Version');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.decideChangeOrder, {
    params: { projectId, changeOrderId },
    body: { decision, signedBy, expectedVersion },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/change-orders`);
  revalidatePath(`/projects/${projectId}`);
  return succeeded(decision === 'approve' ? 'Approved by the client.' : 'Rejected.');
}

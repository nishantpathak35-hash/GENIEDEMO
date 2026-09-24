'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import { MoneyInputError, parseWholeNumber } from '@cog/money';
import {
  failed,
  load,
  messageFor,
  succeeded,
  text,
  type ActionState,
} from '@cog/design-system';
import { apiAsCaller } from '../../lib/api';

/**
 * Signing off a variation.
 *
 * The decision goes through the same rule the staff path uses, so it is
 * recorded **once**: an already-decided variation has no legal transition and
 * the second attempt is refused. CO-04: approving twice in the legacy adds the
 * variation's cost to the contract value twice.
 *
 * `signedBy` is required. A decided variation with no signatory is not evidence
 * that anyone decided it.
 */
export async function decideVariation(
  projectId: string,
  changeOrderId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const decision = text(form, 'decision');
  const signedBy = text(form, 'signedBy');
  if (decision !== 'approve' && decision !== 'reject') return failed('Choose a decision.');
  if (signedBy.length === 0) return failed('Please record who is signing.');

  let expectedVersion: number;
  try {
    expectedVersion = parseWholeNumber(text(form, 'expectedVersion'), 'Version');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.clientPortalDecideVariation, {
    params: { projectId, changeOrderId },
    body: { decision, signedBy, expectedVersion },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}`);
  return succeeded(decision === 'approve' ? 'Approved and recorded.' : 'Rejected and recorded.');
}

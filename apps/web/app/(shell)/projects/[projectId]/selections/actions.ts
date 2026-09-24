'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../../lib/api';
import { failed, load, messageFor, succeeded, text, type ActionState } from '@cog/design-system';
import { formatIndianRupees, parseRupeesToWire, parseWholeNumber } from '@cog/money';

function amountOrNull(raw: string): string | null | 'bad' {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  try {
    return parseRupeesToWire(trimmed);
  } catch {
    return 'bad';
  }
}

export async function addSelection(_previous: ActionState, form: FormData): Promise<ActionState> {
  const projectId = text(form, 'projectId');
  const itemName = text(form, 'itemName');
  if (projectId === '') return failed('A project is required.');
  if (itemName === '') return failed('An item needs a name.');

  const price = amountOrNull(text(form, 'unitPrice'));
  if (price === 'bad') return failed('A unit price is an amount in rupees.');

  const quantityRaw = text(form, 'quantity');
  const leadRaw = text(form, 'leadTimeWeeks');
  const quantity = quantityRaw === '' ? null : parseWholeNumber(quantityRaw);
  const leadTimeWeeks = leadRaw === '' ? null : parseWholeNumber(leadRaw);
  if (quantityRaw !== '' && quantity === null) return failed('A quantity is a whole number.');
  if (leadRaw !== '' && leadTimeWeeks === null) return failed('A lead time is a whole number of weeks.');

  const deadline = text(form, 'decisionDeadline');
  const result = await load(await apiAsCaller(), API_ROUTES.addSelection, {
    params: { projectId },
    body: {
      itemName,
      roomLabel: text(form, 'roomLabel'),
      modelSku: text(form, 'modelSku'),
      finish: text(form, 'finish'),
      unitPricePaise: price,
      quantity,
      leadTimeWeeks,
      decisionDeadline: deadline === '' ? null : deadline,
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/selections`);
  return succeeded(`${itemName} proposed.`);
}

export async function decideSelection(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const selectionId = text(form, 'selectionId');
  const projectId = text(form, 'projectId');
  const decision = text(form, 'decision');
  if (selectionId === '' || projectId === '') return failed('A selection is required.');
  if (decision !== 'approved' && decision !== 'rejected' && decision !== 'alternative_requested') {
    return failed('Say what the decision is.');
  }

  const result = await load(await apiAsCaller(), API_ROUTES.decideSelection, {
    params: { selectionId },
    body: { decision, note: text(form, 'note') },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/selections`);
  return succeeded(
    decision === 'approved'
      ? 'Approved and frozen. Changing it now means proposing an alternative.'
      : 'Recorded.',
  );
}

/**
 * Propose an alternative.
 *
 * The sign is composed from a direction and an amount rather than typed into
 * one field. A leading minus is the character people miss, and missing it here
 * turns a saving into an increase on somebody's contract.
 */
export async function proposeSubstitution(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const selectionId = text(form, 'selectionId');
  const projectId = text(form, 'projectId');
  const proposedSpec = text(form, 'proposedSpec');
  if (selectionId === '' || projectId === '') return failed('A selection is required.');
  if (proposedSpec === '') return failed('Say what should be used instead.');

  const amount = text(form, 'priceDelta');
  let priceDeltaPaise = '0';
  if (amount !== '') {
    try {
      const wire = parseRupeesToWire(amount);
      priceDeltaPaise = text(form, 'direction') === 'less' ? `-${wire}` : wire;
    } catch {
      return failed('A price difference is an amount in rupees.');
    }
  }

  const daysRaw = text(form, 'leadTimeDeltaDays');
  // Negative is allowed here and `parseWholeNumber` refuses a sign, so the
  // minus is peeled off and put back. The alternative is a second parser for
  // signed integers, which is a second place to get a sign wrong.
  const negative = daysRaw.startsWith('-');
  const magnitude = negative ? daysRaw.slice(1) : daysRaw;
  const parsed = magnitude === '' ? 0 : parseWholeNumber(magnitude);
  if (parsed === null) return failed('A lead-time difference is a whole number of days.');
  const leadTimeDeltaDays = negative ? -parsed : parsed;

  const result = await load(await apiAsCaller(), API_ROUTES.proposeSubstitution, {
    params: { selectionId },
    body: { proposedSpec, reason: text(form, 'reason'), priceDeltaPaise, leadTimeDeltaDays },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/selections`);
  return succeeded('Proposed. It changes nothing until somebody approves it.');
}

export async function decideSubstitution(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const substitutionId = text(form, 'substitutionId');
  const projectId = text(form, 'projectId');
  if (substitutionId === '' || projectId === '') return failed('An alternative is required.');

  const result = await load(await apiAsCaller(), API_ROUTES.decideSubstitution, {
    params: { substitutionId },
    body: { approve: text(form, 'approve') === 'yes' },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/selections`);
  if (!result.data.applied) return succeeded('Refused. Nothing changed.');
  return succeeded(
    result.data.newUnitPricePaise === null
      ? 'Approved. The selection now carries the alternative.'
      : `Approved. The unit price is now ${formatIndianRupees(result.data.newUnitPricePaise)}.`,
  );
}

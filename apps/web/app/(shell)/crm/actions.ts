'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import { MoneyInputError, parseRupeesToWire, parseWholeNumber } from '@cog/money';
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

const STAGES = [
  'lead',
  'qualified',
  'proposal_shared',
  'negotiation',
  'won',
  'unqualified',
  'rejected',
] as const;

type Stage = (typeof STAGES)[number];

function stageOf(value: string): Stage | null {
  return (STAGES as readonly string[]).includes(value) ? (value as Stage) : null;
}

/**
 * Lead writes.
 *
 * **The probability is typed, not derived.** CRM-01: four stage→probability
 * ladders exist in the legacy and disagree by up to fifteen points at the same
 * stage — the form's (`CrmView.js:402-408`), the server's
 * (`crm.js:131-139`), the column default and the read fallback. A weighted
 * pipeline built from a mix of them is a figure nobody chose, so no ladder is
 * ported: the number is stored as entered and the weighting is done server-side
 * from that stored number.
 */
export async function createLead(_previous: ActionState, form: FormData): Promise<ActionState> {
  const clientName = text(form, 'clientName');
  const stage = stageOf(text(form, 'stage'));
  if (clientName.length === 0 || stage === null) {
    return failed('A client name and a stage are both required.');
  }

  let estimatedValue: string;
  let probabilityPct: number;
  try {
    estimatedValue = parseRupeesToWire(text(form, 'estimatedValue'), 'Estimated value');
    probabilityPct = parseWholeNumber(text(form, 'probabilityPct'), 'Probability');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }
  if (probabilityPct < 0 || probabilityPct > 100) {
    return failed('Probability is a whole percent between 0 and 100.');
  }

  const optional = (name: string): Record<string, string> =>
    optionalText(form, name) === undefined ? {} : { [name]: text(form, name) };

  const result = await load(await apiAsCaller(), API_ROUTES.createLead, {
    body: {
      clientName,
      stage,
      estimatedValue,
      probabilityPct,
      ...optional('contactName'),
      ...optional('phone'),
      ...optional('email'),
      ...optional('projectType'),
      ...optional('source'),
      ...optional('city'),
      ...optional('consultant'),
      ...optional('expectedClose'),
      ...optional('notes'),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/crm');
  return succeeded(`${result.data.clientName} added to the pipeline.`);
}

export async function updateLead(
  leadId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const clientName = text(form, 'clientName');
  const stage = stageOf(text(form, 'stage'));
  if (clientName.length === 0 || stage === null) {
    return failed('A client name and a stage are both required.');
  }

  let estimatedValue: string;
  let probabilityPct: number;
  let expectedVersion: number;
  try {
    estimatedValue = parseRupeesToWire(text(form, 'estimatedValue'), 'Estimated value');
    probabilityPct = parseWholeNumber(text(form, 'probabilityPct'), 'Probability');
    expectedVersion = parseWholeNumber(text(form, 'expectedVersion'), 'Version');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const optional = (name: string): Record<string, string> =>
    optionalText(form, name) === undefined ? {} : { [name]: text(form, name) };

  const result = await load(await apiAsCaller(), API_ROUTES.updateLead, {
    params: { leadId },
    body: {
      clientName,
      stage,
      estimatedValue,
      probabilityPct,
      expectedVersion,
      ...optional('contactName'),
      ...optional('phone'),
      ...optional('email'),
      ...optional('projectType'),
      ...optional('source'),
      ...optional('city'),
      ...optional('consultant'),
      ...optional('expectedClose'),
      ...optional('notes'),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/crm');
  return succeeded('Saved.');
}

/** Attach a won lead to the project it became. */
export async function convertLead(
  leadId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const projectId = text(form, 'projectId');
  if (projectId.length === 0) return failed('Choose the project this lead became.');

  let expectedVersion: number;
  try {
    expectedVersion = parseWholeNumber(text(form, 'expectedVersion'), 'Version');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.convertLead, {
    params: { leadId },
    body: { projectId, expectedVersion },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/crm');
  return succeeded('Attached to the project.');
}

export async function deleteLead(leadId: string): Promise<void> {
  await load(await apiAsCaller(), API_ROUTES.deleteLead, { params: { leadId } });
  revalidatePath('/crm');
}

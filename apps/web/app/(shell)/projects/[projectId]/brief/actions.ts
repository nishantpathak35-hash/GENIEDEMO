'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../../lib/api';
import {
  failed,
  load,
  messageFor,
  succeeded,
  text,
  type ActionState,
} from '@cog/design-system';
import { parseRupeesToWire, parseWholeNumber } from '@cog/money';

/**
 * An amount a person typed, as wire paise or as nothing.
 *
 * Empty means **absent**, not zero. The legacy writes
 * `Number(payload.budgetMin ?? 0)`, which makes "we have not discussed the
 * budget" and "the budget is nothing" the same row, and the second one is a
 * statement nobody made.
 */
function amountOrNull(raw: string): string | null | 'bad' {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  try {
    return parseRupeesToWire(trimmed);
  } catch {
    return 'bad';
  }
}

function dateOrNull(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

export async function saveBrief(_previous: ActionState, form: FormData): Promise<ActionState> {
  const projectId = text(form, 'projectId');
  if (projectId === '') return failed('A project is required.');

  const min = amountOrNull(text(form, 'budgetMin'));
  const max = amountOrNull(text(form, 'budgetMax'));
  if (min === 'bad' || max === 'bad') return failed('A budget has to be an amount in rupees.');

  const result = await load(await apiAsCaller(), API_ROUTES.saveBrief, {
    params: { projectId },
    body: {
      engagementType: text(form, 'engagementType'),
      scopeSummary: text(form, 'scopeSummary'),
      budgetMinPaise: min,
      budgetMaxPaise: max,
      targetStartDate: dateOrNull(text(form, 'targetStartDate')),
      targetCompletionDate: dateOrNull(text(form, 'targetCompletionDate')),
      approvalAuthority: text(form, 'approvalAuthority'),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/brief`);
  // The message says which version it landed on, because the whole point of the
  // rule is that saving a change to an acknowledged brief does something other
  // than what "save" usually does.
  return succeeded(
    result.data.version === 1
      ? 'Saved as version 1.'
      : `Saved as version ${String(result.data.version)}.`,
  );
}

export async function acknowledgeBrief(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const briefId = text(form, 'briefId');
  const projectId = text(form, 'projectId');
  const status = text(form, 'status');
  if (briefId === '' || projectId === '') return failed('A brief is required.');
  if (status !== 'issued' && status !== 'acknowledged') {
    return failed('Say whether it has been issued or acknowledged.');
  }

  const result = await load(await apiAsCaller(), API_ROUTES.setBriefStatus, {
    params: { briefId },
    body: { status },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/brief`);
  return succeeded(
    status === 'acknowledged'
      ? 'Recorded. This version is frozen — a change to the scope now creates the next one.'
      : 'Recorded as issued.',
  );
}

export async function saveRoom(_previous: ActionState, form: FormData): Promise<ActionState> {
  const briefId = text(form, 'briefId');
  const projectId = text(form, 'projectId');
  const roomName = text(form, 'roomName');
  if (briefId === '' || projectId === '') return failed('A brief is required.');
  if (roomName === '') return failed('A room needs a name.');

  const areaRaw = text(form, 'areaSqft');
  const headRaw = text(form, 'headcount');
  const area = areaRaw === '' ? null : parseWholeNumber(areaRaw);
  const headcount = headRaw === '' ? null : parseWholeNumber(headRaw);
  if (areaRaw !== '' && area === null) return failed('An area is a whole number of square feet.');
  if (headRaw !== '' && headcount === null) return failed('A headcount is a whole number.');

  const result = await load(await apiAsCaller(), API_ROUTES.saveBriefRoom, {
    params: { briefId },
    body: {
      roomName,
      areaSqft: area,
      headcount,
      purpose: text(form, 'purpose'),
      requirements: text(form, 'requirements'),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/brief`);
  return succeeded(`${roomName} saved.`);
}

export async function addStatement(_previous: ActionState, form: FormData): Promise<ActionState> {
  const briefId = text(form, 'briefId');
  const projectId = text(form, 'projectId');
  const body = text(form, 'body');
  const kind = text(form, 'kind');
  if (briefId === '' || projectId === '') return failed('A brief is required.');
  if (body === '') return failed('There is nothing to add.');
  if (
    kind !== 'decision_maker' &&
    kind !== 'client_supplied' &&
    kind !== 'assumption' &&
    kind !== 'exclusion'
  ) {
    return failed('Choose what kind of statement this is.');
  }

  const result = await load(await apiAsCaller(), API_ROUTES.addBriefStatement, {
    params: { briefId },
    body: { kind, body },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/brief`);
  return succeeded('Added.');
}

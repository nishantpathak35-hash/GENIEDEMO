'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../lib/api';
import {
  checked,
  failed,
  load,
  messageFor,
  optionalText,
  succeeded,
  text,
  type ActionState,
} from '@cog/design-system';
import { parseRupeesToWire, parseWholeNumber } from '@cog/money';

/** An absent optional field is an absent key, never an explicit `undefined`. */
function spread(name: string, value: string | undefined): Record<string, string> {
  return value === undefined ? {} : { [name]: value };
}

/**
 * Add somebody at the client.
 *
 * Making a contact primary demotes whoever was primary before, in the same
 * transaction — a partial unique index permits one, so the alternative is a
 * constraint violation shown to somebody who ticked a box.
 */
export async function addContact(_previous: ActionState, form: FormData): Promise<ActionState> {
  const leadId = text(form, 'leadId');
  const name = text(form, 'name');
  if (name.length === 0) return failed('A name is required.');

  const result = await load(await apiAsCaller(), API_ROUTES.addLeadContact, {
    params: { leadId },
    body: {
      name,
      // `exactOptionalPropertyTypes` is on, so an absent field must be an
      // absent KEY rather than an explicit `undefined`.
      ...spread('designation', optionalText(form, 'designation')),
      ...spread('phone', optionalText(form, 'phone')),
      ...spread('email', optionalText(form, 'email')),
      isPrimary: checked(form, 'isPrimary'),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/crm/${leadId}`);
  return succeeded(`Added ${name}.`);
}

/**
 * Log what happened, and when the next thing will.
 *
 * **One act, one save.** A system that makes "log the call" and "schedule the
 * next one" two separate saves gets the second one skipped, and a lead with no
 * next step is the one that goes cold.
 */
export async function logActivity(_previous: ActionState, form: FormData): Promise<ActionState> {
  const leadId = text(form, 'leadId');
  const summary = text(form, 'summary');
  const occurredOn = text(form, 'occurredOn');
  const kind = text(form, 'kind');

  if (summary.length === 0) return failed('A short summary is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    return failed('The date this happened is required.');
  }

  const next = text(form, 'nextFollowupOn');
  const nextKind = text(form, 'nextFollowupKind');
  const kinds = ['call', 'meeting', 'email', 'site_visit', 'note'] as const;
  const knownNextKind = kinds.find((k) => k === nextKind);
  const result = await load(await apiAsCaller(), API_ROUTES.recordLeadActivity, {
    params: { leadId },
    body: {
      kind: kind as 'call' | 'meeting' | 'email' | 'site_visit' | 'note',
      summary,
      ...spread('detail', optionalText(form, 'detail')),
      occurredOn,
      // An empty box means "leave the next step alone". Clearing it is a
      // separate, deliberate act rather than a side effect of logging a call.
      ...(next === '' ? {} : { nextFollowupOn: next }),
      ...(next === '' || knownNextKind === undefined ? {} : { nextFollowupKind: knownNextKind }),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/crm/${leadId}`);
  return succeeded(
    next === '' ? 'Logged.' : `Logged, and the next step is set for ${next}.`,
  );
}

/**
 * Close a lead as lost, with a reason.
 *
 * The reason is required here, in the service, and by a database constraint.
 * Three places, because a lost lead with no reason is what every CRM that makes
 * it optional ends up full of — and it is the only field that changes what the
 * company does next.
 */
export async function markLost(_previous: ActionState, form: FormData): Promise<ActionState> {
  const leadId = text(form, 'leadId');
  const reason = text(form, 'reason');
  const stage = text(form, 'stage');
  if (reason.length === 0) {
    return failed('A reason is required. A lost lead with no reason teaches nothing.');
  }

  let expectedVersion: number;
  try {
    expectedVersion = parseWholeNumber(text(form, 'expectedVersion'), 'version');
  } catch {
    return failed('Reload the page and try again.');
  }

  const result = await load(await apiAsCaller(), API_ROUTES.markLeadLost, {
    params: { leadId },
    body: { stage: stage as 'unqualified' | 'rejected', reason, expectedVersion },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/crm/${leadId}`);
  revalidatePath('/crm');
  return succeeded('Closed, and the reason is on the timeline.');
}

/**
 * Fold a duplicate into this record.
 *
 * The success message says what actually happened rather than “merged”,
 * because the useful part is which fields were filled from the other record.
 * A merge that silently changed a phone number and said nothing is the shape
 * somebody discovers three weeks later.
 */
export async function mergeLead(_previous: ActionState, form: FormData): Promise<ActionState> {
  const leadId = text(form, 'leadId');
  const secondaryId = text(form, 'secondaryId');
  if (leadId === '' || secondaryId === '') return failed('Choose the duplicate to merge in.');

  const result = await load(await apiAsCaller(), API_ROUTES.mergeLeads, {
    params: { leadId },
    body: { secondaryId },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/crm/${leadId}`);
  revalidatePath('/crm');
  const moved =
    result.data.repointed === 1 ? '1 contact moved across' : `${String(result.data.repointed)} contacts moved across`;
  return succeeded(
    result.data.filled.length === 0
      ? `Merged. ${moved}, and nothing on this record was changed.`
      : `Merged. ${moved}, and these empty fields were filled from it: ${result.data.filled.join(', ')}.`,
  );
}

/**
 * Hand this opportunity to delivery.
 *
 * The two confirmations are checked here as well, so the refusal is a
 * sentence rather than a schema error about a literal — the contract types
 * them as `true`, which is right for the wire and unhelpful in a form.
 */
export async function handOverLead(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const leadId = text(form, 'leadId');
  if (leadId === '') return failed('An opportunity is required.');

  if (!checked(form, 'scopeConfirmed') || !checked(form, 'commercialsConfirmed')) {
    return failed(
      'A job cannot be handed over until the scope and the commercials are both confirmed.',
    );
  }

  const version = parseWholeNumber(text(form, 'expectedVersion'));
  if (version === null) return failed('That opportunity could not be read. Reload and retry.');

  const value = text(form, 'originalValue');
  const loiReceived = checked(form, 'loiReceived');
  const loiDate = text(form, 'loiDate');

  const result = await load(await apiAsCaller(), API_ROUTES.handoverLead, {
    params: { leadId },
    body: {
      code: text(form, 'code'),
      name: text(form, 'name'),
      // Absent rather than '0'. A contract whose value is not settled is not
      // a contract worth nothing.
      ...(value === '' ? {} : { originalValue: parseRupeesToWire(value) }),
      scopeConfirmed: true as const,
      commercialsConfirmed: true as const,
      loiReceived,
      ...(loiReceived && loiDate !== '' ? { loiDate } : {}),
      notes: text(form, 'notes'),
      expectedVersion: version,
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/crm/${leadId}`);
  revalidatePath('/projects');
  return succeeded(
    'Handed over. The project exists, this opportunity is marked won against it, and what was confirmed is recorded.',
  );
}

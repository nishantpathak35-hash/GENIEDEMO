'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../../lib/api';
import { failed, load, messageFor, succeeded, text, type ActionState } from '@cog/design-system';
import { formatBasisPoints, parsePercentToBasisPoints, parseRupeesToWire } from '@cog/money';

export async function saveAgreement(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const projectId = text(form, 'projectId');
  if (projectId === '') return failed('A project is required.');

  const value = text(form, 'contractValue');
  let contractValuePaise: string | null = null;
  if (value !== '') {
    try {
      contractValuePaise = parseRupeesToWire(value);
    } catch {
      return failed('A contract value is an amount in rupees.');
    }
  }

  const result = await load(await apiAsCaller(), API_ROUTES.saveAgreement, {
    params: { projectId },
    body: {
      engagementType: text(form, 'engagementType'),
      contractValuePaise,
      notes: text(form, 'notes'),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/commercials`);
  return succeeded('Saved.');
}

/**
 * Parse the schedule out of one text area.
 *
 * `name | share % | what releases it`, one per line. The share goes through
 * `parsePercentToBasisPoints` — the app does no arithmetic on a rate, for the
 * same reason it does none on money, and `12.5 * 100` is 1250.0000000000002
 * before anybody rounds it.
 */
export async function setStages(_previous: ActionState, form: FormData): Promise<ActionState> {
  const projectId = text(form, 'projectId');
  if (projectId === '') return failed('A project is required.');

  const lines = text(form, 'stages')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

  const stages: { name: string; trigger: string; shareBp: number }[] = [];
  for (const [index, line] of lines.entries()) {
    const parts = line.split('|').map((p) => p.trim());
    const name = parts[0] ?? '';
    const share = parts[1] ?? '';
    if (name === '' || share === '') {
      return failed(`Line ${String(index + 1)} needs a name and a share, separated by a bar.`);
    }
    let shareBp: number;
    try {
      shareBp = parsePercentToBasisPoints(share, `line ${String(index + 1)}`);
    } catch {
      return failed(`Line ${String(index + 1)}: "${share}" is not a percentage.`);
    }
    if (shareBp < 1 || shareBp > 10_000) {
      return failed(`Line ${String(index + 1)}: a share is between 0.01% and 100%.`);
    }
    stages.push({ name, shareBp, trigger: parts[2] ?? '' });
  }

  const result = await load(await apiAsCaller(), API_ROUTES.setAgreementStages, {
    params: { projectId },
    body: { stages },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/commercials`);
  const total = stages.reduce((sum, s) => sum + s.shareBp, 0);
  return succeeded(
    total === 10_000
      ? 'Saved. The stages come to 100%, so the agreement can be signed.'
      : `Saved. They come to ${formatBasisPoints(total)} — signing is refused until they come to 100%.`,
  );
}

export async function setStatus(_previous: ActionState, form: FormData): Promise<ActionState> {
  const projectId = text(form, 'projectId');
  const status = text(form, 'status');
  if (projectId === '') return failed('A project is required.');
  if (status !== 'issued' && status !== 'signed') return failed('Say where it has got to.');

  const signedOn = text(form, 'signedOn');
  const result = await load(await apiAsCaller(), API_ROUTES.setAgreementStatus, {
    params: { projectId },
    body: { status, signedOn: signedOn === '' ? null : signedOn },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}/commercials`);
  return succeeded(
    status === 'signed' ? 'Recorded as signed. The schedule is fixed now.' : 'Recorded as issued.',
  );
}

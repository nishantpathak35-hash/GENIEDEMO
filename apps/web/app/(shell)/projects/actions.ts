'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES, projectState } from '@cog/contracts';
import { MoneyInputError, parseRupeesToWire } from '@cog/money';
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
import { projectStateLabel } from './vocabulary';

/**
 * Creating a project.
 *
 * The contract value is typed in rupees and converted by `parseRupeesToWire` —
 * a string decimal shift in `packages/money`, not `value * 100` in a browser.
 * `1234.56` through a float is `123455.99999999999`, and the rounding that
 * hides it works for some values and not others.
 *
 * The id is issued by the server and never supplied.
 */
export async function createProject(_previous: ActionState, form: FormData): Promise<ActionState> {
  const code = text(form, 'code');
  const name = text(form, 'name');
  const clientName = text(form, 'clientName');
  if (code.length === 0 || name.length === 0 || clientName.length === 0) {
    return failed('Code, name and client are all required.');
  }

  const typedValue = optionalText(form, 'originalValue');
  let originalValue: string | null = null;
  try {
    if (typedValue !== undefined) originalValue = parseRupeesToWire(typedValue, 'Contract value');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.createProject, {
    body: { code, name, clientName, originalValue },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/projects');
  revalidatePath('/');
  return succeeded(`${result.data.code} created.`);
}

/**
 * Move a project to its next state.
 *
 * The button that calls this is one the server offered (`project.moves`), so
 * the ordinary path never sees a refusal; the server still holds the rule and
 * refuses a stale button with CONFLICT, which is what the message reports.
 */
export async function moveProject(
  projectId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const state = projectState.safeParse(text(form, 'state'));
  if (!state.success) return failed('That is not a state a project can be moved to.');

  const result = await load(await apiAsCaller(), API_ROUTES.setProjectState, {
    params: { projectId },
    body: { state: state.data },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/projects');
  revalidatePath('/');
  return succeeded(`${result.data.code} is now ${projectStateLabel(result.data.state).toLowerCase()}.`);
}

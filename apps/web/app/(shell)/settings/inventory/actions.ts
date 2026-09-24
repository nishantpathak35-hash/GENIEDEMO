'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../lib/api';
import { failed, load, messageFor, succeeded, text, type ActionState } from '@cog/design-system';

/** Register a store or a site store. The server refuses a name already used. */
export async function createStockLocation(_previous: ActionState, form: FormData): Promise<ActionState> {
  const name = text(form, 'name');
  if (name.length === 0) return failed('A location needs a name.');
  const kind = text(form, 'kind') === 'site' ? 'site' : 'store';
  const projectId = text(form, 'projectId');
  const result = await load(await apiAsCaller(), API_ROUTES.createStockLocation, {
    body: { name, kind, ...(kind === 'site' && projectId !== '' ? { projectId } : {}) },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));
  revalidatePath('/settings/inventory');
  return succeeded(`${name} registered.`);
}

export async function retireStockLocation(locationId: string): Promise<void> {
  await load(await apiAsCaller(), API_ROUTES.retireStockLocation, { params: { locationId } });
  revalidatePath('/settings/inventory');
}

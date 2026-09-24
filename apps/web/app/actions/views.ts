'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { API_ROUTES } from '@cog/contracts';
import { load } from '@cog/design-system';
import { apiAsCaller } from '../../lib/api';

/**
 * Saved views (`docs/design/07-buying.html`, the saved views under the
 * title): the firm's and yours, each with its criteria and columns. A view
 * is saved with the filters the address carries at that moment — the form
 * posts them as hidden fields — so what is saved is exactly what the person
 * was looking at. The server refuses a firm-wide view to a role without the
 * settings permission; the form only offers what the server will take.
 */
export async function saveView(form: FormData): Promise<void> {
  const listKey = String(form.get('list') ?? '');
  const base = String(form.get('base') ?? '/');
  const name = String(form.get('name') ?? '').trim();
  const shared = form.get('shared') === 'on';
  const criteria: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (k.startsWith('criteria.') && typeof v === 'string' && v !== '') criteria[k.slice('criteria.'.length)] = v;
  }
  const columnsText = String(form.get('columns') ?? '');
  const columns = columnsText === '' ? null : columnsText.split(',').filter((c) => c !== '');
  if (name === '' || listKey === '') return;
  const made = await load(await apiAsCaller(), API_ROUTES.createSavedView, {
    body: { listKey, name, shared, criteria, columns },
  });
  revalidatePath(base);
  if (made.kind === 'ok') redirect(`${base}?view=${made.data.id}`);
}

export async function removeView(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '');
  const base = String(form.get('base') ?? '/');
  if (id === '') return;
  await load(await apiAsCaller(), API_ROUTES.deleteSavedView, { params: { viewId: id } });
  revalidatePath(base);
  redirect(base);
}

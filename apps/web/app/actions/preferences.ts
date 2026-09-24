'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES, type UpdatePreferencesInput } from '@cog/contracts';
import { load } from '@cog/design-system';
import { apiAsCaller } from '../../lib/api';

/**
 * A person's preferences are written here and nowhere else: one write per
 * change, to the server, never to the browser (COMPONENT-MAP §6). Each action
 * sends only the key that changed; the server merges it into the document
 * and every later request reads the whole. A failed write is not an error a
 * screen shows — the fold simply does not stick, and the next request draws
 * what the server holds.
 */
async function write(change: UpdatePreferencesInput): Promise<void> {
  await load(await apiAsCaller(), API_ROUTES.updatePreferences, { body: change });
}

/** The sections this person opened and left open; the collapse is kept as it was. */
export async function rememberOpen(open: readonly string[], collapsed: boolean): Promise<void> {
  await write({ sidebar: { collapsed, open: [...open] } });
}

/** The sidebar collapsed to its rail, or open. The sections are kept as they were. */
export async function rememberCollapse(collapsed: boolean, open: readonly string[]): Promise<void> {
  await write({ sidebar: { collapsed, open: [...open] } });
  revalidatePath('/', 'layout');
}

/** The project opened last, for the switcher's Recent when the trail is empty. */
export async function rememberProject(projectId: string | null): Promise<void> {
  await write({ lastProjectId: projectId });
}

/** WCAG 2.1.4: single-key shortcuts on or off. */
export async function setSingleKeyShortcuts(on: boolean): Promise<void> {
  await write({ singleKeyShortcuts: on });
  revalidatePath('/', 'layout');
}

/** The column choice on one list, or its default when `columns` is null. */
export async function rememberColumns(listKey: string, columns: readonly string[] | null, path: string): Promise<void> {
  const current = await load(await apiAsCaller(), API_ROUTES.preferences, {});
  const all: Record<string, string[]> = current.kind === 'ok' ? { ...current.data.columns } : {};
  if (columns === null) delete all[listKey];
  else all[listKey] = [...columns];
  await write({ columns: all });
  revalidatePath(path);
}

/** A starred view or report, on or off. */
export async function star(kind: 'view' | 'report', id: string, on: boolean, path: string): Promise<void> {
  const current = await load(await apiAsCaller(), API_ROUTES.preferences, {});
  if (current.kind !== 'ok') return;
  const key = kind === 'view' ? 'starredViews' : 'starredReports';
  const have = current.data[key].filter((x) => x !== id);
  await write({ [key]: on ? [...have, id] : have });
  revalidatePath(path);
}

/**
 * The column control's own action, bound to the list's base address: the
 * form posts the list key and the columns ticked, or `reset` for the default.
 */
export async function chooseColumns(base: string, form: FormData): Promise<void> {
  const listKey = String(form.get('list') ?? '');
  if (listKey === '') return;
  const reset = form.get('reset') === '1';
  const columns = form.getAll('column').map(String);
  await rememberColumns(listKey, reset ? null : columns, base);
}

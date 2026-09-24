import { cache } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { load, relabel, termsFor, type Column, type Terms } from '@cog/design-system';
import { apiAsCaller } from './api';

/**
 * The firm's words — Settings › Terminology — once per request. React's
 * `cache` dedupes the shell layout's read and every page's within one render,
 * so a screen that prints *Suppliers* in its sidebar, its title and its column
 * made one call for the word. A failed read is the pairs' first words: a
 * screen with the default word beats one with none.
 */
export const terms = cache(async (): Promise<Terms> => {
  const client = await apiAsCaller();
  const read = await load(client, API_ROUTES.terminology, {});
  return termsFor(read.kind === 'ok' ? read.data : null);
});

/** A list's columns in the firm's words. */
export function columnsIn(columns: readonly Column[], t: Terms): Column[] {
  return columns.map((c) => ({ ...c, label: relabel(c.label, t) }));
}

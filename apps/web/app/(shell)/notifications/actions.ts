'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../lib/api';
import { load } from '@cog/design-system';

/**
 * Read state, the caller's only. Both routes scope to the signed-in person on
 * the server, so these send no recipient — there is none to send.
 */
export async function markNotificationRead(id: string): Promise<void> {
  await load(await apiAsCaller(), API_ROUTES.markNotificationRead, { params: { id } });
  revalidatePath('/', 'layout');
}

export async function markAllNotificationsRead(): Promise<void> {
  await load(await apiAsCaller(), API_ROUTES.markAllNotificationsRead, {});
  revalidatePath('/', 'layout');
}

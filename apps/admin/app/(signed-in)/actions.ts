'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
import {
  failed,
  load,
  messageFor,
  succeeded,
  text,
  type ActionState,
} from '@cog/design-system';
import { apiAsCaller } from '../../lib/api';

/**
 * Creating an organisation.
 *
 * **This replaces `seed.mjs`**, which does the same five things by hand as the
 * migration role: a tenant row inside a tenant context, a first principal, the
 * lookup that makes them resolvable, a slug and an app origin. M6's done-when
 * is that onboarding is self-service with no SQL run by hand, and the reason
 * the script is not simply kept is stated there: if a development script and
 * the product provision differently, the one exercised daily stays correct, and
 * it is not the product's.
 *
 * A duplicate slug and a re-used administrator come back as the same refusal,
 * deliberately: a form that distinguishes them says whether an address is
 * already a user of this product somewhere.
 */
export async function provisionTenant(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const slug = text(form, 'slug').toLowerCase();
  const legalName = text(form, 'legalName');
  const appOrigin = text(form, 'appOrigin');
  const adminEmail = text(form, 'adminEmail');
  const adminExternalId = text(form, 'adminExternalId');

  if (
    slug.length === 0 ||
    legalName.length === 0 ||
    appOrigin.length === 0 ||
    adminEmail.length === 0 ||
    adminExternalId.length === 0
  ) {
    return failed('Every field is required. An organisation with no administrator has nobody who can sign in.');
  }

  const result = await load(await apiAsCaller(), API_ROUTES.provisionTenant, {
    body: { slug, legalName, appOrigin, adminEmail, adminExternalId },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/');
  return succeeded(
    `${result.data.slug} created, with ${adminEmail} as its first administrator. ` +
      'They can sign in now.',
  );
}

/** Set or clear an organisation's plan label. The platform principal is checked by the database. */
export async function setTenantPlan(_previous: ActionState, form: FormData): Promise<ActionState> {
  const tenantId = text(form, 'tenantId');
  if (tenantId.length === 0) return failed('Choose an organisation.');
  const plan = text(form, 'plan');
  const result = await load(await apiAsCaller(), API_ROUTES.setTenantPlan, {
    params: { tenantId },
    body: { plan: plan === '' ? null : plan },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));
  revalidatePath('/');
  return succeeded(plan === '' ? 'Plan cleared.' : `Plan set to ${plan}.`);
}

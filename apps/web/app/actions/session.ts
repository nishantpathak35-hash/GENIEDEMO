'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { API_ROUTES } from '@cog/contracts';
import { api } from '../../lib/api';
import { CREDENTIAL_COOKIE, CREDENTIAL_COOKIE_OPTIONS } from '../../lib/session';

/**
 * Signing in, without the app deciding anything.
 *
 * The credential is sent to `GET /purchase-orders/whoami` and the cookie is set
 * **only if the server resolved a principal from it**. So the app never decides
 * who anyone is; it asks, and stores what came back only when the answer was
 * yes. `identity.resolve_principal` is the only thing that maps a credential to
 * a tenant, and it is a SECURITY DEFINER function the runtime role has no grant
 * on.
 *
 * The failure message is deliberately the same for an unknown credential and a
 * disabled one — a sign-in form that distinguishes them is an account
 * enumeration oracle.
 */

export interface SignInState {
  readonly error: string | null;
}

export async function signIn(_previous: SignInState, form: FormData): Promise<SignInState> {
  const credential = String(form.get('credential') ?? '').trim();
  if (credential.length === 0) return { error: 'Enter your credential.' };
  // the address the person was sent to sign in from (`proxy.ts`): a path on
  // this origin and nothing else, or Today — a `next` that names another
  // site would make this form an open redirect
  const next = String(form.get('next') ?? '');
  const back = /^\/(?!\/)[^\s]*$/.test(next) ? next : '/';

  const result = await api({ credential })
    .call(API_ROUTES.whoami, {})
    .catch(() => null);

  if (result === null) {
    return { error: 'The API is not reachable. Nothing was signed in.' };
  }
  if (!result.ok) {
    return { error: 'That credential does not resolve to an account here.' };
  }

  const store = await cookies();
  store.set(CREDENTIAL_COOKIE, credential, CREDENTIAL_COOKIE_OPTIONS);
  redirect(back);
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(CREDENTIAL_COOKIE);
  redirect('/sign-in');
}

'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { API_ROUTES } from '@cog/contracts';
import { api } from '../../lib/api';
import { CREDENTIAL_COOKIE, CREDENTIAL_COOKIE_OPTIONS } from '../../lib/session';

export interface SignInState {
  readonly error: string | null;
}

/**
 * Sign in, without this app deciding anything.
 *
 * The credential is offered to **vendorPortalOrders** — the surface this app
 * actually uses — so a credential that resolves but is not entitled here is
 * rejected at sign-in rather than accepted and then refused on every screen.
 *
 * The failure message is the same for an unknown credential and one of the
 * wrong kind: a sign-in form that distinguishes them is an enumeration oracle.
 */
export async function signIn(_previous: SignInState, form: FormData): Promise<SignInState> {
  const credential = String(form.get('credential') ?? '').trim();
  if (credential.length === 0) return { error: 'Enter your credential.' };

  const result = await api({ credential })
    .call(API_ROUTES.vendorPortalOrders, {})
    .catch(() => null);

  if (result === null) {
    return { error: 'The API is not reachable. Nothing was signed in.' };
  }
  if (!result.ok) {
    return { error: 'That credential does not open this portal.' };
  }

  const store = await cookies();
  store.set(CREDENTIAL_COOKIE, credential, CREDENTIAL_COOKIE_OPTIONS);
  redirect('/');
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(CREDENTIAL_COOKIE);
  redirect('/sign-in');
}

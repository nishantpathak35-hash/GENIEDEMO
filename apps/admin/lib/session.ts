import { cookies } from 'next/headers';

/**
 * The caller's credential, and nothing else.
 *
 * **A different cookie name from every other app**, and that is the point of
 * shipping four deployables rather than one with a role switch: a staff session
 * and a platform session cannot be the same browser session, so a
 * platform cannot arrive at the staff application already authenticated,
 * and a stolen cookie is scoped to one surface.
 *
 * This app never decides who anyone is. It forwards an opaque credential, and
 * `identity.resolve_principal` — a SECURITY DEFINER function the runtime role
 * has no grant on — is the only thing that maps it to a tenant and a principal.
 * The server then refuses it on any surface it does not belong to.
 */

export const CREDENTIAL_COOKIE = 'cog_admin_credential';

export const CREDENTIAL_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 8,
} as const;

export async function currentCredential(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(CREDENTIAL_COOKIE)?.value;
  return value === undefined || value.length === 0 ? null : value;
}

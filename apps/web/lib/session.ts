import { cookies } from 'next/headers';

/**
 * The caller's credential, and nothing else.
 *
 * **This app never decides who anyone is.** It holds an opaque credential in an
 * httpOnly cookie and forwards it; `identity.resolve_principal` — a SECURITY
 * DEFINER function the runtime role has no grant on — is the only thing that
 * maps it to a tenant and a principal. So a forged cookie authenticates as
 * nobody rather than as somebody else, and every tenant-scoped route answers
 * `TENANT_NOT_RESOLVED`.
 *
 * The legacy derives roles in the browser — `isSuperAdmin(user?.email)` at
 * `POsView.js:136` — which means the client decides what the client may do.
 * There is deliberately no equivalent here: this module exposes a credential,
 * never a role, and nothing in `apps/` reads a role off it.
 *
 * `httpOnly` is what stops a script reading it, `sameSite: 'lax'` is what stops
 * another origin sending it, and `secure` outside development is what stops it
 * crossing the network in the clear.
 */

export const CREDENTIAL_COOKIE = 'cog_credential';

export const CREDENTIAL_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  // Eight hours. A working day, and no longer: the development credential is a
  // bearer token with no expiry of its own, so the cookie's lifetime is the
  // only bound on it.
  maxAge: 60 * 60 * 8,
} as const;

/** The credential this request carries, or `null` when there is none. */
export async function currentCredential(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(CREDENTIAL_COOKIE)?.value;
  return value === undefined || value.length === 0 ? null : value;
}

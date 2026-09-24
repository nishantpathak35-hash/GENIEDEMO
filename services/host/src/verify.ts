import { assertNotProduction } from '@cog/identity';

/**
 * Choosing how a credential is verified.
 *
 * **Selected by configuration, never by fallback.** `AUTH_PROVIDER` must name a
 * provider explicitly; an unset or unrecognised value yields a verifier that
 * resolves nobody, so every tenant-scoped route answers `TENANT_NOT_RESOLVED`.
 *
 * That is the opposite of the legacy shape and deliberately so: `db.js` falls
 * back to a local SQLite file when Turso credentials are absent and mints an
 * in-memory JWT secret when none is set, so a misconfigured production looks
 * healthy. Here a misconfiguration refuses every request, loudly, which is the
 * only safe direction for an authentication decision to fail in.
 */

export type Verify = (request: Request) => Promise<{ externalId: string } | null>;

/** Resolves nobody. The default, and the correct state when auth is unconfigured. */
export const verifyNobody: Verify = async () => null;

/**
 * Development verifier: the bearer token IS the seeded user's email.
 *
 * Acceptable only because it cannot run in production — `assertNotProduction`
 * throws at construction rather than at first request, so a misconfigured
 * deployment fails to boot instead of serving.
 *
 * Note what it does *not* do: it does not decide which tenant the caller
 * belongs to. It returns an external id and nothing else, and
 * `identity.resolve_principal` — a SECURITY DEFINER function reading a table
 * `app_runtime` has no grant on — is the only thing that maps that to a tenant.
 * So an unseeded address authenticates as nobody rather than as a new tenant.
 */
export function verifyLocalBearer(nodeEnv: string | undefined): Verify {
  assertNotProduction(nodeEnv);
  return async (request: Request) => {
    const header = request.headers.get('authorization');
    if (header === null) return null;
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    const token = match?.[1]?.trim();
    if (token === undefined || token.length === 0) return null;
    return { externalId: token };
  };
}

export function chooseVerify(env: NodeJS.ProcessEnv): Verify {
  switch (env['AUTH_PROVIDER']) {
    case 'local':
      return verifyLocalBearer(env['NODE_ENV']);
    case 'workos':
      // The adapter is written and typed but cold — there is no WorkOS account
      // (M1/D6). Refusing is correct: a provider that cannot verify must not
      // pretend to, and returning `verifyNobody` here would look configured.
      throw new Error('AUTH_PROVIDER=workos is not wired yet; no account exists (M1/D6)');
    default:
      return verifyNobody;
  }
}

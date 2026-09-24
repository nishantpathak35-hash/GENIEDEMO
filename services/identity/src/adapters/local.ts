import type { IdentityProvider, ProviderIdentity } from '../domain/ports.js';

/**
 * The development identity provider.
 *
 * Exists so `docker compose up` from a clean clone gives a working stack
 * without a WorkOS account, API keys or network egress — and so the isolation
 * suite stays hermetic. It is selected by configuration, never by a fallback:
 * a provider that silently degrades to "local" in production is an
 * authentication bypass.
 */
export class LocalIdentityProvider implements IdentityProvider {
  readonly name = 'local' as const;

  constructor(private readonly users: readonly ProviderIdentity[]) {}

  /**
   * The "credential" is simply a seeded user's email. That is acceptable
   * precisely because this adapter must never run outside development, which
   * `assertNotProduction` below makes explicit rather than assumed.
   */
  async verify(credential: string): Promise<ProviderIdentity | null> {
    return this.users.find((u) => u.email === credential) ?? null;
  }
}

/**
 * Refuse to construct a development provider in a production environment.
 *
 * The legacy app has the shape this guards against: `db.js` silently falls back
 * to a local SQLite file when Turso credentials are absent, and generates an
 * in-memory JWT secret when none is set. Both are conveniences that make a
 * misconfigured production look healthy.
 */
export function assertNotProduction(env: string | undefined): void {
  if (env === 'production') {
    throw new Error('the local identity provider must never be used in production');
  }
}

import type { IdentityProvider, ProviderIdentity } from '../domain/ports.js';

/**
 * The WorkOS adapter — typed and wired, deliberately cold.
 *
 * There is no WorkOS account as of M1, so this is written against the port and
 * exercised by its own tests, but nothing in `docker compose` selects it. That
 * is the correct M1 state: the alternative is either blocking the milestone on
 * a vendor signup, or letting the local adapter become the de facto production
 * path.
 *
 * ADR-0005 records the requirement this satisfies — organisations as a
 * first-class concept, SAML/OIDC SSO, SCIM on the enterprise tier — and the
 * documented conflict it carries: no major managed identity provider hosts in
 * India, so identity data sits outside the region ADR-0003 pins everything else
 * to. DPDP 2023 permits that transfer; it must be disclosed rather than
 * discovered on a security questionnaire.
 */
export interface WorkOsClient {
  authenticateWithCode(input: { code: string }): Promise<{
    user: { id: string; email: string };
    organizationId: string | null;
  }>;
}

export class WorkOsIdentityProvider implements IdentityProvider {
  readonly name = 'workos' as const;

  constructor(private readonly client: WorkOsClient) {}

  async verify(credential: string): Promise<ProviderIdentity | null> {
    const result = await this.client.authenticateWithCode({ code: credential });

    // No organisation means no tenant. Refuse rather than guess: a user without
    // an organisation is not "the first tenant", it is a misconfiguration, and
    // inventing a mapping here would attach a real person to arbitrary data.
    if (result.organizationId === null) return null;

    return {
      externalId: result.user.id,
      email: result.user.email,
      externalOrgId: result.organizationId,
    };
  }
}

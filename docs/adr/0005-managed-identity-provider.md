# ADR-0005: Managed identity provider, replacing hand-rolled auth

- **Status:** Accepted · re-drafted 2026-09-03 (originally decided 2026-08-16)
- **Deciders:** Product owner

## Context

Authentication is currently hand-rolled: bcrypt password hashes, a `sessions`
table, and AES-256-GCM session tokens with HKDF key derivation in
`app/lib/api/token.js`. There are three distinct principal types — internal
staff, vendors, and clients — each with its own login path.

B2B buyers of an ERP will ask for SSO (SAML/OIDC) and, above a certain size,
SCIM provisioning. Both are substantial products in their own right.

## Decision

Move authentication to a **managed identity provider** with first-class support
for B2B organisations. `svc-identity` owns the mapping from provider identities
to application principals and roles; it does not own credentials.

The specific vendor is not fixed by this ADR. The requirement is: organisations
as a first-class concept, SAML/OIDC SSO, SCIM on the enterprise tier, and a
data-residency story compatible with ADR-0003.

## Consequences

- Password storage, reset flows, session rotation, MFA, brute-force protection
  and breach monitoring stop being our code to maintain and our liability.
- SSO and SCIM become configuration rather than a quarter of engineering work
  when the first enterprise buyer asks.
- A hard external dependency in the login path. Availability and pricing become
  procurement concerns.
- Vendor and client principals are external, untrusted, and lower-volume than
  staff — they may warrant a separate connection or tier.
- Migration: existing bcrypt hashes must be imported or users must reset. The
  legacy token code does not port.

## Alternatives considered

**Keep the hand-rolled implementation.** Rejected: it works today, but SSO,
SCIM, MFA and the security questionnaire that accompanies every enterprise deal
are each larger than the current auth code in total.

**Self-hosted open-source IdP (Keycloak, Zitadel, Better Auth).** Cheaper at
scale and keeps data in our region. Rejected for v1: it replaces "write auth"
with "operate auth," which is not obviously less work for one person.

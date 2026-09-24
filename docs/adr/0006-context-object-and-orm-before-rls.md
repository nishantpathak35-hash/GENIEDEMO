# ADR-0006: Tenant context object and ORM before RLS policies

- **Status:** Accepted · re-drafted 2026-09-03 (originally decided 2026-08-16)
- **Deciders:** Product owner

## Context

ADR-0002 chose Postgres RLS as the tenant-isolation backstop. RLS depends on the
database session knowing which tenant is active, via a session variable set per
request. That requires a disciplined path from "incoming request" to "database
connection" — which the legacy code does not have. It calls
`queryAll`/`queryGet`/`queryRun` ad hoc from anywhere.

Turning on RLS first, against that call pattern, would produce silent empty
result sets that are extremely hard to debug.

## Decision

Build in this order:

1. **Tenant context object** — resolved once per request from the authenticated
   principal, carried explicitly, never read from a global or an ambient store.
2. **ORM / query layer** — every query goes through one place that takes the
   context and applies the tenant scope. Drizzle, chosen over Prisma
   specifically because RLS requires `SET LOCAL` on the session and Drizzle
   gives direct control over connection and transaction lifecycle.
3. **RLS policies** — enabled last, as the backstop that catches what the
   application layer misses.

## Consequences

- Isolation is testable at the application layer before the database enforces
  it, and integration tests can assert that tenant A cannot read tenant B.
- When RLS is switched on it should change no behaviour. If it does, that is a
  bug the application layer was hiding — which is exactly the signal wanted.
- A single choke point for every query also gives audit logging, soft deletes
  and query timing for free.
- Cost: no isolation guarantee at all until step 3 lands. Steps 1 and 2 must not
  be treated as sufficient.

## Alternatives considered

**RLS first, application scoping later.** Safer in principle. Rejected: against
the legacy call pattern it produces empty results with no error, and there is no
test harness yet to distinguish "correctly filtered" from "broken."

**Application scoping only, no RLS.** Rejected by ADR-0002 — no defence in depth.

# ADR-0002: Postgres with row-level security, replacing libsql/Turso

- **Status:** Accepted · re-drafted 2026-09-03 (originally decided 2026-08-16)
- **Deciders:** Product owner

## Context

The application uses `@libsql/client` against Turso in cloud mode and a local
SQLite file in development. Under ADR-0001 the database must enforce isolation
between customer companies.

SQLite — and therefore libsql — has **no row-level security**. Isolation could
only ever be enforced in application code, where a single missing `WHERE
tenant_id = ?` leaks one customer's financial data to another.

## Decision

Move to **PostgreSQL** and use **row-level security policies** as the isolation
backstop.

## Consequences

- Tenant isolation becomes a database guarantee, not a code-review guarantee.
- Requires connection-level tenant context (`SET LOCAL`) on every request — see
  ADR-0006.
- Unlocks what an ERP actually needs: real concurrency, proper transactions,
  `NUMERIC` for money instead of float, window functions for reporting,
  JSONB for the semi-structured DPR/WPR payloads.
- Migration cost: the existing SQLite schema and all runtime
  `CREATE TABLE IF NOT EXISTS` statements are replaced by versioned SQL
  migrations. This is not a port; it is a rewrite of the persistence layer.
- Hosting is constrained by data residency — see ADR-0003.

## Alternatives considered

**Stay on Turso, enforce isolation in application code.** Rejected: no
defence-in-depth. One forgotten filter in one query is a cross-tenant breach,
and there is no second line of defence to catch it.

**Database-per-tenant on SQLite/Turso.** Genuinely isolated, and Turso supports
it. Rejected: cross-tenant reporting becomes impossible, schema migrations must
fan out across N databases, and the per-tenant operational cost recreates the
problem ADR-0001 rejected.

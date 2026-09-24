# ADR-0008: Seventeen repositories, organised by business domain

- **Status:** Accepted
- **Date:** 2026-09-03
- **Deciders:** Product owner

## Context

The legacy system is a single Next.js application: one `/api/rpc` endpoint
guarded by a hand-maintained 60-name string allowlist, ~51 tables with no
ownership boundaries, business rules inside React components, and a half-finished
TypeScript refactor (33 `.ts` files) sitting alongside 225 `.js` files.

The product is to be managed the way an established engineering organisation
would manage it, with the deliverable being multiple repositories in one
workspace folder.

Two organising principles were considered: split by **technical function**
(frontend / backend / QA / infra) or split by **business domain** with
cross-functional ownership.

## Decision

**Seventeen repositories, named and bounded by business domain**, grouped on
disk into `frontend/`, `backend/`, `platform/`, `integrations/` and
`foundation/` folders.

Full map in [`../TOPOLOGY.md`](../TOPOLOGY.md).

## Consequences

- Repo names describe what the business does, not who works on them. A future
  hire owns "finance" — TDS, GST, Tally, client billing — rather than "half of
  the backend repo."
- The folder grouping still gives a clean frontend/backend staffing split, so
  the boundaries do not fight the intended hiring model.
- `platform-contracts` becomes load-bearing. Without one versioned source of
  truth for every interface, seventeen repos drift and the tangle reassembles
  itself across seventeen directories instead of one.
- Real cost for a solo team: seventeen CI pipelines, seventeen dependency
  streams, and cross-cutting changes that become two or three coordinated PRs
  with a version bump between them. Mitigated by starting most repos as thin
  scaffolds and filling them in as the rebuild reaches them.
- Boundaries are cheap to create now and expensive to introduce later. That
  asymmetry is the whole argument.

## Alternatives considered

**Split by technical function** (`frontend`, `backend`, `mobile`, `infra`).
The standard model in enterprise IT and at the large Indian systems integrators.
Rejected on Conway's Law grounds: organisations produce systems that mirror
their communication structure, so the strongest boundary becomes the HTTP line
between frontend and backend while everything behind it stays undifferentiated.
That is precisely the legacy system — a crisp frontend/backend seam and 51
tables with no internal boundaries at all. Choosing it again would reproduce the
same outcome.

**Monorepo with enforced module boundaries.** What several large product
companies actually run, and cheaper to operate. Rejected because the requirement
was explicitly multiple repositories in one folder.

**Four or five repos split by layer** (`contracts`, `db`, `web`, `infra`).
Proposed and rejected during design: it is a solo-developer layer split, not an
ownership structure, and it gives no domain boundaries at all.

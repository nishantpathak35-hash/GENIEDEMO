# ADR-0011: TypeScript in the request path; polyglot only at worker seams

- **Status:** Accepted
- **Date:** 2026-09-03

## Context

The legacy app is 201 `.js` files and 29 `.ts` files, with TypeScript
effectively disabled by `typescript: { ignoreBuildErrors: true }`. Before
committing to a rebuild, Java/Spring Boot and Python/Django were evaluated as
backend alternatives, and the question was pressed repeatedly: is TypeScript a
serious choice for statutory calculation, APIs, security and scale?

Both alternatives have a real case.

**Java/Spring:** `BigDecimal` as the idiom, so the float defect recorded in
ADR-0012 is much less likely to be written; mature transactions and batch;
JasperReports; and the deepest, cheapest backend hiring pool in India.

**Python/Django:** Django admin would deliver most of `apps/admin` almost free;
`Decimal` built in; mature `django-tenants`; better libraries for the
Excel/PDF work; and the natural home for future document intelligence.

## Decision

**TypeScript in the request path** — `apps/*` and `services/*`.

**Polyglot is permitted only at asynchronous worker seams**, where the contract
is a queue message rather than a compiled type import:

- **Typst** for document rendering — adopted now (ADR-0013)
- **Bun `--compile`** for `tally-connector` — a single binary for a customer's
  Windows machine (ADR-0015)
- **Python** for a document-intelligence worker — deferred until the capability
  is real
- **SQL** for analytics and rollups — not pandas

## Consequences

- **The decisive reason is semantic loss during the port.** The business rules —
  TDS slabs, GST splits, the CPWD 4-factor formula, `approved_amount ??
  amount_requested` precedence, the stage-string state machine — exist only in
  those 201 `.js` files and in no document. JS→TS lifts them mechanically and
  `strict` then surfaces the holes. A cross-language rewrite re-derives every
  rule by hand, which is how a rule disappears silently and is discovered when a
  customer's TDS is wrong.
- One language gives compile-time safety across the API boundary. Polyglot
  replaces that with OpenAPI codegen, which drifts silently.
- The migration is **already begun**: `app/lib/api/payments/write.js` imports
  `PaymentService` from `src/modules/payments/services/PaymentService.ts`. A
  language change discards that.
- Node is single-threaded per process, so CPU-bound work must go to a worker.
  That constraint shapes the document and reconciliation design regardless.
- npm's supply chain is the weakest of the major ecosystems. Mitigations are
  mandatory, not optional — see ADR-0015.

**Django admin was specifically rejected** because it means a Python service
reaching into Postgres beside the TypeScript services, duplicating the model
layer or sharing tables across languages, which breaks "each service owns its
tables". The weeks saved are spent on that seam.

## The point that outranks this decision

Every defect measured in the legacy app — 3% validation coverage, no tenancy,
TypeScript switched off, tax math in the browser, money as floats, no tests — is
architectural or disciplinary. **Rewriting in Java with the same habits produces
the same system with more ceremony.** The stack was never what went wrong.

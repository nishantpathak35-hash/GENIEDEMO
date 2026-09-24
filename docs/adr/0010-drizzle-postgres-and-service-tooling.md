# ADR-0010: Drizzle, Hono, pg-boss and the service toolchain

- **Status:** Accepted
- **Date:** 2026-09-03

## Context

ADR-0002 chose Postgres with RLS; ADR-0006 fixed the order as tenant context,
then ORM, then policies. The concrete tooling was left open.

The legacy app has 611 `queryAll`/`queryGet`/`queryRun` call sites across 51
files, a hand-rolled migration array alongside runtime `CREATE TABLE IF NOT
EXISTS`, 217+ RPC methods behind a string allowlist with 7 Zod schemas, and no
job queue or test framework at all.

## Decision

| Concern | Choice |
|---|---|
| ORM | **Drizzle** + **drizzle-kit** |
| HTTP | **Hono** |
| Validation | **Zod v4**, in `packages/contracts` |
| Jobs | **pg-boss** |
| Logging | **pino** |
| Tracing | **OpenTelemetry** |
| Tests | **Vitest**, **Playwright**, **fast-check**, **Testcontainers** |

## Consequences

- **Drizzle over Prisma** because RLS requires `SET LOCAL` on the session, and
  Drizzle gives direct control over connection and transaction lifecycle. Prisma
  abstracts exactly the thing that must not be abstracted here.
- **Hono** keeps the HTTP layer thin, which suits a design where services are
  libraries composed into one API host (see OPEN-DECISIONS #2). Standards-based
  Request/Response means the host can move without rewriting handlers.
- **pg-boss over BullMQ** removes Redis entirely. One less container in compose,
  one less managed service in production, one less thing to back up — and jobs
  become transactional with the data they act on. The trade is throughput, which
  is irrelevant at this scale.
- **Testcontainers** means integration and isolation tests run against real
  Postgres with real policies. Isolation cannot be proven against a mock.
- All 611 legacy call sites collapse into a single tenant-scoped query layer.
  That layer is also where audit logging and query timing attach for free.

## Alternatives considered

**Prisma** — better DX, larger ecosystem. Rejected: awkward with `SET LOCAL` and
connection pooling, which is the load-bearing mechanism for tenant isolation.

**BullMQ + Redis** — more capable queue. Rejected: adds infrastructure for
throughput this product will not need, and loses transactional enqueue.

**Express/Fastify** — Fastify was close. Hono chosen for a smaller surface and
runtime portability; nothing in the design depends on the difference.

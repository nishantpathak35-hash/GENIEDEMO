# services/host

> The composition root. The seven services, composed into one deployable.

**Package:** `@cog/api`  ·  **Tier:** Runtime  ·  **Owner:** `@construct-o-genie/backend`  ·  **Status:** boots; no services mounted yet

---

## Responsibility

Wires the seven domain services into a single Hono application, owns the HTTP
listener, and holds the process-level concerns that belong to no single service:
liveness, and later the shared middleware stack from `packages/service-kit`.

It holds **no business logic and no tables**. If a rule starts accumulating
here, it belongs in a service's `domain/`.

## Depends on

Every service, plus `packages/contracts` and `packages/service-kit`.

**This is the one package allowed to do that.** `apps` may not import services
— they are reached over HTTP — and no service may import another. The mechanism
is that `host` is deliberately absent from the `SERVICES` array in
`eslint.config.mjs`; see [`docs/plans/M1.md`](../../docs/plans/M1.md) D5.

## Why a composed monolith rather than seven deployables

Settled in OPEN-DECISIONS #2. Two reasons, in order:

1. **Tenant isolation.** One connection pool, one place that opens the
   transaction and issues `set_config('app.tenant_id', …, true)`, one place the
   isolation suite has to prove. Seven runtimes means seven pools, each
   independently capable of getting the pooling mode wrong and failing silently.
2. **Transactions.** A single PO edit in the legacy app writes purchase orders,
   line items, approval history, the audit log and the event stream, then
   cascades the PO number across three more tables. Under the target boundaries
   that spans procurement, workflow and finance. Composed, it stays one
   database transaction; split, it is a saga on day one.

Splitting a service out later is a config change, not a restructure — the
contract already exists.

## Explicitly not this package's job

No domain logic, no SQL, no migrations, no tables. Routing and composition only.

---

## Before writing code here

Read [`docs/TOPOLOGY.md`](../../docs/TOPOLOGY.md), the ADRs in
[`docs/adr/`](../../docs/adr/), and the current milestone plan in
[`docs/plans/`](../../docs/plans/).

The dependency rule is one-way, and it is enforced by
`import/no-restricted-paths` in `eslint.config.mjs` rather than by convention:

```
apps      ->  packages      never services — services are reached over HTTP
services  ->  packages      never apps, never another service
packages  ->  packages      never apps, never services
```

`services/host` is the single exception: it is the composition root, and the one
place that imports every service.

Legacy source for porting is at `_legacy/atelier-current/` (read-only
reference) — and it is an **unreliable specification**: identity is fuzzy string
matching and parts of the statutory logic are wrong. See ADR-0014 before porting
any rule. Live client data is at `_private/` and **must never enter any
repository**.

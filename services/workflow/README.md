# services/workflow

> The cross-cutting governance machinery every other service calls.

**Package:** `@cog/workflow`  ·  **Tier:** Domain service  ·  **Owner:** `@construct-o-genie/backend`  ·  **Status:** scaffold — no implementation yet

---

## Responsibility

The approval engine (procurement → finance → director) and its history, the immutable audit log, document vault and attachments, document locks and presence, the realtime event stream.

## Depends on

`packages/contracts` · `packages/service-kit`

**No other service.** Cross-domain reads go through `packages/contracts`.

## Explicitly not this package's job

Owns no business domain of its own. **Watch this package** — if it starts accumulating procurement or finance logic, that is the early warning that the old mess is re-forming.

## What ports in from the legacy app

`src/modules/core/services/ApprovalEngine.ts`, `ApprovalWorkflowService.ts`, `AuditService.ts`, `DocumentVaultView.js`, `app/api/events/route.js`, the `document_locks` heartbeat.

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

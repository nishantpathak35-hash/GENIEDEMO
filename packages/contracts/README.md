# packages/contracts

> The single source of truth for every interface in the system. The keystone.

**Package:** `@cog/contracts`  ·  **Tier:** Platform  ·  **Owner:** `@construct-o-genie/platform`  ·  **Status:** scaffold — no implementation yet

---

## Responsibility

API request/response schemas (Zod v4), event schemas, shared domain types
(`TenantContext`, the branded `Paise` and `BasisPoints` types, tax rates), error
codes, pagination, generated typed clients, and the `/connector/v1` contract.

The branded money *types* live here; the money *arithmetic* lives in
`packages/money`, which is the only module permitted to multiply or divide them
(ADR-0012).

## Depends on

Nothing. Everything depends on this; it depends on nothing.

## Explicitly not this package's job

No implementation, no I/O, no business logic. Types and schemas only.

## What ports in from the legacy app

Replaces the **217-name** string allowlist in `app/api/rpc/route.js` with
contracts the compiler enforces. Of those 217, 216 resolve — `listAuditLog` is
allowlisted but never exported, a dead 404 that a runtime allowlist cannot
notice and a type system would not have allowed.

That route is also where authorisation broke: dispatch is
`api[method](...args, session)` with arguments padded but never truncated, so an
attacker-supplied argument can bind to `session`. Typed contracts fix payload
*shape* only — they do not fix that. The rule that does is ADR-0014's:
**the server computes every monetary figure and every permission; clients
display.**

At any commit there is exactly one version of this package in play, so "which
contract version is production on?" is not a question that can exist. A breaking
change is still a deliberate migration across consumers in the same commit.

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

# apps/admin

> Construct-O-Genie back office — the console that makes this a SaaS business rather than an install.

**Package:** `@cog/admin`  ·  **Tier:** Product surface  ·  **Owner:** `@construct-o-genie/frontend`  ·  **Status:** scaffold — no implementation yet

---

## Responsibility

Tenant provisioning and onboarding, plan and subscription management, per-tenant feature flags, support impersonation with mandatory audit, cross-tenant audit search, tenant health and usage metrics.

## Depends on

`packages/contracts` (generated clients) · `packages/design-system`

**Not services.** An app never links service code — it reaches services over
HTTP through the generated client. Enforced by the `{ target: './apps', from:
'./services' }` zone in `eslint.config.mjs`.

## Explicitly not this package's job

Never a route inside a customer-facing surface. Separate deployable, separate auth, separate access list.

## What ports in from the legacy app

Nothing — net new. Without this, onboarding a company means running SQL by hand. That does not survive customer #3.

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

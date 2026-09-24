# apps/web

> Internal ERP — the application your customer's own staff uses all day.

**Package:** `@cog/web`  ·  **Tier:** Product surface  ·  **Owner:** `@construct-o-genie/frontend`  ·  **Status:** scaffold — no implementation yet

---

## Responsibility

Every internal screen: dashboard, projects, BOQ, estimation, takeoff, purchase orders, vendors, inventory, payments, approvals, reports, document vault, site ops, settings.

## Depends on

`packages/contracts` (generated clients) · `packages/design-system`

**Not services.** An app never links service code — it reaches services over
HTTP through the generated client. Enforced by the `{ target: './apps', from:
'./services' }` zone in `eslint.config.mjs`.

## Explicitly not this package's job

No business rules. TDS rates, GST splits and rate-analysis formulas live in the services. This package renders and collects input.

## What ports in from the legacy app

`_legacy/atelier-current/components/views/*` (~20 view components), `MainLayout.js`, `Sidebar.js`, `StateProvider.js`

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

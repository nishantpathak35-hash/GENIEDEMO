# services/projects

> The contract: what work was sold, at what price.

**Package:** `@cog/projects`  ·  **Tier:** Domain service  ·  **Owner:** `@construct-o-genie/backend`  ·  **Status:** scaffold — no implementation yet

---

## Responsibility

The `projects` master table, leads and CRM pipeline, BOQ schedules and items, estimation and CPWD/DSR rate analysis, takeoff sheets, change orders, GFC drawings.

## Depends on

`packages/contracts` · `packages/service-kit` · `packages/money`

**No other service.** Cross-domain reads go through `packages/contracts`.

## Explicitly not this package's job

Does not own site execution — that is `services/siteops`. Does not own billing — that is `services/finance`.

## What ports in from the legacy app

`BoqView.js` (56 KB, largest file in the codebase), `EstimationView.js`, `TakeoffView.js`, `ChangeOrdersView.js`, `CrmView.js`. **The 4-factor rate engine — material + labour + equipment, overheads %, margin %, GST — is genuine domain IP currently living inside a React component. It belongs in `domain/`.** Note: a `projects` table does not exist today; projects are keyed by name string. That defect blocks tenancy and is fixed here first.

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

# apps/vendor-portal

> External surface for vendors and subcontractors.

**Package:** `@cog/vendor-portal`  ·  **Tier:** Product surface  ·  **Owner:** `@construct-o-genie/frontend`  ·  **Status:** scaffold — no implementation yet

---

## Responsibility

PO viewing and acceptance, official PO PDF download, RA-bill and payment-request submission, TDS visibility, payment status tracking, retention ledger.

## Depends on

`packages/contracts` (generated clients) · `packages/design-system`

**Not services.** An app never links service code — it reaches services over
HTTP through the generated client. Enforced by the `{ target: './apps', from:
'./services' }` zone in `eslint.config.mjs`.

## Explicitly not this package's job

Must never reach internal financial routes. A vendor is an untrusted external party — that is the entire reason this is a separate deployable.

## What ports in from the legacy app

`_legacy/atelier-current/components/views/VendorPortalView.js`, `app/lib/poPdfGenerator.js`, the `vendor_users` auth path

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

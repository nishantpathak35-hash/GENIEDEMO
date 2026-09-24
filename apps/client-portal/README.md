# apps/client-portal

> External surface for the end client — the building owner.

**Package:** `@cog/client-portal`  ·  **Tier:** Product surface  ·  **Owner:** `@construct-o-genie/frontend`  ·  **Status:** scaffold — no implementation yet

---

## Responsibility

BOQ variation review and sign-off, live progress 360, client billing ledger (RA-01…RA-n), contract and drawing downloads.

## Depends on

`packages/contracts` (generated clients) · `packages/design-system`

**Not services.** An app never links service code — it reaches services over
HTTP through the generated client. Enforced by the `{ target: './apps', from:
'./services' }` zone in `eslint.config.mjs`.

## Explicitly not this package's job

Must never expose vendor rates or internal margins. Separate from the vendor portal because the two audiences must not share a codebase.

## What ports in from the legacy app

`_legacy/atelier-current/components/views/CustomerPortalView.js`, parts of `ClientBillingView.js`, the `client_users` auth path

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

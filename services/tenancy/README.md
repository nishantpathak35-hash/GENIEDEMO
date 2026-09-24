# services/tenancy

> Which company a user belongs to, and what that company gets. The heart of the SaaS conversion.

**Package:** `@cog/tenancy`  ·  **Tier:** Domain service  ·  **Owner:** `@construct-o-genie/backend`  ·  **Status:** scaffold — no implementation yet

---

## Responsibility

tenants, subscriptions and plans, per-tenant configuration, number series (PO numbering), global configurations, feature flags.

## Depends on

`packages/contracts` · `packages/service-kit`

**No other service.** Cross-domain reads go through `packages/contracts`.

## Explicitly not this package's job

Does not own users. Owns the *relationship* between a user and a tenant.

## What ports in from the legacy app

`src/modules/core/services/SettingsService.ts`, `NumberSeriesService.ts`, `GlobalConfigService.ts`. Today there is no tenant concept anywhere — 51 tables, zero tenancy columns. Every other service depends on this one for the context that scopes every query. Note: `SettingsService.ts` and `app/po/[poNo]/page.js` hardcode a real company GSTIN/PAN — that becomes tenant configuration here.

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

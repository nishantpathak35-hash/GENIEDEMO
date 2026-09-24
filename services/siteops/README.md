# services/siteops

> What actually happened on site today.

**Package:** `@cog/siteops`  ·  **Tier:** Domain service  ·  **Owner:** `@construct-o-genie/backend`  ·  **Status:** scaffold — no implementation yet

---

## Responsibility

daily progress reports (DPR), weekly progress reports (WPR), site recce, joint measurement records, site imprest (petty cash), tasks.

## Depends on

`packages/contracts` · `packages/service-kit` · `packages/money`

**No other service.** Cross-domain reads go through `packages/contracts`.

## Explicitly not this package's job

Does not own scope or cost. It reports progress against what `services/projects` sold.

## What ports in from the legacy app

`src/modules/operations/`, `components/views/operations/dpr/DPRForm.js`, the WPR PowerPoint exporter, `SiteRecceView.js`. Separate from `services/projects` because its user is a site engineer on a phone with patchy signal — offline-first sync, photo upload and low-bandwidth payloads are constraints that apply here and nowhere else. Most likely first mobile app.

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

# packages/design-system

> The Construct-O-Genie UI kit, consumed by all four surfaces.

**Package:** `@cog/design-system`  ·  **Tier:** Platform (frontend-owned)  ·  **Owner:** `@construct-o-genie/frontend`  ·  **Status:** scaffold — no implementation yet

---

## Responsibility

Design tokens, primitives (buttons, dialogs, tables, inputs), composites (KPICard, ChartCard, Drawer, Badge, SearchInput), Storybook, accessibility baseline.

## Depends on

Nothing. Everything depends on this; it depends on nothing.

## Explicitly not this package's job

No product logic, no data fetching, no API clients.

## What ports in from the legacy app

`_legacy/atelier-current/components/ui/design-system.js`, `components/ui/core.js`, token set in `app/globals.css`

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

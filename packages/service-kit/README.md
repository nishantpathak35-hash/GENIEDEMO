# packages/service-kit

> The golden path. Every new service is cut from this.

**Package:** `@cog/service-kit`  ·  **Tier:** Platform  ·  **Owner:** `@construct-o-genie/platform`  ·  **Status:** scaffold — no implementation yet

---

## Responsibility

CI pipeline, Dockerfile, health and readiness checks, tenant-context middleware, structured logging, error handling, migration harness, test setup, CODEOWNERS.

## Depends on

`packages/contracts`

## Explicitly not this package's job

Not a library. It is a scaffold — you copy it, you do not import it.

## What ports in from the legacy app

Nothing. Net new. Its value is that service #8 in two years is configured identically to service #1 today, rather than however you happened to feel that week.

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

# Construct-O-Genie

Multi-tenant B2B SaaS ERP for commercial interior design-build contractors in
India. A rebuild of a working single-tenant application ("Luxeworx Atelier"),
which becomes tenant #1.

## Start here

[`docs/TOPOLOGY.md`](./docs/TOPOLOGY.md) — the system, its boundaries, the stack,
and the defects carried in from the legacy app. Then
[`docs/adr/`](./docs/adr/), then
[`docs/OPEN-DECISIONS.md`](./docs/OPEN-DECISIONS.md).

## Layout

```
apps/          web · admin · vendor-portal · client-portal
services/      identity · tenancy · projects · procurement
               finance · siteops · workflow
packages/      contracts · design-system · service-kit
docs/          TOPOLOGY.md · adr/ · OPEN-DECISIONS.md · ENTERPRISE-READINESS.md
```

Two sibling repositories live beside this one in the workspace and are
deliberately not part of it: `tally-connector` (installed on a customer's
machine, released on their schedule) and `infrastructure` (separate credentials
and access list).

## The rule

**Dependencies point one way.** Apps depend on packages. Services depend on
packages. No service imports another service — they go through
`packages/contracts`. Nothing depends on an app.

This is enforced by `import/no-restricted-paths` in
[`eslint.config.mjs`](./eslint.config.mjs), so CI fails in seconds rather than
the boundary eroding quietly.

## Commands

```bash
pnpm install
pnpm dev              # everything, in parallel
pnpm build            # affected only, in dependency order
pnpm test
pnpm test:isolation   # proves tenant A cannot read tenant B
```

## Never

Nothing in `../_private/` enters this repository. It holds a live customer
database, a signed client contract and secrets. Test fixtures are synthetic.
See [ADR-0007](./docs/adr/0007-client-data-excluded-from-version-control.md).

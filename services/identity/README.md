# services/identity

> Who you are and what you are allowed to do.

**Package:** `@cog/identity`  ·  **Tier:** Domain service  ·  **Owner:** `@construct-o-genie/backend`  ·  **Status:** scaffold — no implementation yet

---

## Responsibility

users, sessions, invites, login attempts, RBAC roles and permissions, and external principals (`vendor_users`, `client_users`).

## Depends on

`packages/contracts` · `packages/service-kit` · a managed identity provider
(ADR-0005), behind a port with a local adapter for development.

**No other service.** Cross-domain reads go through `packages/contracts`.

## Explicitly not this package's job

Does not own tenant membership rules — that is `services/tenancy`. Does not own the audit log — that is `services/workflow`.

## What ports in from the legacy app

`src/modules/core/services/AuthService.ts`, `app/lib/api/auth.js`, `app/lib/api/token.js`, user-admin RPC methods. **Hand-rolled bcrypt + AES-256-GCM session tokens are replaced, not ported** — you should not maintain your own auth in a product that will face enterprise security questionnaires.

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

# The golden path — adding a service

**Status:** M2 deliverable · **Date:** 2026-09-04

How to add a service so it is correct by construction rather than by review.
This document exists because `services/tenancy` and `services/identity` were
built by hand, and every step below is something that was either easy to forget
or actively wrong the first time.

M2's done-when is "a new service can be created and deployed from the golden
path". This is the path.

---

## 1. The package

```
services/<name>/
├── package.json          @cog/<name>, "type": "module", private
├── tsconfig.json         extends ../../tsconfig.base.json
├── src/
│   ├── api/              route handlers; bind to packages/contracts only
│   ├── domain/           entities, invariants. NO imports from infrastructure/
│   ├── application/      use cases; orchestration, no SQL
│   ├── infrastructure/
│   │   ├── db/schema.ts
│   │   ├── db/policies/  two-reviewer path
│   │   └── migrations/   versioned SQL, forward-only, never edited
│   └── index.ts
└── tests/
    ├── unit/ integration/ isolation/ fixtures/
```

Copy `services/identity`'s `package.json` and `tsconfig.json`. Scripts must be
exactly:

```json
"build":         "tsc -p tsconfig.json",
"typecheck":     "tsc -p tsconfig.json --noEmit",
"test":          "vitest run",
"test:isolation": "vitest run --project isolation"
```

**Never add a `lint` script.** Lint runs once from the repository root.
`import/no-restricted-paths` resolves its zones against `process.cwd()`, so
`eslint .` inside a package resolves `./services/tenancy` to
`services/<name>/services/tenancy`, matches nothing, and **passes silently**.

**Never add `--passWithNoTests`.** It turns a mistyped test glob into a green
suite with zero assertions.

## 2. Register it in four places

Forgetting any of these produces a confusing failure much later:

1. `eslint.config.mjs` — add the name to `SERVICES` so every *other* service is
   forbidden from importing it. (`host` is deliberately absent; it is the
   composition root.)
2. `docker-compose.yml` — a `node_modules` volume for the package on every
   service that mounts the repo. A named volume is initialised from the image
   **once** and never refreshed, so also re-run the in-container install when
   dependencies change:
   ```
   docker compose exec -e CI=true api sh -c \
     'cd /app && pnpm install --frozen-lockfile --ignore-scripts --config.confirmModulesPurge=false'
   docker compose restart api
   ```
3. `docs/TOPOLOGY.md` — the package index.
4. `CODEOWNERS` — if it owns migrations or policies.

## 3. Dependencies point one way

```
apps      ->  packages      never services — services are reached over HTTP
services  ->  packages      never apps, never another service
packages  ->  packages      never apps, never services
```

Cross-domain reads go through `packages/contracts`. When a service needs data
another service owns, define a **port** in its own `domain/` and let
`services/host` wire it — `services/identity`'s `TenantConfigReader` is the
worked example.

This is enforced, and there is a test proving it fires
(`services/host/tests/boundary.test.ts`). It spent its whole life not working
before that test existed.

## 4. Tables

Use the `tenant-table` skill. Non-negotiable, and each one has a reason:

- `tenant_id uuid NOT NULL REFERENCES tenancy.tenants (id)`, and
  **`PRIMARY KEY (tenant_id, id)`** — because unique and foreign key checks
  **bypass RLS entirely**, so a single-column FK lets one tenant reference
  another's row, and `ON DELETE CASCADE` then deletes it for them.
- Every unique constraint includes `tenant_id`. Otherwise the violation message
  leaks the value: `Key (gstin)=(27AAAAA0000A1Z5) already exists`.
- `ENABLE` **and** `FORCE ROW LEVEL SECURITY`. Without FORCE the owner bypasses
  its own policies.
- **Two policies**, not one — permissive policies are OR-ed, so a later
  `USING (true)` opens the table while still satisfying "a policy exists":
  ```sql
  CREATE POLICY tenant_isolation ON <t> AS RESTRICTIVE FOR ALL
    USING (tenant_id = tenancy.current_tenant_id())
    WITH CHECK (tenant_id = tenancy.current_tenant_id());
  CREATE POLICY tenant_access ON <t> AS PERMISSIVE FOR ALL
    USING (tenant_id = tenancy.current_tenant_id())
    WITH CHECK (tenant_id = tenancy.current_tenant_id());
  ```
- Never inline `current_setting` in a policy. `tenancy.current_tenant_id()`
  carries the `NULLIF(..., '')` that makes a **warm** connection deny instead of
  raising `22P02`.
- Grant `SELECT, INSERT, UPDATE, DELETE`. **Never `TRUNCATE`** — not subject to
  RLS.
- Money is `BIGINT` paise. Never `real`, never `double precision`.

The static audit in `services/tenancy/tests/migrations.test.ts` checks most of
this in three seconds without a database. Extend it rather than duplicating it.

## 5. Data access

`withTenant(pool, ctx, fn)` from `packages/service-kit` is the **only** way to
get a connection. No `pool` or `db` is exported anywhere. The transaction is a
unit of work, not a request — holding one open across an external call pins a
pooled server connection.

Background work that spans tenants is a **fan-out**: `withoutTenant` may only
enumerate tenants and enqueue; the worker then does one `withTenant`
transaction per tenant. N transactions, not N connections, and never a magic
`'*'` tenant.

## 6. Errors and health

- Throw `ServiceError(code, message, details?)`; the host maps it. Any other
  throw becomes `INTERNAL` with a safe message, and the real cause — including
  Postgres `detail`, which carries the offending value — goes only to the log.
- Liveness never touches a dependency. Readiness does, and asserts the runtime
  role is neither superuser nor `BYPASSRLS`.

## 7. Before opening a pull request

```
pnpm typecheck      # 0
pnpm lint           # 0   — from the root only
pnpm build          # 0
pnpm test           # 0
pnpm test:isolation # 0   — never skipped
```

A new tenant-scoped table without an isolation test is not finished. The suite
is the artifact handed to a customer's security reviewer, and a green-but-empty
gate is worse than a missing one.

## 8. What is deliberately not automated

There is no `create-service` generator. With seven services total, a generator
would be written once, used six times, and then drift from the path it claims
to encode — and the drift would be invisible, because nobody re-reads a
generator. This document plus `services/identity` as a worked example is the
cheaper and more honest artifact.

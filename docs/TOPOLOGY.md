# Construct-O-Genie — System Topology

**Status:** approved · **Date:** 2026-09-03

Construct-O-Genie is a multi-tenant B2B SaaS ERP for commercial interior
design-build contractors in India. It is a rebuild of a working single-tenant
application ("Luxeworx Atelier") that becomes tenant #1 — Atelier is the first
client's brand, not the product name.

---

## The rule that holds this together

**Dependencies point one way — down.**

```
        apps  ──────►  services  ──────►  packages/contracts
          │                                       ▲
          └───────────────────────────────────────┘
```

- Apps depend on packages.
- Services depend on packages.
- **No service imports another service.** They go through `packages/contracts`.
- **Nothing depends on an app.**

Enforced by `import/no-restricted-paths` in
[`eslint.config.mjs`](../eslint.config.mjs) — CI fails in seconds rather than
the boundary eroding quietly. That is the concrete advantage over a multi-repo
split, where nothing stops a wrong dependency being added to a `package.json`.

---

## Workspace layout

```
D:\TechSmiths\Construct-O-Genie\
│
├── construct-o-genie\               ◄ repo 1 — the product
│   ├── apps\
│   │   ├── web\                     internal ERP (staff)
│   │   ├── admin\                   Construct-O-Genie back office (us)
│   │   ├── vendor-portal\           external — vendors
│   │   └── client-portal\           external — end clients
│   ├── services\
│   │   ├── identity\                auth, RBAC, users, external principals
│   │   ├── tenancy\                 tenants, plans, config, number series
│   │   ├── projects\                projects, CRM, BOQ, estimation, takeoff
│   │   ├── procurement\             vendors, POs, inventory, retention
│   │   ├── finance\                 payments, TDS, GST, billing, Tally staging
│   │   ├── siteops\                 DPR, WPR, recce, JMR, imprest, tasks
│   │   ├── workflow\                approvals, audit, vault, realtime
│   │   └── host\                    composition root — the one place that
│   │                                imports every service
│   ├── packages\
│   │   ├── contracts\               API + event schemas, shared types
│   │   ├── money\                   BIGINT paise, branded Paise, the only
│   │   │                            module allowed to multiply money
│   │   ├── design-system\           UI kit + Storybook
│   │   └── service-kit\             shared service runtime: tenant context,
│   │                                logging, health checks
│   └── docs\                        TOPOLOGY · adr/ · OPEN-DECISIONS ·
│                                    ENTERPRISE-READINESS · KICKOFF
│
├── cog-tally-connector\             ◄ repo 2 — on-prem Windows agent
├── cog-infrastructure\              ◄ repo 3 — Terraform, environments
│
├── _legacy\                         NOT a repo — read-only porting reference
│   ├── atelier-current\             the running Next.js app, source only
│   └── v1-google-apps-script\       the dead v1 (Apps Script era)
│
└── _private\                        NOT a repo — live client data, NEVER commit
```

**Three repositories.** The workspace root is not a repo, which is what makes
`_private/` structurally uncommittable.

See [ADR-0009](./adr/0009-monorepo-supersedes-seventeen-repos.md) for why this
supersedes the original seventeen-repo split. Every *boundary* from that design
survives; only the packaging changed.

---

## Why the boundaries fall where they do

### Apps split by audience, not by feature

Four apps exist because there are four **trust boundaries**, not four feature
sets. In the legacy system a vendor authenticates into the same deployable that
serves director-level P&L. Separating them means a vulnerability in the vendor
login surface cannot reach internal financial routes at all. This is the single
most common finding in a B2B security review.

`admin` is net new and non-negotiable: without it, onboarding a company means
running SQL by hand.

### Services split by data ownership

Each service owns its tables outright. Nobody else writes them — they ask.

`siteops` is separate from `projects` because its user is a site engineer on a
phone with patchy signal. Offline-first sync, photo upload and low-bandwidth
payloads are constraints that apply there and nowhere else. It is also the most
likely first mobile app.

`workflow` is the one to watch. It owns no business domain of its own. If it
starts accumulating procurement or finance logic, that is the early warning that
the old mess is re-forming.

### `packages/contracts` is the keystone

One versioned source of truth for every interface. It replaces the **217+ name**
string allowlist in the legacy `/api/rpc` endpoint with contracts the compiler
enforces. At any commit there is exactly one version of it in play, so "which
contract version is production on?" is not a question that can exist.

### `cog-tally-connector` is the only *forced* repository split

Cloud cannot reach a customer's `127.0.0.1:9000`. It is a physically separate
artifact, installed on someone else's machine, upgraded on their schedule, and
it must stay backwards-compatible with cloud releases months older than itself.

`infrastructure` is separate for access control — production credentials and
application code should not share a blast radius, and the separation is real
separation-of-duties evidence during a SOC 2 audit.

---

## Ownership

| Team | Owns | Never |
|---|---|---|
| `frontend` | `apps/*`, `packages/design-system` | writes business rules, writes SQL, touches migrations |
| `backend` | `services/*`, `cog-tally-connector` | writes React, owns deployment topology |
| `platform` | `packages/contracts`, `packages/service-kit`, `docs/` | ships product features |
| `devops` | `infrastructure`, `.github/workflows/` | — sole holder of production credentials |

All four hats are currently worn by one person. The point of the boundary is
that hiring means handing over a directory and a CODEOWNERS line, not a
conversation.

### Two-reviewer rules

Exactly three things, because a single bad merge on any of them is
unrecoverable:

1. Database migrations — `services/*/src/infrastructure/migrations/`
2. Tenant-isolation (RLS) policies — `services/*/src/infrastructure/db/policies/`
3. CI and production infrastructure

---

## Package index

### Apps

| Package | Audience | Owns |
|---|---|---|
| `apps/web` | Internal staff — PM, procurement, finance, director | The ERP: dashboard, projects, BOQ, POs, payments, approvals, reports |
| `apps/vendor-portal` | External — vendors, subcontractors | PO acceptance, RA-bill submission, payment status, retention |
| `apps/client-portal` | External — the end client | BOQ variation sign-off, progress 360, billing ledger, documents |
| `apps/admin` | Construct-O-Genie internal | Tenant provisioning, plans, feature flags, impersonation, audit search |

### Services

| Package | Owns |
|---|---|
| `services/identity` | users, sessions, invites, login attempts, RBAC, external principals |
| `services/tenancy` | tenants, subscriptions, per-tenant config (company, tax setup, terminology — the words a firm uses), number series, feature flags |
| `services/projects` | project master, leads/CRM, BOQ, estimation, takeoff, change orders, GFC drawings |
| `services/procurement` | vendors, POs, PO items, inventory, transfers, retention ledger |
| `services/finance` | payment requests, remittances, TDS, GST/GSTR-2B, client invoices, Tally staging |
| `services/siteops` | DPR, WPR, site recce, joint measurement records, imprest, tasks |
| `services/workflow` | approval engine + history, audit log, document vault, locks/presence, event stream |

**`services/host` is not a domain service.** It is the composition root: the API
host that composes the seven into one deployable, and the only place permitted
to import them all. It is deliberately absent from the `SERVICES` array in
`eslint.config.mjs` — that absence is what exempts it from the cross-service
rule. See [`plans/M1.md`](./plans/M1.md) D5.

### Shared packages and sibling repos

| Package / repo | Owns |
|---|---|
| `packages/contracts` | API + event schemas, shared domain types, error codes |
| `packages/money` | `BIGINT` paise, the branded `Paise` and `BasisPoints` types, the named statutory rounding boundaries. The only module permitted to multiply or divide money (ADR-0012) |
| `packages/design-system` | Tokens, primitives, composites, Storybook, a11y baseline |
| `packages/service-kit` | Shared service runtime: tenant context, structured logging, health checks |
| `cog-tally-connector` *(repo)* | On-prem agent: pull staged vouchers → post to local Tally → report back |
| `infrastructure` *(repo)* | Terraform, environments, reusable CI, observability, backups |

---

## Internal structure

### Every service

```
services/procurement/
├── src/
│   ├── api/                      route handlers; binds to contracts only
│   ├── domain/                   entities, value objects, invariants
│   │   ├── PurchaseOrder.ts      ← CGST/SGST vs IGST lives HERE
│   │   └── Vendor.ts
│   ├── application/              use cases; orchestration, no SQL
│   ├── infrastructure/
│   │   ├── db/schema.ts          Drizzle schema
│   │   ├── db/policies/          RLS policies (two-reviewer)
│   │   └── migrations/           versioned SQL, checked in, never edited
│   └── index.ts
├── tests/
│   ├── unit/                     domain rules, no I/O
│   ├── integration/              real Postgres
│   ├── isolation/                ← tenant A cannot read tenant B. Never skipped.
│   └── fixtures/                 synthetic tenants — never real client data
├── docs/RUNBOOK.md
└── package.json
```

Tenant context, logging and health checks come from `packages/service-kit`
rather than being copied per service.

**The migration runner is `scripts/migrate.mjs` at the repo root**, not a
service and not `service-kit`. Every service owns its own migration files, but
they share one database and therefore one global ordering, so the thing that
computes that ordering cannot belong to any single service — it lived in
`services/tenancy/scripts/` while reading five other services' directories,
which made tenancy the de facto schema owner for the whole system. Amends this
document's earlier attribution of the "migration harness" to `service-kit`
(docs/plans/M6.md step 0).

**`domain/` has no imports from `infrastructure/`.** Business rules must be
testable without a database. The legacy app violates this — the 4-factor rate
formula lives inside a React component.

### Every app

```
apps/web/
├── app/
│   ├── (shell)/                  every staff screen, under one shell: the bar, the two navigations
│   │   ├── page.tsx              Today (and its Getting started tab while setup is open)
│   │   ├── approvals/ crm/ estimation/ documents/ purchase-orders/ vendors/ inventory/
│   │   ├── site-reports/ site-controls/ tasks/ money/ retention/ notifications/
│   │   ├── projects/[projectId]/ a project's lifecycle — and its twins: orders, stock,
│   │   │                         documents, bills, client-billing, reports
│   │   ├── reports/              the Reports Center: the nine reads, run, filtered, exported, starred
│   │   ├── settings/             the hub the gear opens, one card per page; terminology among them
│   │   ├── preferences/          the person's, not the firm's (the keyboard switch)
│   │   └── export/[list]/        CSV on one path for every list and every report
│   ├── _components/              the shell: top bar, sidebar, search, switcher
│   └── actions/                  server actions — the preference store's writes
├── lib/                          routes.ts (the manifest), nav.ts (the trees), terms.ts (the firm's words), api, lists, export
└── tests/                        the pure functions: the trees, the manifest
```

The manifest in `lib/routes.ts` names, for every route, the module that gates it
and the action the role must hold; `lib/nav.ts` generates both navigations from
it at request time (modules × roles). A twin under `/projects/[projectId]/…`
is the firm's list narrowed to that project, sharing the list component. The
browser suite in `e2e/` (repo root) renders every screen; `SCREEN_COUNT` in
`e2e/routes.ts` is asserted against the file tree.

---

## Deployment

A monorepo does **not** mean one deployable. Turborepo builds independent
artifacts:

| Deployable | Contents |
|---|---|
| `apps/web` | Internal ERP |
| `apps/admin` | Back office |
| `apps/vendor-portal` | External |
| `apps/client-portal` | External |
| **one API host** | All seven services composed — see OPEN-DECISIONS #2 |
| Postgres | ap-south-1 |
| Object storage | S3-compatible, same region |

Splitting a service into its own deployable later is a config change, not a
restructure — the contract already exists.

---

## Stack

Shared baseline: **TypeScript strict**, **pnpm workspaces**, **Turborepo**,
**Docker**, ESLint + Prettier, **Vitest**, **Playwright**, GitHub Actions.

**The full stack and the complete migration table live in
[`STACK-MIGRATION.md`](./STACK-MIGRATION.md).** Summary of what is settled:
Hono + Postgres 17 + RLS + Drizzle + Zod v4 for services; pg-boss for jobs (no
Redis); WorkOS for identity; Typst for documents in a sandboxed worker;
S3-compatible storage in ap-south-1 with MinIO locally; `BIGINT` paise for
money. `docker compose up` is the entire local setup.

| Concern | Legacy | Target | Why |
|---|---|---|---|
| Database | libsql/Turso (SQLite) | **Postgres** | SQLite has no row-level security, so it cannot enforce tenant isolation in the database (ADR-0002) |
| Tenant isolation | none | **context object → then RLS** | Application scoping first because it is testable; DB policies as the backstop (ADR-0006) |
| Schema | Hand-rolled `MIGRATIONS` array *plus* runtime `CREATE TABLE IF NOT EXISTS` in route files | **Drizzle + versioned SQL migrations** | You currently cannot answer "what schema is production on?" Drizzle over Prisma because RLS needs `SET LOCAL` on the session |
| API | one `/api/rpc`, 217+ name string allowlist | **typed contracts** | A runtime check for something the compiler should catch |
| Auth | hand-rolled bcrypt + AES-256-GCM tokens | **managed identity provider** | B2B buyers ask for SSO and SCIM (ADR-0005) |
| Files | Cloudinary + `public/uploads/` on disk | **S3-compatible, ap-south-1, signed URLs** | Contracts and drawings currently sit in a publicly-servable folder |
| Realtime | SSE + polling | **SSE, per-tenant channels** | Mechanism is fine; tenancy scoping is missing |
| Tests | 20 ad-hoc `scripts/test_*.js` | **Vitest + Playwright, in CI** | Nothing currently runs automatically or gates a merge |
| Tally | server posts to `127.0.0.1:9000` | **staged vouchers + on-prem connector** | Cloud cannot reach the customer's machine (ADR-0004) |
| Build | `next dev --webpack` | **Turbopack** | Find out why it was opted out; likely a workaround that became permanent |

---

## Known defects carried in from the legacy app

Not style issues. Each one blocks the multi-tenant rebuild.

1. **No `projects` table.** Projects are keyed by name string. Tenancy cannot be
   added on top of this — fix it first, in `services/projects`.
2. **51 tables, zero tenancy columns.** Every table needs a tenant key and an
   RLS policy.
3. **Tally is architecturally impossible as written.** `127.0.0.1:9000` from a
   cloud server reaches the cloud server.
4. **Hardcoded company tax identity.** A real GSTIN/PAN is hardcoded in
   `app/po/[poNo]/page.js` and `SettingsService.ts`. That is tenant
   configuration and belongs in `services/tenancy`.
5. **Unauthenticated debug endpoints.** `app/api/debug/` and `app/api/debug_po/`
   dump schema and data with no auth. They do not port.
6. **Business rules inside React components.** The CPWD/DSR 4-factor rate engine,
   TDS calculation and GST splits all live in view files. Anything producing a
   number that is stored, approved or filed with a tax authority must move
   server-side as part of the port — it is tamperable in the browser, and doing
   it later means touching the same code twice.
7. **Client documents in a publicly-servable folder.** `public/uploads/` contains
   signed contracts.

---

## Scaling — what will actually bite

This is not a scale-hard product. Hundreds of concurrent users per tenant,
concentrated in Indian business hours; RLS on shared tables serves hundreds to
low thousands of tenants before sharding is a conversation. In order of
likelihood:

1. **Postgres pooling vs `SET LOCAL`.** PgBouncer in *transaction* mode — the
   default on most managed Postgres — reuses connections between statements and
   silently breaks the session variable RLS depends on. Scope `SET LOCAL` inside
   an explicit transaction, or use session-mode pooling. **Decide this in
   milestone 1, not milestone 4.**
2. **Heavy exports.** The WPR PowerPoint generator, PDFs, large BOQ reports are
   CPU-bound and belong in a job queue with a worker, not a request handler.
3. **SSE connections.** Long-lived connections pin a process and cap users per
   instance. Eventually the realtime layer wants its own deployable.
4. **Reporting queries under RLS.** Cross-project rollups get slow first. Index
   on the tenant key from day one.

---

## The risk that outranks everything here

**The legacy code is the only specification and it is unreliable** — identity is
fuzzy string matching, and parts of the statutory logic are wrong (a fabricated
default TAN reaches generated 26Q content). See
[`STACK-MIGRATION.md`](./STACK-MIGRATION.md) and
[ADR-0014](./adr/0014-statutory-rules-need-a-verified-spec.md). A CA-verified
rule spec is milestone M2.5 and it gates the money path.

## Open decisions

Tracked in [`OPEN-DECISIONS.md`](./OPEN-DECISIONS.md). Enterprise-readiness
checklist in [`ENTERPRISE-READINESS.md`](./ENTERPRISE-READINESS.md). Stack and
migration detail in [`STACK-MIGRATION.md`](./STACK-MIGRATION.md).

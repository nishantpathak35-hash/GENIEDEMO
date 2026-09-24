# Backlog

Things found and deliberately **not** done. Each entry says what it is, where it
is, roughly what it would cost, and whether it blocks anything.

Opened 2026-09-07, while adding isolation suites to `projects`, `procurement`,
`siteops` and `identity` and bringing every `.mjs` into `typecheck`. Nothing
here is a live defect — a live isolation defect, a privilege escalation, or
anything that stopped `pnpm verify` passing would have been fixed instead of
recorded.

**This file exists because a five-minute fix is how each of the last four passes
became another pass.** An entry here is a decision to stop, not a promise.

---

## 1. The write side of 28 tenant tables is reached by no application code

**Where** — 21 in `services/projects`, 4 in `services/procurement`, 3 in
`services/siteops`. The full list is in the doc comment of each service's
`tests/isolation/tenant-tables.test.ts`.

Measured against a fully seeded stack after the 64-test browser pass, using
`pg_stat_user_tables`: of 75 tenant tables, **zero are never read** and **37 are
never written** — no route, no seed, no test writes a row. 28 of the 37 are in
the four services above; the other 9 are in `finance` (2), `tenancy` (4) and
`workflow` (3), which have suites of their own covering different ground.

Their RLS `WITH CHECK` is now proved by the new isolation suites, so the
*policies* are covered. What is not covered is the application path: there is no
route that would write them.

**Measure it on a database that has only ever been seeded once.**
`pg_stat_user_tables` counts inserted tuples even when the transaction **rolls
back**, so any probe that writes and rolls back — the row builder in
`scripts/tenant-rows.mjs` does exactly that — silently zeroes the "never
written" count afterwards. Reproducing the figure means dropping and recreating
`cog_e2e`, then one `pnpm test:e2e`. Re-running `test:e2e` over an
already-seeded database does not work either: the seed is idempotent, so it
writes almost nothing and the count comes back far too high.

**Cost** — unknown and large; this is feature work, not a gap in testing. Each
table needs the screen and route that would populate it.

**Blocks** — nothing today. It does mean "the table exists" and "the product can
create one" are different claims, and only the first is currently true.

---

## 2. Four services' isolation suites duplicate their container boilerplate

**Where** — `services/{projects,procurement,siteops,identity}/tests/isolation/tenant-tables.test.ts`,
plus the four that already existed in `finance`, `host`, `tenancy`, `workflow`.

Each carries its own `collectMigrations`, Testcontainers Postgres + PgBouncer
setup, `runtimeClient` and `asTenant` — around 150 lines, now repeated eight
times. `collectMigrations` alone is duplicated in **nine** files.

This is deliberate, and `tenant-isolation.test.ts` states the reason inline: a
shared test helper reaching across *service* directories is exactly the coupling
`import/no-restricted-paths` exists to prevent. The generic row builder is
shared, but it lives in `scripts/` — repo-level infrastructure that belongs to no
service — which is the same exemption `services/host` already relies on for
`migration-plan.mjs`.

**Cost** — a day to design a home for shared test infrastructure that does not
weaken the boundary rule, and to move eight suites onto it. The obvious cheap
answer (a `@cog/service-kit/testing` export) adds a build-graph edge that eight
suites depend on, so a break in it surfaces as a service failure.

**Blocks** — nothing. It is drift risk, not a defect: eight copies can diverge.

---

## 3. Two pre-existing isolation suites can silently target the wrong database

**Where** — `services/finance/tests/isolation/voucher-queue.test.ts` and
`services/tenancy/tests/isolation/tenant-isolation.test.ts`.

Found by hitting it. The new suites build fixtures before PgBouncer has started,
and `runtimeClient()` read a `bouncerPort` that was still `undefined`. `pg` reads
an undefined port as its default **5432** — the developer's own compose Postgres,
not the container the suite started. It failed on a password rather than passing
against the wrong database, but only because `app_runtime`'s local password
differs from the test one. Had they matched, the suite would have run green
against a completely different database.

The four new suites carry a guard:

```js
if (!bouncerPort) throw new Error('PgBouncer is not started yet');
```

**Two of the older suites have the same shape and no guard** — a helper that
builds a client from a module-level port variable:
`services/finance/tests/isolation/voucher-queue.test.ts:50` (reading `port`,
assigned at :91) and `services/tenancy/tests/isolation/tenant-isolation.test.ts:97`
(reading `bouncerPort`, assigned at :200). Both happen to assign before the
helper is first called, so the hazard is latent rather than live.

The other three are structurally safe and need nothing: `finance/connector-e2e`,
`host/tenant-routes` and `workflow/approve-atomic` all read
`postgres.getMappedPort(5432)` inline at the point of construction, which cannot
be undefined because the container object does not exist until it has started.

**Cost** — two one-line guards.

**Blocks** — nothing. Latent.

---

## 4. `DEFAULT_POOL_SIZE: 1` deadlocks against a long transaction

**Where** — a trap for whoever writes the ninth isolation suite, not a defect in
an existing one.

The suites set PgBouncer to a single server connection deliberately, so that
connection reuse between tenants is guaranteed to be exercised. A suite that then
holds one transaction open across many statements while a *second* client needs
the pool will deadlock, and surfaces as `25P03 idle_in_transaction_session_timeout`
several minutes later — which reads as a container problem rather than a pool
one.

The fix is to scope one transaction per statement, which is what `withTenant`
does in production anyway. Recorded here because the error message points nowhere
near the cause.

**Cost** — nothing to fix; it is written down so the next person loses minutes
rather than an hour.

**Blocks** — nothing.

---

## 5. `ApiRow` in `seed-demo.mjs` is broader than it needs to be

**Where** — `scripts/seed-demo.mjs`, the `ApiRow` / `ApiList` typedefs.

Bringing `scripts/` into `typecheck` needed a shape for what the API returns.
The seed reads only `id`, `code`, `name` and `slug`, so those are named — but the
typedef keeps `& { [field: string]: any }` because the seed also passes rows
straight back into `post()` bodies. That escape hatch means a typo in a field
name the seed *writes* is still not caught.

**Cost** — half a day: generate the response types from `packages/contracts`
rather than hand-writing them, so the seed is checked against the same schemas
the routes are.

**Blocks** — nothing. It is the difference between "typechecked" and "typechecked
against the real contract".

---

## 6. Ten `projects` tables and four others withhold UPDATE or DELETE

**Where** — `projects.{client_briefs, client_decisions, commercial_agreements,
design_reviews, handover_records, joinery_stages, lead_activities, lead_handovers,
lead_merges, selection_substitutions}`, `procurement.{purchase_order_acceptances,
stock_movements, vendor_bills}`, `siteops.measurement_records`.

**Not a defect** — recorded because it is easy to mistake for one. These are
append-only records and the grant to `app_runtime` deliberately omits DELETE, and
in six cases UPDATE too. That is a stronger guarantee than a policy, because the
privilege does not exist at all.

The new isolation suites read the grant and assert the stronger outcome where it
applies, so a table that *gains* an UPDATE grant later is automatically held to
the row-count assertion instead. Nothing to do; it is written down so nobody
"fixes" the missing grants.

**Blocks** — nothing.

---

## 7. `identity.principal_lookup` and `identity.invite_lookup` are ENABLE without FORCE

**Where** — `services/identity`.

**Not a defect** — both are read before a tenant is known, so no tenant predicate
can apply. They carry zero policies and no grant to `app_runtime` at all, and are
reachable only through a SECURITY DEFINER function. Protection is privilege, not
policy.

Two suites now assert this rather than assuming it —
`services/tenancy/tests/isolation/tenant-isolation.test.ts` and the `EXCLUDED`
set in `services/identity/tests/isolation/tenant-tables.test.ts`, which checks
each excluded table really does have no policy **and** no grant, so a name cannot
be added to that list to silence a failure.

**Blocks** — nothing.

---

## 8. HUMAN(DATA) — what the design shows that the model cannot supply yet

**Opened 2026-09-13**, applying `docs/design/`. Each surface below was BUILT and renders its absent
state — a dash with the server's reason — rather than a zero or a placeholder. The server states the
absence (`/api/v1/today/margin-at-risk` and `…/cash-against-payables` answer `status: 'absent'` with
the missing fields named), so the screen and this list cannot disagree.

| Marker | Surface | What the model lacks |
|---|---|---|
| ~~DATA-01~~ | Today › Margin at risk | **Built 2026-09-14.** Cost budget = Σ(quantity × cost rate) over the BOQ, derived by `lineCost` (the BOQ's own rounding), never a typed column; at risk = approved orders − budget where positive (`domain/margin.ts`); a BOQ with unpriced lines is `partial` with the count; no BOQ is absent. `GET /today/margin-at-risk` and every rollup row carry it; Today and the projects list render it. Actual cost stays on the CA-gated payment path |
| DATA-02 | Today › Cash against this week's payables | **Payables and receivables built 2026-09-15; cash held.** A bill becomes a payable when finance acknowledges it with its taxable value, GST and a due date (0094); Bills and Today show what is due this week and next, gross — never net of TDS. Certified receivables are `finance.client_invoices` (0097), with expected and certified dates. The cash side still answers absent with its reason: there is no bank or cash-book table, and none was built. HUMAN(ARCH-CASH) — (a) the Tally connector reads the bank and cash ledger balances on each sync, with the time it read them; or (b) a person records "cash in hand as of today", one figure and one date |
| ~~DATA-03~~ | Today hero › who an approval waits on | **Built 2026-09-13.** `identity.principals.display_name` (0083), given at invitation and copied on acceptance; `approvalOwner.people` names the holders; the hero, the approvals queue and the people screens show the name, or the address when none was given |
| ~~DATA-04~~ | Notifications › Mark read / Mark all read; the actor | **Built 2026-09-14.** `workflow.notifications.actor_id` (0089, composite FK, `SET NULL (actor_id)`), stamped by every `notify` caller; the inbox names the actor through identity's `principalNames`; `POST /notifications/:id/read` and `/notifications/read-all` are declared and scoped to the caller; the screen draws a person avatar, Mark read per row and Mark all read |
| ~~DATA-05~~ | Today › Get set up › Connect Tally | **Built 2026-09-14.** `finance.connectorPosting` (last `posted_at`, posted and pending counts) and `tenancy.connectorPresence` (last seen, instances); the step is done when a voucher was posted, and the card says never connected / connected, nothing posted / last posted on a date |
| ~~DATA-06~~ | Every sparkline | **Built 2026-09-14.** `GET /today/weekly` — one ISO-week grid (`isoWeeksEnding`) handed to procurement (ordered so far, cumulative), projects (pipeline opened) and siteops (people on site, `null` for unreported weeks); money series carry an index (basis points of the peak) so a sparkline is never handed money. Drawn where the series is the stat's own measure: Today › Ordered so far, Sales › Pipeline, Site › On site today. The design's other sparklines have no weekly history on file and are not drawn |
| ~~DATA-07~~ | Approvals of different ages, from a fresh seed | **Built 2026-09-14.** `backdateForDemo` in the seed — the one step that is SQL, seed-only: orders awaiting approval are aged 9/6/3/1/0 days relative to the seed run, and their request notifications move with them |
| ~~DATA-08~~ | Projects › "N in progress"; the In progress / Won / Handed over tabs | **Built 2026-09-13.** `POST /projects/:id/state` moves a project along `domain/project-state.ts` (lead → won \| lost → in_progress → handed_over → closed; closed/lost final), stamps `started_on`/`handed_over_on`, refuses the rest with CONFLICT; `project.moves` is what the Stage panel offers; a won lead's project is created `won`; the seed walks each project to its stage |
| ~~DATA-09~~ | Sales › Won this quarter · Next site visit | **Built 2026-09-14.** `leads.closed_on` and `next_followup_kind` (0086), stamped by create, update, convert and mark-lost; `totals.wonThisQuarter` (by `closedOn`, Asia/Kolkata quarter) and `totals.nextSiteVisit` are the server's; the activity form records what kind the next step is. Leads closed before 0086 carry no date and are not counted |
| ~~DATA-10~~ | Vendors › Bills waiting · Rate contracts expiring · Open orders total; Rates › Average against BOQ · Items with no agreed rate | **Built 2026-09-14.** Vendors: `vendorListResponse.summary` (open orders count/vendors/total, bills waiting, contracts expiring in 30 days). Rates: `GET /rollups/rate-analysis` — order lines with a trade code and no contracted rate, lines with no trade code, and agreed rates against BOQ cost over lines that carry BOTH a `boq_item_id` and a `contracted_unit_rate` (compared by id, never by description) |
| ~~DATA-11~~ | Site › On site today · Open site issues; Stock › level bar · Received but not checked in | **Built 2026-09-14.** `siteops.site_issues` (0085) with raise/resolve/list routes and `GET /siteops/today` (head count from today's manpower rows, sites reporting, open and blocking issues); a report reads back its `headCount`; a receipt can wait at the gate (`checkedIn: false`, 0087) out of the balance until `check-in` (0088 grants UPDATE on the two check-in columns only, trigger: once, receipts only); `levelPct` drives the level bar |
| ~~DATA-12~~ | Settings › Tax — the two business questions, "done"; Stock locations; Operator console — plan, connector, last active | **Built 2026-09-14.** Tax: `tenancy.tax_setup` (0084), flags with who/when, a review completion that unlocks nothing. Stock locations: `procurement.stock_locations` (0091), a register — retired, never deleted, not a constraint on the ledger. Operator: `tenant_directory` gains `plan` and three instants each tenant reports about itself through `note_tenant_activity` (0090) — never read across tenants; `list_tenants` and `list_provisioning_events` lose their `LIMIT 500`/`LIMIT 200` |
| ~~DATA-13~~ | Export, on every list the design draws it | **Built 2026-09-14.** `GET /export/<list>` in the web app's server: reads the list as the caller through the API, follows the cursor to the end, writes the list's own columns with rupees in Indian grouping, defuses formula cells, refuses past 20,000 rows. Leads, projects, orders, vendors, rates, stock, documents, daily reports, imprest, measurements, surveys, BOQ, variations — each with its Export button carrying the screen's filters |
| DATA-pager | Every list | every list endpoint returns the whole list (`LIMIT 200`, `nextCursor: null`); the pager reads `All N …` and there is no page to turn. Server-side cursor paging is the cost stated in `docs/design/README.md` §6 and has not been agreed |

**Blocks** — nothing today; each is a feature, not a gap in what was built.

---

## 9. HUMAN(DEMO) — the demo's names and its address domain

**Opened 2026-09-15**, with the seed rewrite. Both are the owner's to settle, and changing either
is an edit to `scripts/demo-principals.mjs` and `scripts/seed-demo.mjs` and nothing else.

| Marker | What is in place | What is needed |
|---|---|---|
| DEMO-NAMES | Two invented firms (Bhitarang Interiors Private Limited, Samarachana Fitouts LLP), six clients, thirteen vendors and three lead prospects, each searched for on the web before use. Some searches found a similar name in use; the run report lists them with the source. On 2026-09-15 the owner vetoed four — Bazaarika Stores, Pranavika Hospitals, Aushadhika Research Laboratories and Vyomika Softworks — and they became Upabhogika Stores, Vranaropani Hospitals, Sukshmajivika Research Laboratories and Lipiyantra Technologies, searched the same way | a veto, or a replacement, for any name the owner will not demo under |
| DEMO-DOMAIN | Every demo address ends in `.example`, a reserved domain that cannot resolve (RFC 2606) | the domain the owner wants demo logins shown under, if any |

**Blocks** — nothing: the demo runs as it is.

---

## 10. GST on an advance received before any invoice (CA-06)

**Opened 2026-09-15**, from the CA's answer to CA-06 (CA answers document, reviewed by the CA; CA
details to follow; provisional): "Where no invoice has yet been raised, GST shall nevertheless be paid
on the advance received, to the extent applicable to the works-contract/service supply."

| Marker | What is in place | What is needed |
|---|---|---|
| GST-ADVANCE | Tax is charged when a tax invoice is raised, on its full value, whether or not the client holds back retention. Money a client pays is recorded only against an invoice (`finance.client_receipts.invoice_id` is NOT NULL), so an advance paid before any invoice cannot be recorded, and GST on it is computed nowhere | a record of an advance received — client, project, date, amount — the GST due on it for the period it is received in, and its adjustment when the invoice that covers it is raised. Not built |

**Blocks** — nothing today: no screen takes an advance, so none can be recorded without its tax.

---

## 11. Tally vouchers for payments and invoices recorded as drafts

**Opened 2026-09-15**, with the owner's rule that a voucher computed from a provisional row is never
handed to a Tally connector, in any mode (ADR-0014, addendums).

| Marker | What is in place | What is needed |
|---|---|---|
| TALLY-DRAFTS | A bill payment or a tax invoice computed from a provisional row is recorded, numbered and shown as a draft, and stages no Tally voucher; nor does a retention release whose retention such a payment withheld. One that rests on no provisional row stages its voucher as before | once the CA's details promote the rows, a way to re-check each draft against the verified values and stage its voucher — or to answer one that no longer matches with a corrected document. Not built |

**Blocks** — go-live for a tenant that has recorded drafts; not the build.

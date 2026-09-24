# M5 — The view port

> **This document covers part of the port.** The complete file-by-file
> reconciliation — every module in BOTH legacy trees, and where each went —
> is [`docs/PORT-LEDGER.md`](../PORT-LEDGER.md). Where the two disagree, the ledger was
> built by walking the file system and wins.


**Status:** endpoints complete · screens in progress · **Date:** 2026-09-05 ·
**This file is the resume point.** Update the status table after each view and
commit that update.

**Every module that is not CA-gated has its endpoints.** The screens are being
built now, in `apps/web`. The four CA-gated views must not be started until
`CA-01`…`CA-08` come back.

## What the screens rest on, built before the first one

| Piece | Why it had to come first |
|---|---|
| `packages/money/src/format.ts` | `formatIndianRupees` takes the **wire string**, not a `Paise`. `toRupeeString(fromWire(x))` would put a `Paise` — and therefore a multipliable `bigint` — inside an app |
| `packages/money/src/input.ts` | `parseRupeesToWire`, `parseQuantityToParts`, `parseWholeNumber`, `parsePercentToBasisPoints`. A ban on `Number()` with no alternative gets worked around |
| `eslint.config.mjs`, apps block | Bans `Number`/`parseInt`/`parseFloat` (**both spellings** — `Number.parseInt` was written in this port before the rule caught it), `Math.*`, `toFixed`, unary `+`, `+`/`-` on a money-named identifier, and the **rupee symbol** itself. Proved on planted violations, plants removed |
| 74 route descriptors in `packages/contracts` | An app's only legal path to a service. 18 existed; the screens needed the rest |
| `apps/web/lib/data.ts` | One `load` returning **ok / refused / unreachable**. Under RLS a query with no tenant context returns zero rows, so a refusal and an empty list are otherwise the same screen |
| The response-shape check in the isolation suite | Every GET parsed through its own descriptor against real Postgres. It found a missing query-string mechanism on `weeklyAggregate` the moment it ran |

**The rupee-symbol ban is the one worth knowing about.** `₹${amount}` is not
arithmetic and no arithmetic rule catches it, and it displays paise as rupees —
a 100× error. The symbol now only ever comes out of `packages/money`.

---

## The number that governs this milestone

It is not 88 files. It is:

> **112 distinct RPC method names are called by the legacy views. 74 endpoints
> exist** — 18 when this milestone began.

A view is portable when the endpoints it needs exist. **Every view that is not
CA-gated or M6 now has them.** The list below is re-derived from `routesOf` on
the built app, so it cannot drift from what is mounted.

**The 112 does not fall to zero, and should not.** Several of those RPC names
have no equivalent here on purpose:

| Not built | Why |
|---|---|
| `shootPOFromBOQItem`, `shootPOFromBOQItems` | Minted a PO **born approved** for a caller-supplied value (BOQ-03). Replaced by `from-boq`, which creates a draft |
| `updatePOFull` | Writes a `version` column no migration creates; has never executed (PO-19..22) |
| `exportTakeoffToBOQ` | Three missing-column defects in one function (TAKE-02/03/05); has never executed. Also PO-16 |
| `importEstimationItemsToBOQ` | PO-16 — whether a BOQ rate carries GST |
| `releaseRetentionAmount` | A release is a payment. CA-01..CA-08, and the legacy release writes no payment record (RET-02) |
| `uploadAttachment` | Writes into `public/uploads/`, served with no authentication (VAULT-01) |
| `createBOQSchedule` | No schedules table: a BOQ belongs to a project |
| every payments, reports and client-billing method | CA-GATED |

Counting an endpoint deliberately not built as missing progress would be the
wrong direction of accounting.

---

## The rule that outranks everything here

**The server computes every monetary figure and every permission. Clients
display.** (ADR-0014.)

A view that does GST or TDS arithmetic in the browser is **not ported, it is
copied**. Two measured facts about the tree being ported:

- **42 of 88 files carry `'use client'`** — verified by `grep -rl "^'use client'"`.
- The legacy derives roles in the browser (`POsView.js:136`, `PaymentsView.js:118`,
  `ReportsTables.js:7`) and computes TDS there too (`POsView.js:50`). Those are
  the lines that must have no equivalent in the port.

`packages/money` may be used in a view **only** to turn a `PaiseWire` string
into rupees for display. Multiplication, division, GST and TDS never appear in
`apps/*`.

## The protocol — not optional

Every view goes through the `port-legacy-module` skill and lands as **two
commits**: a faithful port, then a defect fix with its own test. Once a ported
figure differs from the legacy figure, there is no way to tell whether the port
was wrong or the fix was right; two commits keep that answerable (ADR-0014
decision 5).

Use `legacy-scout` to read the old implementation. **Never guess at it**, and
never trust a summary of it — including the inventory below.

### Before porting any defect, establish whether it is live

**A step, not advice.** For each defect you are about to port faithfully, check
that the statement above it can execute — that the columns it names exist, that
the function is reachable, that the branch is entered. One grep each.

Slice 1 was briefed with five defects to port. Four had never executed, because
`updatePOFull` writes a `version` column no migration creates and throws before
reaching any of them. Porting them faithfully would have meant reintroducing a
mutable primary key and a client-trusted GST figure into a schema that had
already designed both out — carefully, and for nothing. The two that were live
(PO-23, PO-24) were found by reading, not from the brief.

Record the answer as a **status** column on the defect row: `live` or `latent`.
A latent defect is still worth recording — it says what the legacy would do if
the blocking bug were fixed — but it is not something to preserve.

---

## Inventory — what is verified and what is not

Produced by `repo-cartographer` on 2026-09-04, then partly checked by hand.

**Independently verified:**

| Fact | Value |
|---|---|
| Files under `components/views/` | **88** |
| Total lines | **23,989** |
| Files with `'use client'` | **42** |
| Largest | `BoqView.js` 1288, `SiteRecceView.js` 1064, `SettingsView.js` 1015, `projects/ProjectDetails.js` 1005, `PaymentsView.js` 908, `POsView.js` 700 |

**NOT verified — treat as a lead, not a fact.** The agent's per-file
"money arithmetic: yes/no @ line" column, and its RPC method list per file. Its
own ranking of the largest files was wrong in both order and membership, which
is the reason for this caveat rather than a general one. Its count of files
doing browser money arithmetic (50) uses a wider definition than a hand check
of `toFixed|Math.round|parseFloat` (31); neither is authoritative.

**Confirm each file with `legacy-scout` at port time.** That is required by the
two-commit protocol anyway — commit 1 must reproduce measured behaviour, not
remembered behaviour.

---

## Status

`CA-GATED` means the endpoints must not be built until a chartered accountant
answers; `blocked — M6` means a different milestone owns it. Everything else has
its endpoints.

| # | View | Lines | Needs | Status |
|---|---|---|---|---|
| 1 | `ProjectsView.js` | 125 | `GET /projects` ✓ | **PORTED** — list, create, and a project shell with tabs |
| 2 | `DashboardView.js` | 248 | `GET /rollups/projects` ✓ | **PORTED** — six payment figures shown as absent, not zero. Found DASH-04 |
| 3 | `BoqView.js` | 1288 | BOQ read ✓, writes ✓, BOQ→PO ✓ | **PORTED** — every total from the server; cost and margin null when a line has no cost rate. Found BOQ-07 |
| 4 | `POsView.js` | 700 | PO reads ✓, writes ✓, numbering ✓ | **PORTED, minus the TDS row** — list, price, create, rename, approve. TDS/netPayable stays CA-GATED (CA-05..CA-08) |
| 5 | `ApprovalsView.js` | 304 | chains ✓, history ✓, approve ✓ | **PORTED** — refuses every decision until PO-13, and says so rather than hiding the control |
| 6 | `TasksView.js` | 478 | `workflow/tasks` ✓ | **PORTED** — grouped by status, not by comparing an email in the browser |
| 7 | `PaymentsView.js` | 908 | payment endpoints | **CA-GATED** — not started, deliberately |
| 8 | `ReportsView.js` | 475 | TDS register, payment reports | **CA-GATED** — not started, deliberately |
| 9 | `SettingsView.js` | 1015 | `tenancy/settings` ✓, `identity/*` ✓ | **PORTED, partial** — the tenant record, its people and invitations. The other eight legacy tabs are platform administration and belong to `apps/admin` |
| 10 | `VendorsView.js` | 218 | vendor endpoints ✓ | **PORTED** — no bank field on any path, in either direction |
| 11 | `EstimationView.js` | 481 | `projects/estimation/items` ✓ | **PORTED** — pre-tax, no GST column; presets and the ladder stay PO-15. Found EST-04 |
| 12 | `TakeoffView.js` | 554 | takeoff sheets ✓, items ✓, summary ✓ | **PORTED** — sheets and exact scale. No BOQ export: the legacy one has never executed, and needs PO-16 |
| 13 | `ChangeOrdersView.js` | 460 | change-order endpoints ✓ | **PORTED** — `original` survives; a second decision is refused, not applied twice |
| 14 | `ClientBillingView.js` | 633 | client invoice endpoints | **CA-GATED** — not started, deliberately |
| 15 | `CrmView.js` | 463 | `projects/leads` ✓ | **PORTED** — probability typed, never derived; the weighted total is the server's |
| 16 | `InventoryView.js` | 245 | stock endpoints ✓ | **PORTED** — no valuation column and no endpoint that could fill one (INV-03) |
| 17 | `SiteControlsView.js` | 504 | imprest ✓, JMR ✓, retention ✓ | **PORTED, partial** — imprest and JMR on the project; retention recording on its own page. **Release stays CA-GATED** |
| 18 | `SiteRecceView.js` | 1064 | recce endpoints ✓ | **PORTED** — exact areas; no efficiency ratio (three roundings, no agreed definition) and no base64 photographs |
| 19 | `DesignView.js` | 646 | drawing endpoints ✓ | **PORTED** — a drawing references a vault object; the API never accepts file bytes |
| 20 | `DocumentVaultView.js` | 199 | document endpoints ✓ | **PORTED** — a register, with no download link: an object is fetched by signed URL |
| 21 | `CustomerPortalView.js` | 416 | client-portal endpoints ✓ | **PORTED into `apps/client-portal`** — progress 360 and variation sign-off. The billing ledger is left out and waits on **CA-01..CA-08** |
| 22 | `VendorPortalView.js` | 390 | vendor-portal endpoints ✓ | **PORTED into `apps/vendor-portal`** — orders, acceptance, RA-bill submission. TDS visibility waits on **CA-05..CA-08**; the retention ledger waits on **CA-01..CA-08** and RET-02 |

### Also built, with no single legacy view behind them

| Screen | Why it exists |
|---|---|
| `/site-reports` | The daily progress report and its manpower, in one transaction. The weekly aggregate it feeds names its missing days rather than averaging over a denominator it does not state |
| `/site-controls` | The way in to a project's Site tab. Separate from `/retention` because releasing retention is a payment and sanctioning an imprest is not |
| `/sign-in` | The app holds an opaque credential in an httpOnly cookie and asks `whoami` whether it resolves. It never decides who anyone is |

### What `apps/web` deliberately has no screen for

| Absent | Why |
|---|---|
| Payments, reports, client billing | CA-GATED — CA-01..CA-08 |
| A TDS or net-payable row on a purchase order | Same. `POsView.js:153-154` computes both in a browser from a rate typed into a form |
| Retention release | A release is a payment (RET-02 as well) |
| Any role picker | PO-13 is unanswered; offering plausible roles would make it look settled |
| A stock valuation | INV-03 — no costing method has been chosen |
| A carpet-to-BUA efficiency ratio | Three roundings in the legacy, no agreed definition |
| A file upload of any kind | The API never accepts bytes. VAULT-01 and VAULT-02 |

Plus **66 files** in nine subdirectories (`dashboard/`, `operations/`,
`payments/`, `projects/`, `purchase-orders/`, `reports/`, `settings/`,
`takeoff/`, `vendors/`) which are components of the views above and port with
their parent.

### `ProjectsView.js` — done so far

The **rules** are ported; the screen is not yet written. That order is
deliberate: the arithmetic and the health band were in the browser, so they had
to move server-side before any screen could display them (ADR-0014, and the
`port-legacy-module` skill's step 5).

Two commits, as the protocol requires:

| Commit | Contents |
|---|---|
| `port the legacy project rollup verbatim, defects included` | `project-financials-legacy.ts` + 16 tests recording measured behaviour. Not exported from the package index; nothing may call it |
| `correct the project rollup and add the money lint backstop` | `project-financials.ts`, `Paise` throughout, each fix naming the defect row it closes |

**Six defects recorded** as `PROJ-01`…`PROJ-06` in `STACK-MIGRATION.md`. The
one worth knowing about:

> **PROJ-01.** `projects.js:118-120` adds the same `val` to both `poIssued` and
> `projectValue` in one loop. With no `project_financials` override the two are
> therefore identical, the health ratio is exactly `1`, and — since `1 > 1` is
> false but `1 > 0.85` is true — **every project without a hand-entered budget
> has read "At Risk" permanently.** Never "On Track", never "Over Budget".
> Confirmed by execution, not by reading.

Still to do for this view: a `project_financials` table (prefix `0012`), an
endpoint returning the rollup, and the screen itself.

### The approval decide endpoint — and where it had to live

`POST /api/v1/purchase-orders/:id/approve` is in **`services/host`**, not in
workflow and not in procurement. It needs the engine from one and the aggregate
from the other, and `eslint.config.mjs` forbids either importing the other, so
the composition root is the only legal home (M1/D5).

The boundary that keeps it from becoming a dumping ground: **host orchestrates,
it does not compute.** Every rule about whether an approval is valid stays in
`approve()`; every rule about what an advanced chain means for a purchase order
stays in `applyChainAdvance`. The route reads four things, hands them to the
engine, and hands the engine's answer to the aggregate. Audited: the only
conditional in the file is a schema-validation branch.

**It refuses everything today, and that is correct.** PO-13 is unanswered, so
`workflow.approval_chains` is empty and `assertChainConfigured` turns that into
a refusal rather than a fall-through — an unconfigured control fails closed. No
plausible chain is seeded to make it look alive. A test-only two-stage chain
exists inside the isolation suite, so that the suite cannot pass against an
endpoint hardcoded to 403.

**A gap this exposed:** `createPrincipalResolver` builds a principal with
`roles: []` on purpose — the bootstrap query runs with no tenant context and
must not become an enumeration surface — and **nothing ever loaded them
afterwards**. Every role-gated approval would have refused for the wrong reason.
`loadPrincipalRoles` in `services/identity` is the other half of that sentence,
read inside the transaction under RLS.

### A gap this port exposed

`eslint.config.mjs` had **no `no-restricted-syntax` money rule**, though M1/D1
specifies one and M1 is marked complete. Branding `Paise` as a `bigint` stops
`bigint * number` at compile time but not `bigint * bigint`, which type-checks
and returns an unbranded `bigint`.

It was added after writing exactly that mistake in this port —
`committed * 100n > budget * 85n` — which the rule now catches. Two structural
exemptions (a product handed directly to a named boundary; `*-legacy.ts` files)
and one documented `eslint-disable` where a **rate**, not money, is halved.

### Two views must not be ported at all

- `app/api/debug/` and `app/api/debug_po/` dump schema and data with no
  authentication. TOPOLOGY defect 5: **they do not port.**
- Anything reading `public/uploads/` — signed contracts in a publicly servable
  folder (VAULT-01). The replacement is object storage with tenant-prefixed
  keys and signed URLs capped at 15 minutes.

---

### Slice 1 — purchase-order writes (done 2026-09-04)

Three endpoints, behind the existing tenant middleware, all in `procurement`:

| Route | Notes |
|---|---|
| `POST /api/v1/purchase-orders` | Totals computed from lines. No request field carries money |
| `PATCH /api/v1/purchase-orders/:id` | `expectedVersion` **required** by the schema |
| `PATCH /api/v1/purchase-orders/:id/number` | Renames one row |

Commits: `875ce98` (the record), `2ed4db8` (the endpoints). 15 per-route
isolation tests against real Postgres, 17 unit tests, gate green.

**The slice found that `updatePOFull` has never worked.** Both branches write a
`version` column that no migration creates, libSQL raises `no such column`, and
`executeWithRetry` rethrows it. So four of the five defects slice 1 was briefed
to port faithfully — the five-table rename cascade, the client-trusted
`gst_amount`, the client-trusted line `amount`, the declinable version check —
have never executed. They are **latent**, recorded as PO-19..PO-22.

Consequences, because the next slices will want to copy this pattern:

- **Update and rename were one commit, not two.** There is no prior behaviour to
  preserve. Create kept the two-commit protocol, and its fidelity target was
  `POService.createPO`, not `write.js`.
- **PO-23 is the only live defect**: `POService.ts:48` stores
  `subt + gstSum - tdsAmt` as `po_value`. Every existing row is net of a
  deduction that has not been made, and `committedSpend` sums that column. The
  replacement stores `gross = taxable + gst` and nets nothing.
- **The status of a legacy defect must be established before it is ported.**
  Four rows in the brief were wrong in the same direction. One grep for the
  column a statement writes was the whole check.

Not in this slice, deliberately: `deletePOFull` — non-transactional, swallows
errors on intermediate deletes via `safeDelete`, `requireAdminConsole`-gated. It
belongs with the M6 admin path.

**Numbering landed with it.** `POST /purchase-orders` allocates a number when
the body omits one, by bumping a per-tenant counter (`procurement.number_series`,
migration `0021`) with `UPDATE ... RETURNING` inside the transaction that
inserts the order. `GET /purchase-orders/next-number` previews without
reserving, and is named so a caller cannot read it as a claim.

That closes **PO-24**, which was live: `peekNextNumber` (`read.js:189`) returns
a number without incrementing and `POsView.js:301` puts it in the form, so two
users opening the modal together are shown the same one. Gaps are accepted —
Rule 46 consecutive serials apply to tax invoices, and M1.md:272 already scopes
the per-tenant counter to those. The `PO`/4-digit format is per-tenant
configuration shipping as **provisional**, for PO-18's reason.

**POsView.js is not portable yet, and the reason is worth carrying forward.**
`POsView.js:153-154` computes `tdsAmount = Math.round(subtotal * (tdsPct / 100))`
and `netPayable = grandTotal - tdsAmount` in the browser. That is a rate
application on the money path, so it sits behind the HARD STOP with
CA-05..CA-08. The writes are done; the screen's TDS row is not, and stubbing it
to unblock the screen is the move that put the legacy where it is.

Full note: [`../ports/purchase-order-writes.md`](../ports/purchase-order-writes.md).

### Slice 2 — BOQ writes (done 2026-09-04)

Three endpoints in `projects`, behind the existing tenant middleware:

| Route | Notes |
|---|---|
| `POST /api/v1/projects/:projectId/boq` | Lines as a set, written atomically. Amount computed, never supplied |
| `PATCH /api/v1/projects/:projectId/boq/:itemId` | Whole line, not a patch |
| `DELETE /api/v1/projects/:projectId/boq/:itemId` | 404 when it is not there, rather than `{ ok: true }` |

Plus migration `0022`, which states in the column comment that a BOQ `rate` is
**pre-tax** — the domain had committed to that (`boq.ts:98-100`) and the column
had been carrying it silently.

14 per-route isolation tests against real Postgres, 20 unit tests.

**The finding: BOQ-03 is a live privilege escalation.** `shootPOFromBOQItem`
(`boq.js:135`) and `shootPOFromBOQItems` (`:199`) mint a purchase order with
`status` and `approval_status` hardcoded to `'Approved'`, for a value the
caller supplies (`:170`), gated only by `requireAuth` — which checks that
`session.email` is truthy and nothing else (`AuthService.ts:17-21`). Both are in
the RPC allowlist. The approval controls built in slice 1 are bypassed by a
different endpoint writing the same table.

**It has no replacement, deliberately.** Nothing in the new system mints a PO
from a BOQ line. It needs a BOQ↔PO link that `0011` does not have, it crosses
`projects` into `procurement` so it belongs in `host`, and the order must be
born `draft`. That is its own slice. Absent is safer than present and wrong.

Also found: **TAKE-02**, `exportTakeoffToBOQ` inserts into `unit` and `qty`,
neither of which exists on `boq_items` — latent, and the same class as slice 1's
`version`. The status-first step found it before any porting effort went into it.

**Carried, not fixed: BOQ-04.** `boq_items` has no version column, so a BOQ line
edit has no optimistic lock and two concurrent edits silently lose one. Named
rather than half-solved: a lock with no column behind it would look like the
purchase-order control without being one.

Not ported, with reasons in the note: `createBOQSchedule` (no schedules table in
the new model), `importEstimationItemsToBOQ` (blocked on PO-16),
`linkPOToBOQItems` (needs the BOQ↔PO link).

Full note: [`../ports/boq-writes.md`](../ports/boq-writes.md).

### Slice A — BOQ-03, the approval bypass (done 2026-09-04)

`POST /api/v1/purchase-orders/from-boq`, in `services/host`.
**The order is born `draft`** — the legacy inserts `status` and
`approval_status` as `'Approved'` for a caller-supplied value, gated only by a
check that `session.email` is truthy. There is now no path in this system that
creates an approved order.

Closed: **BOQ-03**, and **BOQ-04** (migration `0030` adds `version` to
`boq_items`; the PATCH requires `expectedVersion`).
New: **BOQ-05** (the legacy link is `boq_items.po_no`, one PO per line, so
ordering a line twice overwrites the first) and **BOQ-06** (`boq.js:233` prices
a PO line at the **client-facing** rate when the cost is unknown, then at zero —
refused here).

Migration `0031` puts the link on `purchase_order_lines.boq_item_id`, composite
FK, `ON DELETE RESTRICT`.

### Slice 3 — vendors (done 2026-09-04)

`GET/POST/PATCH/DELETE /api/v1/purchase-orders/vendors[/:vendorId]`, migrations
`0032` and `0033`.

**Bank details are a separate table no vendor read touches** — `vendors.js:42`
does `SELECT *` and returns the account number and IFSC to any authenticated
caller (VEND-02). **VEND-01 is the fourth instance** of a write naming a column
no migration creates, so editing a vendor has never worked.

`0033` adds the foreign key `0009` could not have: `vendor_id` was a bare uuid,
so an order could name a vendor that did not exist — and the isolation suite's
own seed did exactly that.

### Slice 4 — inventory (done 2026-09-04)

`GET /stock`, `POST /stock/items|receipts|issues|transfers`, migration `0034`.

**INV-01: a stock transfer moved no stock.** `createTransfer` inserts a transfer
row and never touches `inventory_items`, and it is the only inventory write any
screen calls — so no transfer has ever changed a stock figure.

Stock is now the sum of an append-only ledger. A transfer is two rows sharing a
`transfer_id` that must sum to zero; `app_runtime` has no `DELETE` on it.

**No valuation is returned** (INV-03): the legacy's `unit_price` is the last
price paid, overwritten by each receipt and multiplied by the whole quantity on
hand. Which costing method applies is a commercial decision nobody has made.

### Slices 5 and 6 — tasks and CRM (done 2026-09-04)

`/api/v1/workflow/tasks` and `/api/v1/projects/leads`, migrations `0015` and
`0035`. Columns checked clean in both — the only two modules of seven where the
missing-column pattern does not appear.

**TASK-02** is made unrepresentable by a CHECK: completed means `completed_at`
and `completed_by` are both set. `updateTask` writes both with no COALESCE, so
any later edit erases who completed a task.

**CRM-01: four conflicting stage→probability ladders**, disagreeing by up to 15
points at the same stage. The ladder is **not ported** — `probability_pct` is
stored as entered and never derived. `pipelineTotals` computes the weighted
figure server-side; the legacy does it on a float in a browser.

### Slice 7 — the project rollup (done 2026-09-04)

`GET /api/v1/rollups/projects`, migration `0036`.

**DASH-01: the dashboard reads three keys the server does not send.** The server
returns `plannedGM`, `actualGM`, `balanceAvailable`; the component reads
`plannedGrossMargin`, `actualGrossMargin`, `balance`. `Number(undefined)` is
falsy, so the fallback always runs — and `actualGrossMargin` falls back to
`pv - po`, which PROJ-01 makes **exactly zero for every project without a
hand-entered budget**. The same screen shows a KPI card computed the server way
and a table column computed the fallback way.

**PROJ-02**: `0036` adds `purchase_orders.project_id`. The legacy carries a
project *name* matched with `LIKE '%…%'`, so a per-project spend total is the sum
over whatever the substring caught.

**Six figures are absent, not zero** — inflow, outflow, TDS, actual margin,
planned margin, balance. All come from the payment path and none of those tables
exists. A test asserts each name is missing from the response.

**Slices A and 3 through 7 are complete.** Next: the remaining views that are
not CA-gated — change orders, site controls, recce, design, document vault,
estimation and takeoff. Scouted; findings and scope decisions are recorded in
the port notes as each lands.

## Order

**Endpoints before screens.** The sequence that unblocks the most:

1. Purchase-order writes and the **approval decide endpoint** — the latter must
   live in `services/host`, because `recordApproval` needs the owning
   aggregate and no service may import another (`eslint.config.mjs` generates a
   restricted zone per ordered pair). This is composition, and the composition
   root is the only legal home for it.
2. BOQ writes, estimation, takeoff — one service, three views.
3. Vendors, inventory, tasks, CRM.
4. Payments, reports, client billing — **these stay last and stay blocked**
   until `CA-01`…`CA-09` come back. ADR-0014 forbids shipping a filed figure
   computed under a rule no chartered accountant has seen, and these are the
   views that display them.

## Done when

- Every row above is `ported` or explicitly `will not port` with a reason.
- No file under `apps/` multiplies, divides, or rounds money. Asserted by a
  test, not by review.
- No file under `apps/` derives a role or permission. Same.
- Each ported view has its two commits in the history.

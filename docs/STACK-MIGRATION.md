# Stack Migration

**Status:** approved · **Date:** 2026-09-03

What the legacy stack is, what it becomes, and why. Figures below are measured
from `_legacy/atelier-current/`, not estimated.

---

## The dominant risk — it is not technical

**The legacy code is the only specification, and it is unreliable.** This
outranks every stack decision in this document.

### Identity is fuzzy, so "a correct port" is undefined

Projects join via `LOWER(TRIM(project)) LIKE '%…%'`. Payments link by
string-cast ID comparison. Workflow state is substring matching —
`stage.includes('reject')`. There is a `mergeProjects` RPC precisely because
name-keying corrupts.

When tenant #1's data moves to Postgres with real foreign keys and enum states,
rows that fuzzily matched will stop matching and **the customer's historical
totals will change**. Reconciling old dashboard figures against new ones is
unscoped archaeology, and it lands at go-live.

### Parts of the statutory logic are wrong

Multi-tenancy turns one customer's tolerated quirks into every customer's
exposure, with our name on the SOC 2 report.

| Location | Defect |
|---|---|
| `components/views/settings/SettingsNumberSeriesTab.js` | **The current number of a document series is an editable field.** Lowering it re-issues numbers already printed on purchase orders sent to vendors, and nothing in that app constrains it. Not ported: `saveSeriesFormat` names `last_number` nowhere and no request shape carries it |
| `NumberSeriesService._syncWithExistingPOs` | Reconstructs the counter by pulling trailing digits off existing purchase-order numbers with a regex. Not ported — numbers here have been allocated from the counter row since M1, so there is nothing to reconstruct and a regex over document identifiers introduces a duplicate rather than avoiding one |
| `NumberSeriesService.getFinancialYear:16` | Reads `new Date().getMonth()` in whatever timezone the process runs in. **Diverged deliberately, not ported:** our containers run UTC, under which every document raised between 00:00 and 05:29 IST on 1 April is filed in the financial year that ended the night before. `domain/number-format.ts` computes the date in `Asia/Kolkata` explicitly, and `tests/number-format.test.ts` pins the 31 March / 1 April boundary from both sides |
| `NumberSeriesService.getNextNumber` | Has no notion of a year, so its counter runs straight through April. Carried over as the DEFAULT (`reset_each_fy` false), with a restart offered as a setting — the two produce different numbers on the same document, so it is a decision rather than a fix. A restart is refused unless the year is in the number, in the application and by a CHECK constraint, because otherwise the same string is issued twice a year apart |
| `app/lib/tdsChallan281.js:54` | **Fabricates a default TAN (`'DELM12345F'`) into generated 26Q e-filing content** when one is missing |
| `calculateChallanInterest` | Computes 201(1A) interest from the *due* date rather than the deduction date, by calendar-month difference |
| — | **No 194C threshold tracking** anywhere (₹30k single / ₹1L annual) |
| `app/lib/api/statutory-tally.js` | `generateTallyVoucherXML` interpolates vendor names **unescaped** — "M/s A&B Interiors" breaks the voucher |
| `app/lib/api/statutory-tally.js` | `generateTallyVoucherXML` emits a bare `<TALLYMESSAGE>` — no `<ENVELOPE>`, `<HEADER><TALLYREQUEST>Import Data`, `<BODY><IMPORTDATA>`, and no `ALLLEDGERENTRIES.LIST`, so there is no double entry. **Tally cannot import it.** `syncVoucherToTally` then treats HTTP 200 as success without reading the body, and Tally answers 200 while rejecting — so every `tally_sync_logs` row marked *Synced (Live Gateway)* is meaningless. **No voucher has ever reached Tally.** Also: no `SVCURRENTCOMPANY` (imports into whichever company is open), a locally fabricated `TALLY-GUID-…` stored as though Tally returned it, `CREATED=0` with `ERRORS=0` read as success, no idempotency, and the date is not normalised to `YYYYMMDD` — it works by accident for date-only `po_date` and breaks for `created_at`. Found by the connector workstream. |
| `app/lib/api/auth.js:253` | Invite URL is the hardcoded demo domain `https://lwa-iota.vercel.app`. Per-tenant configuration owned by `services/tenancy`; a compiled-in domain cannot serve a multi-tenant product |
| `app/api/rpc/route.js` | **Unauthenticated privilege escalation.** Session lookup failure is swallowed; args are padded but never truncated; dispatch is `api[method](...args, session)`, so for an arity-1 function an attacker-supplied first argument binds to `session`. Seven files accept a payload object as the session — `estimation.js:15`, `client-billing.js:15/67/257`, `crm.js:15`, `boq.js`, `payments/approve.js`, `payments/other.js`. `requireAdminConsole` then reads roles off that object. **Validation is decorative:** `validateRpcInput` returns `.data`, which is discarded — the original unvalidated object is passed |
| `app/lib/api/purchase-orders/write.js:55` | **Server trusts a client-supplied `gst_amount`** when present |
| `app/lib/api/purchase-orders/write.js:157` | Also trusts client `item.amount` — the line total itself |
| `app/lib/api/purchase-orders/write.js:65` | `financiallyChanged` compares money with a `> 0.5` float tolerance. Port verbatim, then fix |
| `app/lib/api/purchase-orders/write.js:141–146` | `po_no` is a **mutable primary key** cascaded across five tables by loose `UPDATE`s, with no transaction wrapping them |
| `estimationCalculations.js:20` vs `EstimationView.js:120` | The 4-factor formula exists **twice and disagrees**: server rounds `baseRate` before applying GST, client applies GST to the unrounded base. A sweep of material 100–399 disagrees on **132 of 300** inputs. The client's own breakdown does not add up, and the displayed figure is not the stored figure |
| `TDSService.ts` vs `tdsChallan281.js:6` | TDS rates exist twice. `tds_sections` carries `effective_from`/`effective_to`/`threshold`/`surcharge`/`cess` and **no query filters on any of them** — the schema already claims effective-dating that nothing honours |
| `getProjectFullDossier` (`projects.js:449`) | Project identity has **three** semantics in one feature: POs by `WHERE project = ?`, BOQ by `LIKE '%…%'`, and `POsView.js:160` filters in-browser on bidirectional substring. `project_financials` is keyed by the name string, and `mergeProjects` sums floats and rewrites names with no record of the prior value |
| `components/views/POsView.js:136–154` | Derives roles client-side (`isSuperAdmin(user?.email)`) and computes TDS in the browser |
| `estimationCalculations.js:20` **RATE-01** | Rounds `baseRate` to whole rupees **before** applying GST, so tax is charged on a rounded figure. Ported verbatim 2026-09-04; fixed separately |
| `estimationCalculations.js:6-8` **RATE-02** | `Number(x \|\| y \|\| 0)` — the `\|\|` runs *before* `Number()`, so a truthy non-numeric input (`'12,500'`, a rupee amount typed with a comma) becomes **NaN** and propagates through every step into a `REAL` column. Missing input silently becomes 0. An explicit `0` falls through to the next alternative because `0` is falsy |
| `estimationCalculations.js:14` **RATE-03** | GST defaults to 18 when absent **and when explicitly 0**, so a zero-rated supply is inexpressible |
| **RATE-04** — three implementations | The 4-factor formula exists three times and all three disagree on identical input: `estimationCalculations.js` (authoritative, stored) gives **481**, `EstimationView.js:132` (displayed to the user) gives **482**, `scripts/audit_end_user_flows.js:122` gives **481.88** while its own comment claims 481.87. The number on screen is not the number in the database |
| `boq.js:365` **RATE-05** | Imports an estimation item into a BOQ using `final_rate_with_gst` as the unit rate with quantity hardcoded to 1 — embedding tax inside a rate. PO-16 |
| `BoqView.js:137` **RATE-06** | Derives a missing `cost_rate` as **78% of the selling rate**. No stated basis. PO-15 |
| `takeoff.js:337` **TAKE-01** | A missing client rate becomes **cost x 1.25** — a markup with no stated basis, unrelated to the 4-factor engine the rest of the system prices with. Two pricing models, silently |
| `takeoff.js:337` **TAKE-02** | A missing *cost* rate becomes a bare **100**, which is then marked up and quoted |
| `takeoff.js:337` **TAKE-03** | `\|\|` means an explicit zero cost also falls through to 100 |
| `public/uploads/` **VAULT-01** | A **publicly servable directory** holding signed client contracts. Anything written there is reachable by URL with no authentication |
| `db.js:148-158` **VAULT-02** | `attachments.file_data TEXT NOT NULL` — file bytes base64-encoded into a row. Every query touching the table drags the payload, backups carry it, and the document's audit trail is the document |
| — **VAULT-03** | Uploads go through Cloudinary **and** `fs.writeFile`, so where a document lives depends on which code path created it |
| `projects.js:118-120` **PROJ-01** | `poIssued` and `projectValue` are incremented by **the same** `val` in one loop, so with no `project_financials` override the two are identical. The health band then divides one by the other, gets exactly `1`, and every such project reads **"At Risk"** permanently — never "On Track", never "Over Budget". Measured in `project-financials-legacy.test.ts` |
| `projects.js:169` **PROJ-02** | `Number(row.project_value) \|\| projectsMap[name].projectValue` — an override of **exactly zero** falls through to the computed value, so a deliberate zero budget cannot be expressed |
| `projects.js:209` **PROJ-03** | `project TEXT PRIMARY KEY` in `project_financials`. The project **name** is the key, so renaming orphans the financials and two spellings are two projects. TOPOLOGY defect 1, in its most damaging form |
| `projects.js:467` **PROJ-04** | `WHERE LOWER(project) LIKE '%…%'` for BOQ schedules inside `getProjectFullDossier`, while every sibling query uses `project = ?`. "Tower A" therefore also matches "Tower A - Phase 2" — one fuzzy join among exact ones |
| `projects.js:185-191` **PROJ-05** | `plannedGM`, `actualGM` and `balanceAvailable` are raw float arithmetic on `REAL` columns. `balanceAvailable` has no floor, unlike `pendingInflow`/`pendingOutflow`, which are wrapped in `Math.max(0, …)` — so the same quantity is guarded in one place and not another |
| `ProjectsSidebar.js:6-14` **PROJ-06** | The health band is computed **in the browser**, from money fields the browser also receives raw. A negative `projectValue` passes `!pv` and yields a negative ratio, which reads as "On Track" |
| `boq.js:114` **BOQ-01** | `Number(realPayload.amount) \|\| Math.round(qty * rate * 100) / 100` — a **client-supplied line amount wins** whenever it is truthy. Same hole as `write.js:55`; rule 3 forbids carrying it, so there is no verbatim commit for it |
| `BoqView.js:137` **BOQ-02** | A missing `cost_rate` is invented as **78% of the selling rate**, and that guess then drives every margin figure shown. PO-15 |
| `change-orders.js:62-94` **CO-01** | Change-order approval bypasses the approval engine entirely and sets a status string directly. With site imprest and DPR doing the same, "who may approve what" has four different answers in one codebase |
| `change-orders.js:79-86` **CO-02** | Approval **rewrites the linked contract value in place**, so after two variations the originally signed figure is gone and a dispute cannot be settled from the data |
| `change-orders.js:107` **CO-03** | `approveChangeOrderAsClient` decides by `decision === 'Reject'` and treats **everything else** — a typo, an empty string, a missing field — as approval. A client portal that approves a contract variation by default is not a signature |
| `ApprovalWorkflowService.ts:261-303` **APPR-01** | **One user can walk the entire approval chain.** The loop advances while the caller holds the next role, and `admin`/`director` are exempt from the break — so one call from an administrator carries a request from the first stage to the last. A three-stage chain one person can satisfy alone is not a control, and separation of duties is the first thing a SOC 2 auditor tests |
| `PaymentsView.js:448` **APPR-02** | **No server-side self-approval check.** The only creator comparison is client-side and gates loading a summary, not the approve action. The server never compares approver against requester |
| `core.js:193-211` **APPR-03** | **Nine stage fields configured, one evaluated.** `min_approval_count`, `approval_type`, `specific_user`, `department`, `comments_mandatory`, `auto_approval`, `escalation_ready` and `skip_conditions` are all accepted and ignored; execution reads only `approver_role`. Configuring "two approvers required" silently yields one |
| `ApprovalWorkflowRepository.ts` **APPR-04** | Three parallel audit trails with opposite guarantees: `approval_history_v2` is insert-only, `po_approval_history` is rewritten on a PO rename and deleted with the PO, and `audit_logs` is queried by `details LIKE '%(ID: n)%'` |
| `PaymentService.ts:141,157` **APPR-05** | Approval history is written **after** the state change and **outside a transaction**, so a failure between them leaves an approved record with no history |
| `payments/other.js:104-163` **APPR-06** | `bulkApprovePayments` and `bulkRejectPayments` are **not transactional** — each item has its own try/catch and partial success is returned. `bulkRemitPayments` *is* transactional but its post-transaction audit and broadcast report counts that did not persist after a rollback |
| `AuthService.ts:10` vs `config.js:19` **APPR-07** | **Two `isSuperAdmin` implementations with different hardcoded email lists** |
| `dprCalculations.js:8` **DPR-01** | `parseInt` takes a prefix of free text: `'12 workers'` is 12, `'1.9'` is 1, `'0x10'` is 16. A headcount on a signed site document derived from a prefix of whatever was typed |
| `dprCalculations.js:8` **DPR-02** | `\|\| 0` turns an unparseable count into zero, so a malformed entry *lowers* the reported headcount on a document supporting a progress claim |
| `dprCalculations.js:8` **DPR-03** | A negative count is accepted and subtracts from the total |
| `takeoff.js:337` **RATE-07** | Derives a missing `clientRate` as **cost x 1.25**. Not the 4-factor engine, and unrelated to it. PO-15 |

### Required workstream — M2.5, before the money path is ported

1. Extract the rules from code into a written rule spec.
2. **Verify each against statute with a practising CA.**
3. Encode as **effective-dated** rate tables — TDS rates change every Budget, so
   the engine must be time-versioned.
4. Lock with golden-file tests per financial year.
5. **Never fix a rule and port it in the same commit.** Port mechanics verbatim;
   correct defects separately, behind tests.

### The authority-inversion rule

Typed contracts fix payload *shape* only. The porting rule is explicit:

> **The server computes every monetary figure and every permission. Clients
> display.**

A faithful port otherwise preserves the hole through a fully-typed pipeline.

---

### Purchase-order writes — PO-19..PO-23

Full note: [`ports/purchase-order-writes.md`](ports/purchase-order-writes.md).

`updatePOFull` (`write.js:23-182`) is the legacy's only update path, and both of
its branches write `version = COALESCE(version, 1) + 1` on a table that has no
`version` column — absent from `db.js:86`, from the `poColumns` ALTERs at
`core.js:89-93`, and from all nine `ALTER TABLE purchase_orders` at
`migrations.js:65-73`; the only `ADD COLUMN version` targets `payment_requests`
(`migrations.js:43`). libSQL raises `no such column` and `executeWithRetry`
(`db.js:281`) rethrows it. **Editing a purchase order throws, always**, so the
defects below that line have never executed.

The **status** column matters more than the rows. Four of these five were
believed live.

| Ref | Site | Defect | Status |
|---|---|---|---|
| **PO-19** | `write.js:142` | A rename cascades the primary key across five tables with loose UPDATEs and no transaction, while `boq_items` (`migrations.js:178`) and `vendor_retention_ledger` (`migrations.js:273`) also carry `po_no` and are **not** in the list. Retention is released in stages months later, so an orphan there surfaces long after anyone could connect it to a rename | **latent** |
| **PO-20** | `write.js:55` | A client-supplied `gst_amount` overrides the computed figure. The live create path (`POService.ts:49`) always computes, so create was never exposed | **latent** |
| **PO-21** | `write.js:157` | A client-supplied `amount` becomes the line total itself | **latent** |
| **PO-22** | `write.js:96` | Optimistic locking applies only when the client sends `expectedVersion` — a control the caller can decline | **latent** |
| **PO-24** | `read.js:189`, `POsView.js:301` | `peekNextNumber` returns the next PO number **without reserving it** — its own doc comment says so — and the screen puts it in the form when the modal opens. Two users who open it together are shown the same number and the second collides on submit. Replaced by allocation inside the insert transaction (migration `0021`); the preview endpoint is named so it cannot be mistaken for a reservation | **LIVE** |
| **PO-23** | `POService.ts:48`, `:160` | `totalVal = subt + gstSum - tdsAmt`, stored to both `po_value` and `revised_po_value`. The stored order value is net of a deduction that has not been made, so it is neither the order nor the payment. `committedSpend` in `services/projects` sums this column | **LIVE** |

**PO-23 is a data-migration hazard, not only a defect row.** Legacy `po_value`
cannot be loaded into `procurement.purchase_orders.gross` as it stands: it must
be un-netted using the `tds_amount` beside it, or every imported order silently
understates. Recorded on the column itself in migration `0020`.

The replacement stores `gross = taxable + gst` and nets nothing. Declining to
compute a figure needs no CA ruling; computing one would be a rate application
on the money path, which belongs with CA-05..CA-08.

---

### BOQ writes — BOQ-03, BOQ-04, TAKE-02

Full note: [`ports/boq-writes.md`](ports/boq-writes.md).

| Ref | Site | Defect | Status |
|---|---|---|---|
| **BOQ-03** | `boq.js:174`, `:253` | **A purchase order minted from a BOQ line is created already approved, for a caller-supplied value.** The INSERT hardcodes `status` and `approval_status` to `'Approved'`, and `:170` takes `payload.poValue` when present. The only gate is `requireAuth`, which checks that `session.email` is truthy and nothing more (`AuthService.ts:17-21`). Both functions are in the RPC allowlist (`route.js:156`, `:157`). Every approval control — entitlement, self-approval refusal, quorum — is bypassed by an endpoint that writes the same table | **LIVE** |
| **TAKE-02** | `takeoff.js:325-328` | Inserts into `boq_items (… unit, qty …)`. The columns are `uom` and `quantity` (`migrations.js:117-131`); no `ALTER` adds either name. libSQL raises `no such column`, so exporting a takeoff to a BOQ has never worked | **latent** |
| **BOQ-04** | `projects.boq_items` | No version column and no optimistic lock on a BOQ line edit, so two concurrent edits silently lose one. **Carried into the new system deliberately** and named, rather than half-solved with an application-layer check that has no column behind it | **LIVE, carried** |

**BOQ-03 has no replacement yet, and that is the intended state.** There is no
endpoint in the new system that mints a purchase order from a BOQ line. Building
one needs a BOQ↔PO link (`0011` has none — the legacy uses `po_no`, the mutable
key of PO-19) and crosses `projects` into `procurement`, so it belongs in
`services/host` as composition. When built, the order must be born `draft` and
enter the ordinary chain. Absent is safer than present and wrong.

---

### The BOQ→PO path — BOQ-03 closed, BOQ-05 and BOQ-06 recorded

Full note: [`ports/boq-writes.md`](ports/boq-writes.md).

| Ref | Site | Defect | Status |
|---|---|---|---|
| **BOQ-05** | `migrations.js:178`, `boq.js:394` | The BOQ→PO link is `boq_items.po_no` — **one** PO number per BOQ line — and `linkPOToBOQItems` sets it by bulk UPDATE. Ordering a line twice (partial procurement, two vendors, two tranches) overwrites the first silently. The link is now `procurement.purchase_order_lines.boq_item_id`, which is many-to-one and records provenance per order line | **LIVE** |
| **BOQ-06** | `boq.js:233` | A PO line raised from a BOQ line is priced `Number(item.cost_rate \|\| item.rate \|\| 0)` — falling back to the **client-facing selling rate** when the cost is unknown, then to zero. Neither is visible to whoever approves the order. Here a line with no cost rate is refused: `cost_rate` is NULL for UNKNOWN by design (BOQ-02), and an unknown cost has no defensible purchase-order rate | **LIVE** |

**BOQ-03 is closed.** `POST /api/v1/purchase-orders/from-boq` creates the order
through `createPurchaseOrder`, which writes `'draft'`, behind the tenant
middleware. There is no second creation path and no path that produces an
approved order. The legacy's `tax_pct: 18` (`boq.js:244`) was not carried: the
works-contract GST rate is CA-16 and open, so the rate is supplied per request.

**BOQ-04 is closed.** Migration `0030` adds `version` to `projects.boq_items`
and the PATCH requires `expectedVersion`, which the caller cannot omit.

---

### Vendors — VEND-01..VEND-05

Full note: [`ports/vendors.md`](ports/vendors.md).

| Ref | Site | Defect | Status |
|---|---|---|---|
| **VEND-01** | `VendorRepository.ts:64` | Every vendor update writes `version = COALESCE(version, 1) + 1` against a column no migration creates — `db.js:73` omits it, migration 012's `CREATE TABLE IF NOT EXISTS` is a no-op on the existing table, and the ALTER loop at `migrations.js:388-395` does not include it. **Editing a vendor has never worked.** The fourth instance of this exact bug class | **latent** |
| **VEND-02** | `vendors.js:42` | `getVendorByName` does `SELECT *` and returns the vendor bank account number and IFSC to any caller `requireAuth` admits — and that checks only that `session.email` is truthy | **LIVE** |
| **VEND-03** | `VendorRepository.ts:15` | `findByNameOrCode` matches `legal_name = ? OR vendor_code = ?`; `legal_name` has no unique constraint, so two vendors may share one and the lookup returns whichever comes first | **LIVE** |
| **VEND-04** | `vendors.js:163`, `:199` | Vendor purchase orders and payment requests are found with `LOWER(vendor_name) LIKE '%…%'` | **LIVE** |
| **VEND-05** | `vendors.js:25`, `:33` | Any authenticated principal may create or edit any vendor. No role check | **LIVE** |

Bank details now live in `procurement.vendor_bank_accounts`, which **no vendor
read touches** — a structural answer to VEND-02 rather than a filtering habit.
Identity is a surrogate uuid, closing VEND-03 and VEND-04 by construction.

**Migration `0033` adds the foreign key `0009` could not have.**
`procurement.purchase_orders.vendor_id` was `uuid NOT NULL` with no FK because
no vendors table existed, so an order could name a vendor that did not — and
the isolation suite's own seed did exactly that with `randomUUID()`.

---
### Inventory — INV-01..INV-06

Full note: [`ports/inventory.md`](ports/inventory.md). Columns checked clean —
every write names a column that exists, unlike purchase orders, takeoff and
vendors.

| Ref | Site | Defect | Status |
|---|---|---|---|
| **INV-01** | `inventory.js:143-170` | **A stock transfer moves no stock.** `createTransfer` inserts an `inventory_transfers` row and never touches `inventory_items`. It is the only inventory write any screen calls (`InventoryView.js:51`), so no transfer has ever changed a stock figure | **LIVE** |
| **INV-02** | `inventory.js:153` | Transfer ids are `Math.floor(400 + Math.random() * 500)` against a `TEXT PRIMARY KEY` — 500 values, so a collision is more likely than not after ~26 transfers | **LIVE** |
| **INV-03** | `InventoryView.js:79`, `:161` | Stock valuation is `quantity * unitPrice` in the browser, where `unit_price` is one column each goods receipt overwrites — the last price paid, applied to stock bought at other prices | **LIVE** |
| **INV-04** | `inventory.js:69`, `:125` | Stock is a running balance read into JavaScript, adjusted and written back. Two concurrent issues lose one | **LIVE** |
| **INV-05** | `inventory.js:180` | `listTransfers` accepts a filters argument and applies none of it | **LIVE** |
| **INV-06** | `migrations.js:436` | `quantity_on_hand REAL` — a float quantity multiplied by a unit price | **LIVE** |

**Stock is now the sum of an append-only ledger**, which answers INV-01, -02,
-04 and -06 together: a transfer is two rows sharing a `transfer_id` that must
sum to zero, every movement is an INSERT, and quantities are `bigint`
millionths. `app_runtime` has `SELECT, INSERT` and no `DELETE` on the ledger.

**INV-03 is left unbuilt on purpose.** No valuation is returned anywhere and a
test asserts the absence. The legacy figure is not an imprecise valuation, it is
not one — and which costing method applies is a commercial decision, not a
statutory one.

---
### Tasks and CRM — TASK-01..04, CRM-01..06

Full note: [`ports/tasks-and-crm.md`](ports/tasks-and-crm.md). **Columns checked
clean in both modules** — the second and third of six where the
column-that-does-not-exist pattern does not appear.

| Ref | Site | Defect | Status |
|---|---|---|---|
| **TASK-01** | `tasks.js:16-48` | The `tasks` table is created by `ensureTasksTable()` at the top of all six task functions, inside a `try/catch` that swallows the error, and is never recorded in `schema_migrations` | **LIVE** |
| **TASK-02** | `tasks.js:247-248` | `updateTask` writes `completed_at` and `completed_by` with **no COALESCE**, unlike every other field in the same statement, so any later edit erases who completed the task and when | **LIVE** |
| **TASK-03** | `tasks.js:94`, `:138` | Assignment is a lowercased email matched with `LOWER(assigned_to) = ?`, with no foreign key | **LIVE** |
| **CRM-01** | four places | **Four conflicting stage→probability ladders** — `CrmView.js:402-407`, `crm.js:131-139`, the column default of 40 and the read fallback of 40 — disagreeing by up to 15 points at the same stage. The weighted pipeline is a mix of ladders nobody chose | **LIVE** |
| **CRM-02** | `CrmView.js:53`, `:157` | Money multiplied by a probability on a float in a browser, then divided by 10,000,000 for crores | **LIVE** |
| **CRM-03** | `crm.js:57`, `:179` | Lead and project ids are `Math.random()` over 900 and 8000 values against `TEXT PRIMARY KEY` | **LIVE** |
| **CRM-04** | `crm.js:78`, `:43` | The lead owner is a display name or the literal `'Sales Team'`, read back as `'Sales Manager'` | **LIVE** |
| **CRM-05** | `crm.js:81` | `expected_close` defaults to the string literal `'15 Dec 2026'` | **LIVE** |

`workflow.tasks` makes TASK-02 unrepresentable with a CHECK: completed means
`completed_at` and `completed_by` are both set, anything else means neither is.
Assignment is a composite FK to `identity.principals`.

**The probability ladder is not ported.** `probability_pct` is stored as
entered and never derived from the stage — inventing a fifth ladder is the move
that produced the first four. `pipelineTotals` computes the weighted figure
server-side through `mulRatio` with a named boundary.

---
### The dashboard — DASH-01..DASH-03, PROJ-02

Full note: [`ports/project-rollup.md`](ports/project-rollup.md).

| Ref | Site | Defect | Status |
|---|---|---|---|
| **DASH-01** | `DashboardFinancialSection.js:115`, `:117`, `:119` | The screen reads `plannedGrossMargin`, `actualGrossMargin` and `balance`; the server sends `plannedGM`, `actualGM` and `balanceAvailable`. `Number(undefined)` is falsy, so the `\|\|` fallback **always** runs — and `actualGrossMargin` falls back to `pv - po`, which PROJ-01 makes **exactly zero for every project without a hand-entered budget**. The same screen shows a KPI card computed the server way beside a table column computed the fallback way | **LIVE** |
| **PROJ-02** | `boq.js:174`, `dashboard.js:318` | A purchase order carries a project **name** matched with `LIKE '%…%'` and bidirectional `.includes()`, so a per-project spend total is the sum over whatever the substring caught | **LIVE** |
| **DASH-02** | `projects.js:84`, `:205` | `getProjectDetails` and `updateProjectFinancials` are gated by `requireAuth` alone — any authenticated user can read and **edit** project financials. The finance functions in the same file do use `requireFinanceAccess` | **LIVE** |
| **DASH-03** | `projects.js:132`, `:208`, `:408` | `project_financials` has **three** `CREATE TABLE IF NOT EXISTS` statements with three different column sets | **LIVE** |

`GET /api/v1/rollups/projects` replaces it, with migration `0036` adding
`purchase_orders.project_id` so spend groups by an id. **Six figures are absent
rather than zero** — inflow, outflow, TDS, actual margin, planned margin,
balance — because all six come from the payment path and none of those tables
exists. A test asserts each name is missing from the response.

---
### Change orders, site controls and retention — CO-04..06, RET-01..02, IMP-01..02

Full note: [`ports/change-orders-and-site-controls.md`](ports/change-orders-and-site-controls.md).

| Ref | Site | Defect | Status |
|---|---|---|---|
| **CO-04** | `change-orders.js:62-94` | **Approving the same variation twice adds its cost twice.** Nothing checks the status before doing `contract_value = contract_value + cost_impact`, and the variation row and the contract value are separate facts nothing reconciles | **LIVE** |
| **CO-05** | `change-orders.js:35` | No sign check on `cost_impact` — a negative variation reduces what the client owes through the same unguarded path | **LIVE** |
| **CO-06** | `change-orders.js` writes | No role gate on approving a variation of any value | **LIVE** |
| **RET-01** | — | **Nothing in the legacy ever INSERTs into `vendor_retention_ledger`.** It is created, read and updated; there is no insert anywhere. Retention has never been recorded, and the release function operates on rows only a manual seed could have produced | **LIVE** |
| **RET-02** | `site-controls.js:168-170` | Releasing retention writes **no payment record of any kind**. The vendor is not paid; the ledger says they were | **LIVE** |
| **IMP-01** | `site-controls.js:72-90` | An imprest is marked reconciled against receipt text that is compared to nothing | **LIVE** |
| **IMP-02** | `site-controls.js:25`, `:53` | The same principal may request an imprest and sanction it | **LIVE** |

The change-order domain (`domain/change-order.ts`) already existed and already
fixed CO-01..CO-03; migration `0037` is the table it was written against, and
its transition table (`client_approved: []`) is what makes CO-04
unrepresentable.

**Retention records what is HELD; releasing is not built.** A release is a
payment (CA-01..CA-08), and the legacy release writes no payment record either
— so porting it would produce a ledger asserting a vendor was paid when they
were not. A test asserts no release route exists.

---
### Recce, drawings and the vault — VAULT-01/02/04, GFC-01..03, RECCE-01

Full note: [`ports/recce-drawings-vault.md`](ports/recce-drawings-vault.md).
Columns checked clean in all three modules.

| Ref | Site | Defect | Status |
|---|---|---|---|
| **VAULT-01** | `attachments.js:75-83` | Uploads fall back to `fs.writeFile` into `public/uploads/…` and the path is stored and returned. **Anything under `public/` is served by URL with no authentication at all** — there is no access control on that path, because it is static file serving | **LIVE** |
| **VAULT-02** | `db.js:148` | `attachments.file_data TEXT NOT NULL` — base64 bytes in a row, dragged by every query and carried by every backup | **LIVE** |
| **VAULT-04** | `attachments.js:137-140` | `listAllDocuments` reassigns its own `session` parameter from `filters` when that object carries `.email` or `.roles` — the RPC dispatcher's argument-sniffing, in a second place | **LIVE** |
| **GFC-01** | `DesignView.js:117` | With no file chosen, a drawing gets a fabricated URL: `https://luxeworx-vault.s3.amazonaws.com/gfc/<no>.pdf`. One tenant's bucket, and a link to a file that may not exist | **LIVE** |
| **GFC-02** | `DesignView.js:87-100` | A chosen file is base64-encoded into `gfc_drawings.file_url` | **LIVE** |
| **GFC-03** | `change-orders.js:146` | The revision chain is superseded by matching `LOWER(project) = LOWER(?)` | **LIVE** |
| **RECCE-01** | `recce.js:14-37` | The `site_recce` table is created by an inline `ensureTable()` on every call and never recorded in `schema_migrations` | **LIVE** |

**No endpoint in the replacement accepts file bytes.** `workflow.documents`
records metadata against an object-storage key built server-side; a test
asserts the table has no `file_data` and no `file_path` column, and another
asserts a foreign-prefixed key is refused by CHECK — object storage is outside
Postgres, so no RLS policy reaches it.

Whether tenant #1 has files under `public/uploads/` today is knowable only from
their deployment. It is on the M2.5 reconciliation list.

---
### Recce, drawings and the document vault — VAULT-01/02/04, GFC-01..03, RECCE-01

Full note: [`ports/recce-drawings-vault.md`](ports/recce-drawings-vault.md).

| Ref | Site | Defect | Status |
|---|---|---|---|
| **VAULT-01** | `attachments.js:75-83` | Uploads fall back to `fs.writeFile` into `public/uploads/<entityType>/<entityId>/` and the path is stored and returned. **Anything under `public/` is served by URL with no authentication** — and CLAUDE.md names that folder as holding signed contracts | **LIVE** |
| **VAULT-02** | `db.js:148` | `attachments.file_data TEXT NOT NULL` — base64 bytes in a row, dragged by every query and every backup | **LIVE** |
| **VAULT-04** *(new)* | `attachments.js:137-140` | `listAllDocuments` reassigns its own `session` parameter from `filters` when that object carries `.email` or `.roles` — the argument-sniffing that makes the RPC dispatcher a privilege-escalation surface | **LIVE** |
| **GFC-01** *(new)* | `DesignView.js:117` | With no file chosen, the drawing URL falls back to a hardcoded `luxeworx-vault.s3.amazonaws.com` path built from the drawing number — one tenant's bucket, pointing at a file that may not exist | **LIVE** |
| **GFC-02** *(new)* | `DesignView.js:87-100` | A chosen file is base64-encoded whole into `gfc_drawings.file_url TEXT` | **LIVE** |
| **GFC-03** *(new)* | `change-orders.js:146` | Superseding a revision matches the project by name | **LIVE** |
| **RECCE-01** *(new)* | `recce.js:14-37` | `site_recce` is created by an inline `ensureTable()` at the top of every function and never recorded in `schema_migrations` — the same shape as TASK-01 | **LIVE** |

Columns checked clean in all three. With tasks and CRM, that is **five of the**
**ten modules scouted** where the missing-column pattern does not appear.

**No endpoint accepts file bytes**, and a test asserts `workflow.documents` has
no `file_data` or `file_path` column. Object keys are built server-side and the
table re-derives the same string in a CHECK — object storage sits outside
Postgres, so no RLS policy reaches it and the prefix is the only boundary there
is.

A GFC drawing references a vault document **or nothing**; there is no URL
column, so GFC-01 and GFC-02 are unrepresentable rather than discouraged.

---
### Estimation and takeoff — EST-01..03, TAKE-02..05

Full note: [`ports/estimation-and-takeoff.md`](ports/estimation-and-takeoff.md).

| Ref | Site | Defect | Status |
|---|---|---|---|
| **TAKE-02** | `takeoff.js:324-340` | `INSERT INTO boq_items (… unit, qty …)` — the columns are `uom` and `quantity`, and `id` is omitted | **latent** |
| **TAKE-03** | `takeoff.js:307-316` | `INSERT INTO boq_schedules (… description …)` — no such column, and `id` omitted again | **latent** |
| **TAKE-04** | `takeoff.js:337` | A missing client rate becomes `(costRate \|\| 100) * 1.25` — and the fallback **cost** of 100 is itself invented | **LIVE** |
| **TAKE-05** | `takeoff.js:309` | An exported schedule is born `Approved`, and `boq.js:298` then refuses edits to approved schedules | **latent** |
| **EST-01** | `estimationCalculations.js:20-23` | The base rate is rounded to whole rupees, then GST is applied to the **rounded** figure and rounded again — mid-formula, twice, on a float | **LIVE** |
| **EST-02** | `EstimationView.js:257` | The screen recomputes the rate on every render and shows that; `boq.js:365` imports the **stored** value. Two engines, one shown and one used | **LIVE** |
| **EST-03** | `EstimationView.js:199-208` | The KPI cards hardcode 15.0% margin and 18.0% GST as display text | **LIVE** |

**`exportTakeoffToBOQ` has never run** — TAKE-02 and TAKE-03 are two
missing-column inserts in the same function and it fails on the first. So the
feature blocked on PO-16 is a feature that has never worked, and nothing is
lost by leaving it unbuilt.

Counting the whole milestone, that is the **sixth, seventh and eighth**
instance of a write naming a column no migration creates, after
`purchase_orders.version` (PO-22), `boq_items.unit`/`qty` and
`vendors.version` (VEND-01).

The stored estimation rate is **pre-tax with no GST column**, which is what
keeps PO-16 answerable rather than answered by inference.

---
### Estimation and takeoff — EST-01..03, TAKE-02..05

Full note: [`ports/estimation-and-takeoff.md`](ports/estimation-and-takeoff.md).

| Ref | Site | Defect | Status |
|---|---|---|---|
| **EST-01** | `estimationCalculations.js:20-23` | `baseRate` is rounded to whole rupees, **then GST is applied to the rounded figure and rounded again** — mid-formula rounding, twice, on floats. This is the mechanism behind PO-17 | **LIVE** |
| **EST-02** | `EstimationView.js:257` | The screen recomputes the breakdown every render and shows **that**, while `boq.js:365` imports the **stored** rate. Two engines, one shown and one used, nothing comparing them | **LIVE** |
| **EST-03** | `EstimationView.js:199-208` | KPI cards hardcode `15.0%` margin and `18.0%` GST as display text unrelated to any item | **LIVE** |
| **TAKE-03** *(new)* | `takeoff.js:307-316` | `INSERT INTO boq_schedules (… description …)` — no such column, and the required `id` is omitted | **latent** |
| **TAKE-04** *(new)* | `takeoff.js:337` | A missing client rate becomes `(costRate \|\| 100) * 1.25` — a markup on a fallback cost of 100 nobody chose | **LIVE** |
| **TAKE-05** *(new)* | `takeoff.js:309` | An exported schedule is created `Approved` outright, and `boq.js:298` then refuses edits to approved schedules | **latent** |

**`exportTakeoffToBOQ` has never run.** TAKE-02, TAKE-03 and TAKE-05 are all in
that one function and the first insert throws — the sixth, seventh and eighth
instances of the missing-column pattern in this port, all in one place. So the
feature blocked on PO-16 is a feature that has never worked.

The replacement stores a **pre-tax** rate with no GST column and recomputes the
breakdown from the stored factors on every read. Takeoff scale is an exact
rational rather than `REAL`, and a sheet total is `null` — with the offending
items **named** — when any item lacks a rate.

---
## Current stack — measured

| Dimension | Measurement |
|---|---|
| Source files | 201 `.js`, 29 `.ts`, **0 `.tsx`/`.jsx`** |
| Client vs server | 55 `'use client'` components, 7 route handlers |
| API surface | **exactly 217** unique allowlisted RPC names behind one `/api/rpc`; **216 resolve** (`listAuditLog` is allowlisted but never exported — a dead 404). The earlier ~249 figure counted exports: `app/lib/api/**` exports 235 functions, **18 of them not allowlisted**, including `getJwtSecret`, `encryptToken` and `decryptToken` leaking through the barrel |
| Validation | **7** Zod schemas → **~3% of the API validated**; every field `.optional()`, three casings accepted per field |
| Data access | **611** `queryAll`/`queryGet`/`queryRun` call sites across **51 files** |
| Logic placement | **17 `'use client'` files** perform money arithmetic (measured on `/ 100` and `Math.round()`) vs 8 server files. An earlier count of 23 could not be reproduced; the contracts inventory settles it |
| Tests | None. No framework installed |
| Schema DDL | Spread across **10 files**. `vendors` is created **twice** with different nullability on `legal_name`, so the live constraint depends on which ran first |

### Configuration defects

0. **Money is floating point.** Every monetary column is `REAL` — `amount`,
   `rate`, `gross_amount`, `tds_amount`, `tds_deducted`, `tds_percentage`,
   `net_receivable`. No decimal library anywhere. `paymentCalculations.js`
   guards only with `Number(value) || 0`, which silently turns corrupt data into
   zero when a statutory system should throw.
1. **TypeScript is effectively disabled** — `typescript: { ignoreBuildErrors:
   true }` in `next.config.mjs`. The 29 `.ts` files give no build guarantee.
2. **`target: "es5"`** for a React 19 / Next 16 app.
3. **Conflicting path aliases** — `tsconfig.json` maps `@/*` → `./src/*`;
   `jsconfig.json` maps it → `./*`.
4. **Turbopack configured but opted out.** A `webpack()` function stubs
   `node:fs`, `node:http`, `node:stream`, `node:zlib` to `false` on the client
   because `jspdf`/`html2pdf.js` drag Node built-ins into the browser bundle.
   **Client-side PDF is the root cause of the Turbopack opt-out.**
5. **`pdfjs-dist` declared, used in 0 files.**
6. **Secrets** — `.env.example` ships a real-looking default `JWT_SECRET`; dev
   silently generates an in-memory secret when unset.
7. **Sessions** — AES-256-GCM + HKDF, fixed 7-day expiry, no rotation.
8. **Uploads written two ways** — Cloudinary *and* `fs.writeFile` into
   `public/uploads/`, a publicly servable directory.
9. **SSE polls `broadcast_events` every 2s, per connected client.**

> **Correction to the legacy README:** there is no PowerPoint export code. No
> pptx library is present and no export function exists — the `.pptx` in
> `public/` was produced by hand. References to a "WPR PowerPoint exporter" are
> wrong.

---

## Target stack

### Foundation
| | |
|---|---|
| Language | **TypeScript 5.x**, `strict: true`, target **ES2022**. `ignoreBuildErrors` deleted — type errors fail CI |
| Runtime | **Node 22 LTS** |
| Packages | **pnpm** workspaces |
| Build | **Turborepo**, affected-only |
| Containers | **Docker** everywhere — `docker compose up` is the entire setup |

### Frontend — `apps/`
**Next.js 16** App Router · **React 19** · **Turbopack** (unblocked once PDF
moves server-side) · **Tailwind CSS** v3 now, v4 at `design-system` extraction ·
**lucide-react** (kept — 87 files use it) · **clsx** + **tailwind-merge** ·
**Storybook** in `packages/design-system`.

### Backend — `services/`
| | |
|---|---|
| HTTP | **Hono** — thin, standards-based; services are libraries composed into one API host |
| Database | **Postgres 17** with **row-level security** |
| ORM | **Drizzle** + **drizzle-kit** versioned migrations — over Prisma, for `SET LOCAL` and transaction control |
| Driver | **pg** |
| Validation | **Zod v4** in `packages/contracts`, 100% of endpoints |
| Jobs | **pg-boss** — Postgres-backed. **No Redis**: one less container, one less thing to operate |
| Logging | **pino**, correlated by tenant / user / request |
| Tracing | **OpenTelemetry** |

### Money — `packages/money`, built before any feature code
| | |
|---|---|
| Storage | **`BIGINT` paise** — not `NUMERIC`, which invites a stray `parseFloat` later |
| Types | Branded **`Paise`**; percentages get their own exact type (0.75% and 0.1% TDS rates exist) |
| Enforcement | The **only** module permitted to multiply or divide money, enforced by an ESLint restriction — not convention |
| Rounding | Statutory boundaries, named and cited in comments: **Sec 170 CGST** rounds per invoice per head, **Sec 288B** to the nearest ₹10, challans are whole rupees |
| Tests | **fast-check** properties (`CGST + SGST === totalGST`), golden files per financial year |

Magnitude was never the risk — 2⁵³−1 paise ≈ ₹90.07 lakh crore. **Rounding
placement is.** CGST 9% + SGST 9% rounded separately ≠ IGST 18% rounded once,
and `estimationCalculations.js` already rounds `baseRate` mid-computation before
applying GST to the rounded figure.

### Identity
**WorkOS** — organisations, SAML/OIDC SSO and SCIM directory sync are its core
product, matching the B2B shape here. Clerk is the alternative if DX outweighs
enterprise directory sync.

> ⚠️ **Documented conflict.** No major managed IdP hosts in India, so identity
> data leaves the country while [ADR-0003](./adr/0003-vendor-hosted-saas-distribution.md)
> keeps everything else in-region. DPDP 2023 permits cross-border transfer
> except to restricted countries, so this is workable — but it must be written
> down, because it *will* appear on a security questionnaire.

### Documents
**Typst**, binary baked into the worker image, rendered in a **queue-driven,
sandboxed worker** — no network, temp-dir only. Templates ship with the release;
tenant input enters as JSON data and **must never become template code**.

Chosen over `jspdf` (current, browser-side), `@react-pdf/renderer` (weak on
complex multi-page tables) and Playwright/Chromium (~200 MB RSS per render)
because BOQs are hundreds of rows needing repeating headers and controlled page
breaks, and Form 281 needs exact positioning.

**Documents are English-only**, so Indic text shaping is a non-issue and no
spike is needed. A small helper is still required for lakh/crore digit grouping
(`₹1,23,45,678`) — number formatting, not text shaping.

**Archive the rendered PDF** with its template version and input snapshot to
versioned/WORM storage. The auditor asks "show me the document you issued", not
"re-render it identically" — which makes renderer determinism secondary.

### Storage, mail, realtime, imports
**S3-compatible** in `ap-south-1` with signed URLs (**MinIO** locally) ·
**Resend** (kept) · **SSE over Postgres `LISTEN`/`NOTIFY`**, per-tenant channels
· **csv-parser** + **exceljs**, server-side only, through the queue.

### Testing
**Vitest** (unit + integration) · **Playwright** (E2E) · **fast-check** (money
properties) · **Testcontainers** (real Postgres in CI) · a dedicated
**tenant-isolation suite** that is never skipped.

### Docker
```
docker compose:  postgres:17 · minio · api · worker · web
```
Multi-stage builds on `node:22-slim`, Typst binary in the worker image,
non-root user, read-only root filesystem. Testcontainers reuses the same images
in CI.

> **Caveat.** Docker solves developer setup. It does **not** solve
> `tally-connector`, which runs on a customer's Windows machine next to Tally —
> they will not run Docker. That ships as a single compiled binary via **Bun
> `--compile`** plus an installer, which also keeps an npm dependency tree out
> of the customer's network.

### CI/CD and supply chain
**GitHub Actions** with Turborepo affected-only · **OSV-Scanner** (not `npm
audit`, whose signal is weak) · **CycloneDX SBOM** (questionnaires ask for it
directly) · **Renovate** with `minimumReleaseAge: 7d` (hijacked versions are
almost always yanked within days) · **`ignore-scripts=true`** with an explicit
build allowlist (postinstall is the primary npm attack vector) · exact pinning
in server workspaces, lockfile diffs reviewed as code · read-only container
filesystems, egress-restricted workers, no secrets in build steps.

### Infrastructure
**Terraform**. Postgres and object storage in `ap-south-1`. Compute host still
open — Render has no India region, so likely AWS, Neon, or Supabase.

---

## Migration table

| # | Concern | From | To |
|---|---|---|---|
| 0 | **Money** | `REAL` columns, plain JS `Number`, no decimal library | `BIGINT` paise, branded `Paise`, `packages/money` with lint enforcement |
| 1 | Database | libsql/Turso (SQLite) | Postgres 17 + RLS |
| 2 | Data access | 611 raw SQL call sites | Drizzle, one tenant-scoped query layer |
| 3 | Migrations | Hand-rolled array + runtime DDL | drizzle-kit versioned SQL, gated CI job |
| 4 | API | 217+ methods, string allowlist | Typed contracts in `packages/contracts` |
| 5 | Validation | 7 Zod schemas (3%), all-optional | Zod v4, 100%, strict field names |
| 6 | Auth | bcryptjs + AES-256-GCM, 7-day static token | WorkOS |
| 7 | Files | Cloudinary + `public/uploads/` | S3-compatible, ap-south-1, signed URLs |
| 8 | Documents | `jspdf` in a **client** component | Typst in a queue-driven worker. **Also unblocks Turbopack** |
| 9 | Realtime | SSE polling a table every 2s per client | Postgres `LISTEN`/`NOTIFY`, per-tenant |
| 10 | Tally | Server `fetch` → `127.0.0.1:9000` | Staged vouchers + compiled connector |
| 11 | Jobs | None | pg-boss |
| 12 | Tests | None | Vitest + Playwright + isolation suite |
| 13 | Build | `--webpack` + Node polyfill stubs | Turbopack, polyfills deleted |
| 14 | Dev setup | Manual, undocumented | `docker compose up` |

### Fix in place
Delete `ignoreBuildErrors` · `target` → ES2022 · delete `jsconfig.json` ·
components → `.tsx`, services → `.ts` · move GST/TDS/rate math out of the 23
client components into `services/*/src/domain/` · remove the default
`JWT_SECRET` and the silent dev fallback, fail loudly · do not port
`app/api/debug/` or `app/api/debug_po/`.

### Dropped
`@libsql/client` · `bcryptjs` (the IdP owns hashing) · `jspdf` +
`jspdf-autotable` + `html2pdf.js` · `pdfjs-dist` (zero usages) · `cloudinary` ·
`dotenv` · `jsconfig.json` · the `webpack()` Node-polyfill block.

### Kept
`next` · `react` · `lucide-react` · `resend` · `clsx` · `tailwind-merge` ·
`tailwindcss` · `csv-parser`.

---

## Two decisions that must land in M1

**Money representation** — as specified above. All 611 call sites eventually
touch this; deciding late means touching them twice.

**Postgres pooling vs `SET LOCAL`.** PgBouncer in *transaction* mode — the
default on most managed Postgres — recycles connections between statements and
silently discards the session variable RLS depends on. Queries then return empty
sets, or unscoped rows.

**Correction:** earlier revisions called `app/lib/db.js:319` "the seam". There is
no seam — `withTransaction` is a **no-op in cloud mode**. It stores
`{ queryAll, queryGet, queryRun, tx }` in AsyncLocalStorage while `queryAll`/
`queryGet`/`queryRun` read `store?.txQueryAll`/`txQueryGet`/`txQueryRun`. The
keys do not match, so every query falls through to the base client outside the
transaction, and Turso opens a write transaction and commits it empty. All seven
call sites pass `async () => {…}` without destructuring the context, so none of
them are transactional. Locally it appears to work because `BEGIN IMMEDIATE` goes
to the shared client — which also means concurrent local requests share one
transaction.

So: nothing is preserved at `db.js:319`. It is the **hole the seam goes into**,
not the seam. `SET LOCAL` inside an explicit transaction, every request, no
exceptions — built new.

---

## Sequence

| Milestone | Scope | Done when |
|---|---|---|
| **M1** | `packages/contracts` + `packages/money` · `services/tenancy` + `services/identity` on Postgres · Drizzle + drizzle-kit · tenant context in `packages/service-kit` · RLS · docker compose · money + pooling decisions | Isolation suite proves tenant A reads zero rows of tenant B, in CI, every commit; no float anywhere in the schema; `docker compose up` gives a working stack |
| **M2** | `packages/service-kit` complete · CI with OSV + SBOM · `infrastructure` bootstrap | A service can be created and deployed from the golden path |
| **M2.5** | **Statutory rule spec** — extract, **CA-verify**, encode as effective-dated tables, golden files. Plus the re-keying and reconciliation plan for tenant #1's fuzzy-matched history | A CA-signed rule spec, and an old-vs-new totals reconciliation agreed with the customer *before* go-live |
| **M3** | `services/procurement` + `services/finance`. Tax math moves server-side | PO → approval → payment → TDS → staged Tally voucher, end to end, tested |
| **M4** | `services/projects` + `services/siteops` + `services/workflow` | BOQ, estimation, DPR/WPR, approvals ported |
| **M5** | `apps/web` on the new API · `design-system` extracted · Tailwind 4 · Typst rendering live | Internal ERP runs with no legacy dependency |
| **M6** | `apps/vendor-portal`, `apps/client-portal`, `apps/admin` | Tenant onboarding is self-service |
| **M7** | `tally-connector` as a compiled binary + installer | Vouchers reach a customer's Tally without a developer |

`_legacy/atelier-current/` is deleted only after M6.

---

## Files to read first

| Path (under `../../_legacy/atelier-current/`) | Why |
|---|---|
| `app/lib/paymentCalculations.js` | Densest concentration of undocumented rules — fallback precedence, stage semantics, outflow legs. Primary port-and-verify target |
| `app/lib/tdsChallan281.js` | Statutory logic needing CA verification before porting |
| `app/lib/api/purchase-orders/write.js` | Client-trusted `gst_amount` (line 55); the money semantics the server must own |
| `app/api/rpc/route.js` | The full method surface, including argument-padding and session-injection quirks |
| `app/lib/migrations.js` | The actual schema — `REAL` money, name keys. Defines the tenant #1 re-keying problem |
| `app/lib/db.js` | `queryAll/Get/Run` + `withTransaction` (line 319) — the seam all 611 call sites pass through |
| `src/modules/core/services/TDSService.ts` | Cleanest existing service — the shape to follow |
| `components/views/EstimationView.js` | CPWD/DSR 4-factor rate engine, currently inside a React component |

---

## Verification

- `docker compose up` from a clean clone gives a working stack with seeded
  synthetic tenants
- `pnpm turbo run typecheck` passes with `ignoreBuildErrors` absent
- `pnpm turbo run lint` fails on a deliberate cross-service import
- `pnpm turbo run test:isolation` against Testcontainers Postgres — tenant A
  reads zero rows of tenant B; must fail if a policy is dropped
- `drizzle-kit check` — no drift between schema and migrations
- Money property tests hold under fast-check generation; golden files match per
  financial year
- Migration parity: **synthetic**-tenant fixtures verify the migration
  *mechanism* in CI. Tenant #1's real historical totals can only be reconciled
  where the real database is permitted to live — outside any repository. Only
  the *output* of that reconciliation (counts, deltas, sign-off) enters the
  repo, never the data. Scoped as an M2.5 deliverable

### The view port — DASH-04, BOQ-07, EST-04

Found while porting the screens, each verified by reading the cited line rather
than inferred from a summary.

| Ref | Site | Defect | Status |
|---|---|---|---|
| **DASH-04** | `dashboard-utils.js:32`, `DashboardCashflowSection.js:15`, `DashboardFinancialSection.js:15` | `paginateItems` returns `{ pageItems, totalPages, currentPage }`; both sections read `pagination.items` and fall back to `[]`. The callers at `DashboardView.js:94-95` do pass the result. So **both dashboard tables render "No matching projects found." for every tenant, always** — the KPI cards above them are computed from the unpaginated arrays and are populated, which is what makes it look like a filter problem rather than a bug | **LIVE** |
| **BOQ-07** | `BoqView.js:137`, `:141` | A BOQ line with no `cost_rate` is given one derived from the client rate at a fixed 22% margin, on every load of the screen. A line whose selling amount is zero reports a margin of exactly 20 percent. Neither number is configuration and neither was chosen; both feed `activeScheduleTotalCost` and the margin KPI | **LIVE** |
| **EST-04** | `EstimationView.js:196-206` | The KPI cards read `Avg Contractor Margin 15.0%` and `GST Standard Rate 18.0%` as hardcoded display strings, next to three cards that are computed. Neither is derived from any item, and neither changes when an item uses a different rate | **LIVE** |

**Two claims checked and dropped**, both from scout reports and both wrong in
the direction of looking like a finding:

- A stage/probability mismatch in `CrmView.js`: the `<option>` **values** are
  `Lead`, `Qualified`, `Proposal Shared` and do match the ladder at `:402-408`.
  Only the visible labels differ (`Lead Inflow`, `Site Survey & Qualified`).
  Reading `:413-417` settles it; the summary describing the labels as the values
  does not. CRM-01 — four ladders that genuinely disagree — still stands.
- `addManualPayment` having no server-side authorisation. It has one:
  `purchase-orders/other.js:51-52` refuses anyone who is not an accountant, an
  admin, or the hardcoded super-admin address. The browser-side derivation at
  `POsView.js:145` is a display decision sitting on top of a real check, not the
  only check.

Both were caught by reading the cited line before acting on the report, which is
the step the status-first protocol exists for. A subagent's report is a claim.

## Defects in OUR code, recorded rather than fixed in passing

Everything above is an inventory of the legacy. This section is not: these are
defects in the system being built, found while building something else, and
written down because a defect nobody recorded is a defect nobody fixes.

| Ref | Site | Defect | Status |
|---|---|---|---|
| **COG-01** | `services/host/src/principal-resolver.ts:57` | **Every resolved principal was labelled `kind: 'staff'`, whatever it was.** The resolver runs before any tenant context exists, and `identity.resolve_principal` returns two ids and nothing else so that the one unscoped query in the system cannot enumerate anybody — the kind is genuinely not knowable there, and a literal was used. **No authorization decision ever read it**: `requireStaff` and `requireKind` both load the true kind from the database inside the tenant context, so this was never an escalation. What it was is a context that lied about who was acting, and two things downstream believed it — `workflow.audit_events.actor_kind` and `reviewerKind` at `services/projects/src/api/design-build.ts:267`. **Both sit behind `requireStaff`, so neither mislabel was ever reachable**; an earlier note here claimed migration `0080` made them live, which was wrong — a client login can now exist, but it still cannot reach either site. The defect was a trap for the next portal route that writes an audit row, not a wrong row in the log today. **Fixed** by correcting the context where the true kind is already loaded: `requireStaff` and `requireKind` write it back, which costs no extra query. Not by widening `resolve_principal` (forbidden by its own comment in migration `0003`) and not by moving where `TenantContext` is built (ADR-0006 blast radius). Proved by `GET /api/v1/portal/client/whoami` returning `client`; the test was checked against the unfixed code and fails with `expected 'staff' to be 'client'` | **FIXED 2026-09-06** |

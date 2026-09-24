# Open decisions

**One decision is unresolved: #3, hosting and region.** Decisions #1 and #2 were
settled on 2026-09-03 and are kept below as the record of what was weighed.

Two further decisions are **not open but must be settled concretely in milestone
1** — they are listed at the bottom because getting them wrong is expensive to
undo across 611 call sites.

---

## 1. Migration path — how we get from the legacy app to the new system

**Status:** DECIDED 2026-09-03 — **Option A, hybrid**, with two amendments.

> The code argued for it rather than the plan doing so.
>
> **Option B (carve-out) was disqualified by the transaction seam.** Its premise
> is "keep the app green at every step", but in cloud mode there is no
> transaction boundary to keep green: `db.js`'s `withTransaction` stores
> `{ queryAll, … }` in AsyncLocalStorage while the readers look for
> `store.txQueryAll`, so every one of the seven call sites executes outside the
> transaction. Each carve step would have to *create* atomicity before it could
> preserve it — which is the rewrite it was trying to avoid.
>
> **Option C (clean rewrite) was disqualified by duplicated rules that
> disagree.** The 4-factor estimation formula exists twice and diverges on 132
> of 300 sampled inputs; TDS rates exist twice. Where two implementations
> disagree, the running code is the only record of which one the customer has
> actually been billing on. A spec-first rewrite silently picks one.
>
> **Amendment 1 — freeze, don't merely keep runnable.** The legacy tree is
> pinned at a named commit with golden outputs recorded from synthetic data. Any
> later legacy change is a defect report against the new system, not something
> to port. Otherwise the golden files chase a moving target.
>
> **Amendment 2 — M2.5 runs in parallel with M1, not after M2.** The CA is an
> external dependency already on the critical path, M2.5 ships no code so it
> contends with nothing, and M1 *already* commits to statutory answers: ADR-0012
> requires it to settle the Sec 170 / Sec 288B / whole-rupee boundaries, which
> are precisely the questions going to the CA. Sequential means M1 hard-codes
> provisional answers to statutory questions.

*Original framing, retained as the record:*

The legacy app runs and works. Its persistence layer has to die regardless
(libsql → Postgres, no tenancy columns, no versioned migrations). Its domain
logic — TDS 194C/194J/194Q, CGST/SGST vs IGST, the CPWD/DSR 4-factor rate
engine, the three-stage approval chain — is the asset, and much of it exists
*only* in those 225 `.js` files and nowhere in any document.

### Option A — Hybrid *(recommended)*

Build `platform-contracts`, `svc-tenancy` and `svc-identity` clean first, on
Postgres with real migrations and tenant context. Then port the existing screens
and rules onto the new API domain by domain: procurement → finance → projects →
siteops. The legacy tree stays runnable as a reference until the last screen
moves.

Keeps the domain logic. Kills the persistence layer, which has to die anyway.

### Option B — Incremental carve-out

Extract repos out of the legacy tree while keeping the app green at every step;
`src/modules/*` seeds the service layer. Lowest risk of silently dropping
behaviour, but the tenancy rebuild touches all 51 tables and the libsql →
Postgres swap fights the "keep it working" constraint the whole way.
Realistically the slowest of the three.

### Option C — Clean rewrite

Scaffold everything fresh, freeze the legacy tree read-only, rebuild every
screen and rule from spec. Cleanest result, zero legacy compromise. Costs the
most months, and the real risk is undocumented business rules being lost
silently — discovered when a customer's TDS comes out wrong.

---

## 2. Runtime shape — how the seven services actually run

**Status:** DECIDED 2026-09-03 — **composed modular monolith**, one API host.

> The composition root lives at `services/host` and is the one package permitted
> to import every service. It is deliberately absent from the `SERVICES` array
> in `eslint.config.mjs`, and that absence is the mechanism.
>
> **The deciding reason is tenant isolation, not transactions.** One connection
> pool, one place that opens the transaction and issues
> `set_config('app.tenant_id', …, true)`, one place the isolation suite has to
> prove. Seven runtimes means seven pools, each independently capable of getting
> the pooling mode wrong — and that failure is silent, which is exactly what
> `withTransaction` demonstrates in the legacy app today.
>
> Transactions are the second reason. `updatePOFull` alone writes purchase
> orders, line items, approval history, the audit log and the event stream, then
> cascades `po_no` across payment requests, system payments and manual payments.
> Under the target boundaries that spans procurement, workflow and finance in
> one user action: composed it stays a single transaction; split it is a saga on
> day one.
>
> Splitting a service out later remains a config change, because the contract
> already exists.

*Original framing, retained as the record. Note it says "separate repositories",
which ADR-0009 superseded — the boundaries survived, the packaging changed.*

- **Composed modular monolith** *(recommended)* — each service repo publishes a
  versioned package; a thin host composes them into one deployable. Real
  enforced boundaries, but a PO approval spanning procurement + workflow +
  finance + audit stays a single database transaction. Split any service out
  later when it earns it; the contract is already there.
- **Independently deployed** — seven runtimes behind a gateway. Maximum
  independence; cross-domain writes become distributed transactions needing
  sagas and compensating actions. Heavy for an ERP where nearly every action
  spans domains.
- **Mixed** — core domains composed; `svc-identity` and `svc-tenancy` deployed
  independently, since every surface calls them and they have a different
  scaling and security profile.

---

## 3. Hosting and region

**Status:** OPEN · blocks `infrastructure`

ADR-0003 fixes data residency in India. That constrains this more than cost or
preference does.

- The legacy `render.yaml` targets Render, which has **no India region**.
- Postgres in `ap-south-1` (Mumbai) is the realistic starting constraint.
- Needs deciding together: compute host, Postgres host, object storage
  (S3-compatible, same region), and the managed identity provider from ADR-0005,
  whose own data residency must be compatible.

---

# Must be settled concretely in M1 (direction already fixed)

## Money representation — ADR-0012

`BIGINT` paise, a branded `Paise` type, and a `packages/money` that is the only
module permitted to multiply or divide money, enforced by ESLint.

What M1 must actually decide and prove: the exact rounding boundaries, named and
carrying their statute citation — **Sec 170 CGST** rounds tax per invoice per
head, **Sec 288B** rounds to the nearest ₹10, challans are whole rupees. CGST 9%
+ SGST 9% rounded separately differs from IGST 18% rounded once, and the legacy
`estimationCalculations.js` already gets this wrong by rounding `baseRate`
mid-computation.

Every one of the 611 legacy data-access sites eventually touches this. Deciding
late means touching them twice.

## Postgres pooling vs `SET LOCAL`

PgBouncer in *transaction* mode — the default on most managed Postgres — recycles
connections between statements and silently discards the session variable RLS
depends on. Queries then return empty sets, or worse, unscoped rows.

**Correction 2026-09-03.** Earlier revisions called
`_legacy/atelier-current/app/lib/db.js:319` "the seam". There is no seam.
`withTransaction` stores `{ queryAll, queryGet, queryRun, tx }` in
AsyncLocalStorage while `queryAll`/`queryGet`/`queryRun` read
`store?.txQueryAll`/`txQueryGet`/`txQueryRun`. The keys do not match, so every
query falls through to the base client outside the transaction, and Turso opens
a write transaction and commits it empty. It is the **hole the seam goes into**.

Settled in [`plans/M1.md`](./plans/M1.md) D3, built new:

- `set_config('app.tenant_id', $1, true)` inside an explicit transaction, every
  request, no exceptions — **not** literal `SET LOCAL`, which takes no bind
  parameters and would mean interpolating a tenant id into SQL inside the layer
  whose whole job is tenant isolation.
- Two roles: `app_migrator` owns the tables and connects **directly** on 5432
  (transaction-mode pooling breaks DDL needing session state, and drizzle-kit's
  advisory locks do not survive connection reuse); `app_runtime` owns nothing,
  has no `BYPASSRLS`, and connects through PgBouncer. Every table also gets
  `FORCE ROW LEVEL SECURITY`, because an owner otherwise bypasses its own
  policies.
- Proved by a **pool-size-1 connection-reuse test**: tenant A's request
  finishes, its connection returns to the pool, tenant B is handed that same
  connection, and B must see only B's rows. "Runs through PgBouncer" is not the
  assertion; that is.

---

# Noted conflict, not a decision

**Identity data residency.** ADR-0003 puts data in an India region; no major
managed identity provider hosts in India, so WorkOS (ADR-0005) holds identity
data outside the country. DPDP 2023 permits cross-border transfer except to
restricted countries, so this is workable — but it must be written into the
security posture, because it *will* appear on an enterprise questionnaire.
Revisit if a customer contract makes in-country identity mandatory.

---

# PROPOSED — provisional answers adopted from `_legacy-updated/`

**Added 2026-09-05.** `_legacy-updated/` is a security repair of the legacy app.
Its own handover calls itself *"a repair of the audited paths, not certification
of every module, tax rule, permission combination"*, so it is a **second
unreliable spec** and is treated exactly like the first.

What it *can* settle is **business configuration** — how this company actually
works. Those answers are adopted **provisionally** below: each lands as a row in
a table, never as a constant, carries `status = 'provisional'`, and can be
overruled by changing the row rather than the code.

What it cannot settle is a **statutory value**. `SettingsTDSTab` configuring a
TDS rate is not a CA verifying one. CA-01..CA-08 remain hard-gated, and every
default GST rate of `18` found below was deliberately **not** adopted.

Paths below are relative to the updated legacy tree.

**Every citation in the table is quoted verbatim in
[Evidence](#evidence--every-cited-line-quoted) below, and the quotes were taken
by reading the files, not by trusting this document.** That section is not
decoration. `_legacy-updated/` is under **no version control at all** — no repo,
and the workspace root is deliberately not one either — so a `file.js:624` in
this table points into a tree that has no history and no remote. The day it is
deleted, the citation becomes a claim about a file nobody can open, and every
provisional decision below loses the only evidence it had. The quote survives
that; the line number does not.

Checked 2026-09-06: all eighteen citations resolve, and each says what it is
cited for. That check is itself the point — a citation nobody has re-opened is
indistinguishable from one that has drifted.

| # | Question | Adopted answer | Source | If you overrule it |
|---|---|---|---|---|
| **PO-13a** | The role list | 10 roles: `proc` (Procurement), `finance`, `accountant`, `site` (Site team), `engineer`, `designer`, `sales`, `manager` (Project manager), `admin` (Administrator), `director`. Aliases `procurement`→`proc`, `maker`→`proc` | `app/lib/settings-catalog.js:1-2`, extended at runtime by a `custom_roles` setting — `app/lib/api/settings-admin.js:10-14` returns the ten **plus** any custom keys, which is why the list has to be a table and not an enum | Roles are rows in `identity.role_catalog`. Add, rename or retire a row — no code change |
| **PO-13b** | What each role may reach | A role × module grant matrix over 17 modules | `app/lib/settings-catalog.js:3-5` (17 modules), `app/lib/api/core.js:557-562` (defaults for 4 roles), `app/lib/api/settings.js:30` (every role also gets `dashboard`; `site`/`engineer`/`manager` also get `operations` and `projects`). The grant array also carries **10 named actions** — `approve_po`, `approve_payment`, `create_po` and so on, labelled at `components/views/SettingsLegacyView.js:563-572` | Edit the grant rows in `identity.role_grants` |
| **PO-13c** | The approval chain shape | Stages per entity type, each naming one approver role and a quorum. Seeded provisionally per tenant from the documented fallback chains | `src/modules/core/services/ApprovalWorkflowService.ts:267-305` | Chains and stages are already tenant rows. Reconfigure them through the settings screen |
| **PO-13d** | Approval **value limits** | **Machinery built, unconfigured — and it needs your numbers.** The absence in the legacy is a *missing feature*, not a decision: a contractor running ₹40 lakh to ₹12 crore projects does not let one authority sign both a ₹40,000 stationery order and a ₹12 crore MEP package. So `workflow.approval_stages.approval_ceiling_paise` exists (migration `0062`), `approve()` evaluates it on every decision, and the settings screen exposes it. **Every stage ships `NULL`, and nothing seeds a value.** `NULL` = no limit = exactly the behaviour before the column existed | Absence across `ApprovalWorkflowService.ts`, confirmed against the stage columns at `src/modules/core/repositories/ApprovalWorkflowRepository.ts:71-84`. Migration `0024` argued against the column and this supersedes that reasoning — its condition was that a declared field must be evaluated, and this one is | **This is the row that needs you.** Set a ceiling per stage in Settings → Approval chains. Above it a request escalates to the next stage; with no next stage it is refused. Nothing else changes, because nothing is configured today |
| **PO-13e** | Self-approval | **Refused**, unchanged. **No server-side check stops a requester approving their own request.** The approve path reads roles and stage only. There *is* a requester test, but it gates *viewing the project financial summary*, not the decision | approve path: `app/lib/api/purchase-orders/approve.js:58-83`. Requester test: `app/lib/api/projects.js:278`, mirrored client-side at `components/views/PaymentsView.js:437-438` | This one is **not** configuration. Refusing it is the APPR-02 fix in `services/workflow/src/domain/approval.ts:96-98`; permitting it again is a code change with a test, deliberately |
| **INV-03** | Stock costing method | **Weighted-average unit cost, recomputed on every receipt.** Issues do not change the average; a transfer carries the dispatched item's cost to the destination | `app/lib/api/inventory.js:61` (the average), `:297` (an issue leaves cost alone), `:322-323` and `:337` (the transfer snapshot) | Costing method is a per-tenant configured value. FIFO would be a second implementation behind the same setting |
| **PO-15** | Does a missing BOQ cost rate have a basis? | **No. It stays ABSENT.** The repair did not settle it — it made the disagreement worse: the browser invents 78% of the selling rate and the server invents 80% for the same field | `components/views/BoqView.js:258`, `:736`, `:800`, `:2029` (78%) against `app/lib/api/boq.js:115`, `:463` (80%) | Absent is the safe answer. Supply a basis and it becomes a configured factor |
| **PO-16** | Does a BOQ rate carry tax inside it? | **No — a BOQ rate is exclusive of tax**, and the tax rate is carried alongside in its own field. The repair now divides an estimation figure back out of tax before storing it as the rate | `app/lib/api/boq.js:624` (`final_rate_with_gst / (1 + gst_pct/100)`), `:627-635` (rate and `gst_pct` stored separately) | The structure is adopted; **the rate value 18 is not** — it appears as a default at `boq.js:120`, `:329`, `:570`, `:635`, `:728`, `:891`, `:964` and is a statutory value we will not seed |
| **PO-17** | Which of three rate figures is the real one? | **`base_rate`** — the selling price *excluding* tax. The ladder is `totalCost` → `baseRate` → `finalRateWithGst`, and the BOQ import prefers `base_rate`, falling back to the tax-inclusive figure divided back out | `app/lib/estimationCalculations.js:63`, `:80`, `:93-96`; `app/lib/api/boq.js:624` | The figure a quotation shows becomes a per-tenant display choice, not a different stored number |
| **PNL** | Accrual profit on the client-billing screen | **Not claimed.** The repair sets `pnl: null` and returns a cash-basis figure instead: `netCash = receipts − vendor disbursements`, with the disbursement net of TDS, and client TDS credits reducing receivables | `app/lib/api/client-billing.js:359-361` (`pnl: null` and `accountingBasis`), `:328-329` (outflow nets TDS), `:345` (TDS reduces receivables) | Adopted as a decision about **what we will not display**. The screen itself is CA-gated and unbuilt, so nothing renders either figure today |

## Evidence — every cited line, quoted

Verbatim, as read on 2026-09-06. `_legacy-updated/` unless the path says
otherwise. Long lines are the legacy's own formatting, not a wrapping failure —
several of these files are minified-by-hand, which is part of why reading them
is slow.

### PO-13a — the role list

`app/lib/settings-catalog.js:1-2`

```js
export const ROLE_LABELS = {proc:'Procurement',finance:'Finance',accountant:'Accountant',site:'Site team',engineer:'Engineer',designer:'Designer',sales:'Sales',manager:'Project manager',admin:'Administrator',director:'Director'};
export const canonicalRole = role => ({procurement:'proc',maker:'proc'}[role] || role);
```

`app/lib/api/settings-admin.js:10-14` — the ten, **plus** whatever a setting
adds, which is why the list is a table here and not an enum:

```js
export async function getSettingsRoles(session) {
  AuthService.requireAuth(session);
  const custom=JSON.parse(await getSetting('custom_roles','[]')||'[]');
  return {...ROLE_LABELS,...Object.fromEntries(custom.map(r=>[r,r.replace(/_/g,' ')]))};
}
```

### PO-13b — what each role may reach

`app/lib/settings-catalog.js:3-5`, the 17 modules (one line in the original):

```js
export const MODULES = [
 ['dashboard','Overview','Workspace'],['projects','Projects','Workspace'],['crm','Leads & opportunities','Plan & procure'],['design_build','Design & build','Plan & procure'],['estimation','Estimates','Plan & procure'],['boq','Bill of quantities','Plan & procure'],['purchase_orders','Purchase orders','Plan & procure'],['vendors','Vendors','Plan & procure'],['operations','Daily & weekly reports','Site & delivery'],['inventory','Inventory & goods receipts','Site & delivery'],['change_orders','Variations & drawings','Site & delivery'],['site_controls','Site expenses & measurements','Site & delivery'],['payments','Vendor payments','Finance'],['client_billing','Client billing','Finance'],['reports','Reports','Finance'],['documents','Documents','Collaboration'],['project_team','Project team','Collaboration']
];
```

`app/lib/api/core.js:557-562` — defaults for **four** roles, not ten:

```js
export const DEFAULT_FEATURE_PERMISSIONS = {
  proc:       ['dashboard', 'payments', 'purchase_orders', 'vendors', 'create_payment', 'create_po'],
  finance:    ['dashboard', 'payments', 'vendors', 'reports', 'approve_payment', 'reject_payment', 'export_data'],
  accountant: ['dashboard', 'payments', 'purchase_orders', 'vendors', 'reports', 'create_payment', 'approve_payment', 'export_data', 'upload_document'],
  director:   ['dashboard', 'payments', 'purchase_orders', 'projects', 'vendors', 'settings', 'reports', 'manage_users', 'manage_settings', 'view_analytics', 'export_data', 'approve_po', 'approve_payment', 'reject_payment']
};
```

`app/lib/api/settings.js:30` — every role also gets `dashboard`, and
`site`/`engineer`/`manager` also get `operations` and `projects`:

```js
  const defaults=Object.fromEntries(Object.keys(ROLE_LABELS).map(role=>[role,[...new Set([...(DEFAULT_FEATURE_PERMISSIONS[role]||['dashboard']),...legacyModules,...(['site','engineer','manager'].includes(role)?['operations','projects']:[])])]]));
```

`components/views/SettingsLegacyView.js:563-572` — the ten named actions, which
is the only place they are labelled:

```js
    'create_payment': 'Create Payment Request',
    'approve_payment': 'Approve Payments',
    'reject_payment': 'Reject Payments',
    'create_po': 'Create Purchase Order',
    'approve_po': 'Approve Purchase Order',
    'upload_document': 'Upload Documents',
    'manage_users': 'Manage Users',
    'manage_settings': 'Manage Settings',
    'export_data': 'Export Data',
    'view_analytics': 'View Analytics'
```

### PO-13c — the approval chain shape

`src/modules/core/services/ApprovalWorkflowService.ts:267-275`. Note the stage
names are compared as **strings**, with a numeric alias beside each — `'1'` and
`'2'` — which is what a fallback chain looks like when it was written twice:

```ts
      if (moduleType === 'payment_request') {
        const cur = currentStage || 'Pending Procurement';
        if ((cur === 'Pending Procurement' || cur === '1') && isProc) {
          return { newStage: 'Pending Finance', updates: { proc_approval: 'Approved' }, advanced: true };
        }
        if ((cur === 'Pending Finance' || cur === '2') && isFin) {
          return { newStage: 'Ready to Remit', updates: { finance_approval: 'Approved' }, advanced: true };
        }
      } else if (moduleType === 'purchase_order') {
```

### PO-13d — approval value limits are ABSENT, not zero

`src/modules/core/repositories/ApprovalWorkflowRepository.ts:71-84`. Twelve
stage columns are written and twelve are updatable. **No amount, no ceiling, no
threshold appears in either list** — that absence is the citation:

```ts
      `INSERT INTO approval_workflow_stages (workflow_id, stage_name, sequence, approver_role, specific_user, department, min_approval_count, approval_type, comments_mandatory, auto_approval, escalation_ready, skip_conditions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [stage.workflow_id, stage.stage_name, stage.sequence, stage.approver_role || '', stage.specific_user || '', stage.department || '',
       stage.min_approval_count || 1, stage.approval_type || 'any_one', stage.comments_mandatory ? 1 : 0,
       stage.auto_approval ? 1 : 0, stage.escalation_ready ? 1 : 0, stage.skip_conditions || '']
    );
    return Number(result?.lastInsertRowid || 0);
  }

  static async updateStage(stageId: number, updates: any): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    const allowed = ['stage_name', 'sequence', 'approver_role', 'specific_user', 'department',
      'min_approval_count', 'approval_type', 'comments_mandatory', 'auto_approval', 'escalation_ready', 'skip_conditions', 'is_active'];
```

**This is the one that needs your numbers**, and quoting it is how you can see
that the gap is real rather than something we chose not to port.

### PO-13e — self-approval is not refused

`app/lib/api/purchase-orders/approve.js:58-83`. The whole approve path. It reads
status, roles and stage. `created_by` is never consulted:

```js
  requireAuth(realSession);
  if (!poNo) throw new Error('PO Number is required');
  if (!realAction || !['approve', 'reject'].includes(realAction)) throw new Error('Action must be approve or reject');

  const po = await queryGet(`SELECT * FROM purchase_orders WHERE po_no = ?`, [poNo]);
  if (!po) throw new Error('PO not found: ' + poNo);

  const currentStage = po.approval_status || po.status || 'Draft';
  if (currentStage === 'Approved' || currentStage === 'Rejected' || currentStage === 'Draft') {
    throw new Error(`PO cannot be approved/rejected from current status: ${currentStage}`);
  }
```

The requester test that **does** exist gates a read, not a decision —
`app/lib/api/projects.js:278`:

```js
  if (!isDirOrAdmin && session.email === pr.created_by) {
```

…mirrored client-side at `components/views/PaymentsView.js:437-438`, where it is
a hidden button rather than a control:

```js
    const isCreator = req && user && req.created_by === user.email;
    if (isApprover && (!isCreator || isAdmin || isDirector) && req?.id) {
```

### INV-03 — weighted-average costing

`app/lib/api/inventory.js:61` — the average, recomputed on receipt:

```js
    const price = (Number(old.quantity_on_hand) * Number(old.unit_price) + quantity * Number(item.unit_price)) / total;
```

`:297` — an issue decrements quantity and leaves `unit_price` alone (and note
the `AND quantity_on_hand >= ?`, which is the conditional update
`issueStockToProject` never got):

```js
    const result = await queryRun('UPDATE inventory_items SET quantity_on_hand = quantity_on_hand - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND quantity_on_hand >= ?', [quantity, id, quantity]);
```

`:322-323` and `:337` — the transfer carries a JSON snapshot of the dispatched
item, so its cost travels with it:

```js
    await queryRun('INSERT INTO inventory_transfers (id, material_name, from_warehouse, to_warehouse, quantity, transferred_by, status, source_item_id, item_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, item.material_name, from, to, quantity, session.email, 'Dispatched', item.id, JSON.stringify(item)]);
...
    const itemId = await addStock(JSON.parse(transfer.item_snapshot), transfer.to_warehouse, Number(transfer.quantity));
```

### PO-15 — the missing cost rate has no basis, and the two guesses differ

`components/views/BoqView.js:258` — the browser invents 78%:

```js
          const costRate = Number(i.cost_rate || Math.round(rate * 0.78 * 100) / 100);
```

`app/lib/api/boq.js:115` and `:463` — the server invents 80%, for the same
field:

```js
  const costRate = Number(realPayload.cost_rate || realPayload.costRate || Math.round(rate * 0.8 * 100) / 100);
...
    const costRate = Number(item.cost_rate || item.costRate || Math.round(rate * 0.8 * 100) / 100);
```

Two numbers for one field, in one application. This is why ABSENT is the
adopted answer.

### PO-16 / PO-17 — a BOQ rate is exclusive of tax, and `base_rate` is the real one

`app/lib/api/boq.js:624` — the division back out, and the `|| 18` inside it:

```js
      const rate = Number(estItem.base_rate || (estItem.final_rate_with_gst ? Math.round((Number(estItem.final_rate_with_gst) / (1 + Number(estItem.gst_pct || 18) / 100)) * 100) / 100 : actualCost));
```

`:627-635` — rate and `gst_pct` stored in separate columns, which is the
structure we adopt. The `?? 15` margin and `?? 18` GST in the same statement are
the values we do **not**:

```js
        `INSERT INTO boq_items (id, schedule_id, category, sub_category, description, uom, quantity, rate, amount, cost_rate, margin_pct, gst_pct, source, source_ref_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          itemId, scheduleId, estItem.trade || 'Estimation Import', 'Imported Benchmark',
          estItem.item_name, estItem.uom || 'Sq.Ft',
          qty, rate, amount,
          actualCost,
          Number(estItem.margin_pct ?? 15),
          Number(estItem.gst_pct ?? 18),
```

`app/lib/api/boq.js:120` — one of seven sites where 18 appears as a default:

```js
  const gstPct = Number(realPayload.gst_pct || realPayload.gstPct || 18);
```

`app/lib/estimationCalculations.js:63` and `:93-96` — the margin formula, and
the three figures it returns, of which `base_rate` is the one adopted:

```js
        baseRate = Math.round(totalCost / (1 - (rawMargin / 100)));
...
    baseRate,
    gstPct,
    gstAmt,
    finalRateWithGst
```

### PNL — not claimed

`app/lib/api/client-billing.js:359-361`:

```js
    cashflow: { netCash: totalReceived - totalOutflow },
    accountingBasis: 'Cash receipts and vendor disbursements; not accrual profit',
    pnl: null
```

`:328-329` — the outflow nets TDS, floored at zero:

```js
           THEN CASE WHEN COALESCE(pr.approved_amount, pr.amount_requested, 0) - COALESCE(pr.tds_amount, 0) < 0 THEN 0
                     ELSE COALESCE(pr.approved_amount, pr.amount_requested, 0) - COALESCE(pr.tds_amount, 0) END
```

`:343-345` — and `grossProfit`/`marginPct` are still computed, one line from
being returned again, with `pendingAR` beside them:

```js
  const grossProfit = totalInvoiced - totalOutflow;
  const marginPct = totalInvoiced > 0 ? (grossProfit / totalInvoiced) * 100 : 0;
  const pendingAR = totalInvoiced - totalReceived - Number(payRow?.total_tds_deducted || 0);
```

### The estimation engine, twice, and rounding mid-formula

`app/lib/estimationCalculations.js:48`, `:63`, `:70` — three roundings of
`baseRate` to whole rupees:

```js
    baseRate = Math.round(totalCost + profitAmt);
...
        baseRate = Math.round(totalCost / (1 - (rawMargin / 100)));
...
      baseRate = Math.round(totalCost + profitAmt);
```

`:79-80` — tax applied to the **already rounded** figure, then rounded again.
On floats. This is EST-01:

```js
  const gstAmt = Math.round(baseRate * (gstPct / 100) * 100) / 100;
  const finalRateWithGst = Math.round(baseRate + gstAmt);
```

`components/views/EstimationView.js:121-134` — the same formula, again, in the
browser. Compare line 134 with `estimationCalculations.js:63`: identical
expression, different surrounding defaults. This is the 132-of-300 divergence
behind ADR-0014:

```js
    const overheads = subtotalWithWastage * ((Number(item.overheadPct) || 0) / 100);
    const totalCost = subtotalWithWastage + overheads;

    let baseRate = totalCost;
    let margin = 0;

    if (item.markupPct !== undefined && Number(item.markupPct) > 0) {
      margin = Math.round(totalCost * (Number(item.markupPct) / 100));
      baseRate = Math.round(totalCost + margin);
    } else {
      const marginProvided = item.marginPct !== undefined && item.marginPct !== null;
      const rawMargin = marginProvided ? Number(item.marginPct) : 15;
      if (rawMargin > 0 && rawMargin < 100) {
        baseRate = Math.round(totalCost / (1 - (rawMargin / 100)));
```

### The action grants are read once, and re-merged wrongly

`app/lib/api/projects.js:282-302` with `core.js:564`. `VALID_ROLE_KEYS` has four
entries; `ROLE_LABELS` has ten. A saved permission for any of the other six is
parsed, tested, and dropped on the floor at line 290:

```js
  let hasApprovalPermission = isDirOrAdmin;
  if (!hasApprovalPermission) {
    const raw = await getSetting('feature_permissions', null);
    let perms = { ...DEFAULT_FEATURE_PERMISSIONS };
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        Object.keys(saved).forEach(role => {
          if (VALID_ROLE_KEYS.has(role)) {
            perms[role] = saved[role];
          }
        });
      } catch (e) {}
    }
    for (const role of roles) {
      if (perms[role] && (perms[role].includes('approve_payment') || perms[role].includes('reject_payment'))) {
        hasApprovalPermission = true;
        break;
      }
    }
  }
```

```js
export const VALID_ROLE_KEYS = new Set(['proc', 'finance', 'accountant', 'director']);
```

### `issueStockToProject` has no conditional update

`app/lib/api/inventory.js:378-383`. Read, check, then write — with nothing in
the `WHERE` to make it safe, unlike `:297` above:

```js
    const available = Number(item.quantity_on_hand || 0);
    if (qty > available) {
      throw new Error(`Insufficient stock: Requested ${qty}, but only ${available} ${item.unit || 'units'} available in stock.`);
    }

    await queryRun('UPDATE inventory_items SET quantity_on_hand = quantity_on_hand - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [qty, itemId]);
```

## What the repair did NOT fix, and we therefore do not inherit

Recorded because each of these looks settled and is not:

- **The estimation engine still exists twice.** `app/lib/estimationCalculations.js:63`
  and `components/views/EstimationView.js:121-134` reimplement the same formula.
  That is the 132-of-300 divergence behind ADR-0014, unrepaired.
- **Mid-formula rounding survives.** `estimationCalculations.js:48`, `:63` and
  `:70` round `baseRate` to whole rupees, then `:79` applies tax to the rounded
  figure and `:80` rounds again. On floats. This is EST-01.
- **The action grants are read at exactly one site, and it re-implements the
  merge.** `app/lib/api/projects.js:282-302` is the only place any of the ten
  actions is consulted, it gates a **read** rather than a write, and it filters
  saved permissions through `VALID_ROLE_KEYS` (`core.js:564`) — four roles, not
  the ten. So a `manager` granted `approve_payment` is honoured by
  `getFeaturePermissions` and silently discarded here. Two merge implementations
  that disagree, the same shape as the estimation engine.
- **`grossProfit` and `marginPct` are still computed** at
  `client-billing.js:343-344` and simply not returned. Dead code, one line from
  being live again.
- **`issueStockToProject` never got the conditional update** that `issueMaterial`
  got. `inventory.js:378-383` reads the quantity and then writes it, so two
  concurrent issues can both pass the check. Tracked as a GAP in
  [`LEGACY-UPDATED-CROSSCHECK.md`](./LEGACY-UPDATED-CROSSCHECK.md).

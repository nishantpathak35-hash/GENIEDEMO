# Port note — the project rollup

Slice 7 of the M5 view port. `DashboardView.js` (248 lines) was blocked on this.

Legacy sites, under `../../../_legacy/atelier-current/`:

| File | What it is |
|---|---|
| `app/lib/api/projects.js:83-202` | `getProjectDetails` — the rollup |
| `app/lib/api/dashboard.js:75-144` | `getDashboardKPIs` |
| `app/lib/paymentCalculations.js:252-306` | `calculateProjectOutflowSnapshots` |
| `components/views/dashboard/DashboardFinancialSection.js` | where the figures are displayed |

---

## Defects, with status

| Ref | Site | Defect | Status |
|---|---|---|---|
| **DASH-01** | `DashboardFinancialSection.js:115`, `:117`, `:119` | **The screen reads three keys the server does not send, so a fallback always runs — and two of the three fallbacks use a different formula.** The server returns `plannedGM`, `actualGM` and `balanceAvailable` (`projects.js:186-190`); the component reads `plannedGrossMargin`, `actualGrossMargin` and `balance`. `Number(undefined)` is `NaN`, which is falsy, so `\|\|` takes the fallback every time. `actualGrossMargin` falls back to `pv - po` where the server computes `inflow - outflow - tds`; `balance` falls back to `pv - out` against the same server formula | **LIVE** |
| **PROJ-02** | `boq.js:174`, `dashboard.js:318`, `DashboardView.js:22-26` | A purchase order carries a project **name** as free text, matched with `LIKE '%…%'` in SQL and bidirectional `.includes()` in the browser. "Tower A" and "Tower A Phase 2" each match the other, so a per-project spend total is the sum over whatever the substring caught | **LIVE** |
| **DASH-02** | `projects.js:84`, `:205`, `dashboard.js:76` | `getProjectDetails`, `updateProjectFinancials` and `getDashboardKPIs` are gated by `requireAuth` alone. Any authenticated user can read **and edit** project financials. The finance-specific functions in the same file do use `requireFinanceAccess` (`dashboard.js:254`, `:313`) — the dashboard path simply does not | **LIVE** |
| **DASH-03** | `projects.js:132`, `:208`, `:408` | `project_financials` has **three** `CREATE TABLE IF NOT EXISTS` statements with three different column sets, plus `ALTER TABLE`s inside bare `try{}catch{}`. Which columns exist depends on which function ran first | **LIVE** |

### DASH-01 compounds with PROJ-01, and the result is a column of zeros

PROJ-01 records that `projects.js:118-120` adds the same `val` to both `poIssued`
and `projectValue`. So for any project with no hand-entered
`project_financials.project_value` row, `pv === po`.

The actual-gross-margin fallback is `pv - po`. **That is exactly zero, for every
such project, permanently** — and the balance fallback `pv - out` is wrong in the
same way but by a different amount.

Worse, both appear on one screen next to a KPI card computed the other way: the
card at `DashboardView.js:112` sums the server's `actualGM`, while the table row
at `DashboardFinancialSection.js:117` sums the client fallback. Two numbers,
same label, same screen, different formulas.

---

## What replaces it

`GET /api/v1/rollups/projects`, in `services/host` because committed spend is
procurement's and the contract value and the band are projects'.

**Host orchestrates and holds no money.** It reads both sides and calls
`buildProjectRollup`, which lives in `projects` — `services/host` has no
`@cog/money` dependency at all, so it cannot touch a monetary value even to
format one. That is a stronger guarantee than a review habit, and it is what
caught an earlier draft of this endpoint that formatted figures inline.

**Migration `0036` adds `purchase_orders.project_id`** with a composite FK, which
closes PROJ-02: spend is grouped by an id, and an order cannot name another
tenant's project. Orders raised from a BOQ inherit it from the BOQ's project, so
nothing has to state it twice.

Orders attached to no project are reported under `unattached` rather than
dropped — otherwise the per-project figures and the tenant total silently
disagree.

The at-risk band travels with `provisional: true` (PO-18), so a screen can say
the threshold was inherited rather than agreed.

---

## What is deliberately absent

**Inflow, outflow, TDS, actual margin, planned margin and balance.**

Every one comes from the payment path. `getProjectDetails` reads
`payment_requests`, `system_payments` and `project_financials`; **none of those
tables exists here**, because payments are gated on CA-01..CA-08 and have not
been built.

They are omitted, not zeroed, and a test asserts each name is absent from the
response body. `outflow: 0` is a statement that nothing has been paid — a claim
about money that nothing supports — and a screen would render it beside a real
committed figure as though the two were comparable. That is how DASH-01 happened
in the first place: a number that looked like a figure and was an artefact.

`plannedMargin` is absent for a different reason: it needs a budgeted cost of
sale, and `projects.projects` has no `bcs` column. The legacy keeps it in
`project_financials`, which is DASH-03.

---

## Needs a person

- **DASH-02 roles.** Who may read project financials, and who may edit them.
  Today every authenticated principal in a tenant may do both — the legacy's
  behaviour minus the cross-tenant exposure. Part of PO-13.
- **The BCS.** Whether budgeted cost of sale belongs on the project or is
  derived from the BOQ's cost rates. The legacy has it as a manual override in a
  table with three schemas; the BOQ already carries `cost_rate` per line, so the
  two would have to be reconciled rather than both kept.

---

## The commits

One for the project link migration, one for the endpoint. No faithful-port
commit: reproducing `getProjectDetails` means reproducing a rollup over
`LIKE`-matched project names, and reproducing the screen means reproducing
DASH-01.

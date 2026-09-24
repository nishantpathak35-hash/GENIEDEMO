# The eleven design-build workflows

`_legacy-updated/app/lib/api/design-build.js` — 1,909 lines, 45 exported
functions, inventoried in [`design-build-and-work.md`](design-build-and-work.md).
This is the port record: what each workflow is, whether it describes an
**observed process** or a **shape somebody sketched**, and what was built.

## How the verdict was reached

The question is not how many functions a workflow has. It is **how many rules
the code enforces** — a state machine, a cross-check, a computed consequence,
something a person would only write after watching the work happen.

- **SOLID** — there is at least one rule with a domain reason, citable by line.
- **THIN** — CRUD with defaults, and the defaults are invented numbers.

A thin verdict is not a reason to skip a workflow. It is a reason to say so, and
to leave the invented numbers out.

**Every one of the eleven is off by default**, in `tenancy.tenant_modules`
(migration 0065). They came out of a feature tree written on top of the original
app rather than out of watching a business run, so a tenant switches on the ones
they use and never sees the rest.

| # | Workflow | Module key | Verdict | Built |
|---|---|---|---|---|
| 1 | Client brief and rooms | `design_brief` | **SOLID** | ☑ |
| 2 | Design deliverables and review | `design_deliverables` | **SOLID** | ☑ |
| 3 | Room selections and substitutions | `room_selections` | **SOLID** | ☑ |
| 4 | Commercial agreement | `commercial_agreement` | **THIN** | ☑ |
| 5 | Procurement planning | `procurement_plan` | **THIN** | ☑ |
| 6 | Joinery packages | `joinery_packages` | **SOLID** | ☑ |
| 7 | Delivery milestones | `delivery_milestones` | **THIN** | ☑ |
| 8 | Handover | `handover` | **SOLID** | ☑ |
| 9 | Warranty | `warranty` | **THIN** | ☑ |
| 10 | Design timesheets | `design_timesheets` | **THIN** | ☑ |
| 11 | Client action items | `client_actions` | **SOLID** | ☑ |

Six solid, five thin.

---

## The verdicts, with their evidence

### 1. Client brief and rooms — **SOLID**

**The rule:** a brief that the client has acknowledged cannot be edited in
place. `saveClientBrief:222-233` creates a **new version** instead, and
`:242-244` refuses an in-place edit outright: *"Cannot modify acknowledged brief
in-place. Create a new version revision to update scope after client
signature."*

That is a real rule with a real reason — a signed scope that changes silently is
the origin of every variation argument that follows — and nobody writes it
without having had the argument.

Also real: clients cannot author a brief (`:206-208`).

**Not ported:** the project keyed by name (`LOWER(project) = LOWER(?)`), budgets
as `Number(...)` floats, ids from `Date.now().toString().slice(-6)`, and
`acknowledged_by` holding a display name rather than a principal.

### 2. Design deliverables and review — **SOLID**

**The rule:** revisions are counted against an included limit, and the one past
the limit is flagged for a charge rather than absorbed.
`submitDesignReview:671-693` increments `current_revision_count`, compares it
with `included_revisions_limit`, and sets `extra_scope_status` to
`'Charge Pending Approval'` when it is exceeded.

The line that settles the verdict is `:675`:
`const extraCharge = 0; // Variations must be authorized via change orders rather than arbitrary fees`.
Somebody thought about where the money goes and deliberately did not put it
here. That is not a sketch.

Also real: an approved deliverable is archived into
`design_deliverable_revisions` before it can be superseded (`:573-582`), and
approval freezes it (`:668`).

### 3. Room selections and substitutions — **SOLID**

**The rules:**
- Approval **freezes** the selection (`decideRoomSelection:872`); a rejection or
  an alternative request unfreezes it (`:880`, `:888`).
- A substitution is a separate record carrying a **price delta** and a
  **lead-time delta**, and it needs approval before it takes effect
  (`proposeSelectionSubstitution:903`, `approveSelectionSubstitution:936`).
- `approveSelectionSubstitution:940-942` returns early when the substitution is
  already approved, with the comment *"Idempotent: prevent duplicate price
  inflation"*. That is a bug somebody was bitten by, in production, and fixed.

**Not ported:** `unit_price = unit_price + ?` with a JavaScript `Number` as the
delta — money arithmetic on a float, in SQL. And
`approveSelectionSubstitution` has **no authorisation check at all**: it defaults
the actor's display name to the string `'Authorized Lead'` and asks nobody.
Here a substitution with a price impact goes through the existing approval
chain.

### 4. Commercial agreement — **THIN**

CRUD, and the defaults are the tell: `deposit_pct ?? 10` (`:1053`),
`validity_days ?? 30` (`:1054`), `included_revisions ?? 2` (`:1058`),
`included_site_visits ?? 6` (`:1059`). Four commercial terms invented by the
software.

**Nothing reads any of them.** No code refuses a third revision because
`included_revisions` is 2; nothing raises a deposit invoice from `deposit_pct`;
nothing expires a quotation after `validity_days`. `status` defaults to
`'Draft'` and no function transitions it. `contract_value` is a float that is
never compared with anything.

There is one genuine connection: `included_revisions` is the same idea as
workflow 2's `included_revisions_limit`, which **is** enforced — but the two are
separate columns on separate tables and neither reads the other.

### 5. Procurement planning — **THIN**, with one real rule inside

`getProcurementPlan:1100` is two SELECTs joined by project name and returned
untouched. That is a list, not a plan.

`detectLeadTimeConflicts:1119-1159` is the real part: it compares each
selection's lead time in weeks against the days remaining to the target
completion date and reports the shortfall. One rule, and a correct one. It is
worth porting; the "plan" around it is not.

**Not ported:** the target date falls back to the last milestone's planned
finish (`:1132`), so a project with no brief silently measures itself against
its own last milestone and can never be late.

### 6. Joinery packages — **SOLID**

**The rule:** `advanceJoineryStage:1280-1288` refuses to advance a stage while
any earlier stage is incomplete, and names the ones that are outstanding. You
cannot reach Factory Fabrication before Shop Drawing Approval is signed off.

**The vocabulary is the second piece of evidence.** Nine stages, in this order
(`:1166-1176`): Site Measurement, Shop Drawing Approval, Finish / Sample
Approval, Factory Fabrication, Factory Quality Inspection, Dispatch from Works,
Site Receipt, Installation, Final Client Acceptance. Nobody sketches that list.
It comes from watching a workshop.

Each stage carries evidence and a sign-off (`:1291-1303`).

### 7. Delivery milestones — **THIN**

`saveDeliveryMilestone:1336` writes `predecessor_id` (`:1365`, `:1390`) and
**nothing ever reads it** — there is no check that a predecessor finished, which
is the entire point of a predecessor.

`site_readiness_gate` defaults to the literal `'Passed'` (`:1367`, `:1392`). A
gate whose default is "passed" is not a gate.

`is_critical_path` is stored and appears in no query.

`getTwoWeekLookahead:1406` is real but tiny: milestones starting within a
fortnight and not complete. `recordMilestoneDelay:1422` records a reason and a
recovery plan, which is fact capture rather than a rule.

### 8. Handover — **SOLID**

**The rule:** `generateHandoverPack:1604-1612` refuses to issue the pack while
any punch item of severity `Critical` is unrectified, and says how many remain.
A handover that can be issued over open critical defects is a handover nobody
would trust; this one cannot be.

Also real: rectification requires an after-photo and records who verified it
(`rectifyHandoverItem:1588-1594`), against the before-photo captured when the
item was raised.

### 9. Warranty — **THIN**

`saveWarrantyCase:1660` invents an **SLA target of seven days from now** when
none is supplied. A service-level commitment fabricated by software is a promise
nobody made.

It also defaults `category` to `'Carpentry'` (`:1673`), `assigned_contractor` to
`'General Works'` (`:1676`) and `client_name` to the literal `'Client'`
(`:1670`) — a trade, a contractor and a customer invented for a claim.

**Nothing reads `sla_target_date`.** No escalation, no overdue list, no report.
`resolveWarrantyCase:1687` writes a status and some notes.

### 10. Design timesheets — **THIN**

`logDesignTimesheet:1444` validates that hours are greater than zero and writes
a row keyed by `user_email` — a string, not a principal.

`getTeamDesignWorkload:1481` has a defect that shows how little is behind it:
`WHERE role IN ('designer', 'lead_designer', 'architect') OR is_active = 1`. The
`OR` makes the role filter inert — every active user matches — so the "design
team workload" is the whole company's.

### 11. Client action items — **SOLID**

**The rule:** `getClientActionItems:1729-1752` unions the three things a client
is actually blocking — a design deliverable awaiting review, a finish selection
awaiting a decision, a variation awaiting approval — and narrows them to the
projects that client is authorised for (`:1714-1724`).

**`recordExternalClientDecision:1776-1801` is the observation.** Clients decide
on WhatsApp, in a meeting, on the phone; the decision is real and the system
never hears about it. This records it *with the channel it arrived through*, and
routes it to the same functions the in-app decision uses rather than writing a
second path. Nobody sketches `channel: 'WhatsApp'`.

**Not ported:** `getFounderExceptionsSummary:1823` builds a user-facing string
by concatenating `cost_impact` into SQL — a raw money column interpolated into
prose, which is both a formatting bug and the money-as-a-string pattern this
codebase forbids.

#### Where this one crosses a module boundary, and what was decided

Client actions is the only one of the eleven that reaches into another module,
and it does so in both directions. The two were settled differently.

**The write is gated.** `recordExternalDecision` applies the decision through
`reviewDeliverable` and `decideSelection` — that is the point of it, so a client
answer relayed by WhatsApp counts exactly as one typed into the app. It also
means a POST to `client-actions` is a write to design deliverables or to room
selections, which `moduleGate` cannot see: it gates a path prefix and the path
says `client-actions`. So `externalDecisionGate` in `services/host/src/api/
modules.ts` checks the module that owns the **subject kind** before dispatching.
A tenant with client actions on and deliverables off gets a 404 rather than a
moved revision count — the counter that becomes a charge. The three subjects are
checked separately, so the three switches still move independently.

**The read is not gated, deliberately.** `clientActions` unions deliverables and
selections and returns rows from both whether or not those modules are on. It is
a list of what the client is holding up, assembled inside `services/projects`,
which cannot import `services/tenancy` to ask (M1/D5). Gating it in the host
would mean the host filtering rows out of a response body it does not own.

That is a real seam and it is recorded rather than hidden: **a module switched
off stops being writable through this door, and stops having a screen, but its
outstanding rows still appear in the client-actions list.** Nothing there is a
figure or a decision — it is a title, a subject kind and a date — and the
alternative was worse. If it ever needs to change, the honest fix is a filter
parameter the host supplies, not a service reaching across the boundary.

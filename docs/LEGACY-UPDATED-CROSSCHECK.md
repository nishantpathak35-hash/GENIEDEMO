# Cross-check against the repaired legacy tree

> **This document covers part of the port.** The complete file-by-file
> reconciliation — every module in BOTH legacy trees, and where each went —
> is [`docs/PORT-LEDGER.md`](./PORT-LEDGER.md). Where the two disagree, the ledger was
> built by walking the file system and wins.


**2026-09-05.** The updated legacy tree is a *security repair* of the app we are
replacing. Its handover lists twelve changes. This file answers, for each one,
whether our rebuild covers it — and where it does not, that is a **GAP** and a
defect we missed.

**Most rows are `covered-by` rather than `same-fix`, and that is expected.** The
repair patched an app with no tenancy, no transactions and an RPC dispatcher; we
have row-level security, a typed HTTP surface and a real transaction per
request. Where the mechanism differs the row says so, because "we do it
differently" is only an answer if the difference is named.

**Neither tree is a specification.** The repair's own handover says it is "a
repair of the audited paths, not certification of every module, tax rule,
permission combination". Nothing here was adopted because that code does it that
way; each row cites a line we read.

| Verdict | Meaning |
|---|---|
| **covered-by** | We already do this, by the cited mechanism. |
| **not-applicable** | The defect cannot arise here, for a structural reason that is stated. |
| **GAP** | A real hole in our rebuild. Closed in the commit named. |

---

## 1. RPC handlers use explicit argument counts

> *Extra arguments cannot replace a verified session, omitted optional arguments are padded correctly, and non-public methods require authentication. Portal accounts have a restricted method allowlist.*

**not-applicable.** There is no RPC dispatcher to repair. `app/api/rpc/route.js`
dispatches `api[method](...args, session)`, so for an arity-1 function an
attacker-supplied first argument binds to `session` — the escalation the repair
is patching. Our surface is typed HTTP routes with a Zod schema per route
(`packages/contracts/src/api/routes.ts`), and the principal comes from the
tenant middleware, never from a request body.

The portal allowlist is `covered-by` a stronger shape: `services/host/src/app.ts:109-129`
mounts `/api/v1/portal` on its own sub-app and everything else behind
`requireStaff()`, so a non-staff credential is refused on the whole internal
tree rather than filtered to an allowlist somebody maintains.

## 2. Portal passwords, token expiry, and portal/employee separation

> *Client and vendor passwords are verified. Login no longer creates accounts. Portal tokens resolve against their own account tables, carry an expiry, and cannot inherit employee privileges.*

**not-applicable** for the credential half: we own no passwords at all. ADR-0005
puts credentials with the identity provider, and `services/identity` maps a
provider identity to a principal.

**covered-by** for the separation half, and by a different mechanism:
`identity.principals.kind` has carried `staff | vendor | client` under a CHECK
constraint since migration `0003`, and `requireKind` in
`services/host/src/api/portal.ts` refuses a mismatched kind. A portal principal
cannot inherit staff privileges because it is never handed a staff context —
there is no privilege field to inherit.

Automatic registration: `covered-by`. An account exists only through
`tenancy.provision_tenant` or an invite (`identity.invites`), and an invite
token is hashed, single-use and expiring (`services/identity/src/application/invite.ts`).

## 3. Portal reads scoped to the signed-in account

> *Client summaries and variation decisions are scoped to the signed-in client's stored identity. Vendor queries and payment submissions are scoped to the signed-in vendor's purchase orders.*

**covered-by** — `identity.principal_links` (migration `0023`) and
`loadPrincipalScope`, with the subject read from the link and **never from the
request**. `VendorPortalView.js:22-27` takes `vendorId` from the client, which
makes the scoping an input rather than a control.

Fourteen tests in `services/host/tests/isolation/tenant-routes.test.ts` assert
it, including the one that matters: a vendor linked to V cannot read an order
belonging to W **in the same tenant**, where row-level security contributes
nothing because V, W and the staff who raised both share a tenant.

## 4. Debug routes, PO printing, Tally forwarding — and two portal boundaries

> *Debug HTTP routes return 404 … PO printing requires an authenticated HttpOnly cookie … Tally forwarding requires finance access. Portal users cannot read the global event feed or unrestricted attachment endpoint; private attachment responses are no longer publicly cacheable.*

| Sub-item | Verdict |
|---|---|
| Debug routes | **not-applicable** — `app/api/debug/` and `app/api/debug_po/` were never ported. `../CLAUDE.md` names them as non-porting, and no route in `API_ROUTES` corresponds to either |
| PO printing behind a cookie | **covered-by** — `apps/web/lib/session.ts` holds the credential in an httpOnly `cog_credential` cookie, and every PO read is a tenant-scoped route under RLS. Vendor ownership is `requireKind` plus the link |
| Tally forwarding needs finance | **covered-by**, differently — the connector authenticates with a per-tenant key resolved by a SECURITY DEFINER function, not with a user session, so there is no user privilege to check. The grant is provisioned, not requested |
| **Portal users and the global event feed** | **not-applicable** — there is no event-feed endpoint. `workflow.events` is a Postgres LISTEN/NOTIFY channel consumed by a worker; nothing exposes it over HTTP. When one is built it lands under `/api/v1` and is behind `requireStaff` by construction |
| **Unrestricted attachment endpoint** | **covered-by** — document access is a signed URL with a bounded TTL (`assertMaySign`, `MAX_SIGNED_URL_TTL_SECONDS`), and the metadata route is tenant-scoped. There is no unauthenticated static path; `public/uploads/` was never ported (VAULT-01) |
| **Private responses publicly cacheable** | **GAP — closed.** No response set `Cache-Control` at all, and absent a header a shared cache may store an authenticated response heuristically. A portal response is one vendor's order book. Now `no-store` plus `Vary: Authorization` on every response, set once in `services/host/src/app.ts` rather than per route. Commit *make every response uncacheable* |

## 5. Variation decisions: transactional, once, and unambiguous

> *Variation decisions run in a transaction, apply once, reject conflicting repeat decisions, and require a single matching client contract.*

**covered-by** for the first three: the decision runs in the request's
transaction, and `expectedVersion` is required on every change-order decision
(`services/projects/src/application/change-orders.ts`), so a repeat decision is
refused rather than applied twice — CO-04 is that the legacy adds a variation's
cost to the contract value on each approval.

**not-applicable** for the fourth, and this is a schema difference rather than a
policy one. "A single matching client contract" is a repair for identity by
fuzzy string: the legacy links projects and contracts by client NAME, so
`LIKE '%…%'` can match several and the original silently updated the first. Our
change orders resolve a project by **uuid**, one project carries one contract
value, and there is nothing to disambiguate. The handover names the same fix as
future work on its own side — *"several modules still link projects by name. A
future schema migration should introduce stable client/project IDs"*.

## 6. Transaction-scoped queries

> *Queries inside a transaction use the transaction connection, including calls through nested services. Failed multi-step changes roll back together.*

**not-applicable as a repair, load-bearing as a property.** This is the defect
recorded in `OPEN-DECISIONS.md` §1: `withTransaction` stores
`{ queryAll, queryGet, queryRun, tx }` in AsyncLocalStorage while the readers
look for `store.txQueryAll` — the keys do not match, so every query falls
through to the base client outside the transaction. It is the reason Option B
was disqualified.

We do not have the seam because we do not have the hole: `withTenant` in
`packages/service-kit` opens one transaction per request and hands the `tx`
down explicitly. Every application function takes it as its first parameter.
There is no ambient store that can be missed.

## 7. Cash flow rather than claimed profit

> *Project cash outflows use the selected project, and client TDS credits reduce receivables. The UI shows cash flow rather than claiming accounting profit; the API's former `pnl` result is now null.*

**Adopted as a decision, and the surface is CA-gated.** Recorded as `PNL` in the
PROPOSED table in `OPEN-DECISIONS.md`. Nothing renders either figure today:
client billing, payments and reports are all CA-gated and unbuilt, so this is a
commitment about what we will not claim rather than code.

Worth carrying forward: `client-billing.js:343-344` still computes `grossProfit`
and `marginPct` and simply does not return them. One line from being live again.

## 8. Inventory: dispatch, receipt, and competing issues

> *Inventory dispatch deducts source stock. Confirmed receipt credits destination stock once. Stock issues use conditional updates, concurrent issues cannot spend the same stock … Transfers store the dispatched item's details; stock receipts maintain weighted-average unit cost.*

| Sub-item | Verdict |
|---|---|
| Dispatch deducts source | **covered-by** — a transfer IS two movements sharing a `transfer_id`, written in one transaction. There is no separate transfer record that could disagree with the ledger (INV-01) |
| Receipt credits once | **covered-by** — same two rows. There is no second confirm step to double-apply |
| **Concurrent issues cannot spend the same stock** | **GAP — closed.** Ours read the balance and then wrote, under READ COMMITTED, so two issues could both see 100 and both take 60. The legacy's own fix — `UPDATE … WHERE quantity_on_hand >= ?` — is unavailable to us because we deliberately store no balance, so the equivalent is `SELECT … FOR UPDATE` on the item before the sum is read. Proved by two overlapping requests on separate pool connections. Commit *stop two concurrent issues spending the same stock* |
| Invalid quantities rejected | **covered-by** — `positiveQuantity`'s equivalent, plus a `CHECK (quantity_micros <> 0)` and a sign constraint per movement kind in migration `0034` |
| Transfers carry the dispatched item's cost | **covered-by** — the value that leaves the source is the value that arrives, so a transfer moves value and creates none. Migration `0051` |
| **Weighted-average unit cost** | **Adopted (INV-03), built.** Migration `0051`, valued on the movement rather than as a stored average — see the note below |

**Why our weighted average is shaped differently.** `inventory.js:61` keeps a
`unit_price` column and rewrites it on each receipt. We store the **value** on
each movement and derive the average on read, because a stored quotient rounds:
sum the rounded unit costs back against their quantities and the total no longer
matches the one it came from. Value and quantity are exact integers, their sums
are exact, and the division happens once — when somebody looks.

## 9. Fabricated client-facing figures removed

> *Fabricated client contract totals, progress percentages, bill counts, and document-download alerts were removed. Progress and documents show an honest unpublished state until approved data is connected.*

**covered-by, and reached independently.** The client portal carries no billing
ledger and no billing percentage — both are CA-gated and absent rather than
stubbed (`docs/plans/M6.md`). `apps/client-portal` renders an empty state rather
than a computed one, and the contract shapes have no field for a percentage, so
adding one would have to be argued for in `packages/contracts` first.

The legacy caps its billing percentage with `Math.min(100, …)`, so an over-billed
project reads as exactly complete. We show nothing rather than that.

## 10. Finance-only controls and BOQ locking

> *Approved BOQ schedules reject estimate imports. Finance-only controls protect client billing writes, imprest approval/reconciliation, and retention release. Payment edit overrides require administrator/director authorization.*

**Partly covered, and the rest is now real rather than blocked.**

- Approved BOQ rejects imports: **covered-by** — a BOQ line write checks the
  schedule's state, and `expectedVersion` is required (BOQ-05/06).
- Finance-only controls: **covered-by as of this run.** These were the PO-13
  casualties — the chain refused every decision because no chain could be
  configured. Migration `0024` lands the role model and the approval chain is
  seeded per tenant, so imprest sanction and change-order review now run through
  `approve()` with an entitled role. Client billing writes and retention release
  stay CA-gated and unbuilt, so there is nothing yet to protect.
- Payment edit overrides: **not-applicable** — payments are CA-gated. When they
  are built the override is a `role_grants` action, not a hardcoded role check.

## 11. Lockfile and TypeScript in production builds

> *The dependency lockfile was repaired. Production builds now validate TypeScript instead of ignoring errors.*

**not-applicable / already true.** `pnpm-lock.yaml` is committed and
`.npmrc` sets `save-exact=true` and `ignore-scripts=true`. `pnpm verify` runs
`typecheck` and `build` across 28 tasks and is the gate; nothing in this repo has
ever set `ignoreBuildErrors`.

## 12. The `audit_001_stock_transfer_receipt` migration

> *Apply the existing migrations plus `audit_001_stock_transfer_receipt` … Existing transfer notes have no reliable dispatch snapshot, so the receipt operation deliberately rejects those notes until physical stock and the legacy entries are reconciled.*

**not-applicable as SQL; the INTENT is covered.** That migration adds
`source_item_id` and `item_snapshot` to a transfer table we do not have — our
transfer is the pair of movements, so there is no note to snapshot.

The intent — *refuse to complete a movement whose cost basis is unknown rather
than guessing at it* — is carried directly: `value_paise` is nullable in
migration `0051`, a balance containing an unvalued movement reports **null**
rather than a smaller number that looks complete, and the contract documents
`null` as "unvaluable, not zero".

---

## Two gaps this exercise found that the handover does not mention

Neither is in the repaired tree's Changes list. Both were found by trying to
USE what the cross-check said we already had, which is the argument for doing
this against running code rather than on paper.

| Gap | How it surfaced | Closed by |
|---|---|---|
| **A request could never ENTER an approval chain.** `approve()` refused an empty current stage as `unknown-stage`, and nothing ever set one — so every approval refused, whatever the configuration said | Seeding the first default chain and watching an approval still refuse | An empty stage now resolves to stage one, narrowly: a stage that is *named* but absent still refuses, because that is a reconfiguration that stranded a live request. Commit *let a request enter the chain at its first stage* |
| **No route moved a purchase order out of `draft`.** `canTransition` has permitted `draft → pending_approval` since M1 and no endpoint exposed it, so an order was created as a draft and stayed one forever | Writing a demo seed that tried to show an approval part-way through a chain | `POST /purchase-orders/:id/submit`, under an optimistic lock, separate from the edit route. Commit *add the route that sends a purchase order for approval* |

Together these were the other half of PO-13's blockage. The role model answered
"who may approve"; these two answered "and how does anything ever get to them".

## The defects the repair did not fix, and we do not inherit

Cross-referenced from the PROPOSED section of `OPEN-DECISIONS.md`:

| | |
|---|---|
| The estimation engine still exists twice | `app/lib/estimationCalculations.js:63` against `components/views/EstimationView.js:121-134` |
| Mid-formula rounding, twice, on floats | `estimationCalculations.js:48`, `:63`, `:70`, then `:79`, `:80` — EST-01 |
| `grossProfit` / `marginPct` computed and discarded | `app/lib/api/client-billing.js:343-344` |
| `issueStockToProject` never got the conditional update `issueMaterial` got | `app/lib/api/inventory.js:378-383` — a read-then-write, the same defect on the other issue path |
| The action grants are read at one site, which re-implements the merge | `app/lib/api/projects.js:282-302` filters through `VALID_ROLE_KEYS` (four roles) while `getFeaturePermissions` honours ten |
| A missing BOQ cost rate is invented at two different factors | 78% in the browser (`BoqView.js:258`), 80% on the server (`boq.js:115`) |
| No server-side check stops a requester approving their own request | `app/lib/api/purchase-orders/approve.js:58-83` reads roles and stage only |

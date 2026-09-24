# Port note — BOQ writes

Slice 2 of the M5 view port. Covers adding, editing and deleting BOQ lines.

Legacy sites, under `../../../_legacy/atelier-current/`:

| File | What it is |
|---|---|
| `app/lib/api/boq.js` | eight write functions, 47–400, all in the RPC allowlist |
| `app/lib/api/takeoff.js:259` | `exportTakeoffToBOQ` — writes BOQ lines from a takeoff |
| `app/api/rpc/route.js:151-158`, `:226` | how each is reached |

---

## What was ported, and what was not

**Ported as a replacement, one commit each:** `addBOQItem` (`:89`),
`updateBOQItem` (`:289`), `deleteBOQItem` (`:327`). Every one carries a defect
ADR-0014 already classifies as blocking, so there is no correct prior behaviour
to preserve.

**Replaced in slice A:** `shootPOFromBOQItem` (`:135`), `shootPOFromBOQItems`
(`:199`) and `linkPOToBOQItems` (`:388`), by
`POST /api/v1/purchase-orders/from-boq`. See the slice A section at the end.

**Still not ported, deliberately:** `importEstimationItemsToBOQ` (`:349`),
`createBOQSchedule` (`:47`), `exportTakeoffToBOQ`. Reasons below.

---

## Defects, with status

Status was established before deciding what to port, as
`plans/M5-VIEW-PORT.md` now requires. It changed the shape of this slice twice.

| Ref | Site | Defect | Status |
|---|---|---|---|
| **BOQ-03** | `boq.js:174`, `:253` | **Minting a purchase order from a BOQ line creates it already approved, for a caller-supplied value.** `INSERT INTO purchase_orders (... status, approval_status ...) VALUES (..., 'Approved', 'Approved', ...)`, and `:170` takes `payload.poValue` when the caller sends one. The only gate is `requireAuth` (`boq.js:8`), which is `AuthService.requireAuth` — and that checks `session.email` is truthy and nothing else (`AuthService.ts:17-21`). Both functions are RPC-exposed (`route.js:156`, `:157`) | **LIVE** |
| **TAKE-02** | `takeoff.js:325-328` | `INSERT INTO boq_items (... unit, qty ...)`. Neither column exists: `boq_items` has `uom` and `quantity` (`migrations.js:117-131`) and the six later `ALTER`s add `cost_rate`, `margin_pct`, `vendor_name`, `rc_number`, `po_status`, `po_no` (`:163-178`). libSQL raises `no such column`, so **exporting a takeoff to a BOQ has never worked** | **latent** |
| **BOQ-01** | `boq.js:114` | `Number(realPayload.amount) \|\| Math.round(qty * rate * 100) / 100` — a caller can assert a line total that is not quantity × rate | **LIVE** |
| **BOQ-02** | `boq.js:110` | A missing `cost_rate` becomes `Math.round(rate * 0.8 * 100) / 100`. `BoqView.js:137` invents the same unknown as **78%** of the rate. Two fabrications of one unknown, neither with a basis, and every margin figure rests on whichever ran | **LIVE** |
| **BOQ-04** | — | `boq_items` had no version column and `updateBOQItem` takes no lock, so two concurrent edits to one line silently lose one | **was LIVE — closed by migration `0030`** |
| **PO-16** | `boq.js:364-366` | Estimation import hardcodes `qty = 1` and makes `final_rate_with_gst` the unit rate, embedding tax in a rate and discarding the quantity | **LIVE** |

### BOQ-03 is the one to act on

*(Closed in slice A — `POST /api/v1/purchase-orders/from-boq`. The description
below is what it was, and why it mattered.)*

It is not a rounding defect. Any caller who can produce an object with an
`email` property can create a purchase order that is **born approved**, for an
**amount they choose**, with no chain, no approver and no history row. The
approval controls built in the previous slice — entitlement, self-approval
refusal, quorum — are all bypassed by a different endpoint that writes the same
table.

It is also compounded by the two RPC defects already recorded: `route.js`
dispatches `api[method](...args, session)` with padded arguments, and
`shootPOFromBOQItem` itself decides which argument is the session by sniffing
for `.email` or `.roles` (`boq.js:140-152`).

**It was rebuilt as its own slice, which was the right call.** It needs a BOQ↔PO link that
`0011` does not have — the legacy carries `po_no` on `boq_items`, which is the
mutable key PO-19 is about — and it crosses `projects` into `procurement`, so
the endpoint belongs in `services/host` as composition, like the approval
decide endpoint. When it is built, the created order must be born `draft` and
enter the ordinary chain.

Between slice 2 and slice A there was **no endpoint in the new system that minted
a purchase order from a BOQ line** — the correct interim state, because absent is
safer than present and wrong.

### BOQ-04 was carried, then closed

*(Closed by migration `0030`: `projects.boq_items` now has a `version` column and
the PATCH requires `expectedVersion`. The reasoning for carrying it first is
kept because it is the reasoning for not inventing a control without a column.)*

`projects.boq_items` has no version column, so `PATCH .../boq/:itemId` has no
optimistic lock. Two people editing one line: last writer wins, silently.

This is stated rather than half-solved. Adding a version column is a migration,
a contract change and a negative test of its own, and a lock invented in the
application layer without a column behind it would look like the purchase-order
control while not being one. The purchase-order endpoints require
`expectedVersion` because `procurement.purchase_orders.version` exists to check
it against.

---

## Unreliable here

- **`createBOQSchedule` (`:47`) is not ported** because the new model has no
  `boq_schedules` table: a BOQ belongs to a project, and `projects.boq_items`
  carries `project_id` directly. Whether schedules need to be versioned
  documents in their own right is a product question, not a port one.
- **`importEstimationItemsToBOQ` (`:349`) is not ported** while PO-16 is open.
  `fromEstimationItem` in `domain/boq.ts` already refuses a placeholder quantity
  of 1 and takes a pre-tax rate; what is missing is the endpoint, and building
  it means deciding how to read historic `final_rate_with_gst` values, which is
  the reconciliation question only the customer can answer.
- Only the two PO-minting functions are wrapped in `withTransaction`
  (`:173`, `:251`). Every other write is a loose sequence, so a failure part-way
  through a bulk insert leaves a partial schedule that reads as complete. Here
  the middleware opens one transaction per request and the whole set lands or
  none of it does.
- `boq.js:112` defaults `margin_pct` to **20**, while `migrations.js:166`
  declares the column default as **15**. A third invented commercial figure, and
  it disagrees with the schema it writes into. Neither is ported; margin is not
  a column in the new model at all, because it is derived from rate and cost.

---

## Needs a person

Nothing new for a CA. PO-16 and PO-15 are already open and both are about the
customer's historic data and commercial defaults, not about statute.

What is new is a decision for the user, recorded here rather than guessed:
**BOQ-03 means the legacy has been able to create approved purchase orders
outside the approval chain for as long as the feature has existed.** Whether
tenant #1's existing purchase orders include any created that way is knowable
only from their data, and it changes what the M2.5 reconciliation has to check.

---

## The commits

One commit for the writes. There is no faithful-port commit to precede it: a
port of `addBOQItem` would carry a client-supplied line total and an invented
cost rate, both of which ADR-0014 forbids outright, and the two-commit protocol
exists to keep a changed *figure* attributable rather than to require that every
defect be reproduced first.

---

## Slice A — the BOQ→PO path, built

`POST /api/v1/purchase-orders/from-boq`, in `services/host`, because it needs
`projects` and `procurement` and no service may import another.

### What closes BOQ-03

The order is created by `createPurchaseOrder` — the same function a direct
create uses, which writes `state = 'draft'`. There is no second creation path,
and nothing anywhere writes `'approved'` except `applyChainAdvance`, which runs
only after the workflow engine has accepted an approval. **No path in this
system creates an approved order.**

The endpoint is behind the tenant middleware, so the caller is a resolved
principal in a resolved tenant rather than any object carrying an `email`
property.

### Host orchestrates; it computes nothing

Three calls, no conditional about domain meaning:

1. `loadOrderableBoqLines` — **projects** decides what is orderable.
2. `purchaseOrderLinesFromBoq` — **procurement** decides what a PO line made
   from a BOQ line looks like.
3. `createPurchaseOrder` — **procurement** creates it and computes the totals.

The response is built by procurement's `toWriteResponse`. `services/host` has no
`@cog/money` dependency, so it cannot touch a monetary value even to format one
— which is a stronger guarantee than a review habit.

### BOQ-05 — the link direction

The legacy holds it as `boq_items.po_no`: one PO number per BOQ line, set by
`linkPOToBOQItems` (`boq.js:394`) as a bulk UPDATE. Partial procurement — 500
sqm of tile across two vendors, or in two tranches — cannot be represented, so
the second order silently takes the field and the first is forgotten.

Here it is `procurement.purchase_order_lines.boq_item_id`, nullable, many-to-one.
Three reasons for that direction:

- a BOQ line can be ordered more than once;
- the FK sits in the service that owns the referencing row (`projects`
  references nothing outside itself);
- the ordered quantity and rate are recorded on the PO line, so the link
  survives a later BOQ edit.

Composite `(tenant_id, boq_item_id)`, because referential integrity is not
subject to RLS and a single-column FK would let tenant A reference tenant B's
line — the insert succeeding is itself the disclosure. Asserted directly in the
isolation suite rather than assumed.

`ON DELETE RESTRICT`, and the choice matters: CASCADE would delete a
purchase-order line because somebody tidied a BOQ, and SET NULL would keep the
line while dropping its provenance. RESTRICT refuses, and the refusal surfaces
as a 409.

### BOQ-06 — what a PO line raised from a BOQ costs

`boq.js:233` is `Number(item.cost_rate || item.rate || 0)`. When the cost is
unknown it falls back to the **client-facing selling rate**, and when that is
absent, to zero. Neither substitution is visible to whoever approves the order.

`cost_rate` is NULL for UNKNOWN here by design (BOQ-02), so the fallback has
nothing to fall back to and nothing to invent. `loadOrderableBoqLines` refuses
the whole request and names the lines. An unknown cost has no defensible
purchase-order rate.

### What was not carried

`tax_pct: 18` (`boq.js:244`). The GST rate for a works contract is **CA-16** and
open; hardcoding it would be answering a statutory question by inference. The
rate is supplied per request, exactly as `purchaseOrderLineInput` already does
for a direct create. Per-line rates become meaningful once CA-16 settles — one
rate for the selection is what BOQ data supports today.

### Still not built

`importEstimationItemsToBOQ` (PO-16) and `createBOQSchedule` (no schedules table)
remain out, for the reasons already given above.

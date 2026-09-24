# Port note — purchase-order writes

Slice 1 of the M5 view port. Covers creating, editing and renaming a purchase
order: the endpoints the screens have been blocked on.

Legacy sites, all under `../../../_legacy/atelier-current/`:

| File | What it is |
|---|---|
| `app/lib/api/purchase-orders/write.js` | `savePO` (15–22), `updatePOFull` (23–182), `deletePOFull` (183–230) |
| `src/modules/purchase-orders/services/POService.ts` | `createPO` — where `savePO` actually goes |
| `app/api/rpc/route.js:34` | how `updatePOFull` is reached |

---

## Behaviour

**Create** is `savePO` → `POService.createPO`. It computes GST per line
(`POService.ts:49`, `Math.round(gross * tPct / 100)`), sums, computes TDS on the
subtotal excluding GST, and stores

```
totalVal = subt + gstSum - tdsAmt          POService.ts:48, and again at :160
```

into **both** `po_value` and `revised_po_value`.

**Update** is `updatePOFull`, and it is the only update path — `POService.ts`
contains no `UPDATE purchase_orders` at all. It recomputes the totals from the
payload, writes the header, cascades a changed `po_no` across five tables, then
deletes and re-inserts the lines.

**Rename** is not a separate operation. `po_no` is the primary key
(`db.js:86`), so renaming is a field on the update, and `write.js:142` carries
the new value to `po_items`, `payment_requests`, `system_payments`,
`manual_payments` and `po_approval_history` in a loop of bare UPDATEs with no
transaction.

### The finding that reorganises all of it

`updatePOFull` writes `version = COALESCE(version, 1) + 1` in **both** of its
branches — `write.js:104` (locked) and `write.js:126` (unlocked).

`purchase_orders` has no `version` column:

- not in the `CREATE TABLE` at `db.js:86-100`
- not in the idempotent `poColumns` ALTERs at `core.js:89-93`
- not in any `ALTER TABLE purchase_orders` — there are nine, at
  `migrations.js:65-73`, and none adds it
- the codebase's only `ADD COLUMN version` targets `payment_requests`
  (`migrations.js:43`)

The driver is libSQL (`db.js:1`), so this raises `no such column`. It is not
swallowed: `queryRun` (`db.js:310`) delegates to `executeWithRetry`, which
rethrows anything that is neither a network fault nor `SQLITE_BUSY` on the first
attempt (`db.js:281`).

**So editing a purchase order throws, always** — and every defect below
`write.js:104` has never executed.

Scope of the claim: this is what the repository shows, for a database built by
this code's own migrations. A column added out-of-band to the live Turso
instance is not knowable from here, and `_private/` is not readable.

---

## Defects carried into `STACK-MIGRATION.md`

The **status** column is the point of this table. Four of these six were briefed
as live, and porting them faithfully was the stated plan for slice 1. They are
not live — the two that are were found by reading, not by being told.

| Ref | Site | What | Status |
|---|---|---|---|
| **PO-19** | `write.js:142` | A rename cascades the primary key to five tables with loose UPDATEs and no transaction. `boq_items` (`migrations.js:178`) and `vendor_retention_ledger` (`migrations.js:273`) also carry `po_no` and are **not** in the list, so a rename would orphan them | **latent** — below the throwing line |
| **PO-20** | `write.js:55` | `item.gst_amount !== undefined ? Number(item.gst_amount) : computed` — the client's GST figure wins when supplied | **latent**, and create was never exposed: `POService.ts:49` always computes |
| **PO-21** | `write.js:157` | `item.amount !== undefined ? Number(item.amount) : ...` — the client supplies the line total itself | **latent** |
| **PO-22** | `write.js:96` | The optimistic lock applies only when the client sends `expectedVersion`. A control the caller can decline is not a control | **latent**, and moot — both branches throw |
| **PO-23** | `POService.ts:48`, `:160` | `totalVal = subt + gstSum - tdsAmt` stored as `po_value` **and** `revised_po_value` | **LIVE** |
| **PO-24** | `read.js:189`, `POsView.js:301` | The next PO number is peeked without reserving it and shown in the form, so two users who open it together collide | **LIVE** |

### PO-24 — the number in the form is a guess

`NumberSeriesService.peekNextNumber` documents itself as *"Peeks at the next
unique number for a module type without incrementing the counter"*, and
`POsView.js:301` calls it when the create modal opens. Nothing is reserved, so
two users who open the form together are both shown `PO-0042`.

This one is **live** — `savePO` works, so the collision is reachable. It is
replaced rather than ported: `allocateNumber` bumps a per-tenant counter with
`UPDATE ... RETURNING` inside the transaction that inserts the order, so
concurrent creates take the lock in turn. `GET /purchase-orders/next-number`
still exists for a form to fill a field, and is named a preview because that is
what it is.

Gaps are accepted: a rolled-back insert burns a number. GST Rule 46 requires
consecutive serials on a **tax invoice**, and M1.md:272 already scopes the
per-tenant counter to that. A purchase order is neither an invoice nor
supplier-issued.

### PO-19's retention orphan

`vendor_retention_ledger.po_no` is `TEXT NOT NULL`. Retention is money withheld
from a vendor and released in stages months later, so a detached ledger row
surfaces at release time — long after anyone could connect it to a rename. It is
the row of this table worth reading twice, and it is only latent because of a
missing column.

### PO-23 is also a data-migration hazard

Every existing `po_value` is net of a deduction that has not been made, against
an invoice that does not exist. It is neither what the order is worth to the
vendor nor what the vendor will be paid. `committedSpend` in `services/projects`
sums exactly this column, so committed spend is under-stated by the TDS.

**Legacy `po_value` cannot be loaded into `gross`.** It must be un-netted first
using the `tds_amount` stored alongside it, or every imported order silently
understates. That is a migration step, not a defect row, and it is recorded on
the column itself in migration `0020`.

---

## Unreliable here

- **`deletePOFull` (`write.js:183`) is out of scope for this slice.** It is
  non-transactional and uses a `safeDelete` that swallows errors on the
  intermediate deletes, so a partial delete reports success. It is
  `requireAdminConsole`-gated and belongs with the M6 admin path; pulling it in
  here doubles the slice.
- `submitPOForApproval` and `approvePO` were done in the approval slice. Their
  stage strings are case-inconsistent between the two functions —
  `.toLowerCase()` in one, title-case exact matching in the other — which is
  recorded as APPR-01 and is not a target.
- `financiallyChanged` compares money with `> 0.5`, a float tolerance that
  exists only because `po_value` is `REAL`. With BIGINT paise the comparison is
  exact.

---

## Needs a person

Nothing new. PO-23 does not need a CA: **declining** to compute a figure needs
no ruling. Computing one would be a rate application on the money path, which is
where CA-05..CA-08 bite, and the ordering puts that in slices 8–10.

What a person may still want to say, once tenant #1's history is reconciled
(M2.5), is whether the un-netting described above should be applied to historic
rows or whether those orders should be imported as-is with a marker. That is a
reconciliation input, not a rule.

---

## The commits

**Create keeps the two-commit protocol.** It has live behaviour with a real
figure, so commit 1's fidelity target is `POService.createPO` — not `write.js`.

**Update and rename are one commit each.** There is no prior behaviour to
preserve: the path throws before it writes. ADR-0014 decision 5 exists so a
changed *figure* stays attributable, and a path that never produced a figure has
none. This is the same call M3 made for the procurement domain — *"one commit,
not two, because there is no correct prior behaviour to preserve"* — and
`domain/purchase-order.ts` already records it for the aggregate.

The one thing that would have been a two-commit port — PO-20, the client-trusted
`gst_amount` the brief said to fix on port — turns out to be unreachable, and
the live create path already computes GST server-side. There was no privilege
escalation to port.

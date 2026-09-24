# Port note — inventory

Slice 4 of the M5 view port. `InventoryView.js` (245 lines) was blocked on all
of these.

Legacy sites, under `../../../_legacy/atelier-current/`:

| File | What it is |
|---|---|
| `app/lib/api/inventory.js` | `listInventory` (11), `recordGRN` (46), `issueMaterial` (94), `createTransfer` (143), `listTransfers` (172) |
| `app/lib/migrations.js:430-455` | `inventory_items`, `inventory_transfers` |

The status check came back **clean on columns** — every write names a column
that exists, unlike purchase orders, takeoff and vendors. The defects here are
of a different kind.

---

## Defects, with status

| Ref | Site | Defect | Status |
|---|---|---|---|
| **INV-01** | `inventory.js:143-170` | **`createTransfer` moves no stock.** It inserts a row into `inventory_transfers` and never touches `inventory_items`, so the source warehouse keeps its quantity and the destination never gains it. It is the **only inventory write the UI calls** (`InventoryView.js:51`) — `recordGRN` and `issueMaterial` are in the RPC allowlist but no screen calls either. So every stock figure in the legacy is whatever a goods receipt last set, and no transfer has ever changed one | **LIVE** |
| **INV-02** | `inventory.js:153` | `id = 'STN-' + Math.floor(400 + Math.random() * 500)` against a `TEXT PRIMARY KEY`. Five hundred possible ids: by the birthday bound a collision is more likely than not after about **26** transfers, and the insert then throws | **LIVE** |
| **INV-03** | `InventoryView.js:79`, `:161` | Stock valuation is `quantity * unitPrice`, computed in the browser, where `unit_price` is a single column each goods receipt overwrites — the last price paid, not a cost basis | **LIVE** |
| **INV-04** | `inventory.js:69`, `:125` | Stock is a running balance read into JavaScript, adjusted, and written back. Two concurrent issues both read 100 and both write 90 | **LIVE** |
| **INV-05** | `inventory.js:180` | `listTransfers(filters)` takes a filters argument and applies none of it — every caller gets every transfer | **LIVE** |
| **INV-06** | `migrations.js:436` | `quantity_on_hand REAL`. A float quantity multiplied by a unit price is a float on the money path | **LIVE** |

---

## What replaces it

**Stock is the sum of an append-only ledger.** `procurement.stock_movements`
holds signed `quantity_micros`, and the balance is `SUM(...)` per item per
warehouse. There is no stored balance column, so there is nothing that can
disagree with the movements that produced it.

That single decision answers four of the six:

- **INV-01** — a transfer is *two rows sharing a `transfer_id`*, written in one
  transaction, one negative and one positive. Moving stock out of a warehouse
  without moving it into another is not something the schema can express. A test
  asserts every `transfer_id` group sums to exactly zero.
- **INV-04** — every movement is an `INSERT`. Nothing is read-modify-written, so
  there is no update to lose.
- **INV-06** — `bigint` millionths, exact.
- **INV-02** — uuids.

`app_runtime` is granted `SELECT, INSERT` and **not `DELETE`** on the movement
table. A ledger you can delete from is not a ledger; a mistaken movement is
corrected by a reversing movement, which leaves both visible. The isolation
suite asserts the `DELETE` is refused.

**INV-05** goes away because scoping is RLS's job, not a filter argument's.

---

## INV-03 — valuation is deliberately absent, and this is the notable omission

The response carries no stock value and no unit price, and a test asserts their
absence.

The legacy figure is not merely imprecise — it is not a valuation. `unit_price`
is one column that each goods receipt overwrites, so it is the price of the most
recent purchase applied to the entire quantity on hand, including stock bought
at other prices. Multiplying it by quantity produces a number with no
interpretation, and `InventoryView.js:161` renders it with a rupee sign.

Reproducing that would put a meaningless figure in front of a director. What
stock is worth requires a costing method — FIFO, weighted average, standard cost
— and that is a decision with accounting consequences that nobody has made.

**This is not CA-gated.** Inventory valuation affects the balance sheet, so it is
adjacent to statutory territory, but the question here is which method the
business uses, not what a statute requires. It is the same category as PO-15 and
PO-18: a commercial decision, recorded rather than invented.

The ledger makes it answerable later — every movement has a quantity, a
warehouse and a date, so a costing layer can be added over it without a
migration. A running balance could not.

---

## Needs a person

**INV-03.** Which costing method, per tenant. Until then no valuation is shown
anywhere, and the absence is asserted by a test so it cannot be quietly filled
in with the legacy's number.

Also unresolved and recorded rather than guessed: whether an issue should be
attributable to a project or a cost centre. The legacy's `issueMaterial` takes
neither and is called by nothing, so there is no observed behaviour to port —
`reference` is free text in the meantime.

---

## The commits

One for the tables and their policy pairs, one for the endpoints. No
faithful-port commit: porting `createTransfer` verbatim means porting a transfer
that does not transfer.

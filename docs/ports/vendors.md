# Port note — vendors

Slice 3 of the M5 view port. `VendorsView.js` (218 lines) was blocked on all of
these.

Legacy sites, under `../../../_legacy/atelier-current/`:

| File | What it is |
|---|---|
| `app/lib/api/vendors.js` | `addVendor` (24), `updateVendor` (32), `getVendorByName` (40), `getVendorSummary` (73), `createVendor` (116) |
| `src/modules/vendors/repositories/VendorRepository.ts` | where the SQL actually is |
| `app/lib/db.js:73`, `app/lib/migrations.js:362-400` | two `CREATE TABLE vendors`, and the ALTER loop that reconciles them |

---

## Defects, with status

| Ref | Site | Defect | Status |
|---|---|---|---|
| **VEND-01** | `VendorRepository.ts:64` | `fields.push('version = COALESCE(version, 1) + 1')` runs on **every** update, against a column that does not exist. `db.js:73` creates `vendors` without it; migration 012's `CREATE TABLE IF NOT EXISTS` (which *does* declare `version`) is a no-op because the table already exists; and the 20-column ALTER loop at `migrations.js:388-395` does not include it. **`updateVendor` throws `no such column: version` every time** | **latent — editing a vendor has never worked** |
| **VEND-02** | `vendors.js:42` | `getVendorByName` does `SELECT * FROM vendors` and returns `accountNo: row.bank_account` and `ifsc: row.ifsc`, plus `pan` and `gstin`. The gate is `requireAuth`, which checks that `session.email` is truthy and nothing else (`AuthService.ts:17-21`). It is in the RPC allowlist (`route.js:25`) | **LIVE** |
| **VEND-03** | `VendorRepository.ts:15` | `findByNameOrCode` matches `legal_name = ? OR vendor_code = ?`, and `legal_name` carries no unique constraint. Two vendors may share a legal name, and the lookup returns whichever the planner reaches first | **LIVE** |
| **VEND-04** | `vendors.js:163`, `:199` | `getVendorPOs` and `getVendorPaymentRequests` match with `LOWER(vendor_name) LIKE '%…%'`. A vendor named "Ace" matches "Aceline", "Palace Interiors" and "Menace Ltd" | **LIVE** |
| **VEND-05** | `vendors.js:25`, `:33` | Any authenticated principal may create or edit any vendor. No role check exists in the module | **LIVE** |

### VEND-01 is the fourth instance of one bug

`purchase_orders.version` (PO-22), `boq_items.unit`/`qty` via `exportTakeoffToBOQ`
(TAKE-02), and now `vendors.version`. In every case a write names a column no
migration creates, the statement throws, and the feature has never worked —
while the code reads as though it does.

The status-first step in `plans/M5-VIEW-PORT.md` exists because of this pattern,
and it found this one before any effort went into porting the optimistic-locking
behaviour that never ran.

### VEND-02 is the one that matters operationally

A vendor's bank account number and IFSC are what a payment is made to. Returning
them to every authenticated user means a junior site engineer can read the
details a fraud would need, and nothing records that they did.

---

## What replaces it

**Identity is a surrogate `uuid`.** `code` carries the legacy `vendor_code` as a
tenant-unique label; `name` is a label and nothing looks anything up by it. That
closes VEND-03 and VEND-04 by construction — `purchase_orders.vendor_id` is a
composite FK to this table (migration `0033`), so no string matching is involved
anywhere in the path.

**Bank details are a separate table.** `procurement.vendor_bank_accounts` holds
`account_number`, `ifsc` and `account_name`, and **no vendor read touches it**.
That is a structural answer to VEND-02 rather than a filtering habit: the
columns are not on the table the vendor endpoints read, so `SELECT *` on
`procurement.vendors` could not leak them. The read also names its columns
explicitly, so a future column is opted in rather than included by default.

The isolation suite asserts the absence directly — it greps the response bodies
of both vendor reads for `ifsc` and `account`.

**`expectedVersion` is required**, as on purchase orders and BOQ lines, and this
time against a column that exists.

**GSTIN and PAN are format-checked and optional.** Absent means not supplied.
There is no placeholder default, because `tdsChallan281.js:54` fabricates a TAN
into generated 26Q content and that is the failure this refuses to repeat. The
CHECK constraints are shape-only; the GSTIN checksum is not verified, and that is
noted rather than silently assumed.

**Deleting a vendor with orders against it is refused** — `0033`'s FK is
`ON DELETE RESTRICT` — and the message says to deactivate instead, which is what
`status` is for. The legacy has no delete at all.

---

## The foreign key `0009` could not have

`procurement.purchase_orders.vendor_id` has been `uuid NOT NULL` **with no
foreign key** since `0009`, because there was no vendors table. An order could
name a vendor that did not exist, and the isolation suite's own seed did exactly
that with `randomUUID()`.

Migration `0033` adds the composite FK. The suite now seeds a real vendor per
tenant, and a new test asserts that raising an order against **another tenant's**
vendor fails — which it did not before, because a bare uuid column cannot refuse
anything.

---

## Needs a person

**VEND-05 is a role question, not a schema one.** Who may create or edit a
vendor, and who may see its bank details, is a business decision. Today every
authenticated principal in a tenant may do both, which is the legacy's behaviour
minus the cross-tenant exposure. The bank-account table exists so that a role
gate has something to gate when PO-13's role model is settled — the same answer
that unblocks the approval chain.

Recorded rather than guessed: seeding a plausible permission model would look
like a decision somebody made.

---

## The commits

One commit for the table and its policy pair, one for the endpoints. There is no
faithful-port commit: `updateVendor` has never executed, so there is no prior
behaviour to preserve, and porting `getVendorByName` faithfully would mean
porting VEND-02.

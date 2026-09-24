# Port note — change orders, site controls, retention

`ChangeOrdersView.js` (460 lines) and `SiteControlsView.js` (504 lines) were
blocked on all of these.

Legacy sites, under `../../../_legacy/atelier-current/`:

| File | What it is |
|---|---|
| `app/lib/api/change-orders.js` | variations and GFC drawings, 12–186 |
| `app/lib/api/site-controls.js` | imprest, JMR, retention, 12–178 |

---

## The domain was already written

`services/projects/src/domain/change-order.ts` existed before this slice and had
already decided the shape — states, transitions, `decide`, `submitToClient`,
`contractValue` — and already recorded **CO-01**, **CO-02** and **CO-03**.

Migration `0037` is the table that module was written against, and
`application/change-orders.ts` is a shell that loads, calls it and stores. An
earlier draft of this slice reimplemented the same rules with a different shape
(`kind` plus a non-negative amount, statuses `pending/approved/rejected`) and
would have contradicted the domain it was supposed to persist. Catching that
cost one typecheck; not catching it would have cost a parallel state machine.

---

## Defects, with status

| Ref | Site | Defect | Status |
|---|---|---|---|
| **CO-04** *(new)* | `change-orders.js:62-94` | **Approving the same variation twice adds its cost twice.** `approveChangeOrder` never checks the current status before doing `contract_value = contract_value + cost_impact`, so a repeated call — a double-click, a retry, a replayed request — silently inflates the client contract | **LIVE** |
| **CO-05** *(new)* | `change-orders.js:35` | No sign check on `cost_impact`. A negative variation reduces what the client owes, through the same unguarded path | **LIVE** |
| **CO-06** *(new)* | `change-orders.js` all writes | No role gate. Any authenticated principal may approve a variation of any value | **LIVE** |
| **RET-01** *(new)* | — | **Nothing in the legacy ever INSERTs into `vendor_retention_ledger`.** The table is created, read and updated; there is no insert anywhere in the codebase. So retention has never been recorded, and `releaseRetentionAmount` operates on rows only a manual seed could have produced | **LIVE** |
| **RET-02** *(new)* | `site-controls.js:168-170` | Releasing retention updates `released_amount` and writes **no payment record of any kind**. The vendor is not paid; the ledger simply says they were | **LIVE** |
| **IMP-01** *(new)* | `site-controls.js:72-90` | `reconcileSiteImprest` sets the status to `Reconciled` and stores whatever receipt text it is given, comparing nothing to the sanctioned amount | **LIVE** |
| **IMP-02** *(new)* | `site-controls.js:25`, `:53` | No role gate: the same principal may request an imprest and sanction it | **LIVE** |

### CO-04 is the one with a number attached to it

Everything else on this list is a control that is missing. CO-04 is a control
that is missing **on a path that changes what a client owes**, and the change is
cumulative — nothing in the data says a variation was applied twice, because the
variation row and the contract value are separate facts that nothing reconciles.

The domain's transition table already made it unrepresentable —
`client_approved: []`, so an approved variation has no legal next state — and
this slice adds the storage half: `WHERE state = $n` on the UPDATE, so the
guarantee survives two concurrent requests.

### RET-01 and RET-02 together

Retention in the legacy is a feature that reads and releases a ledger nothing
writes. Recording what is held is therefore **new work, not a port**, and it is
worth doing because it is money withheld from a vendor that no system currently
records.

**Releasing is deliberately not built.** A release is a payment, payments are
gated on CA-01..CA-08, and the legacy release writes no payment record either —
so porting it would produce a ledger asserting that a vendor was paid when they
were not. A test asserts no release route exists.

---

## What replaces it

**Change orders** — `projects.change_orders`, signed `cost_impact` matching the
domain, and a CHECK requiring a decided variation to name its signatory. The
current contract value is `original_value` plus the `client_approved` rows,
derived on read. Pending variations are counted and not applied.

**Imprest** — `siteops.imprest_requests`, paise throughout, with the requester,
sanctioner and reconciler in three separate columns so a separation-of-duties
rule has something to read when PO-13 lands. A CHECK keeps a reconciliation
within its sanction (IMP-01), enforced in the table as well as the handler.

**Joint measurement** — `siteops.measurement_records`, append-only by grant:
`app_runtime` has `SELECT, INSERT` and no `UPDATE` or `DELETE`, and a test
asserts both are refused. A signed measurement that can be edited afterwards is
not evidence. Both signatures are required — the client's as free text, because
a client is not a principal here; the site engineer's from the credential.

**Retention** — `procurement.retention_holdings`, one row per purchase order,
with the retained amount computed from the order's gross and a basis-point rate
through `mulRate` with `roundToPaise` named at the call site. `roundToPaise`
because retention is contractual, not statutory — and `mulRatio` refuses to
multiply without naming a boundary, which is what keeps that distinction visible.

---

## Needs a person

- **CO-06, IMP-02** — who may approve a variation, and who may sanction an
  imprest they requested. Both are PO-13.
- **The retention release path** — CA-01..CA-08 first, then it lands with
  payments. Whether tenant #1 has retention outstanding is not knowable from the
  legacy data, because RET-01 means it was never recorded.

---

## The commits

One for the tables and their policy pairs, one for the endpoints. No
faithful-port commits: `approveChangeOrder` cannot be reproduced without
reproducing CO-04, and `releaseRetentionAmount` cannot be reproduced without
reproducing a ledger that lies.

# Port note — estimation and takeoff

`EstimationView.js` (481 lines) and `TakeoffView.js` (554 lines). The last two
non-CA-gated views.

Legacy sites, under `../../../_legacy/atelier-current/`:

| File | What it is |
|---|---|
| `app/lib/api/estimation.js` | four functions, 12–122 |
| `app/lib/estimationCalculations.js:5-33` | the 4-factor rate engine |
| `app/lib/api/takeoff.js` | seven functions, 68–374 |
| `components/takeoff/takeoff-constants.js` | 54 preset items with hardcoded rates |

---

## Both domains were already written

`domain/rate-analysis.ts` records RATE-01, RATE-02 and RATE-03 and fixes all
three. `domain/takeoff.ts` records TAKE-01 and has `orderQuantity`, `lineValue`,
`summarise` and `assertExportable`.

Migration `0042` is the pair of tables those modules were written against, and
the application layers store inputs and ask the domain for answers. **That is
the fourth time this run** — `change-order.ts`, `vault.ts`, `rate-analysis.ts`
and `takeoff.ts` had all settled their designs before the table existed.

The lesson is now in the checklist: read `domain/` before writing a migration,
not after. My first draft of the change-order table actively contradicted its
domain, and only a duplicate export name caught it.

---

## Defects, with status

| Ref | Site | Defect | Status |
|---|---|---|---|
| **EST-01** | `estimationCalculations.js:20-23` | `baseRate` is `Math.round`ed to whole rupees, **then GST is applied to the rounded figure and rounded again**. Rounding mid-formula, twice, on floats | **LIVE** |
| **EST-02** | `EstimationView.js:257` | The screen recomputes the breakdown on every render and displays **that**, while `boq.js:365` imports the **stored** `final_rate_with_gst`. Two engines, one shown and one used, with nothing comparing them | **LIVE** |
| **EST-03** | `EstimationView.js:199-208` | The KPI cards hardcode `15.0%` margin and `18.0%` GST as display text, unrelated to any item | **LIVE** |
| **TAKE-02** | `takeoff.js:324-340` | `INSERT INTO boq_items (… unit, qty …)` — neither column exists, and the required `id` is omitted | **latent** |
| **TAKE-03** *(new)* | `takeoff.js:307-316` | `INSERT INTO boq_schedules (… description …)` — that table has no `description` column either, and `id` is again omitted. A **second** missing-column write in the same function | **latent** |
| **TAKE-04** *(new)* | `takeoff.js:337` | A missing client rate becomes `Math.round((costRate \|\| 100) * 1.25)` — a markup on a fallback cost of **100** that nobody chose | **LIVE** |
| **TAKE-05** *(new)* | `takeoff.js:309` | An exported schedule is created with status `'Approved'` outright, and `boq.js:298` then refuses edits to approved schedules — a one-way gate nobody chose | **latent** |

### `exportTakeoffToBOQ` has never run

TAKE-02, TAKE-03 and TAKE-05 are all in one function, and the first insert
throws. That is the sixth, seventh and eighth instance of the missing-column
pattern found in this port — **all three in a single function**.

So the feature blocked on PO-16 is a feature that has never worked. Nothing is
lost by not porting it.

### EST-01 is why the three engines disagree

PO-17 records that the 4-factor engine exists three times and the three give
different answers on identical input — 481 stored, 482 shown, 481.88 computed by
the audit script whose own comment claims 481.87.

EST-01 is the mechanism: rounding to whole rupees mid-formula and then rounding
again after tax. `analyseRate` rounds each component once at paise precision, so
its answer differs from all three — deliberately, and that is why **which of the
legacy figures the customer has been quoting from is PO-17** and still open.

---

## What replaces it

**Estimation** — `projects.estimation_items` stores the four factors and the two
rates as basis points, plus the computed `base_rate`. The breakdown is
**recomputed from the stored factors on every read**, which is EST-02 turned
around: there is one engine, and the stored rate is a cache the same function
produced.

**No GST column and no `final_rate_with_gst`.** `rate-analysis.ts` fixes RATE-03
"by omission — there is no GST here to default to 18%", and a test asserts the
response body contains no `gst` anywhere.

**Takeoff** — `projects.takeoff_sheets` and `takeoff_items`. Scale is an **exact
rational** (`scale_px_num` per `scale_px_den`), not `REAL`; every measured
quantity on a sheet is divided by it, so a float there reaches every figure. A
scale is both halves or neither, because half a scale reads as calibrated.

`cost_rate` and `client_rate` are both nullable and **neither is derived**.
`summarise` returns `null` for a total when any item lacks the matching rate,
**and names the items that do** — a total over the priced subset looks complete
and is not, which is how an under-priced quotation goes out.

Items are saved as a set: the sheet is redrawn when a measurement changes, so a
partial update would leave items nothing on screen produced. The delete and the
inserts run in the middleware's transaction; `saveTakeoffItems` issues them
loose.

**There is no BOQ export**, and a test asserts no such route exists.

---

## Needs a person

- **PO-16** — whether a BOQ rate carries GST. It blocks both
  `exportTakeoffToBOQ` and `importEstimationItemsToBOQ`, and the second one does
  work, so the question is real regardless of the first.
- **PO-17** — which of the three legacy rate figures tenant #1 has been quoting
  from. A reconciliation input for M2.5.
- **PO-15** — the 54 hardcoded preset rates in `takeoff-constants.js`, and the
  commercial defaults (material 150 / labour 50 / equipment 15, overhead 6%,
  margin 15%). All are seed configuration per tenant, none has a stated basis,
  and none is ported.

---

## The commits

One for the tables, one for the endpoints. No faithful-port commits: porting the
rate engine means porting EST-01's double rounding, and porting the export means
porting three columns that do not exist.

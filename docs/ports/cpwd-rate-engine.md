# Port note — the CPWD/DSR 4-factor rate engine

**Date:** 2026-09-04 · **Target:** `services/projects/src/domain/rate-analysis.ts`
· **Protocol:** two commits (ADR-0014 decision 5)

Written before any code, per the `port-legacy-module` skill.

---

## Behaviour

The formula, as the legacy states it in its own doc comment
(`estimationCalculations.js:1-4`):

```
[(Material + Labour + Equipment) × (1 + Overhead%) × (1 + Margin%)] × (1 + GST%)
```

It is implemented **three times**, and the three produce **three different
answers for the same input**. Measured, not inferred — inputs
`material 240, labour 75, equipment 20, overhead 6%, margin 15%, GST 18%`:

| Site | `baseRate` | final | Rounding |
|---|---|---|---|
| `app/lib/estimationCalculations.js:20-23` | 408 | **481** | whole rupees, applied **before** GST |
| `components/views/EstimationView.js:132-142` | 408 | **482** | none before GST; outputs rounded at the end |
| `scripts/audit_end_user_flows.js:122-123` | 408.37 | **481.88** | two decimals, before GST |

The audit script's own inline comment asserts `481.87`, which its own code does
not produce. Even the test disagrees with itself.

### Which one is authoritative

`estimationCalculations.js`. It is the only one the write path uses:

- `app/lib/api/estimation.js:43` calls it on create,
  `:81` on update, and stores the result in `estimation_items.base_rate` and
  `.final_rate_with_gst` (`:48-60`, `:86-101`).
- `EstimationView.js` **never imports it**. Its inline copy is used only for the
  preview (`:155`) and the table display (`:257`).

So the number the customer *sees on screen* is computed by a different function
from the number that is *stored and later billed from* — and they differ by ₹1
on this input, and on 132 of 300 inputs sampled across a ₹100–₹400 sweep.

### Where the stored figure travels

`app/lib/api/boq.js:365-366` imports estimation items into a BOQ using
`final_rate_with_gst` as the unit rate, with **quantity hardcoded to 1** and
`amount = rate`. So a GST-inclusive figure becomes a BOQ line rate.

---

## Unreliable here

1. **Three implementations, no stated authority.** Nothing in the code says
   which is the source of truth; it has to be inferred from which one the write
   path calls.
2. **GST is applied inside a "rate".** `final_rate_with_gst` is stored, and the
   BOQ import uses it as a line rate — so tax is embedded in a unit rate and
   then, presumably, taxed again downstream or double-counted. Whether a BOQ
   rate should be tax-inclusive at all is a question for the user, not the code.
3. **Mid-formula rounding.** ADR-0012 already names this: rounding `baseRate`
   to whole rupees before applying GST is the defect that makes the two paths
   diverge. Carried over verbatim in commit 1.
4. **`Number(x || 0)` throughout.** A malformed cost becomes 0 rather than an
   error — the same silent-zero habit as `money()`.
5. **Two unrelated rate formulas exist alongside this one:**
   - `components/views/BoqView.js:137` derives a missing `cost_rate` as
     **78% of the selling rate**.
   - `app/lib/api/takeoff.js:337` derives a missing `clientRate` as
     **cost × 1.25**.
   Neither uses the 4-factor engine. Both are commercial assumptions with no
   stated basis.
6. **`REAL` columns.** `base_rate` and `final_rate_with_gst` are floats
   (`migrations.js:145-146`), so the stored value is already imprecise before
   any of this.

---

## Needs a person

| Ref | Question |
|---|---|
| **PO-15** | The commercial defaults: material 150 / labour 50 / equipment 15, overhead **6%**, margin **15%** (`EstimationView.js:71-76`), BOQ item margin **15%** (`migrations.js:166`), the **78%** cost-rate derivation and the **1.25** takeoff markup. None has a stated basis. They are seed configuration per tenant, not constants. |
| **PO-16** *(new)* | **Should a BOQ line rate be GST-inclusive?** The legacy stores `final_rate_with_gst` and imports it as a BOQ unit rate with qty 1. If a BOQ rate is meant to be pre-tax, every imported line is overstated by the GST rate. |
| **PO-17** *(new)* | **Which of the three answers is the one tenant #1 has been quoting from?** The screen shows one number and the database stores another. This is a reconciliation input for M2.5, and only the customer can say which figure went out in a quotation. |
| **CA-16** | The GST rate applied here (hardcoded 18%) and the works-contract SAC. Already open. |

Recorded in `../../../HUMAN-INPUTS-NEEDED.md`. A `TODO` in source is not
sufficient — the person answering will never read `rate-analysis.ts`.

---

## The two commits

**Commit 1 — port the mechanics verbatim.** The authoritative path
(`estimationCalculations.js`) exactly as written, defects included: mid-formula
rounding to whole rupees, `Number(x || 0)` silent-zero coercion, and GST folded
into the returned rate. Golden tests capture *what the legacy produces*, not
what it should produce. A row per defect goes into the
`docs/STACK-MIGRATION.md` table.

**Commit 2 — fix, behind its own test.** Rounding moves to the end; money
becomes `Paise`; the silent zero becomes a throw. The test names the defect row
it closes and asserts the *new* expected values, with the legacy values kept
alongside as a recorded divergence rather than deleted.

Doing these in one commit would destroy the only means of telling whether a
figure that differs from the legacy system differs because the port was wrong or
because the fix was right — which is the entire reason ADR-0014 decision 5
exists.

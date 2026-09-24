# Golden files — the provenance boundary

Every statutory expectation this system relies on lives here as a JSON file with
its provenance attached. **The point is to make "a CA agreed to this" and "a
model wrote this down" impossible to confuse.**

Without this, a passing test suite is evidence of nothing: `rounding.test.ts`
already asserts `-₹90.50 → -₹91`, which the source file's own
`HUMAN(CA-01)` at `src/rounding.ts:32` says is *our convention, not a statutory
finding*. Green, and unverified. That is the failure this directory prevents.

## Format

```json
{
  "rule": "sec-170-invoice-total-to-the-rupee",
  "status": "provisional",
  "statute": "Section 170, CGST Act 2017",
  "effective_from": "2017-07-01",
  "verified_by": null,
  "verified_on": null,
  "question_ref": "docs/statutory/QUESTIONS-FOR-CA.md#q1",
  "notes": "Halves away from zero. Negative-amount direction is our convention.",
  "cases": [
    { "numerator": 9049, "denominator": 1, "expect": 9000, "comment": "₹90.49 -> ₹90" }
  ]
}
```

All amounts are **integer paise**. `numerator`/`denominator` are the exact
rational the boundary receives — never a pre-divided value, because rounding
must happen exactly once from the exact product.

## The two states

| `status` | Meaning |
|---|---|
| `provisional` | Written by us from statute text or inference. **Not evidence.** `verified_by` is null. |
| `verified` | A named CA signed off, on a date, against a cited statute or circular. |

A file only becomes `verified` when a human moves it there after the CA meeting.
Nothing in the automated pipeline may promote a file — an agent may *propose* a
value, never mark it verified.

## Rules

1. **Never derive an expected value from the implementation.** That tests the
   code against itself. Values come from statute, a CA, or a recorded legacy
   oracle run — never from running our own function.
2. **Never derive a statutory value from `_legacy/`.** It is an unreliable
   spec. A legacy oracle run records *what the old system did*, which is a
   defect report, not an expectation. Keep those under `oracle/`, not here.
3. **This directory holds rounding-boundary tables only.** `packages/money`
   "commits to no rate, no threshold and no effective date" — M1 builds the
   machinery and every statutory *rate value* is deferred to M2.5. Rate goldens
   (a rate, its payee class, its threshold, its `effective_from`) belong with
   the effective-dated table in `services/finance`, one file per rule per
   financial year, because the engine is time-versioned: a voucher raised in
   FY2024-25 must compute under FY2024-25 rules forever.
   Legacy-oracle recordings are neither of these — they go under `oracle/`.
4. **No softened assertions.** No `toBeCloseTo`, no ranges, no snapshots.
5. `/verify` prints how many cases are still `provisional`. That count reaching
   zero for the money path is a milestone, not a formality.

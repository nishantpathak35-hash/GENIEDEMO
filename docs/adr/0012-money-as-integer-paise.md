# ADR-0012: Money as integer paise, in a single enforced package

- **Status:** Accepted
- **Date:** 2026-09-03

## Context

**Every monetary column in the legacy schema is `REAL`** — IEEE-754 floating
point. `amount`, `rate`, `gross_amount`, `tds_amount`, `tds_deducted`,
`tds_percentage`, `net_receivable`, `amount_approved`, `rate_with_gst`, `price`.

No decimal library exists anywhere in the codebase. `paymentCalculations.js`
guards only with `function money(value) { return Number(value) || 0; }`.

`0.1 + 0.2 !== 0.3`. On crore-scale purchase orders this produces figures that
will not reconcile against Tally, and TDS filed with the government must match
to the rupee. **This is the most serious defect in the system** — unlike the
missing tenancy, which is known and absent, this is silently wrong today.

## Decision

**Money is integer paise, stored as `BIGINT`.**

- A branded `Paise` type in `packages/contracts`.
- **`packages/money` is the only module permitted to multiply or divide money**,
  enforced by an ESLint restriction rather than convention.
- Percentages get their own exact type — TDS rates of 0.75% and 0.1% exist.
- Rupee formatting happens only at display. Money never round-trips through a
  formatted string: Indian digit grouping (`1,23,456.78`) through `parseFloat`
  is a bug factory.
- **Rounding boundaries are statutory, named, and carry the citation in a
  comment.** Section 170 CGST rounds tax per invoice per head to the rupee;
  Section 288B rounds to the nearest ₹10; challan amounts are whole rupees.
- Property tests via `fast-check` (`CGST + SGST === totalGST` across generated
  inputs) plus golden files per financial year.
- **Built before any feature code.** Under deadline pressure, unmechanized
  discipline is the first casualty.

## Consequences

- Magnitude is not a constraint: 2⁵³−1 paise ≈ **₹90.07 lakh crore**. The risk
  was never overflow.
- **Rounding placement is the real risk.** CGST 9% + SGST 9% rounded separately
  differs from IGST 18% rounded once; per-line-item rounding differs from
  invoice-level. `estimationCalculations.js` already gets this wrong — it rounds
  `baseRate` to whole rupees mid-computation, then applies GST to the rounded
  figure.
- `money()` returning `Number(value) || 0` silently converts corrupt data to
  zero. In a statutory system it must **throw**.
- All 611 legacy data-access sites eventually touch this. Deciding it late means
  touching them twice, which is why it lands in M1.

## Alternatives considered

**`NUMERIC(14,2)` in Postgres.** Correct arithmetic, and node-postgres returns
it as a string. Rejected as the primary representation because it invites a
`parseFloat` somewhere three years from now; integer paise makes float leakage
structurally awkward. If `NUMERIC` is used for any column, Drizzle's numeric
mode must be `string` and `packages/money` must be the only parser.

**`decimal.js` throughout.** Retained for division and percentage steps where
controlled rounding is needed, but not as the storage or transport type.

**Switching language to get `BigDecimal` by default.** Considered seriously and
rejected in ADR-0011. `BigDecimal` does not save a developer who declares a
`double`; the discipline has to be mechanized either way.

# Questions for the chartered accountant — M2.5

Take this document to the CA meeting. It is written to be read by someone who
does not read code.

**Why this exists.** The system computes GST and TDS figures that are filed with
tax authorities. Some of those calculations are settled by statute and some are
conventions we chose because the statute is silent. **The chosen ones are marked
PROVISIONAL and are currently asserted in passing tests** — a green test suite
today does not mean a CA has agreed. This document is the list of things only a
CA can settle.

Each answer becomes a golden file under `packages/money/golden/` with
`status: verified`, the CA's name and the date. Until then the value stays
`provisional` and `/verify` reports it as such.

Sources: `packages/money/src/rounding.ts` (CA-01…CA-04),
`services/finance/src/domain/tds.ts` (CA-05…CA-08), and
`services/finance/src/domain/statutory-catalogue.ts` (every provisional value
below). Nothing here is a coding question.

---

## Provisional values in use — what the system computes with today

**Decided by the owner on 2026-09-15** (ADR-0014, addendum): the money path is
built now, on provisional values, and a CA's name, membership number, firm and
date promote them before go-live. Until then every row below is `provisional`,
`verified_by` and `verified_on` are empty, and **the system refuses to produce a
TDS deduction, a challan, 26Q content, a Tally voucher or a tax invoice from any
of them unless it was told, explicitly, to produce drafts** —
`STATUTORY_OUTPUTS=draft`; unset, or any other value, refuses. A draft marks
rates *Provisional* and documents *Draft: provisional rates*, and a Tally voucher
computed from a provisional row is never handed to a connector, draft or not.

Three sources, and the table says which:

- **CA call** — relayed by the owner from a CA call; CA details to follow.
- **CA answers document** — CA answers document, reviewed by the CA; CA details to follow. The
  written answers to CA-01 to CA-09, reviewed and signed by the CA; the document
  is held outside the repository. Each answer is recorded under its question
  below, in the document's own words where it states a rule.
- **Statute text** — our reading of the provision cited, used because the CA
  has not answered. Each one has a question below.

An earlier version of this file said the answers to CA-01, 02, 03, 04, 06, 07
and 08 were not in the repository and kept the conventions those questions
describe. That was written without the answers document. Where an answer differs
from what the system does, the question below says so, and the code follows the
answer; an answer is still provisional until the CA's name, membership number,
firm and date arrive.

Every rate and threshold is effective from **1 April 2026** (the CA call). A
provision's own commencement, where it is earlier, is in the citation.

| # | Value in use | Used by | Source | Question |
|---|---|---|---|---|
| 1 | Sections in scope: 194C, 194I, 194J, 194Q | vendor TDS profile, payments, challan, 26Q | CA call | CA-05 |
| 2 | The rate table is effective from 1 April 2026 | every rate and threshold row | CA call | CA-05 |
| 3 | No PAN, or an invalid PAN: 20% under s.206AA — relayed for 194C's two payee classes, and the same for 194I and 194J, whose rates are below it; 5% under 194Q, by the proviso to s.206AA(1) | payments | CA call (194C); statute text (194I, 194J, and 194Q's 5%) | CA-07, CA-10 |
| 4 | GST on works contracts: 18%; the work is a works contract service | tax invoices | CA call; works contract from the CA answers document | CA-06 |
| 5 | Document numbering is set per tenant, in Settings | payment vouchers, tax invoices | CA call | CA-09 |
| 6 | Document numbering has no gaps | payment vouchers, tax invoices | CA call; CA answers document | CA-09 |
| 7 | 194C: 1% when the payee is an individual or HUF, 2% otherwise | payments | CA answers document; statute text, s.194C(1) | CA-05, CA-12 |
| 8 | 194C: no deduction up to ₹30,000 in one payment and ₹1,00,000 in the year; once the year's total passes ₹1,00,000, earlier undeducted payments that year join the base | payments | CA answers document (the two thresholds); statute text, s.194C(5) and proviso (the catch-up) | CA-05, CA-12 |
| 9 | 194I: 2% for plant, machinery or equipment; 10% for land, building, furniture or fittings | payments | statute text, s.194-I | CA-13 |
| 10 | 194I: no deduction up to ₹50,000 for a month or part of a month | payments | statute text, s.194-I proviso as amended by the Finance Act 2025 | CA-13 |
| 11 | 194J: 2% for fees for technical services (not professional services); 10% otherwise | payments | statute text, s.194J(1) | CA-14 |
| 12 | 194J: no deduction up to ₹50,000 in the year | payments | statute text, s.194J(1) proviso as amended by the Finance Act 2025 | CA-14 |
| 13 | 194Q: 0.1% of purchases from one seller above ₹50,00,000 in the year, only when the buyer's turnover in the previous year exceeded ₹10 crore | payments | statute text, s.194Q(1) and Explanation | CA-15 |
| 14 | An invalid PAN is: no PAN on the vendor record, or a PAN recorded as inoperative. A PAN that fails the format cannot be stored at all | payments | statute text, s.206AA and Rule 114AAA | CA-11 |
| 15 | The 18% cites Notification No. 11/2017–Central Tax (Rate), S. No. 3, item (ii), as amended; for IGST, No. 8/2017–Integrated Tax (Rate) | tax invoices | statute text | CA-16 |
| 16 | Place of supply for work at a client's site is where the property is: CGST and SGST when that is the supplier's registration state, IGST otherwise | tax invoices | CA answers document; statute text, IGST Act s.12(3)(a) | CA-06, CA-16 |
| 17 | A document number is at most 16 characters of letters, digits, hyphen and slash, and unique in its financial year | numbering settings | CA answers document (unique in the year, format configurable within the statutory limits); statute text, CGST Rule 46(b) (the limits) | CA-09, CA-17 |
| 18 | A cancelled document keeps its number; nothing is deleted and no number is reused | tax invoices | CA answers document; statute text, CGST Rule 46(b) and the GSTR-1 documents-issued table | CA-09, CA-18 |
| 19 | TDS is computed on the value excluding GST shown separately, works contracts included | payments | CA answers document; CBDT Circular 23/2017 | CA-08 |
| 20 | A TDS deduction keeps its computed amount to the paise; s.288B does not round it | payments | CA answers document | CA-03 |
| 21 | A challan line drops its paise, then rounds to the nearest ₹10, five and above up (s.288B); each nature-of-payment line on its own | challan | CA answers document; per line, our reading | CA-04, CA-21 |
| 22 | Tax deducted in a month is due by the 7th of the next month; March's by 30 April | challan | statute text, Rule 30(2) | CA-19 |
| 23 | 26Q is due 31 July, 31 October, 31 January and 31 May | 26Q | statute text, Rule 31A | CA-19 |
| 24 | Challan codes: minor head 200; nature of payment 94C, 4IA, 4IB, 4JA, 4JB, 94Q | challan | statute text, the challan's own code list | CA-19 |
| 25 | Under 194C the payee class comes from the vendor's recorded constitution — an individual or HUF at 1%, a firm, company or other at 2%; the PAN's fourth character only cross-checks it, and a mismatch is shown on the vendor | payments, vendors | CA answers document | CA-07 |
| 26 | 194C(6): no deduction for a transporter whose declaration for the payment's financial year is on record — the vendor's name and PAN, the year, confirmation of the goods-carriage condition, its date and an evidence file — dated on or before the payment, under the PAN the vendor still has | payments, vendors | CA answers document; statute text, s.194C(6) | CA-07 |
| 27 | TDS is deducted on the whole bill: retention withheld does not reduce the base, and releasing it deducts nothing more | payments, retention release | our convention | CA-20 |
| 28 | Negative amounts round away from zero | tax invoices, challans | CA answers document | CA-01 |
| 29 | A tax invoice's CGST, SGST and IGST keep their calculated values to the paise; only its total is rounded to the rupee (Sec 170), and the difference is its own round-off line on the invoice and in its Tally voucher | tax invoices | CA answers document | CA-02 |
| 30 | Payment voucher and tax invoice numbers restart each financial year; a format a tenant has saved is its own | numbering settings, payment vouchers, tax invoices | CA answers document | CA-09 |
| 31 | GST is charged on a tax invoice's full value when it is issued; retention the client holds back does not defer it. An advance received before any invoice is not modelled | tax invoices | CA answers document | CA-06 |

---

## CA-01 — Rounding of negative amounts (credit notes, reversals)

**Status:** PROVISIONAL — answered in the CA answers document; CA details to follow.
**Source:** `packages/money/src/rounding.ts:32`

Every statute we cite is phrased for positive amounts only. Section 170 says
"if such part is fifty paise or more, it shall be increased to one rupee" — it
does not say what happens to −₹90.50.

**What we do now:** round halves *away from zero*, so −₹90.50 → −₹91. We chose
this so a credit note rounds in the same direction as the invoice it reverses.
The alternative (JavaScript's native behaviour, halves toward +∞) would make
−₹90.50 → −₹90, and a credit note would differ from its invoice by one rupee.

**Question:** is symmetric rounding acceptable for credit notes and reversals,
or does the department expect something else?

**If we are wrong:** every credit note and reversal is off by up to ₹1, and the
error does not cancel against the original invoice.

**Answer — CA answers document, reviewed by the CA; CA details to follow:** "The proposed symmetric rounding
methodology is acceptable for the system. Negative values may be rounded away
from zero so that the reversal mirrors the original invoice treatment. Example:
-₹90.50 becomes -₹91."

**Matches.** Halves already round away from zero, both signs. Nothing changes.

---

## CA-02 — Where rounding happens in the invoice pipeline

**Status:** PROVISIONAL — answered in the CA answers document; CA details to follow.
**Source:** `packages/money/src/rounding.ts:79`

An invoice has many lines. Tax can be rounded in two places:

- **Option A:** compute each line's tax to paise, sum the lines, then round the
  invoice total to the rupee under Sec 170. *(Rounds twice.)*
- **Option B:** compute the exact sum across all lines, then round once under
  Sec 170.

These give different answers. This is not a preference — the **invoice, the
GSTR-1 return and the e-invoice (IRP) must all reflect the same choice**, and
the e-invoice schema carries 2-decimal line tax with the rupee rounding held
separately in `RndOffAmt`.

We already know that rounding per *line* to the rupee is wrong: 40 lines of
₹5.00 at 9% give ₹0 per line against ₹18 for the invoice. That option is out.

**Question:** A or B? And does the answer differ for the e-invoice payload
versus the printed invoice?

**If we are wrong:** invoice totals will not reconcile against GSTR-1 or against
the IRP, per invoice, forever.

**Answer — CA answers document, reviewed by the CA; CA details to follow:** "Rounding shall be applied only to
the final total invoice value. The taxable/basic value and the GST components
shall retain their calculated values and shall not be individually rounded to
the nearest rupee. Any round-off adjustment will therefore be posted only at the
invoice-total level. For the e-invoice/IRP payload, line-level taxable value and
tax shall continue to be reported to the precision supported by the schema,
while the final round-off amount will reconcile the document total with the
printed invoice."

**Changed** (old → new): each head rounded to the rupee once per invoice under
Sec 170 → each head kept to the paise (`roundGstHeadToPaise`), and only the
invoice total rounded to the rupee (`roundInvoiceTotalSec170`), with the
difference on its own round-off line — recorded on the invoice (`round_off`,
migration 0098) and posted in the invoice's Tally voucher, which is new. The
e-invoice payload is not built.

---

## CA-03 — Where Section 288B applies to TDS

**Status:** PROVISIONAL — answered in the CA answers document; CA details to follow.
**Source:** `packages/money/src/rounding.ts:109`

Sec 288B rounds to the nearest ₹10 ("if such part is five rupees or more, be
increased to ten rupees").

**Question:** does Sec 288B apply at the moment TDS is **deducted** from a
vendor payment, or only to the amount **payable on a return**? If it applies
only at return level, then the per-payment deduction should carry exact rupees
and only the challan/return total gets the ₹10 rounding.

**If we are wrong:** every vendor's Form 16A and the 26Q return disagree with
what was actually deducted, by up to ₹5 per payment.

**Answer — CA answers document, reviewed by the CA; CA details to follow:** "Section 288B rounding to the nearest
₹10 should be applied to the amount payable under the Income-tax Act at the
challan / final tax-payable level, not independently to every vendor-payment TDS
deduction. Individual voucher deductions should retain the actual computed TDS
amount required for vendor and return reconciliation. Accordingly, the software
should not force each vendor-level TDS deduction to a multiple of ₹10. The
challan / aggregate payable amount should be rounded to the nearest multiple of
₹10 in accordance with Section 288B."

**Changed** (old → new): each deduction rounded to the nearest ₹10 → each
deduction keeps its computed amount to the paise (`roundTdsDeductionToPaise`).
s.288B moves to the challan, CA-04.

---

## CA-04 — Challan whole-rupee constraint

**Status:** PROVISIONAL — answered in the CA answers document; CA details to follow.
**Source:** `packages/money/src/rounding.ts` (challan section)

ITNS-281 has no paise column, so a challan amount carrying paise cannot be
deposited as written. We treat whole rupees as a **form** constraint rather than
a section of an Act.

**Question:** confirm this is a form constraint only, and confirm the direction
(round up, round down, or nearest) the department expects when a computed
liability carries paise.

**Answer — CA answers document, reviewed by the CA; CA details to follow:** "Yes. Since the challan does not
accept paise, paise should not be carried into the deposited amount. For the
final amount payable, the system should follow Section 288B: ignore paise first
and then round the rupee amount to the nearest multiple of ₹10; where the last
rupee digit is 5 or more, round up to the next ₹10, otherwise round down to the
previous ₹10."

**Changed** (old → new): a challan line rounded to the nearest rupee → its paise
dropped, then its rupees rounded to the nearest ₹10, five and above up
(`roundChallanSec288B`). Each nature-of-payment line is rounded on its own until
CA-21 is answered.

---

## CA-05 — TDS rates, thresholds and effective dates

**Status:** PROVISIONAL — answered in the CA answers document; CA details to follow.

**Provisional answer in use (2026-09-15, CA call):** the sections are 194C,
194I, 194J and 194Q, and the rate table is effective from 1 April 2026. The
rates and thresholds themselves are statute text, CA-12 to CA-15. **Still open
here:** does any financial year before 2026-27 need rows, for vouchers that will
be migrated?

The legacy application contains TDS logic for **194C, 194J and 194Q**, and it is
**not trustworthy** — `tdsChallan281.js:54` fabricates a default TAN into
generated 26Q content, and TDS rates appear in more than one place in the legacy
code. We will not copy any rate out of it.

**What we need, per section (194C, 194J, 194Q, and any other section that
applies to a construction/interior-fit-out contractor):**

| Field | Why |
|---|---|
| Rate for a company payee | |
| Rate for a non-company / individual / HUF payee | |
| Rate when PAN is not furnished | Higher-rate rule |
| Single-payment threshold | Below it, no deduction |
| Aggregate annual threshold | |
| **Effective-from date** for each of the above | Rates change every Budget. A voucher raised in FY2024-25 must compute under FY2024-25 rules **forever** — the engine is time-versioned, so every rate needs a date, not just a value. |

**Which financial years we need:** every FY for which the client has open or
historical vouchers that will be migrated, not only the current one.

**Answer — CA answers document, reviewed by the CA; CA details to follow:**

| Item | Treatment in the answer | Its note |
|---|---|---|
| Primary section for contractor payments | Section 194C | "Apply based on vendor/payee classification." |
| Individual / HUF contractor | 1% | Resident contractor. |
| Company / firm / other non-individual contractor | 2% | Resident contractor. |
| PAN not furnished / invalid | "Management input: 10%" | "CA validation required: Section 206AA generally prescribes 20% (or the higher applicable rate) for 194C; do not hard-code 10% until CA confirms." |
| Single-payment threshold | ₹30,000 | "No deduction where the single payment does not exceed the threshold, subject to aggregate threshold." |
| Aggregate annual threshold | ₹1,00,000 | "Apply on aggregate payments/credits during the financial year." |

"Effective dates should be stored as date-versioned rules in the system rather
than as a single current value. The CA should confirm the historical
effective-from date for each rate/threshold that is required for old vouchers."

The document closes with items it lists as still requiring CA confirmation, three
of them this question's: the higher TDS rate for a missing or invalid PAN under
s.206AA ("Management input was 10%, whereas the statutory rule generally points
to 20% for Section 194C"); historical effective dates for each rate and threshold;
and whether any additional sections, for example 194J or 194Q, need to be
configured for the company's actual vendor and purchase profile.

**Matches.** 194C at 1% and 2%, ₹30,000 and ₹1,00,000, every rate and threshold
stored with its effective date. The no-PAN rate stays 20%: the document records
10% as a management input and says not to code it, and 20% is what the CA call
gave and what s.206AA says for 194C (CA-10). 194I, 194J and 194Q stay loaded, as
the CA call named them; a vendor with none of them set has nothing deducted.
Nothing changes. **Still open:** rows for any financial year before 2026-27.

---

## CA-06 — GST treatment specific to this business

**Status:** PROVISIONAL — answered in the CA answers document; CA details to follow.

**Provisional answer in use (2026-09-15, CA call):** GST on works contracts is
18%. Place of supply and the notification are statute text, CA-16. Retention
timing: tax is charged on the full invoice when it is issued, and a retention
release is not a new supply. That is our reading and is part of this question.

- CGST/SGST versus IGST determination — confirm the place-of-supply rule as it
  applies to interior fit-out work executed at a client site in another state.
- Whether the work is treated as a works contract, and the rate that follows.
- Retention money and its GST timing — when retention is withheld and later
  released, when is tax due?
- Advance payments and their GST timing.

**Answer — CA answers document, reviewed by the CA; CA details to follow:**

- "Place of supply: where the relevant client site / immovable property is in a
  different State from the supplier's GST registration, IGST shall be charged."
- "Nature of supply: commercial interior fit-out execution shall be treated as a
  works contract service."
- "Retention money: GST on the invoice is discharged upfront. Only the
  contractual retention amount is withheld commercially and released later; GST
  is not deferred merely because retention is held."
- "Advances: where an invoice is raised against the advance, GST is discharged
  through that invoice. Where no invoice has yet been raised, GST shall
  nevertheless be paid on the advance received, to the extent applicable to the
  works-contract/service supply."

**Matches** on place of supply (the site's state against the supplier's, CA-16),
on the works contract, and on retention: tax is charged on the full invoice when
it is issued. **Not modelled:** an advance received before any invoice — nothing
in the system records one, so GST on it is computed nowhere. Nothing changes: a
test now holds the retention case, and the advance is recorded as a gap in
`docs/BACKLOG.md` §10, not built.

---

## CA-07 — Which rate applies to *this* payee

**Status:** PROVISIONAL — answered in the CA answers document; CA details to follow.

**Provisional answer in use (2026-09-15):** from the CA call, no PAN or an
invalid PAN is 20% under s.206AA, in both cases. From statute text: the 194C
payee class comes from the PAN's fourth character (P or H is an individual or
HUF, anything else is not). A transporter with a 194C(6) declaration dated in
the current financial year and a PAN on file has nothing deducted. The vendor
record carries the section, and for 194I and 194J the class (plant or
building; technical or professional).
**Source:** `services/finance/src/domain/tds.ts:15`

A section alone does not determine a rate. The same section charges different
rates depending on facts about the payee, and the system currently takes the
rate as an input with no rule for choosing it — deliberately, because the rule
is yours to give.

Three things decide it, and we have none of them written down:

1. **Deductee classification.** Company vs non-company (individual / HUF /
   firm). Under 194C these differ, and the classification is a property of the
   vendor record — so we need to know what evidence establishes it and what
   happens when a vendor's status changes mid-year.

2. **No PAN — Section 206AA.** When a vendor has not furnished a valid PAN, a
   higher rate applies. We need the rate (or the rule for computing it), and
   confirmation of what counts as "not furnished" — absent, structurally
   invalid, or failing a PAN-status check against the department.

3. **Section 194C(6) — the transporter declaration.** A goods-transport
   operator who furnishes a declaration with their PAN is not subject to
   deduction at all. We need to know whether this client's vendor base includes
   any such payee, what the declaration must contain, and how long it stays
   valid.

**What we do now:** nothing. `deductionInput` takes `rate` as an explicit
parameter with no default and no lookup, so the system cannot deduct at all
until a rate is supplied. That is the correct state — it fails closed — but it
means no vendor payment can be processed until this is answered.

**Question:** for each section that applies to an interior fit-out contractor,
what determines the rate for a given payee, and what is the rate in each case?
Please include the no-PAN rate and say whether 194C(6) is relevant here.

**If we are wrong:** every deduction for the misclassified payees is at the
wrong rate. A short deduction carries interest under 201(1A) and disallowance of
the expense; an over-deduction is the vendor's money withheld without authority.

**Answer — CA answers document, reviewed by the CA; CA details to follow:** "The vendor master shall contain the
information required to determine TDS treatment, including
constitution/classification (individual, HUF, firm, company, etc.), PAN and
transporter status. Vendor classification will drive whether the Section 194C
rate is 1% or 2%. PAN shall be stored and validated. A missing/invalid PAN will
trigger the higher-rate rule after CA confirmation of the applicable Section
206AA rate. Transporter: where the vendor is engaged in plying, hiring or leasing
goods carriages and satisfies Section 194C(6), no TDS shall be deducted if the
prescribed declaration and PAN are furnished. The declaration should be obtained
for the relevant financial year and retained against the vendor record. The
transporter declaration should capture, at minimum, the vendor's name, PAN,
financial year, confirmation that the statutory goods-carriage ownership
condition is satisfied, date and authorised signature/declaration evidence."

**Changed** (old → new): the 194C class read from the PAN's fourth character →
the class from the vendor's recorded constitution — individual, HUF, firm,
company or other — with the PAN's fourth character only cross-checking it and a
mismatch shown on the vendor; a 194C payment to a vendor with a PAN and no
constitution recorded is refused. A declaration as one date on the vendor → a
record per financial year of the vendor's name and PAN, the year, confirmation of
the goods-carriage condition, its date and an evidence file registered in the
vault against the vendor (migration 0100). The higher rate stays s.206AA's, CA-10.

---

## CA-08 — Is TDS computed on the invoice value including GST?

**Status:** PROVISIONAL — answered in the CA answers document; CA details to follow.
**Source:** `services/finance/src/domain/tds.ts:34`

An invoice from a vendor has a taxable value and a GST component shown
separately. TDS can be computed on either the taxable value alone, or on the
gross including GST.

**What we do now:** we exclude GST — TDS is computed on the taxable value only.
Our reading is CBDT Circular 23/2017, which directs deduction on the amount
excluding the GST component **where that component is shown separately on the
invoice**. In this system it always is, because the purchase-order service
computes and stores it as a distinct figure rather than folding it into a total.

**Why it is not settled.** The circular's condition is about GST being shown
separately. What this business mostly issues are **works contracts and composite
supplies**, where the split between goods, services and labour is itself a
question (see CA-06), and we do not know whether the same treatment is intended
there. The legacy application also computes TDS on a GST-exclusive subtotal —
but matching the legacy is not evidence, and it is recorded only so a future
divergence is traceable to a decision rather than to a bug.

**Question:** for works contracts and composite orders issued by this business,
is TDS computed on the GST-exclusive taxable value? If the answer differs by
section or by contract type, we need the distinction, because the choice is a
per-deduction parameter (`includeGst`) that is set explicitly at every call site
and has no default.

**If we are wrong** and the base should include GST: **every deduction is
understated by the tax on the tax.** At 18% GST that is roughly 18% less tax
deducted than was due on every vendor payment, across every year. That is a
short-deduction exposure with 201(1A) interest, not a rounding difference — and
unlike a rate error it would not be visible as an odd-looking number on any
single voucher.

**Answer — CA answers document, reviewed by the CA; CA details to follow:** "TDS shall be computed on the
basic/taxable value only, excluding the GST component where GST is separately
indicated in the invoice / contract. This treatment shall also be followed for
works-contract invoices where GST is separately identifiable."

**Matches.** TDS is computed on the taxable value, and a bill is acknowledged
with its GST shown separately. Nothing changes.

---

## CA-09 — Document numbering: per financial year, reset, and what the number must contain

**Provisional answer in use (2026-09-15, CA call):** numbering is set per tenant
in Settings, and it must have no gaps. Payment vouchers and tax invoices now
take their number from a counter moved in the same transaction as the document,
so a document that fails to save gives its number back. Format limits and
cancellation are statute text, CA-17 and CA-18.

**Status:** PROVISIONAL — answered in the CA answers document; CA details to follow.
**Source:** `services/procurement/src/infrastructure/migrations/0066_number_series_per_module.sql`,
`services/procurement/src/application/number-series.ts:19`

A document number looks like a preference and is not. For a GST tax invoice the
series is governed, and the constraint is on the series as a whole rather than
on any one number — so it cannot be corrected document by document afterwards.

**What we do now.** One numbered document type exists: the purchase order.
`NUMBERED_MODULES` is a one-element list, and the `CHECK` on `module_type`
carries the same single value, deliberately — a settings row for a document
nothing allocates is a control that appears to take effect and does not.

The format is per tenant, and every option ships **off**:

| Column | Ships as | What it does |
|---|---|---|
| `include_fy` | `false` | whether the year appears: `PO/2026-27/0001` vs `PO-0042` |
| `reset_each_fy` | `false` | whether the counter restarts in April |
| `fy_format` | `'YYYY-YY'` | how the year is written |
| `starting_number` | `0` | where a restarted series begins |

`false` for the two booleans is what the legacy does — its `getNextNumber` has
no notion of a year, so its counter runs straight through April. **That is a
description of the legacy, not a decision**, and the legacy is an unreliable
specification. The allocation happens inside the transaction that inserts the
order, so numbers cannot be issued twice; **gaps are accepted**, because a
rolled-back insert burns a number.

**Why it is not settled.** Two separate reasons, and they need separate answers.

1. *For the purchase order*, we believe nothing statutory governs the series —
   a purchase order is not a tax invoice — so the question is the client's
   business preference, not yours. We would still like it confirmed that no
   requirement attaches to it that we have not thought of.
2. *For every document type this system does not yet number*, the question is
   yours and it has to be answered **before** the first one is issued. We expect
   to number at least: tax invoices, credit and debit notes, delivery challans,
   receipt and payment vouchers, and reverse-charge self-invoices. We have not
   built numbering for any of them, precisely so that the rule shapes the schema
   rather than a migration having to renumber issued documents later.

**Question**, per document type in that list:

- **Must the series be unique per financial year?** Our reading of Rule 46(b) of
  the CGST Rules is that a tax invoice number must be unique within a financial
  year — but we are not the right people to read that, and the same rule's
  application to the other document types above is exactly what we do not know.
- **Must the counter reset each financial year, or merely be distinguishable
  by year?** These are different: a number containing `2026-27` is already
  unique for the year without restarting at 1. If restarting is not required, we
  would rather not, because a series that runs on is easier to audit for gaps.
- **What must the number contain, and what may it not?** Length limit,
  permitted characters, whether the financial year must appear literally, and
  whether one tenant may run multiple concurrent series for the same document
  type (Rule 46(b) appears to allow "one or multiple series"; we do not know
  what makes a series legitimately separate).
- **Is a gap a defect?** We accept gaps from rolled-back transactions. If the
  requirement is a strictly consecutive series with no gaps, that is a different
  allocation design and we need to know now rather than after go-live.

**If we are wrong**, the failure is retrospective and cannot be patched. A
number is printed on a document that has been sent to a vendor, a client and
the GST portal. Discovering in year two that the series should have been unique
per financial year does not mean fixing a setting — it means every document
already issued carries a number that does not comply, and the reissue is a
conversation with the tax authority rather than a migration. This is why the
switches ship off and empty rather than defaulted to what looked most common.

**Answer — CA answers document, reviewed by the CA; CA details to follow:**

| Question | The answer |
|---|---|
| Must the series be unique per financial year? | "Yes. Each statutory document series shall be unique within the relevant financial year." |
| Must the counter reset each financial year? | "Yes. The counter shall restart for each financial year." |
| What may the number contain? | "The format shall be user-defined/configurable, subject to statutory format restrictions applicable to the relevant document type." |
| Are multiple concurrent series permitted? | "Yes. Multiple series may be configured where operationally required, provided each series remains identifiable and compliant." |
| Are gaps permitted? | "No. The intended system design is a consecutive series without gaps. Cancelled/void documents should remain auditable rather than their number being reused." |
| Purchase-order numbering | "Business preference. Purchase-order numbering will be configurable and will not be treated as a GST tax-invoice numbering requirement." |

Among the items the document lists as still requiring CA confirmation: "the final
statutory numbering restrictions (length/characters/series) for each GST
document type before implementation."

**Matches** on uniqueness in the year and the format limits (CA-17), no gaps, a
cancelled document kept with its number (CA-18), and purchase orders as a
business preference. **Changed** on the reset (old → new): a payment voucher or
tax invoice series ran on across years unless a tenant saved otherwise → both
restart each financial year (`STATUTORY_DEFAULTS`, and migration 0099 for every
series nobody has saved); a format a tenant has saved is left as it is. Multiple concurrent
series are permitted by the answer; the system has one series per document type,
and a second is not built. **Still open:** the final restrictions per GST
document type (CA-17).

---

## CA-10 — The s.206AA rate for 194Q

**Status:** PROVISIONAL — 20%, as relayed from the CA call for 194C; 5% under 194Q, statute text.
**Source:** `services/finance/src/domain/statutory-catalogue.ts`

**What we do now:** a payee with no PAN, or an invalid one, has 20% deducted
under 194C, 194I and 194J, and 5% under 194Q. The 20% is the answer relayed from
the call ("20% in both cases"), which was for 194C's two payee classes; the 5% is
our reading of the proviso below.

**Changed** (old → new), 2026-09-15: 194Q without a valid PAN at 20% → 5%, a row
of its own (`tds_206aa_194q`), statute text.

**Why it is not settled.** Our reading of s.206AA(1) is that the rate is the
highest of the section's own rate, the rate in force, and 20%, and that its
proviso substitutes 5% for 20% where the deduction is under 194Q. If that
reading is right, 194Q without a PAN is 5%, not 20%.

**Question:** for a 194Q purchase from a seller without a valid PAN, is the rate
20% or 5%? And for the other three sections, is it the higher of the section
rate and 20% (so never below the section rate)?

**If we are wrong:** 194Q deductions without a PAN are four times what the
statute requires, which is the seller's money withheld without authority.

---

## CA-11 — What counts as an invalid PAN

**Status:** PROVISIONAL — statute text.

**What we do now:** a PAN is treated as not furnished when the vendor record has
none, or has one marked *inoperative* by a person in the vendor screen. A PAN
that fails the format (five letters, four digits, a letter) cannot be stored,
so it can never reach a deduction. The system does not check a PAN against the
department.

**Question:** is "inoperative" (Rule 114AAA — not linked with Aadhaar) the only
status that makes a well-formed PAN invalid for s.206AA? How often must a
deductor check it, and what evidence of the check should be kept?

**If we are wrong:** a payee whose PAN is inoperative is deducted at the section
rate instead of 20%, a short deduction with 201(1A) interest.

---

## CA-12 — 194C rates and thresholds

**Status:** PROVISIONAL — statute text. The call confirmed 194C is in scope, not
its figures.

**What we do now:** 1% when the payee is an individual or HUF, 2% otherwise. No
deduction when one payment is ₹30,000 or less and the year's total to that
vendor is ₹1,00,000 or less. When a payment takes the year's total past
₹1,00,000, the payments earlier in the year that had nothing deducted join this
payment's base, so tax is deducted on the whole year's amount. The year's total
is kept per vendor record.

**Question:** are the rates and both thresholds right from 1 April 2026? When the
annual total is crossed, is tax due on the earlier payments in this way? Is the
total kept per PAN rather than per vendor record (a vendor with two records
under one PAN)?

**If we are wrong:** contractor payments are short-deducted, or deducted when
nothing was due.

---

## CA-13 — 194I rates, threshold and effective date

**Status:** PROVISIONAL — statute text.

**What we do now:** 2% of rent for plant, machinery or equipment; 10% for land,
building, furniture or fittings. No deduction when the rent for a month is
₹50,000 or less — each bill is treated as one month's rent. Effective from
1 April 2026 in our table; our reading is that the monthly threshold replaced
the ₹2,40,000 annual one from 1 April 2025 (Finance Act 2025).

**Question:** are the rates, the threshold and its basis (per month or part of a
month) right? How should a bill covering several months be tested against it?

**If we are wrong:** rent paid for equipment hire and site offices is deducted
at the wrong rate or against the wrong threshold.

---

## CA-14 — 194J rates, threshold and effective date

**Status:** PROVISIONAL — statute text.

**What we do now:** 2% for fees for technical services that are not professional
services; 10% for professional services. No deduction while the year's total to
that payee is ₹50,000 or less (our reading of the proviso as amended by the
Finance Act 2025, previously ₹30,000); once passed, the earlier undeducted
payments join the base, as for 194C. The vendor record says which class applies.

**Question:** are the rates and the threshold right from 1 April 2026? Is the
threshold annual and aggregate for both classes? Which class applies to an
architect, a structural consultant and a lighting designer — the payees this
business most often has under 194J?

**If we are wrong:** consultants' fees are deducted at 2% where 10% was due, or
the reverse.

---

## CA-15 — 194Q rate, threshold, and when the buyer is covered

**Status:** PROVISIONAL — statute text.

**What we do now:** 0.1% of the part of the year's purchases from one seller
that is above ₹50,00,000, computed on the value excluding GST. It applies only
when the tenant has answered, in Settings › Tax, that its turnover in the
previous financial year exceeded ₹10 crore; otherwise nothing is deducted under
194Q.

**Question:** are the rate, the ₹50,00,000 threshold and the ₹10 crore buyer
condition right from 1 April 2026? Is GST excluded on credit and included on an
advance, as we read the circular? Does anything change now that TCS under
s.206C(1H) no longer applies?

**If we are wrong:** material purchases are deducted when they should not be,
or not when they should.

---

## CA-16 — The notification for 18%, and place of supply at a client's site

**Status:** PROVISIONAL — statute text. The call confirmed the rate, not its
citation.

**What we do now:** a tax invoice for works cites Notification No. 11/2017–
Central Tax (Rate), S. No. 3, item (ii), as amended (Notification No. 8/2017–
Integrated Tax (Rate) for IGST). The place of supply is the state the client's
site is in (IGST Act s.12(3)(a)): the same state as the tenant's GSTIN gives
CGST and SGST at 9% each, another state gives IGST at 18%.

**Question:** is that the entry, as amended, that governs these works contracts
from 1 April 2026? Is the site's state the place of supply for every invoice this
business raises, including design fees billed before work starts?

**If we are wrong:** invoices cite the wrong entry, or charge CGST and SGST where
IGST was due. The tax paid to the wrong head is not simply moved across.

---

## CA-17 — Limits on a document number's format

**Status:** PROVISIONAL — statute text.

**What we do now:** a payment voucher or tax invoice number is at most 16
characters, uses only letters, digits, hyphen and slash, and is unique in its
financial year (CGST Rule 46(b)). Settings refuses a format that could produce
anything else.

**Question:** do these limits apply to payment vouchers as well as tax invoices?
May a tenant run separate series for separate sites or registrations, and what
makes a second series legitimate?

**If we are wrong:** issued numbers do not comply and cannot be renumbered.

---

## CA-18 — How a cancelled document is treated

**Status:** PROVISIONAL — statute text.

**What we do now:** a tax invoice can be cancelled with a reason. It keeps its
number and stays in the list marked cancelled; the number is never issued again
and no row is ever deleted. A cancelled invoice counts in the documents issued
for the period.

**Question:** until when may an invoice be cancelled rather than reversed with a
credit note — before it is reported in GSTR-1, or before a particular date? Is
keeping and reporting the cancelled number enough to keep the series free of
gaps?

**If we are wrong:** cancelled invoices leave gaps the department reads as
missing supplies, or cancellation is used where a credit note was required.

---

## CA-19 — Challan and 26Q particulars

**Status:** PROVISIONAL — statute text.

**What we do now:** a challan groups one month's deductions by section, with
minor head 200 and nature-of-payment code 94C, 4IA, 4IB, 4JA, 4JB or 94Q. It is
due by the 7th of the next month, or 30 April for March (Rule 30(2)). The 26Q
content lists each deduction for a quarter, due 31 July, 31 October, 31 January
or 31 May (Rule 31A). A row where the higher rate applied for want of a PAN is
marked `C`; a transporter's declared payment `T`; a payment below the threshold
`Y`. Interest under s.201(1A) is not computed. The TAN comes from Settings ›
Company, and nothing is produced without one.

**We also need:** the Income-tax Act, 2025 is, as we understand it, in force from
1 April 2026 and renumbers these sections. Which references — the 1961 sections
or the new ones — must a challan and a 26Q carry for deductions on or after that
date?

**Question:** are the codes, due dates and remark codes right, and which Act's
section references apply?

**If we are wrong:** a deposit is booked against the wrong code, or a return is
rejected on validation.

---

## CA-20 — TDS and retention money

**Status:** PROVISIONAL — our convention.

**What we do now:** when a bill is paid, tax is deducted on the bill's value
excluding GST, as if nothing were retained. The retention withheld is paid later,
in full, with nothing further deducted.

**Question:** is TDS on retention money due when the bill carrying it is credited,
or when the retention is released?

**If we are wrong:** tax is deducted a year early on money the vendor has not
received, or a year late on money already credited.

---

## CA-21 — Where a challan's ₹10 rounding applies, and where its difference shows

**Status:** PROVISIONAL — our reading, until you answer.
**Source:** `services/finance/src/domain/tds-statements.ts` (`challanAmount`)

Your answer to CA-04 rounds what is deposited: paise dropped, then the nearest
₹10, five and above up. A month's challan has one line per nature-of-payment
code — 94C, 4IA, 4JA and so on — and, following your answer to CA-03, each
deduction keeps its exact amount to the paise.

**What we do now:** each line is rounded on its own. A line's deductions are
added exactly, its paise dropped, and the rupees rounded to the nearest ₹10; the
challan's total is the sum of the rounded lines. The 26Q lists every deduction at
its exact amount, and nothing on it shows the difference between those amounts
and what was deposited.

**Question:** does the ₹10 rounding apply to each challan line — each nature
code — or once, to the challan's total? And where does the difference between the
exact deductions and the rounded deposit appear in the 26Q: against a deductee
row, only in the challan's deposited amount, or nowhere?

**If we are wrong:** each month's deposit differs from what the 26Q says was
deducted, by up to ₹5 a line, and the statement does not reconcile against its
challan — a short deposit carries interest, and an unreconciled statement is a
validation question.

---

## What we need back, in a usable form

For each answer: **the number or rule, the statute or circular it comes from,
the date it took effect, and your name.** We record all four in the golden file
so that in two years anyone can see who verified it and against what.

We do not need a written opinion — a marked-up copy of this document is enough,
provided each answer carries its citation and effective date.

## Reconciliation — a separate conversation, but do not forget it

ADR-0014 also flags this: when the existing client's records move from
fuzzy-matched name strings to real foreign keys, **historical totals will
change**. That reconciliation has to be agreed with the client *before* go-live,
not discovered at it. It is a business conversation, not a CA question, but it
is on the same critical path.

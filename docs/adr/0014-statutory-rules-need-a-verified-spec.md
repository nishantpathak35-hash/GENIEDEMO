# ADR-0014: Statutory rules require a CA-verified spec before porting

- **Status:** Accepted
- **Date:** 2026-09-03

## Context

The rebuild was planned as a port: lift the business rules from the legacy code
and re-express them in typed services. That assumes the legacy code is a
trustworthy specification. **It is not**, in two compounding ways.

### Identity is fuzzy, so "a correct port" is undefined

- Projects join via `LOWER(TRIM(project)) LIKE '%…%'`
- Payments link via `CAST(pr_id AS TEXT) = CAST(sp.pr_key AS TEXT)`
- Workflow state is substring matching — `stage.includes('reject')`
- A `mergeProjects` RPC exists precisely because name-keying corrupts

### Parts of the statutory logic are wrong

| Location | Defect |
|---|---|
| `app/lib/tdsChallan281.js:54` | Fabricates a default TAN (`'DELM12345F'`) into generated 26Q e-filing content when missing |
| `calculateChallanInterest` | Computes 201(1A) interest from the *due* date rather than the deduction date, by calendar-month difference |
| — | No 194C threshold tracking anywhere (₹30k single / ₹1L annual) |
| `app/lib/api/statutory-tally.js` | `generateTallyVoucherXML` interpolates vendor names unescaped — "M/s A&B Interiors" breaks the voucher |
| `app/lib/api/statutory-tally.js` | `generateTallyVoucherXML` emits a bare `<TALLYMESSAGE>` — no `<ENVELOPE>`, `<HEADER><TALLYREQUEST>Import Data`, `<BODY><IMPORTDATA>`, and no `ALLLEDGERENTRIES.LIST`, so there is no double entry. **Tally cannot import it.** `syncVoucherToTally` then treats HTTP 200 as success without reading the body, and Tally answers 200 while rejecting — so every `tally_sync_logs` row marked *Synced (Live Gateway)* is meaningless. **No voucher has ever reached Tally.** Also: no `SVCURRENTCOMPANY` (imports into whichever company is open), a locally fabricated `TALLY-GUID-…` stored as though Tally returned it, `CREATED=0` with `ERRORS=0` read as success, no idempotency, and the date is not normalised to `YYYYMMDD` — it works by accident for date-only `po_date` and breaks for `created_at`. Found by the connector workstream. |
| `app/lib/api/purchase-orders/write.js:55` | Server trusts a client-supplied `gst_amount` when present |
| `components/views/POsView.js:136–154` | Derives roles client-side and computes TDS in the browser |

In a single-tenant deployment these were one customer's tolerated quirks. In a
multi-tenant compliance product they become **every customer's statutory
exposure, with our name on the SOC 2 report**.

## Decision

A distinct workstream (**M2.5**) runs before the money path is ported:

1. **Extract** the rules from code into a written rule spec.
2. **Verify each against statute with a practising CA.**
3. **Encode as effective-dated rate tables.** TDS rates change every Budget, so
   the engine must be time-versioned — a voucher raised in FY2024-25 must
   compute under FY2024-25 rules forever.
4. **Lock with golden-file tests per financial year.**
5. **Never fix a rule and port it in the same commit.** Port mechanics verbatim;
   correct defects separately, behind tests.

Additionally, a **re-keying and reconciliation plan** for tenant #1: when
fuzzy-matched rows move to real foreign keys, historical totals will change.
That reconciliation must be agreed with the customer *before* go-live, not
discovered at it.

### The authority-inversion rule

Typed contracts fix payload shape only. Throughout the port:

> **The server computes every monetary figure and every permission. Clients
> display.**

A faithful port otherwise preserves the hole through a fully-typed pipeline.

## Consequences

- The plan gains a milestone that produces no shipping code. It is not optional:
  porting a wrong TDS rule into a multi-tenant product multiplies liability.
- An external dependency — CA availability — sits on the critical path before
  M3.
- Effective-dated rate tables are more work than constants, and they are the
  only design that survives the next Budget.
- The tenant #1 data migration is a sub-project of archaeology and sign-off, not
  a script.

## Alternatives considered

**Port faithfully, fix later.** Rejected: it ships known-wrong statutory output
to every tenant, and "later" never precedes the first filing.

**Fix while porting.** Rejected: it conflates two changes in one commit, so when
a figure differs from the legacy system there is no way to tell whether the port
was wrong or the fix was right.

---

## Addendum — the Tally integration has never worked

Investigated 2026-09-03 by the connector workstream and confirmed against the
code. `generateTallyVoucherXML` produces XML that Tally cannot import, and
`syncVoucherToTally` records HTTP 200 as success without parsing the response
body — which Tally returns 200 with while rejecting.

Two consequences beyond the rule spec:

1. **`tally_sync_logs` is not evidence.** Rows marked *Synced (Live Gateway)*
   record a request that was sent, not a voucher that landed. The tenant #1
   migration must treat every one of them as unsynced. Do not reconcile against
   `tally_guid`; those values were generated locally from a timestamp.
2. **`services/finance` writes the XML generator from scratch.** It is not a
   port. It needs the full envelope, `ALLLEDGERENTRIES.LIST` double entry,
   `SVCURRENTCOMPANY` targeting, `YYYYMMDD` dates, XML escaping, and a stable
   `REMOTEID` derived from the voucher id for Tally-side deduplication. Success
   must be parsed from `<CREATED>`/`<ALTERED>`/`<ERRORS>`/`<EXCEPTIONS>` —
   `CREATED=0` with `ERRORS=0` is a silent no-op and is the most dangerous
   outcome available, so it must be treated as failure.

Interestingly, `app/api/tally/push/route.js` — a different code path — *does*
check the response body for `<ERRORS>`/`<LINEERROR>` rather than trusting the
status. That instinct is correct and carries forward; it simply was not the path
`syncVoucherToTally` used.

---

## Addendum — the gate moves from the build to production output

Decided by the owner on 2026-09-15. The Decision section above is left exactly
as it was written, so the change can be read against it.

**What changes.** The Decision put the CA gate *before the money path is
built*. It now sits *before a statutory output is produced in production*.

**Why.** The chartered accountant's name, membership number, firm and
confirmed-on date will arrive before go-live, not before the build. Holding the
build on them would move every integration problem in the money path into the
weeks before go-live, which is the most expensive place to find one.

**What it means in practice.**

1. **Every value stays `provisional`.** Answers the owner relayed from a call
   with the CA carry the source *"relayed by the owner from a CA call; CA
   details to follow"*. A value the CA has not answered is taken from the
   statute text, is equally `provisional`, and has its question written into
   `docs/statutory/QUESTIONS-FOR-CA.md`. `verified_by` and `verified_on` stay
   empty, and no code path can fill them: a person promotes a row, with the CA's
   details, when they arrive.
2. **In production, a statutory output computed from a provisional row is
   refused, by name** — TDS deducted on a payment, a challan, 26Q content, a
   Tally voucher, and a GST tax invoice. The refusal carries the code
   `PROVISIONAL_IN_PRODUCTION` and names every row it would have relied on. A
   test proves it. "Production" is `NODE_ENV=production`, the same condition
   `assertNotProduction` already uses to keep development sign-in out of it.
3. **Outside production the pipeline computes normally**, so it can be built,
   tested and demonstrated end to end. Where rates are displayed the screen
   says *Provisional*, and a generated statutory document says *Draft:
   provisional rates*. Individual figures carry no banner.

**What does not change.** Effective-dated rate tables, golden files per
financial year, never fixing a rule and porting it in one commit, the
authority-inversion rule, and the reconciliation plan for tenant #1. A
provisional row is still not evidence. The gate is still a CA's name, date and
statute against every row a filed figure depends on; it is now enforced at the
output rather than at the build.

**What is held.** The CA brief: the CA's name, membership number, firm,
confirmed-on date, and YES/NO on the seven earlier answers (CA-01, 02, 03, 04,
06, 07, 08). It promotes the provisional rows to verified.

## Addendum — the gate fails closed

Decided by the owner on 2026-09-15, the same day. The addendum above is left as
it was written.

**What changes.** The gate no longer asks whether the process is production. A
statutory output computed from a provisional row is refused unless the process
was told, explicitly, to produce drafts: `STATUTORY_OUTPUTS=draft`. Unset,
empty, or any other value refuses, and `NODE_ENV` plays no part. The refusal's
code is `PROVISIONAL_OUTPUT_REFUSED`, and it still names every row it would have
relied on. The local stack sets `draft` in `docker-compose.yml`.

**Why.** Keyed on `NODE_ENV=production`, a deployment that was not labelled
production — a staging stack, a container started without it — would compute
figures from unverified rows. Keyed on an explicit `draft`, a deployment nobody
configured refuses.

**A voucher computed from a provisional row never reaches Tally.** Draft or not,
it is not staged for a connector: a payment or a tax invoice resting on one is
recorded and shown as a draft, and stages no voucher, and neither does a
retention release whose retention such a payment withheld. What reaches the
books rests on verified rows.

**What is held** is now the CA's name, membership number, firm and confirmed-on
date. The CA's written answers to CA-01 to CA-09 are recorded in
`docs/statutory/QUESTIONS-FOR-CA.md`; they promote the rows to verified once
those details arrive.

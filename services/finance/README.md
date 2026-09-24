# services/finance

> Money in, money out, and the tax authorities.

**Package:** `@cog/finance`  ·  **Tier:** Domain service  ·  **Owner:** `@construct-o-genie/backend`  ·  **Status:** scaffold — no implementation yet

---

## Responsibility

payment requests, remittances, manual payments, TDS (194C 1%/2%, 194J 10%, 194Q 0.1%), Form 281 challans, client invoices and receipts, GSTR-2B reconciliation, project financials, **and the Tally voucher staging tables**.

## Depends on

`packages/contracts` · `packages/service-kit` · `packages/money`

**No other service.** Cross-domain reads go through `packages/contracts`.

## Explicitly not this package's job

Does not talk to Tally directly. It stages vouchers; the on-prem connector pulls them.

## What ports in from the legacy app

`src/modules/payments/`, `src/modules/core/services/TDSService.ts`, `PaymentsView.js`, `app/lib/api/statutory-tally.js`, `TDSTrackerSection.js`. **Critical:** legacy `app/api/tally/push/route.js` posts to `http://127.0.0.1:9000`. In the cloud that address is the server itself, not the customer's Tally — the feature is architecturally impossible as written. See ADR-0004.

---

## Before writing code here

Read [`docs/TOPOLOGY.md`](../../docs/TOPOLOGY.md), the ADRs in
[`docs/adr/`](../../docs/adr/), and the current milestone plan in
[`docs/plans/`](../../docs/plans/).

The dependency rule is one-way, and it is enforced by
`import/no-restricted-paths` in `eslint.config.mjs` rather than by convention:

```
apps      ->  packages      never services — services are reached over HTTP
services  ->  packages      never apps, never another service
packages  ->  packages      never apps, never services
```

`services/host` is the single exception: it is the composition root, and the one
place that imports every service.

Legacy source for porting is at `_legacy/atelier-current/` (read-only
reference) — and it is an **unreliable specification**: identity is fuzzy string
matching and parts of the statutory logic are wrong. See ADR-0014 before porting
any rule. Live client data is at `_private/` and **must never enter any
repository**.

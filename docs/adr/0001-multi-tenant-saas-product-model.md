# ADR-0001: Multi-tenant SaaS product model

- **Status:** Accepted · re-drafted 2026-09-03 (originally decided 2026-08-16)
- **Deciders:** Product owner

## Context

The application was built as a single-tenant ERP for one construction and
interiors contractor. Its schema assumes exactly one company: 51 tables carry
no tenant key of any kind.

> **Correction, 2026-09-03.** This ADR originally stated the app "runs on
> localhost, has never been deployed". That is imprecise. A **sales demo
> instance** is live at `https://lwa-iota.vercel.app`, used to show the product
> to prospects before it is finished. It is not a production deployment and no
> customer operates on it.
>
> Two things follow anyway:
>
> 1. The demo is public and the RPC route accepts a forged session (see
>    STACK-MIGRATION.md), so whatever data the demo holds is readable by anyone
>    who finds the URL. Seed it synthetically, not from the real project set.
> 2. `app/lib/api/auth.js:253` hardcodes that demo domain as the invite URL.
>    Invite URLs are **per-tenant configuration** owned by `services/tenancy` —
>    a compiled-in domain cannot work for a multi-tenant product.
>
> Note that `render.yaml` deploys `backend/whatsapp-bot.js`, a separate bot — it
> is not evidence about the ERP either way.

The intent is to sell it to many contractors as a product, not to install it
once per customer.

## Decision

Rebuild as a **multi-tenant SaaS product**. One application instance serves many
customer companies, with data isolated per tenant. The original customer
("Luxeworx Atelier") becomes tenant #1, not the product name.

## Consequences

- Every table gains a tenant key, and every query is scoped by it.
- A tenant-provisioning surface (`cog-admin`) becomes mandatory — onboarding
  cannot be a manual SQL exercise.
- Configuration that is currently hardcoded (company GSTIN/PAN, PO prefixes,
  approval chains, TDS defaults) becomes per-tenant data.
- The blast radius of a bug changes: a missing tenant filter no longer shows
  wrong data, it shows *another company's* data. This is why ADR-0002 and
  ADR-0006 exist.
- Realistic effort: 6–9 months solo to a defensible v1.

## Alternatives considered

**Single-tenant instances per customer.** Simpler — the current schema would
work almost unchanged. Rejected because the per-customer operational cost
(upgrades, backups, monitoring, incident response × N) does not scale for a
one-person team, and every customer would drift onto a different version.

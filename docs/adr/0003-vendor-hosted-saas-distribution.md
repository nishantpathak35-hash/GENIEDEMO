# ADR-0003: Vendor-hosted SaaS distribution, India region

- **Status:** Accepted · re-drafted 2026-09-03 (originally decided 2026-08-16)
- **Deciders:** Product owner

## Context

Indian construction and ERP buyers have historically expected on-premise or
customer-hosted deployment. Three models were on the table: vendor-hosted SaaS,
bring-your-own-cloud (BYOC), and customer-managed on-premise.

## Decision

**Vendor-hosted multi-tenant SaaS, hosted in the India region.** Dedicated
single-tenant instances on *our own* infrastructure remain available as a bridge
for the first few customers who require it.

BYOC and customer-managed on-premise are explicitly out of scope for v1.

## Consequences

- One environment to operate, monitor, patch and back up.
- Data residency in India is a hard hosting constraint. The specific provider
  and region are still open (see `OPEN-DECISIONS.md`); note the legacy
  `render.yaml` targets Render, which has no India region.
- Customers who mandate on-premise cannot be served in v1. That is accepted.
- The Tally integration is the one place where an on-prem component is
  unavoidable — see ADR-0004.

## Alternatives considered

**BYOC — deploy into the customer's cloud account.** A real model, and one some
enterprise buyers ask for. Rejected as premature for a one-person team: every
customer environment becomes a support surface with its own network topology,
credentials and failure modes.

**Customer-managed on-premise.** Rejected outright: it makes continuous delivery
impossible and turns every release into N migration projects.

## Open

What deployment model Indian construction and ERP buyers *actually* expect in
2026 has not been researched. This ADR is a considered judgement, not a
finding. Go-to-market work is deliberately parked until the product is complete.

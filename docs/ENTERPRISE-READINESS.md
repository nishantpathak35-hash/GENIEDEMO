# Enterprise readiness

What a B2B buyer's procurement and security review actually asks for, and where
each item lives. Repository topology is not on this list — it never comes up.

Status legend: **planned** · **in progress** · **done**

---

## Design in from milestone 1 — expensive to retrofit

| Item | Where | Status |
|---|---|---|
| **Tenant isolation with an adversarial test suite** — authenticate as tenant A, assert zero rows from tenant B, on every commit | `services/tenancy` + `test:isolation` in CI | planned |
| **Row-level security policies** as the backstop under application scoping | `services/*/src/infrastructure/db/policies/` | planned (ADR-0002, ADR-0006) |
| **Append-only audit log on every mutation** — actor, action, tenant, timestamp, source IP | `services/workflow` | planned |
| **Soft delete + retention windows + a real purge path** — DPDP erasure requests need a code path, not a `DELETE` | every service | planned |
| **Structured logging correlated by tenant / user / request ID** | `packages/service-kit` | planned |
| **Region pinning** — compute, Postgres, object storage and the identity provider all in India | `infrastructure` | planned (ADR-0003) |
| **Encryption at rest and in transit, with key management** | `infrastructure` | planned |

The first item is the one that matters most. For multi-tenant B2B, "how do you
guarantee our data cannot leak to another customer?" is the first technical
question in every security review, and the answer has to be a test suite, not a
paragraph.

## Cheap to add later

| Item | Where |
|---|---|
| SSO — SAML / OIDC | WorkOS (ADR-0005) |
| SCIM provisioning | managed IdP, enterprise tier |
| Tenant data export and self-service deletion | `services/tenancy` + `apps/admin` |
| Usage metering and billing | `services/tenancy` |
| Status page | operational |
| Dependency and container scanning | CI |
| Annual external penetration test | operational |
| **CycloneDX SBOM generation** | CI — questionnaires now request it directly (ADR-0015) |
| **OSV-Scanner / Socket in CI** | CI — `npm audit`'s signal is too weak to rely on |
| **`ignore-scripts=true` + build allowlist** | `.npmrc` — postinstall is the primary npm attack vector |
| **Renovate `minimumReleaseAge: 7d`** | hijacked package versions are usually yanked within days |

## Operational commitments

| Item | Note |
|---|---|
| **Backups with a tested restore, stated RPO/RTO** | Untested backups are not backups. Test quarterly. |
| **Disaster recovery plan** | |
| **Uptime SLA** | See the constraint below |
| **Incident response + breach notification** | DPDP has notification obligations |
| **Change management records** | Also SOC 2 evidence |

## Compliance

| Item | Note |
|---|---|
| **DPDP Act 2023 (India)** | Binding today. Consent, purpose limitation, erasure, breach notification, and the data-residency posture in ADR-0003. **Disclose that identity data sits outside India** — no major managed IdP hosts in-country. DPDP permits cross-border transfer except to restricted countries, but this must be stated, not discovered. |
| **SOC 2 Type II** | Gates large deals. 6–12 months of evidence collection, so audit logging and change records must start early. |
| **ISO 27001** | Often accepted in place of SOC 2 for Indian and EU buyers. |
| **GST-compliant invoicing** for our own billing | We are selling B2B in India; e-invoicing applies above the turnover threshold. |

## Two constraints a solo team cannot fake

**SOC 2 expects separation of duties** — evidence that changes were reviewed by
someone other than the author. With one engineer that is impossible; you
document compensating controls instead. Achievable, but the auditor conversation
is different, and it is a real reason `infrastructure` stays a separate
repository with its own access list.

**A 99.9% SLA implies on-call**, which one person cannot hold. Early contracts
should either omit an SLA or state business-hours support honestly. Promising
uptime you cannot staff is a faster way to lose an enterprise account than not
offering it.

Neither is a reason not to build this. Both are reasons to be selective about
which enterprise deals to chase before there is a second engineer.

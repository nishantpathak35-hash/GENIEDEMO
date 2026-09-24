# Architecture Decision Records

One file per decision. Never edit an accepted ADR to change its meaning —
supersede it with a new one and mark the old one superseded.

| # | Decision | Status |
|---|---|---|
| [0001](./0001-multi-tenant-saas-product-model.md) | Multi-tenant SaaS product model | Accepted · re-drafted |
| [0002](./0002-postgres-with-rls-over-libsql.md) | Postgres with RLS over libsql/Turso | Accepted · re-drafted |
| [0003](./0003-vendor-hosted-saas-distribution.md) | Vendor-hosted SaaS distribution | Accepted · re-drafted |
| [0004](./0004-tally-via-staged-xml.md) | Tally integration via staged XML + on-prem connector | Accepted · re-drafted |
| [0005](./0005-managed-identity-provider.md) | Managed identity provider | Accepted · re-drafted |
| [0006](./0006-context-object-and-orm-before-rls.md) | Tenant context object and ORM before RLS | Accepted · re-drafted |
| [0007](./0007-client-data-excluded-from-version-control.md) | Client data excluded from version control | Accepted · re-drafted |
| [0008](./0008-seventeen-repos-by-domain.md) | Seventeen repositories organised by business domain | **Superseded by 0009** |
| [0009](./0009-monorepo-supersedes-seventeen-repos.md) | Monorepo with enforced boundaries | Accepted |
| [0010](./0010-drizzle-postgres-and-service-tooling.md) | Drizzle, Hono, pg-boss and the service toolchain | Accepted |
| [0011](./0011-typescript-with-polyglot-workers.md) | TypeScript in the request path; polyglot only at worker seams | Accepted |
| [0012](./0012-money-as-integer-paise.md) | Money as integer paise, in a single enforced package | Accepted |
| [0013](./0013-typst-for-document-rendering.md) | Typst for document rendering, in a sandboxed worker | Accepted |
| [0014](./0014-statutory-rules-need-a-verified-spec.md) | Statutory rules require a CA-verified spec before porting | Accepted |
| [0015](./0015-containers-and-supply-chain.md) | Docker everywhere; mandatory supply-chain hardening | Accepted |

## A note on 0001–0007

These seven decisions were made and recorded on 2026-08-16, then deleted at the
end of that session because only a discussion had been asked for. **The original
text is gone** — no git history existed to recover it.

They have been re-drafted from the decision titles and the surviving project
notes. The decisions themselves stand; the reasoning is a reconstruction. Read
them once and correct anything that misremembers your intent before the rebuild
leans on them.

## A note on 0008 and 0009

0008 is kept rather than deleted. Its boundary analysis is still the design in
force — which service owns which tables, where the trust boundaries fall. Only
its conclusion about repository *count* was wrong, and 0009 records why.

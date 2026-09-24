# ADR-0009: Monorepo with enforced boundaries, superseding the 17-repo split

- **Status:** Accepted — supersedes [ADR-0008](./0008-seventeen-repos-by-domain.md)
- **Date:** 2026-09-03

## Context

ADR-0008 established seventeen repositories organised by business domain. The
boundary analysis behind it was sound: which service owns which tables, what
depends on what, where the trust boundaries fall.

The repository *count* was not. It was chosen to match how a 25–30 engineer
organisation is structured. The actual team is one person.

The concrete cost, for a single logical change — adding a field to a purchase
order: edit `platform-contracts`, open a PR, merge, cut a release, bump the
dependency in `svc-procurement`, PR, merge, bump in `cog-web`, PR, merge. Three
PRs and two version bumps, with no way to test end to end until all three land.
Multiplied across every cross-cutting change for the 6–9 months of the rebuild.

It is also worth noting that the companies the "like a tech company" instruction
was reaching for — Google, Meta, Stripe, Shopify, Uber, Airbnb — predominantly
run monorepos. Repo-per-service is more characteristic of enterprise IT and
systems integrators.

## Decision

**Three repositories:**

| Repo | Contains | Why separate |
|---|---|---|
| `construct-o-genie` | 4 apps, 7 services, 3 shared packages, all docs and ADRs | The product |
| `tally-connector` | On-prem Windows agent | Installed on a customer's machine, released on their schedule, must stay backwards-compatible with older cloud versions |
| `infrastructure` | Terraform, environments, secrets wiring | Different credentials and access list; also real separation-of-duties evidence for SOC 2 |

**Every boundary from ADR-0008 survives unchanged** — same names, same
ownership, same one-way dependency rule. They become workspace packages rather
than repositories, enforced by `import/no-restricted-paths` in
`eslint.config.mjs` instead of by npm version ranges.

## Consequences

- A cross-cutting change is one PR touching several directories. CI builds only
  what the commit affected, via Turborepo.
- At any commit there is exactly one version of `packages/contracts` in play.
  The question "which contract version is production on?" stops existing.
- The dependency rule is enforced *more* strictly than before. In a multi-repo
  split nothing stops a wrong dependency being added to a `package.json`; here
  CI fails in seconds.
- CODEOWNERS still maps ownership per directory, and the two-reviewer rules on
  migrations and RLS policies still apply by path.
- A monorepo does **not** imply a single deployable. `apps/*` and the service
  host build as independent artifacts.
- Repo-level access control is lost: anyone with access to the monorepo sees all
  of it. Acceptable at current team size; `infrastructure` stays separate
  precisely because that is where it matters.
- **Direction of travel is the reversible one.** Extracting a package out of a
  monorepo with clean boundaries is mechanical — the contract already exists.
  Merging N diverged repositories back together is not.

## Alternatives considered

**Keep the seventeen.** Rejected: it optimises for the organisation we intend to
become rather than the one that exists, and pays the coordination cost every day
until then.

**Two repos — fold `infrastructure` in.** Rejected: production credentials and
application code should not share a blast radius, and the separation is useful
evidence during a SOC 2 audit.

**One repo — fold `tally-connector` in.** Rejected on the same grounds as
ADR-0004: it is a physically separate artifact on a release cycle we do not
control.

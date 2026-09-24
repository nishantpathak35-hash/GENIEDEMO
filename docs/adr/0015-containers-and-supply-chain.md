# ADR-0015: Docker for all environments; mandatory supply-chain hardening

- **Status:** Accepted
- **Date:** 2026-09-03

## Context

The legacy app has no documented setup: a developer needs Node, a Turso token or
a local SQLite file, and a set of environment variables discoverable only by
reading `db.js`. Setting it up on another machine is guesswork.

Separately, npm's supply chain has the worst incident record of the major
ecosystems — `event-stream`, `ua-parser-js`, `node-ipc`, and successive
worm-style attacks. ADR-0011 accepted that risk; this ADR fixes the mitigations,
which are mandatory rather than advisory.

## Decision

### Containers

```
docker compose:  postgres:17 · minio · api · worker · web
```

`docker compose up` is the entire setup. Multi-stage builds on `node:22-slim`,
Typst binary in the worker image, non-root user, read-only root filesystem.
Testcontainers reuses the same images in CI, so local, CI and production run
what is provably the same thing.

### Supply chain

1. **`ignore-scripts=true`** with an explicit `onlyBuiltDependencies` allowlist.
   Postinstall is the primary npm attack vector; this alone neutralises most
   historical incidents.
2. **Renovate `minimumReleaseAge: 7d`.** Hijacked versions are almost always
   yanked within days. Never install a version published hours ago.
3. **Exact version pinning** in server workspaces. Lockfile diffs are reviewed
   as code.
4. **OSV-Scanner or Socket in CI** — `npm audit`'s signal is weak — plus
   **CycloneDX SBOM generation**, which enterprise questionnaires now request
   directly.
5. Read-only container filesystems, egress-restricted workers, no secrets in
   build steps.

### The connector is the exception

`tally-connector` runs on a customer's Windows machine next to Tally. They will
not run Docker, and shipping a Node runtime plus `node_modules` into a
customer's network is a poor security story.

It ships as **a single compiled binary via Bun `--compile`**, plus an installer.

**Bun is a build step, not a development runtime.** The binary is produced by a
container — `docker/connector-build.Dockerfile`, `FROM oven/bun:1`, cross-
compiling with `--target=bun-windows-x64` — so no developer machine needs Bun
installed. It is invoked the way the Typst binary is invoked in the worker
image.

Consequently the connector should prefer **Node-standard APIs** in its source:
`node:test` over `bun:test`, and an append-only journal with `fsync` over
`bun:sqlite` for the durable queue. A connector handles tens to a few hundred
vouchers a day, so SQLite is overkill and a plain journal is easier to write
crash-recovery tests against — which is the actual correctness requirement.

This keeps Deno `compile` and Node SEA available as fallbacks without a rewrite.
Single-executable tooling is the least settled corner of the JS ecosystem, and
this is a component we will be shipping to customer machines for years.
Bun over Go because it keeps the connector in TypeScript without adding a
second language for one component; Go would give a marginally smaller
dependency tree.

**Correction (2026-09-03):** an earlier revision of this ADR justified Bun by
saying the connector could "import `packages/contracts` directly". That was
wrong and is withdrawn. Taking a build-time dependency on a versioned package
from the product repo couples the connector's release to the cloud's, which is
exactly what the connector's backwards-compatibility rule forbids — it must run
unchanged against a cloud eighteen months newer than itself. The connector keeps
its own hand-written structural guards and a dated snapshot of the contract in
`cog-tally-connector/docs/CONTRACT.md`. Raised by the connector workstream.

## Consequences

- Onboarding a machine — or a future developer — is one command.
- Local and CI parity removes a whole class of "works on my machine" defects.
- SBOM and OSV output become artifacts to hand a security reviewer, which is
  work that would otherwise be done under deadline during a deal.
- `ignore-scripts` will occasionally break a package that genuinely needs a
  build step; the allowlist is maintained deliberately, which is the point.
- Docker adds a dependency for local development. Acceptable — it replaces a
  longer list of undocumented ones.

## Alternatives considered

**Devcontainers only.** Good editor integration, but does not give production
image parity.

**Nix.** Stronger reproducibility, materially steeper learning curve, and no
answer for production container images.

**Shipping the connector as a Node app with an installer.** Rejected: an npm
dependency tree inside a customer's network, plus "install Node.js" as a support
burden on machines we do not control.

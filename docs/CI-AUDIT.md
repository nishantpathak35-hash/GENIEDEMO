# What would happen on the first real CI run

**2026-09-05.** `.github/workflows/ci.yml` has **never executed** — no repository
in this workspace has a hosted remote, only a local `mirror` on the same disk.
So this is a reading, not a run, and every claim below says which it is.

Audited against how `pnpm verify` actually runs today, which is the point: CI
that does not run the gate is CI that agrees with it only by coincidence.

---

## Findings

### 1. CI does not run the gate. It re-implements it — and had already drifted. **FIXED**

`pnpm verify` sequences six steps. `ci.yml` ran three of them, spelled out by
hand as `pnpm lint`, `pnpm turbo run typecheck build test --filter=…` and
`pnpm test:isolation`.

The moment the browser suite joined the gate, CI stopped covering it. **All 41
Playwright tests — every screen in the product — would never have run on any
pull request**, and nothing would have said so. The workflow would have gone
green.

This is [`TOOLING-DEFECTS`](TOOLING-DEFECTS.md) defect 7 one level up. That
defect was a prose checklist that could be partially run; the fix was to make
the gate a script. A workflow that restates the script's steps is the same
mistake with YAML instead of prose.

**Fixed** by calling `pnpm verify`. There is now one definition of the gate and
CI runs it, so a step added locally is a step CI runs.

### 2. `--filter=...[origin/main]` selects **nothing** on a push to main. **FIXED**

On `push: branches: [main]`, the pushed commit *is* `origin/main`. The changed-
package set is therefore empty, turbo runs zero tasks, and the job exits 0.

Green, having compiled and tested nothing — on the branch that matters most.
The filter only ever worked on pull requests, where `origin/main` is genuinely a
different commit.

**Fixed** along with finding 1: `pnpm verify` is unfiltered by construction.
Slower, and correct. `--force` is already passed to every turbo step inside it
for a related reason (defect 5: turbo replayed `EXIT=0` from cache while four
test files were failing).

### 3. The browser step needs Docker and a browser download. **Handled, UNVERIFIED**

`scripts/e2e.mjs` starts the compose stack and seeds it, so the runner needs a
working Docker — `ubuntu-latest` has one, and the isolation suite already
depends on it for Testcontainers, so this adds no new requirement.

It also runs `pnpm exec playwright install chromium` explicitly. That is not
belt-and-braces: `.npmrc` sets `ignore-scripts=true` repo-wide (ADR-0015,
postinstall is the primary npm attack vector) and Playwright downloads its
browsers in a postinstall, so `pnpm install` does **not** fetch them. Without
that line the step fails with a missing executable.

**Unverified.** Nobody has run compose on a GitHub runner. The most likely
failures are wall-clock (four Next.js dev servers, cold) and a port collision
with something the runner image already binds — every published port is
overridable for exactly that reason.

### 4. `test:isolation` on a fresh checkout — **NOT a finding, checked**

Worth recording because it looks like one. `dist/` is gitignored, packages
resolve through `"main": "./dist/index.js"`, and CI's `build` was filtered — so
an unfiltered `pnpm test:isolation` should have failed to resolve `@cog/contracts`
on a fresh clone.

It would not have. `turbo.json` declares `"test:isolation": { "dependsOn":
["^build"] }`, so turbo builds every dependency first regardless of the filter.
Read the file rather than assumed.

### 5. ADR-0015's supply-chain requirements are present — **checked, correct**

| Requirement | State |
|---|---|
| `ignore-scripts` enforced | Present, and asserted by a step that fails if `.npmrc` stops setting it |
| OSV, not `npm audit` | `google/osv-scanner-action@v2.2.4` against `pnpm-lock.yaml` |
| SBOM as an artifact | `cdxgen` from a **pinned devDependency** via `pnpm exec`, uploaded with `if-no-files-found: error` |
| Renovate, 7-day quarantine | `renovate.json` exists — and has never run, for the same reason this workflow has not |

`cdxgen` rather than `@cyclonedx/cyclonedx-npm` is correct and the reason is
already recorded in the workflow: the latter shells out to `npm ls`, which does
not understand a pnpm workspace.

### 6. `pnpm migrate` is never run as a step — **not fixed, and probably fine**

Nothing in CI runs the migration runner directly. The isolation suite applies
every migration through Testcontainers, so a broken migration fails there; and
`scripts/migration-plan.mjs` throws on a duplicate global prefix, which that
path exercises.

Left alone rather than "fixed" by adding a step that would duplicate what the
isolation job already proves. Noted so the absence is a decision.

### 7. Toolchain versions — **checked, consistent**

`pnpm/action-setup@v4` with no `version:` reads `packageManager` from
`package.json`, which pins `pnpm@9.12.0`. `node-version: 22` matches the images
and the declared `>=22`. The local host runs node 24, which is a local-only
divergence and is recorded in `CLAUDE.md`.

### 8. `cancel-in-progress` also applies to main — **noted, not changed**

A merge to main cancels the previous main build. Usually wanted; worth knowing
if a run is ever the thing that publishes something.

---

## What is still not known

**Whether any of this works.** Every finding above is from reading the file and
the scripts it calls. The first real run will find things this cannot — that is
what a first run is for, and the honest position until a remote exists.

Adding a remote is a publishing decision and is not one this exercise makes.

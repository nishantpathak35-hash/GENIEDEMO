# Tooling defects — first measured 2026-09-03, last reviewed 2026-09-20

Twenty-three defects in the development loop, each reproduced with a command
and an exit status. None is a code defect; nearly all cause a **green result that
proves nothing**, which is why they are written down rather than left to be
rediscovered.

**Eighteen are fixed: 1, 2, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18,
22, 23.** Two are not — 5 (a recurring Windows link failure with a manual
remedy) and 11 (judged not worth what the fix would cost). **Three are worked
around, not fixed — 19, 20 and 21**: Windows Smart App Control blocks the unsigned `turbo.exe`, and
the gate runs the same tasks through `pnpm -r` when it cannot spawn turbo; and
it blocks Next's native compiler, and the gate then builds the apps with
webpack on the WebAssembly one. Whether to allow either binary is a
machine-security decision, not a repository one. Each entry keeps its original
reproduction so the failure mode stays recognisable if it returns.

This header said "four defects... all four are now fixed" for ten defects
longer than it was true, and the `CLAUDE.md` summary drifted with it — which is
the same failure as a rule that is configured but does not fire. **It drifted
again the same way**: 15 was written into the body and left out of the count
here, and `CLAUDE.md` listed only 11 as open while 5 has never been fixed. **Fix status is
tracked here and `CLAUDE.md` points at it; where the two disagree, this file
wins.** Entry 11 sits after 14 because it was written later; the numbers are
identifiers, not an order.

---

## What each gate step actually covers

**Measured 2026-09-06, and the reason this table exists.** Three gate steps have
now been found reaching less than their names imply — the boundary rule was
configured and could not fire (1), `pnpm lint` examined `dist/` instead of
source (2), and `typecheck` had never looked at a test file (17). A green step
is not evidence of the thing the step is named after, and the only defence is
writing down what each one reaches.

| Step | Reaches | Does NOT reach |
|---|---|---|
| `lint` | **395 of 395** source files — every `.ts`, `.tsx` and `.mjs` outside `node_modules`, `dist/`, `.next/`, `.turbo/`, `coverage/`. Verified by diffing eslint's own file list against `find`. Includes `scripts/` and `e2e/` | nothing. This step is honest |
| `design` | `scripts/design-gates.mjs` — the static half of the design's gates: no colour, radius, shadow, space or type literal outside `styles.css` (`apps/`, `packages/`), no chart rule or `chart.tsx` line painting a status token, `--warn` only as ink on `--warn-soft`, and every used token pair AA / 1.4.11 in both themes, computed from the token block. The browser half is `e2e/design-gates.spec.ts` under `test:e2e` | a colour written in a JS string that is not `var(--…)` and not `#hex`/`rgb()` (a named colour in JSX), and any CSS a screen might one day inline through `style` with a datum key |
| `typecheck` | **everything.** `src/` and `tests/` in all 13 services and packages (via `tsconfig.typecheck.json`), the 4 apps' own `app/ lib/ tests/`, `e2e/` (turbo root task `//#typecheck:e2e`), and every `.mjs` in the repo — `scripts/`, `eslint.config.mjs`, the four `next.config.mjs` and the per-service seeds — under `checkJs` via `//#typecheck:scripts`. **30 turbo tasks** | nothing. Closed 2026-09-07 (defect 18) |
| `build` | all 17 workspace members, `--force`, no cache | `scripts/` and `e2e/` are not compiled — they are executed directly by node and Playwright |
| `test` | 61 test files across all 17 members. Every member has at least one | the `isolation` vitest project in the 4 packages that declare one — run by `test:isolation` instead, deliberately. Nothing is orphaned: every declared vitest project is run by exactly one step |
| `test:isolation` | **8 services**, against real Postgres behind PgBouncer via Testcontainers. `finance`, `host`, `tenancy`, `workflow` cover their own behaviour; `projects`, `procurement`, `siteops`, `identity` cover **every tenant table one at a time** — 55 of them, 288 tests | the write PATH for 28 of those tables, which no route populates. Their policies are proved; the application code that would write them does not exist. BACKLOG 1 |
| `compose` | two phases: your stack recreated (containers only, volumes untouched), then the same compose file under a throwaway project name migrating from an **empty** volume, asserting `migrations: applied <n>` rather than `already up to date` | the `worker` container and the four app containers are not started by either phase — `postgres`, `pgbouncer`, `minio`, `api` and `migrate` are |
| `test:e2e` | every screen rendered in Chromium against the seeded stack, plus the suite guards — the screen count, a seeded figure formatted as grouped rupees, and the vendor picker submitting an id — then the design's browser gates over each one. **One Playwright process per shard** since 2026-09-20 (`E2E_SHARDS`, four by default): the whole suite as one process died for host memory at 508 tests, and a shard's browsers are released before the next starts. `scripts/e2e.mjs` prints each shard's own row — passed, failed, flaky, skipped — read back from its JSON report | **it writes nothing.** Every test is a read: it signs in, renders, and asserts. No form is submitted, so no server write path is covered here |

### Both gaps this table named are now closed

Kept because the shape of each is worth recognising again.

**The isolation gap.** Four services owned tenant tables and declared no
`test:isolation` task, so their policies ran only when a `host` route happened
to reach them. Closed 2026-09-07: all four now have a suite that walks **every**
tenant table it owns. The measurement that shaped them is the part worth
remembering — `pg_stat_user_tables` on a fully seeded database after the
61-screen browser pass showed **zero** tables never read, and **28** never
written. So the gap was never "an untested table"; it was that `WITH CHECK` —
the half that stops one tenant planting a row in another's books — was exercised
by nothing at all.

**The scripts gap.** Closed the same day, defect 18.

---

## 1. ~~The import-boundary rule does not fire at all~~ FIXED 2026-09-03

**Severity: highest.** `TOPOLOGY.md`, the root `README.md` and the comment in
`.github/workflows/ci.yml` all describe the one-way dependency rule as enforced
by `import/no-restricted-paths`, with CI failing "in seconds rather than the
boundary eroding quietly". It cannot currently fail, because ESLint cannot parse
the files.

`eslint.config.mjs` sets no `languageOptions.parser`.
`typescript-eslint@8.69.0` and `eslint-import-resolver-typescript@4.4.5` are
both in `devDependencies` and both unused.

Reproduction:

```
$ printf 'const x: number = 1;\nexport default x;\n' \
  | pnpm exec eslint --stdin --stdin-filename services/host/src/probe.ts
  1:8  error  Parsing error: Unexpected token :
✖ 1 problem (1 error, 0 warnings)
exit 1
```

Any file containing a type annotation fails to parse, so its imports are never
examined. `services/host/src/index.ts` passes only because it happens to contain
no TypeScript-only syntax.

The second half of the problem is resolution: even with a parser, the zones must
match the import forms `module: NodeNext` actually requires — `'../x.js'` and
extensionless `'../x'`, not just `'../x.ts'`. A parser alone is not sufficient;
an `import/resolver` entry for TypeScript is also needed.

**Fix applied.** `languageOptions.parser` is set to the typescript-eslint
parser for `**/*.{ts,tsx}`, and `settings['import/resolver']` now carries a
TypeScript resolver so `'./x.js'` and extensionless `'./x'` both resolve.

M1/D8 is satisfied: `services/host/tests/boundary.test.ts` writes a deliberate
violation, runs lint, and asserts it fails — then asserts lint passes once the
violation is removed. Measured:

```
$ pnpm lint                     # with a package importing a service
  2:34  error  Unexpected path "../../../services/tenancy/src/index.js" imported
               in restricted zone. Packages must never import from services
                                                    import/no-restricted-paths
exit 1

$ pnpm lint                     # violation removed
exit 0

$ printf 'const x: number = 1;
export default x;
'   | pnpm exec eslint --stdin --stdin-filename services/host/src/probe.ts
exit 0                          # was: Parsing error: Unexpected token :
```

A configured rule is not an enforced rule; the test is what makes the
difference durable.

## 2. ~~`pnpm lint` is red on generated output~~ FIXED 2026-09-03

```
$ pnpm lint
services/host/dist/index.d.ts
  2:9  error  Parsing error: Unexpected token const
exit 1
```

`eslint.config.mjs` has no `ignores` for `dist/`, `.next/` or `.turbo/`. ESLint
9's flat config ignores only `node_modules` and `.git` by default.

CI does not hit this: it lints a fresh checkout, where `dist/` does not exist
because it is gitignored and lint runs before build. So **CI is green on a rule
that cannot fire, and local is red for an unrelated reason** — a local/CI
divergence in both directions at once.

**Fix applied.** `eslint.config.mjs` now ignores `**/dist/**`, `**/.next/**`,
`**/.turbo/**` and `**/coverage/**`. `pnpm lint` exits 0 locally with build
output present, so local and CI now agree.

## 3. ~~`docker compose up --build` creates no containers~~ FIXED 2026-09-03

```
$ docker compose up -d --build
worker.Dockerfile:13
  curl: (77) error setting certificate file: /etc/ssl/certs/ca-certificates.crt
  xz: (stdin): File format not recognized
  tar: Child returned status 1
target worker: failed to solve: ... exit code: 2
exit 1

$ docker compose ps -a
(empty)
```

`docker/worker.Dockerfile:13` runs
`apt-get install -y --no-install-recommends curl xz-utils`.
`--no-install-recommends` omits `ca-certificates`, which is a *recommend* of
curl rather than a dependency. curl then fails TLS against
`github.com`, emits nothing, and the empty stream reaches `tar -xJ`, which
reports "File format not recognized". The Typst binary is never downloaded.

Because one image in the project fails to build, compose aborts before creating
any container — so postgres, minio, api and web never start either. ADR-0015's
claim that "`docker compose up` is the entire setup" is currently false.

**Fix applied.** `ca-certificates` added to that `apt-get install` line.
`docker compose build worker` now exits 0 and the Typst binary downloads.
`docker compose up -d --build` exits 0 and creates **all five** containers,
where it previously created none.

What does work today:

```
$ docker compose build api                      exit 0
$ docker compose up -d postgres minio api       exit 0
  postgres  Up (healthy)   5432
  minio     Up (healthy)   9000-9001
  api       Up             4000     ← but crashing, see defect 4
```

`docker compose down` (no `-v`) is safe and preserves the `pgdata` and
`miniodata` volumes.

## 4. ~~The api container crashes under the bind mount~~ FIXED 2026-09-03

```
$ docker compose logs api
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@hono/node-server'
  imported from /app/services/host/src/index.ts
Node.js v22.23.2
$ curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/
000
```

`docker-compose.yml` mounts `.:/app` with an anonymous volume on
`/app/node_modules`. That masks only the **root** `node_modules`. pnpm
workspaces also place a `node_modules` in each package, and
`services/host/node_modules` is therefore taken from the Windows host, where its
entries are absolute symlinks:

```
$ ls -la services/host/node_modules/        # on the host
hono -> /d/TechSmiths/Construct-O-Genie/construct-o-genie/node_modules/.pnpm/hono@4.13.5/node_modules/hono
tsx  -> /d/TechSmiths/Construct-O-Genie/construct-o-genie/node_modules/.pnpm/tsx@4.23.13/node_modules/tsx

$ docker compose exec api sh -c 'ls /app/node_modules | wc -l'
16                                          # root devDependencies only
```

Those `/d/...` paths do not exist inside the container, so the symlinks dangle
and resolution fails.

**Fix applied.** Each workspace `node_modules` now has its own named volume in
`docker-compose.yml`, initialised from the image where `pnpm install` already
ran. Verified inside the container:

```
$ docker compose exec api sh -c 'ls /app/services/host/node_modules | wc -l'
5                                    # was: dangling symlinks, 0 resolvable
$ curl -s http://localhost:4000/healthz
{"ok":true}                          # was: ERR_MODULE_NOT_FOUND, HTTP 000
$ docker compose exec api pnpm turbo run test --force
@cog/contracts  29 passed
@cog/money      40 passed            # first tests ever run in the supported environment
```

**Maintenance cost — larger than it first looks.** A named volume is
initialised from the image *once*, when it is first created, and is never
refreshed afterwards. So the volumes go stale in two ways:

1. **Adding a workspace package** needs a new volume line here. Forgetting is
   loud (module-not-found), never silent.
2. **Adding or changing a dependency** leaves the existing volume holding the
   old tree — including an empty one for a package that did not exist when the
   image was built. Observed: `packages/service-kit` was added, and its volume
   was created empty, so `vitest: not found` inside the container while the host
   was green.

The repair does **not** require deleting volumes (the workspace guard blocks
that, correctly — `construct-o-genie_pgdata` holds the local database). Install
in place instead:

```
docker compose exec -e CI=true api sh -c   'cd /app && pnpm install --frozen-lockfile --ignore-scripts --config.confirmModulesPurge=false'
docker compose restart api      # the reinstall kills the running tsx watch
```

`CI=true` and `--config.confirmModulesPurge=false` are both needed: pnpm
otherwise prompts "The modules directories will be removed and reinstalled from
scratch. Proceed?" and hangs on a non-interactive exec.

Verified after that repair — all five turbo tasks succeed in the container:

```
@cog/contracts   29 passed
@cog/money       49 passed
@cog/service-kit 11 passed
Tasks: 5 successful, 5 total
```

---

## 3b. Nothing exercised the four compose fixes — CLOSED 2026-09-06

Defects 3, 4, 12 and 13 were all compose failures and all four are marked
fixed. **No step in the gate started the stack**, so the only way to learn one
had regressed was for somebody to try. That is the same shape as a lint rule
that is configured and does not fire.

`scripts/compose-check.mjs` now runs as a `slow` step in `pnpm verify`: it
recreates the containers, applies migrations, and asserts `/healthz` and
`/readyz` both answer — `/readyz` being the one that checks `app_runtime` is
neither superuser nor `BYPASSRLS`, the condition under which every RLS policy in
the system is inert. Volumes are deliberately left alone: removing them destroys
somebody's local database, which the workspace guard blocks and CLAUDE.md says
to ask about first.

Two real failures were found and fixed while writing it, both in the check
rather than in the stack:

```
Bind for 0.0.0.0:9000 failed: port is already allocated
```

An unrelated container on this machine held 9000. Published ports are now probed
and moved, which the compose file already supported via `${MINIO_PORT:-9000}`.
The first probe used `net.createServer().listen()` and reported 9000 free —
Docker Desktop's Windows port proxy accepts the second bind — so the probe now
asks `docker ps` instead. The second bug was that probe handing MinIO and its
console the same moved port, because each lookup did not claim what it returned.

Measured, after both fixes:

```
  published ports moved (something else holds the defaults): MINIO_PORT=9002 MINIO_CONSOLE_PORT=9003
  containers: api, minio, pgbouncer, postgres
  applying migrations
  compose: up, migrated, healthy and ready
```

---

## 5. pnpm workspace links can become un-traversable on Windows — and turbo caches over it

**Found 2026-09-04.** A `pnpm install` run from Git Bash created workspace links
that Node could not traverse:

```
$ node -e "require('fs').lstatSync('services/projects/node_modules/@cog/money')"
Error: EACCES: permission denied, lstat '...\@cog\money'

$ pnpm --filter @cog/projects test
Error: Cannot find package '@cog/money'
Test Files  4 failed | 1 passed
```

pnpm normally creates **junctions** on Windows precisely because Node cannot
follow the other kind without elevated privileges. Installing from a POSIX shell
produced the wrong kind, and a second `pnpm install` then failed on its own
`.ignored_*` leftovers.

**The dangerous part was not the broken link — it was that `pnpm test` reported
EXIT=0 while four test files were failing.** Turbo replayed a cached success for
packages whose inputs had not changed, so the gate was green on results from
before the breakage. A cached pass is a statement about the past.

**Fix:** remove every per-package `node_modules` and reinstall **from
PowerShell**, not from Git Bash:

```
Get-ChildItem packages,services,apps -Directory | ForEach-Object {
  cmd /c rmdir /s /q "$($_.FullName)
ode_modules" }
pnpm install
```

**Standing rule: verify with `pnpm turbo run test --force` before reporting a
result.** The cache is right about what it saw; it is not evidence about what
the tree does now.

---

## 6. The D8 drift checks named their schemas literally, and stopped covering new ones

**Found 2026-09-04.** M1/D8's guarantee is that *adding an unprotected table
fails CI* — deliberately not per-table assertions, because "those pass happily
when someone adds a **new** table with no policy".

The implementation named the schemas literally:

```sql
WHERE n.nspname IN ('tenancy','identity','finance')
```

So the same argument it was written to defeat applied one level up. `workflow`
arrived in M4 with three tables, `procurement` in M5 with two, and **neither
schema was ever examined** — by the RLS check, the FORCE check, the canonical-
predicate check, or the no-float check. Five tables sat outside a control that
reported green the entire time.

They turned out to be correct when finally checked, which is luck rather than
evidence, and is exactly how this class of defect survives: the check is green,
so nobody looks, so the day one is wrong nothing says so.

**Fix applied.** The schema set is discovered — every namespace that is not
`pg_*`, `information_schema`, `public` or `migrations`. Two tests keep it
honest: one asserts all five service schemas are discovered (so the set cannot
silently narrow again), and one plants a policy-less table in `procurement` and
asserts the drift query names it.

```
$ pnpm --filter @cog/tenancy test:isolation
  Tests  20 passed (20)      # was 18, over three fewer schemas
```

---

## 7. The gate was a prose checklist, so it could be partially run — and was

**Found 2026-09-04**, by the user, from my own report.

`.claude/commands/verify.md` listed five numbered steps ending at `pnpm test`.
It never named `pnpm test:isolation`. And `pnpm test` is `turbo run test`, where
`services/host`'s `test` script is `vitest run --project unit` — so **the
per-route tenant-isolation tests were never executed by anything the gate
named**, even though they existed and passed.

That is worse than a missing test. The per-route negative test — "tenant A
cannot read tenant B *through this route*" — was the entire point of the step-4
gate, and four of the five services were signed off without it running.

A second defect compounded it: **there were two copies of `verify.md`**, one at
the workspace root and one in `construct-o-genie/.claude/`, and they had already
drifted. The root copy still claimed "`pnpm lint` cannot parse TypeScript at
all", which stopped being true when defect 1 was fixed.

**Fix applied.** The gate is now a script, `scripts/verify.mjs`, run as
`pnpm verify`:

- runs lint, typecheck, build, test **and test:isolation**;
- continues past a failure, so the summary says how much is red rather than only
  what is red first;
- `--force` on every turbo step, because a cached pass is a statement about the
  past (defect 5);
- `pnpm verify:fast` skips build and isolation for the iteration loop and
  **prints that it is not a full gate**, so it cannot be mistaken for one.

Both copies of `verify.md` now point at it and are byte-identical.

```
$ pnpm verify
  lint             PASS     EXIT=0
  typecheck        PASS     EXIT=0
  build            PASS     EXIT=0
  test             PASS     EXIT=0
  test:isolation   PASS     EXIT=0
  full gate green
```

**A checklist cannot fail; a script can.** That is the whole of the fix.

---

## 8. ~~The isolation suite tests the built package, so a source edit does not change it~~ FIXED 2026-09-06

**Found 2026-09-04**, while checking that a new test could actually fail.

`services/host/tests/isolation/` imports services by package name
(`@cog/procurement`, `@cog/workflow`), which resolves to each package's **`dist/`**,
not its `src/`. So a change to a service's source has no effect on the isolation
suite until that package is rebuilt.

Measured. A new test asserted that `previewNumber`'s no-row fallback matches the
column defaults in migration `0021`. To confirm the test could fail, the
fallback prefix was changed from `'PO'` to `'XX'` in
`services/procurement/src/application/number-series.ts`:

```
# edit src only
pnpm --filter @cog/api exec vitest run --project isolation
      Tests  58 passed (58)          ← still green, with a deliberately wrong value

# same edit, after pnpm --filter @cog/procurement build
      × the no-row fallback matches the column defaults it stands in for
      → expected 'XX' to be 'PO'
```

**Why it matters.** `pnpm verify` runs `build` before `test:isolation`, so the
gate is correct and this is not a hole in it. The trap is the *iteration* loop:
running the isolation suite directly after editing a service — the obvious thing
to do while fixing a failure — tests the previous build. A fix appears not to
work, or a broken change appears to pass, and neither result means what it looks
like.

It is also how a falsification check silently becomes worthless. A test that is
verified to fail against a stale artifact has been verified against nothing.

**Working practice:** rebuild the package you edited before running the
isolation suite directly, or run `node scripts/verify.mjs`, which sequences it
correctly. `pnpm --filter <pkg> test` (the unit suites) reads source through
vitest's resolver and does not have this property — which is what makes the
inconsistency easy to miss.

**FIXED 2026-09-06.** `services/host/vitest.config.ts` now carries a
`resolve.alias` mapping every workspace package to its `src/index.ts`. The
aliases are DISCOVERED by scanning `services/` and `packages/` rather than
listed, because a literal list would reproduce defect 6 — the D8 drift checks
named their schemas literally and silently stopped covering new ones — and the
config throws if discovery finds fewer than ten packages, so a moved directory
fails loudly instead of falling back to `dist/`.

Proved rather than asserted. With `AND c.status = 'active'` changed to
`'DELIBERATELY-BROKEN'` in `services/procurement/src/application/rate-contracts.ts`
and **no rebuild**:

```
$ pnpm --filter @cog/api exec vitest run --project isolation -t "THE CHECK FIRES WITHOUT"
  × THE CHECK FIRES WITHOUT ANYBODY ATTACHING A CONTRACT 193ms
  AssertionError: a line priced above contract was not flagged: expected undefined to be defined
  Tests  1 failed | 394 skipped (395)
```

Before the fix the same edit left the suite green, because the import resolved
to the built copy. Restored, the test passes again.

*Original note, kept for the reasoning:* **Not fixed.** The clean fix is for the
isolation suite to resolve services to
source, but that would diverge the suite from what actually ships, and the
suite's whole value is testing the wiring rather than the units.

---

## 9. ~~The migration prefix allocation is documentation nothing reads~~ CLOSED 2026-09-06

**Found 2026-09-04**, three migrations after it started drifting.

`docs/plans/M6.md` allocates migration prefixes to services in blocks, because
prefixes are global and a collision is a hard failure. `0019`–`0022` were
allocated to `siteops`. `0020` and `0021` were then written in `procurement`
and `0022` in `projects`, and nothing objected.

Both existing checks pass, because neither is checking this:

- `scripts/migration-plan.mjs` throws on a **duplicate** prefix.
- `services/host/tests/migration-order.test.ts` asserts the sequence is
  **strictly increasing**.

Monotonic and unique, and in the wrong service. The allocation table is the
only statement of ownership and it is prose.

**Consequence.** It is not a data-integrity bug — a prefix is an ordering, not
an address — but the table is what stops two sessions working in different
services from claiming the same number, and this workspace runs concurrent
sessions by design. Its value is entirely in being true.

**CLOSED BY ABANDONMENT, 2026-09-06.** The allocation table in
`docs/plans/M6.md` is marked abandoned and kept only as history. The rule is now
"take the next free number", and the invariant that actually matters — no two
migrations claiming one prefix — is enforced by `scripts/migration-plan.mjs`,
which throws and names both offenders, plus `migration-order.test.ts`. There was
nothing left to enforce that code did not already enforce better, and a second
place to be wrong had been wrong twice.

*Original note, kept for the reasoning:* **Fixed in the document, not in the
tooling.** The table now records what was
taken and re-allocates `siteops` to `0040`–`0049`. The check that would
actually hold — the migration test parsing the allocation table and asserting
each file sits in its owner block — is not written, because the table would
have to become machine-readable first and that is a bigger change than the
defect warrants today.

---
## 10. A test writes a fixture into a package `src/`, and a killed run leaves the workspace unbuildable

**Found 2026-09-04**, after three consecutive `pnpm verify` failures with no
code change between them.

`services/host/tests/boundary.test.ts` proves the import-boundary rule fires by
writing a deliberate violation to
`packages/service-kit/src/__boundary_probe.ts`, running eslint, and deleting it
in `afterEach`. The test is right to exist — a configured rule is not an
enforced rule (M1/D8).

**`afterEach` does not run when the process is killed.** The probe imports
`services/tenancy/src/index.js`, so a leftover copy pulls that entire service
into `service-kit`'s compilation:

```
src/__boundary_probe.ts(2,34): error TS6059: File '…/services/tenancy/src/index.ts'
  is not under 'rootDir' '…/packages/service-kit/src'.
```

tsc then emits service files into `packages/service-kit/dist/`, and every
later build fails on the wreckage:

```
error TS5055: Cannot write file '…/dist/health.d.ts' because it would overwrite input file.
  (and six more)
```

**The failure outlives the cause, and points somewhere else.** `TS5055` in
`health.d.ts` says nothing about a boundary test. Worse, `turbo.json` declares
`outputs: ["dist/**"]` for `build`, so **turbo caches the broken `dist/` and
restores it** — deleting `dist` by hand does not help, because the next task
restores the cached copy.

Measured: one interrupted run, then three failed gates. The first was blamed on
a genuine test failure, the second on concurrent `tsc` processes; neither was
the cause.

**Fixed 2026-09-04** by removing the probe in `beforeEach` as well as
`afterEach`, so a stale copy from a killed run is cleared before anything reads
it. The suite is now self-healing rather than merely tidy.

### It also writes one service's compiled output into another service's source

Because `services/tenancy/src/**` is outside `service-kit`'s `rootDir`, tsc
cannot place its output under `outDir` and emits it **next to the sources**:

```
services/tenancy/src/index.js        services/tenancy/src/index.d.ts
services/tenancy/src/api/routes.js   services/tenancy/src/api/routes.d.ts
services/tenancy/src/domain/connector-key.js   (+ .map for each — 12 files)
```

`services/host/tests/no-build-output-in-src.test.ts` catches exactly this, and
did — but only after the build had been fixed, because the earlier failures
masked it. **This is the second time these twelve files have appeared**; they
were found and removed once before and the cause was never identified.

It is identified now: it is this probe, and it is why the `beforeEach` cleanup
matters more than tidiness.

**Still true and worth knowing:** a test fixture written inside a compiled
package's `src/` is a landmine whatever the cleanup. The durable fix is to
write it somewhere no `tsconfig` includes, which is a larger change than the
defect warrants today — the probe has to live where the boundary rule applies,
and that is the point of it.

---
## 12. `docker compose up` deadlocked: the migrate step waited for the API that waited for it

**Found 2026-09-05**, by settling a contradiction rather than by hitting a bug.
`CLAUDE.md` said compose "brings up nothing" and named defects 3 and 4; this
file marked both **FIXED 2026-09-03**. Both could not be true, and the previous
session believed `CLAUDE.md` — so it proved the demo seed against a hand-built
stack and left the supported environment unexercised for two days, for no reason
that was ever established.

Defects 3 and 4 really are fixed. Measured from a clean `docker compose down`:

```
$ docker compose up -d --build
EXIT=1
 Container construct-o-genie-migrate-1  Created      ← every image built
 Container construct-o-genie-api-1      Created
 Container construct-o-genie-web-1      Created
 ...
 Error response from daemon: ... Bind for 0.0.0.0:9000 failed: port is already allocated
 service "migrate" didn't complete successfully: exit 1
```

Every image built, including the worker — so the `ca-certificates` fix (defect
3) holds. What remained were **three separate faults**, none of them defect 3 or
4, and each of which reads as "compose is broken":

### 12a. The deadlock — the real one

```
$ docker compose logs migrate
applied 0061_lead_contact_designation.sql
migrations: applied 25
> @cog/tenancy@0.0.0 seed
Could not reach http://localhost:4000. Start the API first — this script now
calls the product rather than writing to the database.
TypeError: fetch failed
```

`migrate`'s command was `pnpm migrate && pnpm --filter @cog/tenancy seed`. The
tenancy seed had since been rewritten to provision **through the product over
HTTP** (M6: "if a development script and the product do provisioning
differently, the one exercised daily stays correct, and it is not the
product's"). So the seed needed the API — and `api` declares
`migrate: { condition: service_completed_successfully }`.

migrate waited for an API that was waiting for migrate. `docker compose up`
exited 1 with every container created and nothing serving, which is *visually
identical* to defect 3 and is why the stale `CLAUDE.md` line looked confirmed.

**Fixed.** `migrate` runs `pnpm migrate` and nothing else. Seeding is a `seed`
service behind the `seed` profile, `depends_on: api: service_healthy`, reaching
the API by service name (`http://api:4000` — `localhost` inside that container
was always the container itself). `api` gained a `/healthz` healthcheck so
anything can wait for it; the `dev` target had none, though the `runtime` stage
in the same Dockerfile did.

### 12b. Hard-coded host ports

`Bind for 0.0.0.0:9000 failed: port is already allocated` — an unrelated
project's MinIO. Compose then creates every container and starts none of the
ones that matter. Every published port is now `${VAR:-default}` with the
defaults unchanged. Container-to-container addressing is untouched: services
still reach each other on the internal network by name and real port.

### 12c. The API served 404 to its own seed

`Provisioning aarambh-interiors failed: 404`. The `api` service set no
`AUTH_PROVIDER` (so the default `verifyNobody` made every request anonymous) and
no `PLATFORM_CONSOLE` (so `/platform/v1` was never mounted). The seed provisions
against a route that does not exist and reports a bare `404 Not Found`, which
reads like a broken script rather than a deliberately absent surface. Both are
now set in the compose environment, with a comment saying they are local-only
and that `verifyLocalBearer` calls `assertNotProduction`.

### After

```
$ MINIO_PORT=9010 docker compose up -d
EXIT=0
SERVICE     STATE     STATUS
api         running   Up (healthy)
migrate     exited    Exited (0)
minio       running   Up (healthy)
pgbouncer   running   Up
postgres    running   Up (healthy)
web         running   Up
worker      running   Up

$ curl -s localhost:4000/healthz          {"ok":true}          (200)
$ curl -o /dev/null -w '%{http_code}' localhost:3000/   307    (auth redirect)

$ docker compose --profile seed run --rm seed
EXIT=0
created aarambh-interiors — first administrator priya@aarambh-interiors.test
created dvitiya-fitouts  — first administrator arjun@dvitiya-fitouts.test
  purchase orders: 18 (6 approved, 6 awaiting, 6 draft)
  purchase orders: 11 (4 approved, 3 awaiting, 4 draft)
```

Identical to the host path. **The supported environment now runs the product.**

### What this cost, and the rule that follows

A stale `CLAUDE.md` loads into every session on every turn and it changed a
session's behaviour — it is a defect with a blast radius, not a tidiness
problem. `CLAUDE.md`'s Traps section now says explicitly that **this file is the
record and wins where the two disagree**, and points here instead of restating
findings that go stale.

---

## 13. The node_modules volumes were per-service, so the same staleness bug had three repairs

**Found 2026-09-05.** Defect 4's fix gave each workspace package its own named
volume, and defect 4's own text records the maintenance cost: a named volume is
initialised from the image **once** and never refreshed.

It had drifted three ways at once:

- **Stale.** `migrate` failed with `Cannot find package 'pg'` — plainly a root
  dependency. The documented in-place repair reported `+ pg 8.23.0`, confirming
  the volume predated it.
- **Incomplete.** `web` mounted only `web_node_modules` and `web_nm_web`, so the
  workspace packages it imports resolved through the bind mount to the Windows
  host, where their entries are absolute `/d/...` symlinks. `web` exited 1 with
  `Cannot find module '.../next/dist/bin/next'`.
- **Triplicated.** api, migrate and worker each carried their own copy of the
  list, and a fourth was about to be written for the `seed` service.

**Fixed.** One `x-workspace-volumes` YAML anchor, one volume per workspace
package, shared by api, migrate, seed, worker and web. Adding a package is one
line in one place. The repair command lives at the top of `docker-compose.yml`,
next to the anchor, because that is where somebody hits the symptom.

The database name is overridable for the same reason the ports are:
`POSTGRES_DB=cog_e2e docker compose up -d` gives a disposable database in the
same server, so an end-to-end run never touches whatever a developer has in
`cog`. **pgbouncer resolves databases from its own config**, not from the
connection string, so it follows the same variable — pinning it to `cog` while
everything else pointed at `cog_e2e` produced `no such database: cog_e2e` for a
database that demonstrably existed.

---

## 14. A tenant provisioned before the role model existed is permanently bricked

**Found 2026-09-05**, while seeding a compose database whose two tenants dated
from 2026-09-03:

```
dvitiya-fitouts  | roles=0 | chains=0 | costing=0 | created=2026-09-03
aarambh-interiors | roles=0 | chains=0 | costing=0 | created=2026-09-03
```

Roles, chains and the costing policy are seeded **in the transaction that
creates the tenant**. Every organisation created before migration `0024` has
none of them, and there was no way to fix that from anywhere.

The consequence is not cosmetic: `loadEntitlements` returns nothing, so every
approval refuses; the settings screen that would grant a role is itself behind
`manage_settings`; and the organisation cannot repair itself from the inside. It
looks like an approval bug. The seed reported it as `0 approved` where a healthy
tenant reports `6 approved`, and nothing else said a word.

**Fixed.** `POST /platform/v1/tenants/:tenantId/role-model` on the platform
console re-runs the three seeders in a tenant context. Idempotent by
construction — all three already refuse to overwrite — so it needs no "has it
run?" flag, which is the usual way a backfill acquires a second source of truth.
It deliberately does **not** assign a role to anybody: handing an existing
principal `admin` from the platform console is a privilege grant made by whoever
ran a repair.

One trap inside the fix, worth recording because it is the second time this
shape has appeared: the route first resolved the tenant with
`SELECT id FROM tenancy.tenants WHERE id = $1` and answered **404 for both
tenants**. `tenancy.tenants` carries the same RESTRICTIVE policy as everything
else and the platform console runs with **no tenant context** — it is the
surface that exists above tenancies. The authorised path is
`tenancy.list_tenants(p_requested_by)`, a SECURITY DEFINER function that reads
`tenancy.tenant_directory` and checks the caller is a platform principal, making
existence and permission one question rather than two.

*(Those two particular tenants predate the directory as well, so they are
invisible to the console and were not repairable — they are artifacts of a seed
script that no longer exists. That is why the E2E work runs against a fresh
`cog_e2e` rather than against them.)*

---

## 11. Concurrent sessions make the gate flaky, and the boundary probe is why

**Found 2026-09-04**, one gate after defect 10 was fixed.

`pnpm verify` reported `lint FAIL EXIT=1` while `pnpm exec eslint .` run
immediately afterwards exited **0** with no findings. Nothing had changed in
between.

The cause is defect 10 seen from the other side. `boundary.test.ts` writes a
deliberate import violation to `packages/service-kit/src/__boundary_probe.ts`,
runs eslint, and deletes it. While that file exists — a window of a second or
two — **any other lint run in the same working tree sees it and fails**, which
is exactly what the probe is for.

CLAUDE.md already records that more than one Claude session runs in this
workspace at a time. Two sessions, one running its unit tests while the other
runs its gate, is enough.

**Not fixed, and probably not worth fixing.** The alternatives each cost more
than the flake: a lock file around lint serialises every session, and moving the
probe outside the workspace defeats it — the rule under test is *about* files
inside `packages/`.

**Working practice:** a lone `lint FAIL` with a green `eslint .` afterwards is
this, not a real finding. Re-run the gate. A genuine boundary violation fails
consistently and names the offending import.

---
## 15. The container stack could not start on a machine that had never started it

**Found 2026-09-06**, by the first run of `scripts/compose-check.mjs` phase 2.

`docker compose up` has worked on this machine for weeks. On an **empty
volume** it does not:

```
pgbouncer-1  WARNING server login failed: FATAL password authentication failed
             for user "app_runtime"
pgbouncer-1  LOG C-0x…: cog_fresh/app_runtime@… closing because: password
             authentication failed for user "app_runtime" (age=11s)

api /readyz  503 {"status":"degraded","checks":[{"name":"postgres","ok":false,
             "error":"password authentication failed for user \"app_runtime\""}]}
```

The cause is one line of asymmetry. Migration
`0001_roles_and_tenant_context.sql:24` creates the role:

```sql
CREATE ROLE app_runtime NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
```

**`NOLOGIN`, and with no password** — which is right, because a migration runs
in production and a production credential does not belong in a repository. But
`docker-compose.yml` connects the pooler as `app_runtime:runtime_local_dev`,
and nothing anywhere granted that role a login. The compose file even said so,
and named a step that does not exist:

```yaml
# Starts after migrate, because app_runtime has no login until the seed
# mints one.
```

`scripts/seed-demo.mjs` has never minted anything of the kind. The stack ran
only because somebody, once, ran `ALTER ROLE app_runtime LOGIN PASSWORD …` by
hand against their own `pgdata`, and that volume has carried the fix ever
since. Every check in the gate — including the compose check added the day
before — ran against that volume.

### Why nothing caught it

The same reason defect 6 keeps recurring: the check ran against the state that
already had the fix. `compose-check.mjs` recreated **containers** and left
`pgdata` alone, deliberately, because deleting somebody's local database is not
a thing a gate step may decide to do. So "the stack comes up" was measured
against a database set up by hand months earlier, and the setup steps that were
never written down were invisible by construction.

### Fixed

`docker/postgres-init/01-runtime-role.sql`, mounted read-only at
`/docker-entrypoint-initdb.d/`, which the postgres image runs **only when the
data directory is empty**. It creates `app_runtime` with `LOGIN`, the local dev
password, and the same `NOBYPASSRLS NOSUPERUSER` attributes 0001 uses.
Migration 0001 creates the role inside `IF NOT EXISTS`, finds this one, and
leaves it alone — 0001 remains the authority on every grant the role holds;
this file decides only that it can connect. An existing `pgdata` is untouched,
because init scripts do not run against a populated data directory.

### And the check that found it now asserts it stays found

`compose-check.mjs` phase 2 brings the same compose file up under a **different
compose project name**, so it gets its own `<project>_pgdata` and
`<project>_miniodata`, created empty seconds earlier, and removes the project
with its volumes afterwards. Compose namespaces volumes by project, so
`construct-o-genie_pgdata` is not in the set that command can reach — the
isolation is structural, not a rule the script follows carefully.

It also asserts that migrate printed `migrations: applied <n>` rather than
`already up to date`. Without that, the phase degrades into phase 1 the moment
a volume survives a killed run: every assertion would still pass and the
from-empty claim would be false. The first version of phase 2 had exactly that
hole — it brought `api` up alongside postgres, `api` depends on `migrate`
completing, so the real from-empty migration happened silently inside `up` and
the explicit run that was supposed to prove it reported `already up to date`.

Measured after the fix: `migrations: applied 60`, `/healthz` 200, `/readyz`
`{"status":"ok"}` against a volume that was empty a minute earlier.

## 16. The money guard was off for four domain files, and blind to a parenthesis

**Found 2026-09-06.** Two separate holes in the same rule, one of which had
never been suspected.

### 16a — a blanket exemption that outlived its reason

`eslint.config.mjs` exempted `'**/*-legacy.ts'` from `MONEY_ARITHMETIC`. That is
a rule about a **filename**: any file added later became exempt by being called
the right thing. It covered 431 lines across four domain files. It was created
so that ADR-0014 commit-1 ports could land verbatim; those ports landed.

Reproduction — remove the `ignores` line and lint the four files:

```
project-financials-legacy.ts  142:62  Money is divided only in packages/money
rate-analysis-legacy.ts       87:23   Money is multiplied only in packages/money
rate-analysis-legacy.ts       90:21   …
rate-analysis-legacy.ts       95:18   …
rate-analysis-legacy.ts       95:30   …
approval-legacy.ts            (nothing)
manpower-legacy.ts            (nothing)
```

**Two of the four had no money arithmetic at all** and were exempt for their
name alone. `approval-legacy.ts` moves an approval through stages by comparing
roles; `manpower-legacy.ts` counts people, and `parseInt` on a headcount is
DPR-01, not a money defect.

**Fixed.** The glob is now two named paths — `rate-analysis-legacy.ts` and
`project-financials-legacy.ts` — each with the reason inline. Those two record
arithmetic defects that comparison tests assert against, and routing them
through `packages/money` would change the oracle values, which is ADR-0014
decision 5 exactly. The other two are under the guard, with a line at each file
head saying they were measured at zero violations. Both were verified by
planting a money division in each and watching lint fail.

### 16b — the selector only looked at direct children

The more serious half, and it was found by reading 16a's own output. Two
structurally identical float divisions of money, four lines apart in
`project-financials-legacy.ts`:

```js
142  row.plannedGMPct = projectValue ? (projectValue - bcs) / projectValue : 0;   // caught
144  row.actualGMPct  = inflow ? (inflow - outflow - tds) / inflow : 0;           // SILENT
```

The selectors ended `> Identifier[name=/…/]` — a **direct child** of the binary
expression. On line 144 the division's direct children are the parenthesised
subtraction and `inflow`; `tds` — a statutory head — is one level down, and
`inflow` is not a money-shaped name. Line 142 was caught only because
`projectValue` happens to be the right-hand operand. **One parenthesis defeated
the rule**, and it applied repo-wide, not to 431 lines.

**Fixed.** All three arithmetic families now match any descendant identifier.
Measured across the whole repo before the change: **zero** new violations, so it
cost nothing and closed a hole any parenthesis would have reopened. Verified by
planting line 144's exact shape in a non-exempt file: silent before, caught
after.

## 17. `pnpm typecheck` had never examined a test file

**Found 2026-09-06.** Thirteen `tsconfig.json` files set
`"include": ["src/**/*.ts"]`, so a gate step named `typecheck` had never looked
at ~1,000 tests across unit, isolation and design-system suites — nor at `e2e/`,
which belongs to no workspace member and so appeared in no `include` at all.

It cannot simply be widened. `build` and `typecheck` read the **same** config,
and it carries `rootDir: "./src"` because it emits to `dist/`:

```
$ # tests added to packages/money/tsconfig.json "include"
$ pnpm --filter @cog/money build
error TS6059: File '.../tests/format.test.ts' is not under rootDir '.../src'.
             'rootDir' is expected to contain all source files.
```

**Fixed** with a second config per package — `tsconfig.typecheck.json`, which
extends the build config, sets `noEmit` and widens `rootDir`, and covers `src/`
and `tests/` both. `typecheck` reads that one; `build` still reads the emitting
one. `e2e/` gets `tsconfig.e2e.json` at the root, run by the turbo root task
`//#typecheck:e2e` which `scripts/verify.mjs` now invokes alongside the
per-package task.

Turning it on surfaced **52 errors in 5 packages**, every one of them real:

| Count | What it was |
|---|---|
| 29 | request helpers declaring `Promise<Response>` while returning Hono's `Response \| Promise<Response>` |
| 14 | `await res.json()` read as if it were typed; it is `unknown` |
| 4 | money cast to a bare `bigint`, **unbranding it** — the one cast `Paise` exists to prevent |
| 2 | an `ApprovalStage` fixture missing `approvalCeilingPaise`, a field the type gained and the fixture never followed |
| 1 | a `pg.Pool` stub declaring one parameter while the code under test passes two — so `mock.calls[n][1]`, which the assertion was entirely about, was typed as not existing |
| 2 | index-signature access and a too-narrow cast |

### The six `@ts-expect-error` directives were inert, and all six turned out live

Nothing typechecked those files, so the directives suppressed nothing — they
read as deliberate and did nothing. `tsc` errors on an unnecessary
`@ts-expect-error` (TS2578), so turning typechecking on tested all six at once:
**zero were stale.** Two had a stated reason that had gone false — "host's
tsconfig covers src/ only" — and now say what is actually true, that `scripts/`
is in no `include`.

**Proof the step now fires**, which is the whole point:

```
$ printf 'const __planted: number = "a string";' >> services/projects/tests/rate-analysis.test.ts
$ pnpm exec turbo run typecheck --force --continue
@cog/projects:typecheck: tests/rate-analysis.test.ts(144,7):
    error TS2322: Type 'string' is not assignable to type 'number'.
 Tasks:    27 successful, 28 total
$ # removed
 Tasks:    28 successful, 28 total
```

## 18. `pnpm typecheck` had never examined a `.mjs` file

**Found 2026-09-06, fixed 2026-09-07.** Defect 17 brought tests into
typechecking. This is the same hole one file extension over, and it was named in
this file's own gate-coverage table before it was closed: **sixteen `.mjs` files
belonged to no workspace member's `include`**, so a step named `typecheck` had
never read the migration runner, the seed the browser suite asserts against, the
four `next.config.mjs`, `eslint.config.mjs`, or `verify.mjs` — the gate script
itself.

Reproduction, before the fix:

```
$ pnpm exec tsc -p tsconfig.scripts.json
162 errors
   97  TS7006  parameter implicitly has an 'any' type
   22  TS4111  property comes from an index signature
    9  TS7031  binding element implicitly has an 'any' type
    7  TS18048 possibly 'undefined'
   … 27 more across 8 codes
```

**Fixed** with `tsconfig.scripts.json` — `allowJs` **and `checkJs`**, which is
the part that matters: without `checkJs` TypeScript reads the files and reports
nothing, so the step would have gone green having checked nothing. It is run by
the turbo root task `//#typecheck:scripts`, which `scripts/verify.mjs` now
invokes alongside `typecheck` and `typecheck:e2e`.

All 162 were fixed by **annotating**, never by widening the config or adding a
suppression. There are no `@ts-ignore` and no `@ts-expect-error` in any `.mjs`.

Three of them were more than missing types:

| Where | What it actually was |
|---|---|
| `seed-demo.mjs` | `PROJECTS`, `TRADES` and `LOCATIONS` are heterogeneous array literals, so TypeScript widened them to `string \| number` and `string \| string[]`. `rupees * 100` and `clientName.split(' ')` were both errors against the *inferred* type. Naming the tuples (`[string, string, number][]`) fixed them and writes the shape down |
| `compose-check.mjs` | `fail()` ends in `process.exit(1)`, which nothing said. Every caller null-checked a value and then used it, and only `@returns {never}` makes that legal without a cast |
| `eslint.config.mjs` | TS2742 — the inferred type of the default export named a path inside `.pnpm/`. A `@type` annotation on `export default [...]` does **not** bind; the export has to go through a typed `const` |

The root was also missing `@types/pg` entirely, so every `.mjs` importing `pg`
read as `any`.

**Proof the step fires**, which is the whole point:

```
$ printf '\n/** @type {number} */\nconst __planted = "a string";\n' >> scripts/migrate.mjs
$ pnpm exec turbo run typecheck typecheck:e2e typecheck:scripts --force
//:typecheck:scripts: scripts/migrate.mjs(72,7):
    error TS2322: Type 'string' is not assignable to type 'number'.
 Tasks:    1 successful, 4 total
$ # removed
 Tasks:    30 successful, 30 total
```

## 19. Windows Smart App Control blocks `turbo.exe`, and the gate could not start

**Found 2026-09-13, worked around the same day.** `pnpm verify` had run green
at `e3cb34d` the evening before. The next morning its first turbo step died
before running anything:

```
$ pnpm verify:fast
──── typecheck ────
node:internal/child_process:421
Error: spawn UNKNOWN
  code: 'UNKNOWN',
  syscall: 'spawn'

$ pnpm exec turbo --version
Error: spawn UNKNOWN
```

`spawn UNKNOWN` is Node's rendering of a `CreateProcess` refusal it has no
errno for. PowerShell says what it is:

```
PS> & node_modules\.pnpm\@turbo+windows-64@2.10.12\node_modules\@turbo\windows-64\bin\turbo.exe --version
Program 'turbo.exe' failed to run: An Application Control policy has blocked this file

PS> Get-ItemProperty HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy
VerifiedAndReputablePolicyState : 1        # Smart App Control: ON

PS> (Get-AuthenticodeSignature ...\turbo.exe).Status
NotSigned
```

The Code Integrity log (`Microsoft-Windows-CodeIntegrity/Operational`, event
3077) shows the policy enforcing since 2026-09-09 — 198 blocks of a Python
interpreter that day, a `mypy.exe` on the 11th — and **its first block of
`turbo.exe` at 00:25 on the 13th**, the moment the gate ran. The binary itself
is unchanged since 2026-09-03 (SHA-256 `666cc48a…4ccaa9`). Smart App Control
decides by cloud reputation, and a decision can change without the file
changing; the same policy blocked `chrome-headless-shell.exe` once on the 11th
and has let Playwright's Chromium run every day since.

**Why it matters for this file:** three of the eight gate steps (`typecheck`,
`build`, `test`) and the isolation runner all go through turbo, so a machine in
this state cannot run the gate at all — not red, not green, nothing. The build
in `apps/web` (`next build`, no turbo) succeeded on the same machine at the
same time, which is how a screen could have shipped with the gate never having
run.

**Worked around, not fixed.** `scripts/verify.mjs` and
`scripts/test-isolation.mjs` now probe `pnpm exec turbo --version` once, and
when it cannot spawn they run the same tasks through `pnpm -r run` — the
workspace in dependency order, no cache, one package at a time. The summary
table marks each such step `(pnpm -r, no turbo)` and a footer names this
entry, so a green table never hides which path ran. Allowing the binary — or
turning Smart App Control off, which Windows does not let you undo — is a
decision about the machine and is not taken here.

**Not fixed** because there is nothing in the repository to fix: the binary is
what the `turbo` package publishes, and pinning a signed alternative does not
exist.

## 20. Smart App Control blocks Next's native compiler, and `next build` cannot run

**Found 2026-09-15, worked around the same day.** The gate had built all four
apps natively on this machine at `c6c49a6` the day before. At `9db88ea` its
`build` step failed in `@cog/admin`, and the app fails the same way built alone:

```
$ pnpm --filter @cog/admin run build
⚠ Attempted to load @next/swc-win32-x64-msvc, but an error occurred:
  An Application Control policy has blocked this file.
  \\?\D:\…\node_modules\.pnpm\@next+swc-win32-x64-msvc@16.3.4\…\next-swc.win32-x64-msvc.node
> Build error occurred
Error: Turbopack is not supported on this platform (win32/x64) because native
bindings are not available. Only WebAssembly (WASM) bindings were loaded, and
Turbopack requires native bindings.
```

The same policy as 19, deciding the same way: the `.node` file was installed on
2026-09-04 and has not changed, and it loaded the day before. `next build
--webpack` runs on the WebAssembly compiler Next falls back to, and builds.

**Worked around, not fixed.** `scripts/verify.mjs` asks Node, once, to load
the binding the way Next does; when the policy refuses it, `build` builds every
package and service as before and the four apps with `next build --webpack`.
The summary table marks the step `(apps: webpack, defect 20)` and a footer names
this entry.

**What the workaround does not reach:** Turbopack's production bundling of the
apps on this machine. It still type-checks, compiles and prerenders every page.
The dev servers the browser suite renders run Turbopack inside the Linux
containers, where the policy does not apply, and so does a build in any Linux
image.

## 21. A cold dev server loses the pages under a page it was asked for first

**Found 2026-09-15, worked around the same day.** The gate at `77e5c78` failed
`test:e2e` before a browser opened:

```
client-portal (no API) answered 404 for 3 page(s) that exist
  (/projects/<id>/billing, /projects/<id>/documents, /projects/<id>/variations) — restarting it once
client-portal (no API) still answers 404 for pages that exist: …
```

The same three pages had answered 404 in three earlier gate logs, and the
check's own comment (1b in `scripts/e2e.mjs`) records a plain restart, a
cache-less start and a start with no `.next/dev` each clearing it for a while.
None of those was the cause. Measured on fresh copies of the client portal,
each on an empty anonymous `.next` volume, `next dev --turbopack` 16.3.4:

| First requests | `/projects/<id>` | its three pages |
|---|---|---|
| `/projects/<id>` first, API unreachable | 307 | 404, and 404 again after `docker restart` |
| `/projects/<id>` first, API reachable | 307 | 404 |
| `/projects/<id>` first, then 60 s idle | 307 | 404 |
| the three pages first, API unreachable | 307 | 307 |

The files are present inside the container every time (`find` lists all four
`page.tsx`). What decides it is which page the server compiles first: asked
for a page before the pages beneath it, it serves that page and 404s the rest
until its `.next/dev` is gone. The page check walked each app's tree parent
first, so the check itself was the request that lost them; whether it did on a
given run depended on whether `.next/dev` already held the pages.

**Worked around, not fixed.** The check requests every app's pages deepest
first, so a page is never compiled before the pages beneath it. A page that
really has no route still answers 404 and still fails the step.

**A readiness probe is a request like any other**, and that took two more gate
runs to see: the check asked deepest first, but the probe that waits for the
server to answer had already asked for `/`, the parent of everything the app
serves — and the client portal lost the three pages again, cleared by the
restart in one run and not in the next.

Pointing the probe at the deepest page instead made it worse, and that is the
second half of this defect. A request in the window before the route tree is
built is answered 404, and that page stays 404: measured on a fresh copy,
`/projects/<id>/billing` answered 404 two seconds after the port opened and was
still 404 after two minutes of polling. `/sign-in` asked for in the same window
answered 200, and every deeper page then served.

So readiness asks for `/sign-in` — a leaf, outside the signed-in tree, present
in all four apps — and **a 404 does not count as ready**. The page check then
walks each app deepest first. Measured on fresh copies: probe `/sign-in` from
the instant the port opens, then all five client-portal pages answer 307.

**And the copy's restart was not a restart of the thing that lost the page.**
The gate at `89741c8` (2026-09-19) failed the same way — the client portal's
no-API copy 404'd the three pages, was restarted once, and 404'd them again —
with the probe on `/sign-in` and the walk deepest first. The real apps restart
with `.next/dev` removed; a no-API copy restarted with `docker restart`, which
keeps the anonymous volume and the `.next/dev` in it, the very thing this
defect says has to go.

**It is a lottery, and a warm `.next` is the only sure thing.** Measured
2026-09-20 on cold copies of the client portal (fresh volume each time, API
unreachable, the three pages then the parent, then `/sign-in`, then `/`):

| First requests after the port opened | Starts | Lost a page |
|---|---|---|
| 1 s idle, the three children one after another | 6 | 1 (the third) |
| 5 s idle, one page every 4 s | 6 | 2 (the third) |
| 8 s idle, one page every 8 s | 6 | 5 (all three) |
| 5 s idle, the parent first, then the children | 6 | 4 (all three) |
| 5 s idle, the three children at once | 6 | 4 (all three) |
| 20 or 30 s idle, then the children | 3 | 2 |

A lost page stayed 404 for 80 s of polling and after the parent was served. A
longer idle before the first request loses MORE, so the fifteen-second grace
added the day before was withdrawn. What never lost a page was a copy started
on a `.next` that already held the pages: the real apps, whose `.next` is on
the host, have not lost one since. So a no-API copy now keeps its own `.next`
on the host too (`.e2e/next-<app>`, ignored), warm from one gate to the next;
a copy that lost a page has that directory removed and starts cold again, up to
three times, and only a fourth loss fails the step (`servesEveryPage` and
`startDead` in `scripts/e2e.mjs`).

**What the workaround does not reach:** a person running `next dev` who opens a
project before its tabs. That is the dev server only — `next build` lists every
route (the gate's `build` step printed all seven client-portal routes) — and it
has not been reported upstream.

## 22. The gate at HEAD failed itself: the warm build output was linted, and the boundary probe timed out while planted

**Found 2026-09-20, fixed the same day.** The full gate at `d50ba23` — the
first run after the e2e runner started keeping the no-API copies' Turbopack
output on the host (`.e2e/next-<app>/`, defect 21's remedy) — reported:

```
lint             FAIL     EXIT=1
test             FAIL     EXIT=1
```

Two causes, one commit apart from the other.

**`lint` walked `.e2e/`.** `eslint.config.mjs` ignored `dist/`, `.next/`,
`.turbo/` and `coverage/`, and the new directory was none of them, so
`eslint .` read Turbopack's server chunks and failed on rules they name
(`Definition for rule 'react-hooks/rules-of-hooks' was not found`, 40 errors
across a dozen generated files). `.gitignore` had `.e2e/`; the lint ignore
list did not. Fixed: `**/.e2e/**` is ignored, and `scripts/design-gates.mjs`
skips the directory in its walk for the same reason.

**The boundary probe timed out while planted.** `services/host/tests/
boundary.test.ts` writes a deliberate violation, runs `eslint .`, and allowed
each lint 120 s. Alone, a lint of this repo takes about 90 s on this host;
under the gate, with turbo running the other sixteen members' suites beside it
at concurrency 2, it took **205 s**. The first test timed out with the probe
still on disk; `afterEach` then removed it, and the second test's lint —
another 200 s — failed on the `.e2e/` chunks above, reporting only `expected
1 to be +0`. Fixed: each lint is allowed ten minutes (`LINT_MS`), the ceiling
below which no honest lint of this repo has ever finished, and the clean-repo
assertion prints the tail of lint's output, so the next such failure names its
file.

**The lesson is the one at the top of this file.** A gate step that
introduces a directory must add it to every list that walks the tree — lint,
the design gate, the route walk — in the same commit, or the next gate is red
for a reason that has nothing to do with the work.

## 23. React's development-only performance tracks throw on a clock ahead of the browser's

**Found 2026-09-20, worked around the same day.** In the same gate, five of
the seventy `states.spec.ts` not-found tests failed with a page error the
suite collects as a crash:

```
pageerror: Failed to execute 'measure' on 'Performance':
  '​ProjectLayout' cannot have a negative time stamp.
```

The message names a server component, and it comes from React's development
build: since 19.2 it draws a "performance track" for each server component's
render by calling `performance.measure` with start and end times the server
sent. The dev server runs in the compose VM and the browser on the host; when
the VM's clock is a little ahead, the start lands in the browser's future and
Chromium refuses the measure. The page rendered correctly in every case — the
screenshot shows the not-found state — and the next full run reported none.
The 502 tests that passed and the five that failed differ only in when the
clocks drifted.

**Worked around, not fixed:** both suites' `watch()` leave out exactly this
message (`DEV_CLOCK_SKEW` in `e2e/states.spec.ts`, the same regex in
`e2e/screens.spec.ts`) and keep every other page error. The clocks are Docker
Desktop's to keep in step; the instrumentation is React's; neither is this
repository's to fix. A production build carries no such measure.

In the same run `screens.spec.ts › admin /sign-in renders` failed on
`waitForLoadState('networkidle')` with the page fully rendered (the screenshot
shows the form): a dev server keeps a socket open and a busy host can hold a
request past the wait. Both suites' `settled()` now try for idle for thirty
seconds and then judge the page on what it rendered — the assertions that
follow are about the content, and a page that never went idle was failing on
the wait, never on the content.

## 24. Two host tests refused a staff login for the wrong reason, and passed

**Found 2026-09-21, fixed the same day.** `services/host/tests/isolation/
tenant-routes.test.ts › optional modules — the switch, not the role model ›
a staff principal without manage_settings is refused` inserted its role-less
staff principal straight into `identity.principals` and never registered the
credential (`identity.register_principal`). The resolver therefore answered
`403 TENANT_NOT_RESOLVED` — "no organisation could be determined" — and the
test, which asserts only the status, read that as the authorisation decision
it was written to prove. The same shape was about to be copied for the
terminology routes, where a **read** by that principal was expected to be
200 and came back 403, which is how it was noticed.

Both fixtures now register the principal inside the tenant transaction. The
modules test still passes, this time because `mayManage` said no. A test that
asserts a status alone proves the status; when the refusal has a code, assert
the code.

## 25. The browser gates changed shape on 2026-09-21

What `test:e2e` reaches changed with the redesign's last layer, so the table
above is amended by this entry:

- `e2e/design-gates.spec.ts` measures alignment at **four** widths — 400, 768,
  1280, 1440 — in both themes; the count rule reads `table.tbl` only (the old
  `table.data` is gone from every page), and a list's count may be a
  `.pager .count` line or a card head that opens with the figure.
- `e2e/shell-gates.spec.ts` is new: the bar and the sidebar measured at the
  four widths (48px bar; 200px sidebar, 48px rail, a 200px sheet at a phone);
  the island rule (every element on the bar paints the same in both themes);
  both trees for the admin, procurement and finance logins compared to
  `navFor` over each login's own entitlements; reduced motion (no running
  animation but a fade, a breath or a shimmer, no timed transition on a
  transform, a width or a height); and no internal marker inside a rendered
  frame. Each gate carries a test that plants the violation and asserts the
  gate reports it and only it.
- `e2e/screens.spec.ts` counts a list's rows (`.list li`) and a hub's cards
  (`.hub-card`) as content, beside a table's rows, an empty state and a form.
- `e2e/reports.spec.ts` is new: the Reports Center's nine, each run.
- `e2e/shell.spec.ts` gained Terminology (a word chosen through the API reaches
  the sidebar, the list title, its column, the quick-create and the search's
  scope; a word outside its pair is refused) and Today › Getting started; the
  WCAG single-key describe restores the switch in `afterEach`, because a failure
  mid-test had left it off for every later "/" test in the run.
- The unreachable half of `states.spec.ts` still needs the no-API copies that
  only `scripts/e2e.mjs` starts: run directly against the compose stack, those
  75 tests fail by design, and the count is the way to tell them from a fault.

## 26. The layout detector replaced the three alignment rules on 2026-09-22

The three rules `e2e/design-gates.spec.ts` measured — buttons in a group
share a height, a numeric column shares a right edge, the document does not
scroll sideways — passed on a product that was not usable at a laptop width.
`document.scrollWidth` never moves when a 48px flex row's children spill and
the next box clips them; a page whose left edge differs from its neighbour's
is not a scroll; a popover past the window is not a scroll either. So:

- `e2e/layout.ts` measures eleven rules inside the page (`RULES` names them):
  horizontal overflow of the document AND of every element whose scroll width
  exceeds its client width under `overflow: visible` or `clip`; a visible box
  past the window, and a popover inside a closed `details` where it would
  open (Chromium lays the box out while `content-visibility` hides it);
  in-flow siblings of one flex or grid parent overlapping by more than 2px;
  clipped content with no ellipsis; a box holding more than its height; a tap
  target under 40px at 768 and under 44 at 400 (a checkbox's target is its
  label or its cell; an inline link is its sentence's); the focus ring, drawn
  at the outline's width and offset, on screen and unclipped on a tab through
  every screen at 1280 and 400; each bar popover the top element at its own
  centre and inside the window; sticky and fixed boxes not overlapping once
  scrolled; and the content's left edge and width against the ladder's
  arithmetic per app and width. Rule j (a scrolling box with a max-height
  contains its overscroll) is static: `scripts/design-gates.mjs traps`.
- The matrix: every screen at 400 · 640 · 768 · 1024 · 1280 · 1366 · 1440 by
  900 and at 1024 and 1366 by 600, both themes, scrolled to the middle; the
  three list screens again with a record open beside the list; the bar on
  Today, on a list with its pane, and on each portal's first screen with every
  popover opened in turn. One page load per screen; the widths and the theme
  are set on it in place.
- `e2e/alignment-baseline.json` holds the faults the product had when the
  detector was written, per screen, width, theme, state and rule. A count
  within it is reported, not failed; a new one fails. It was written with
  `LAYOUT_BASELINE=write` and merged by `scripts/layout-baseline.mjs`, and it
  is committed before any fix so its diff shows which fault each fix closed;
  it goes when it is empty.
- Each rule was proven on a plant in the same file (a 1300px child, two
  siblings pulled over each other, a label clipped without an ellipsis, an
  18px box with three lines, a 24px button, two sticky boxes at one top, a
  moved page padding, a button flush inside `overflow: hidden`, a fixed lid
  over an open menu; the static gate on a `.plant-trap`), each reporting its
  plant and nothing else.
- What it does not see: a screen that renders differently on a real touch
  device (the matrix is a resized desktop Chromium), fonts other than this
  machine's, and a popover opened by a control the matrix does not press
  (the row kebabs, the column and filter popovers — measured closed, where
  Chromium lays them out, not open).
- **The shell stays on screen (rule i, added 23 September).** Scrolled to the
  middle and to the end at every width and height, the bar's top is 0 and the
  sidebar's 48, and a wheel over the sidebar never moves the page. The document
  stays the scroller; the bar and the sidebar are sticky. Proven on a plant —
  `overflow: hidden` put back on `.body` — which fails the sidebar and nothing
  else. On the product as it was, this rule fired 4,670 times; the counts are
  in the baseline's first commit.
- **A sticky box counts only while it holds its line.** A record pane whose
  list has ended leaves with the list, and a table head inside a sideways
  scroll holds to that scroll, not to the window; both pass under the bar as
  ordinary content, and rule i does not compare them.
- **Four traps met while measuring, and what the suite does about them.** A
  loading skeleton and a font not yet arrived are the page mid-flight: every
  pass waits for `[aria-busy]` to go and `document.fonts.ready`. A ring fault
  is read again two frames later, where the browser's scroll to the focused
  control has landed. A popover is closed by its own control, never by a
  click in a corner (under 640 the switcher is a full-screen sheet and the
  click lands inside it). And a Chromium container STYLE query does not
  re-apply when the property it reads changes through a media query on an
  ancestor — measured: `--rail` read 1 on the parent while the rail's rules
  stayed off after a resize — so the rail is drawn from a SIZE query on the
  sidebar's own width, which does.
- **Measuring by hand needs the runner's warm-up.** A plain
  `docker compose restart web` followed by a measurement lost every project
  page to defect 21 (504 faults that were 404s, not layout). Stop the app,
  remove its `.next/dev`, start it, and ask every route deepest first — what
  `scripts/e2e.mjs` does — before trusting a count.
- **Where the baseline stands.** After the pass it holds 139 faults in 72 keys,
  from 12,206 in 1,284: tap targets and focus rings in tables at a phone width
  and a handful of small controls, each listed with its file in the pass's
  report. A count above its allowance fails.

## Latent, will bite once the above are fixed

- ~~`worker` and `web` start and immediately **exit 0** with `No projects
  matched the filters in "/app"`.~~ **Fixed 2026-09-04.** Both packages now
  exist. `services/worker` boots and stays up:

  ```
  $ docker compose ps
  worker   Up 25 seconds
  $ docker compose logs worker
  {"level":"info","msg":"worker started","started":"2026-09-03T22:48:16.982Z"}
  ```

  Exit **0** was the trap: a container that does nothing successfully looks
  healthy in `compose up` output, which is the same "green proves nothing"
  failure as the rest of this file.
- ~~`pnpm test` exits 0 having run zero tests (`vitest --passWithNoTests`).~~
  **Fixed 2026-09-03.** `--passWithNoTests` is gone from every package,
  including `@cog/api`, which now has the boundary-enforcement test. No package
  in the workspace can report green having executed nothing.
- ~~`pnpm test:isolation` exits 0 having run zero tasks.~~ **Resolved
  2026-09-03.** It first became deliberately red (`scripts/test-isolation.mjs`
  refuses to be green until a package declares the task), and now runs the real
  suite: `@cog/tenancy` executes **14 tests** against Postgres 17 behind
  **PgBouncer in transaction mode** via Testcontainers, as `app_runtime` — a
  role with neither superuser nor `BYPASSRLS`. `pnpm test:isolation` exits 0
  having actually executed them.
- ~~`pnpm migrate` still exits 0 having run **zero tasks** — no package defines
  it.~~ **Fixed 2026-09-04.** The runner moved from `services/tenancy/scripts/`
  to `scripts/migrate.mjs` and `pnpm migrate` invokes it directly rather than
  through turbo — one database, one global ordering, one run. Measured against
  a live Postgres: 8 migrations applied across 3 services, 13 tables created,
  every one with RLS enabled.
- CI's `pnpm turbo run typecheck build test --filter=...[origin/main]` cannot
  run locally: **no repo in this workspace has a git remote.** It exits 1 with
  "unknown revision 'origin/main'".
- ~~`renovate.json` does not exist, though ADR-0015 makes Renovate with
  `minimumReleaseAge: 7d` mandatory.~~ **Written 2026-09-04.** Carries the
  7-day quarantine, `rangeStrategy: pin` for server workspaces, and no
  grouping — a batched PR is the one nobody reads line by line. Security
  advisories bypass the quarantine, which is the case it was never protecting
  against. **Untested: Renovate has never run, because no repo has a remote
  (PO-01).**
- ~~No repo has a remote and no backup exists.~~ **Partly addressed.** A
  `mirror` remote now exists — `C:/backup/cog/construct-o-genie.git`, a bare
  repo **on the same disk**. That is a copy, not a backup: it survives a
  mistaken `git reset`, and nothing that takes the drive. There is still no
  hosted remote, so **CI has never executed** and Renovate has never run.
  `docs/adr/README.md` records that ADRs 0001–0007 were already lost once with
  no history to recover them.

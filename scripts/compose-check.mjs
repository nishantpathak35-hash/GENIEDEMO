#!/usr/bin/env node
// Does the container stack actually come up, migrate, and answer?
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
// ---------------------------------------------------------------------------
//
// Four of the fourteen entries in `docs/TOOLING-DEFECTS.md` are compose
// failures — 3 (`up --build` created no containers), 4 (the api container
// crashed under the bind mount), 12 (migrate waited for the API that waited for
// migrate), 13 (per-service node_modules volumes, so the same staleness bug had
// three separate repairs). All four are marked fixed, and until now **nothing
// in the gate exercised any of them.**
//
// That is the same shape as a lint rule that is configured and does not fire:
// four fixes, no check, and the only way to learn one had regressed was for a
// person to try to start the stack. `pnpm verify` never noticed, because
// `test:e2e` runs against a stack that is usually already up.
//
// ---------------------------------------------------------------------------
// WHAT "FROM CLEAN" MEANS HERE, AND WHAT IT DELIBERATELY DOES NOT
// ---------------------------------------------------------------------------
//
// This runs in TWO phases, and they prove different things.
//
// **Phase 1 — your stack, containers only.** Containers are removed and
// recreated; `pgdata` and `miniodata` are never touched. Migrations are
// forward-only and idempotent, so applying them to an already-migrated
// database is a no-op that still proves the migrate service starts, connects
// and exits zero — defect 12 exactly. What it CANNOT prove is a first-ever
// migration: every run here starts from a database that is already migrated.
//
// **Phase 2 — a throwaway stack, from nothing.** Same compose file, same
// images, run under a DIFFERENT COMPOSE PROJECT NAME. That one flag is the
// whole design: compose namespaces volumes by project, so the throwaway gets
// its own `<project>_pgdata` and `<project>_miniodata`, created empty by this
// script seconds earlier. It migrates from an empty volume — the state a new
// machine and a first deployment are in, and the only state in which a
// migration depending on something a person once did by hand actually fails.
//
// **YOUR VOLUMES ARE NEVER A CANDIDATE FOR DELETION, so this needed no
// decision from anyone.** The teardown at the end of phase 2 does say `-v` —
// but it says it with `-p <the throwaway project>`, and compose can only remove
// volumes belonging to the project it was given. `pgdata` belongs to
// `construct-o-genie` and is not in that set. That is how compose namespaces
// volumes, not a rule this script follows carefully: there is no argument to
// that command that would reach your database.
//
// Usage:  node scripts/compose-check.mjs

import { spawnSync } from 'node:child_process';
import { choosePorts } from './ports.mjs';

const DB = process.env['POSTGRES_DB'] ?? 'cog_e2e';

// Published ports are CHOSEN, not assumed — see `scripts/ports.mjs`. A machine
// running an unrelated container on 9000 would otherwise turn the whole gate
// red for a reason that says nothing about this product, and one did.
const { ports, moved } = choosePorts();

const API = `http://localhost:${ports['API_PORT']}`;
const env = { ...process.env, POSTGRES_DB: DB, ...ports };

// Whether the stack was already running when we arrived. If it was, it is put
// back afterwards rather than left down — another session may be using it.
let wasUp = false;

/**
 * @param {string[]} argv
 * @param {object} [options]
 */
function run(argv, options = {}) {
  return spawnSync('docker', argv, { stdio: 'inherit', shell: true, env, ...options });
}

/**
 * @param {string[]} argv
 */
function quiet(argv) {
  return spawnSync('docker', argv, { encoding: 'utf8', shell: true, env });
}

/**
 * @param {string} what
 * @param {string} [detail]
 * @returns {never}
 */
function fail(what, detail) {
  process.stderr.write(`\n  compose check FAILED: ${what}\n`);
  if (detail) process.stderr.write(`${detail}\n`);
  process.stderr.write(
    '\n  This step exists because defects 3, 4, 12 and 13 were all compose\n' +
      '  failures and all are marked fixed. Do not delete the step to make the\n' +
      '  gate green — write the real output into docs/TOOLING-DEFECTS.md as a\n' +
      '  new entry.\n',
  );
  process.exit(1);
}

/**
 * @param {string} url
 * @param {number} [ms]
 * @returns {Promise<Response | null>}
 */
async function reachable(url, ms = 3000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    const res = await fetch(url, { signal: controller.signal, redirect: 'manual' });
    clearTimeout(timer);
    return res;
  } catch {
    return null;
  }
}

/**
 * @param {string} what
 * @param {string} url
 * @param {number} seconds
 * @returns {Promise<Response | null>}
 */
async function waitFor(what, url, seconds) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    const res = await reachable(url);
    if (res !== null && res.status < 500) return res;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return null;
}

// ── 0. is docker even here ────────────────────────────────────────────────

if (quiet(['info', '--format', '{{.ServerVersion}}']).status !== 0) {
  fail(
    'docker is not reachable',
    '  Start Docker Desktop. This step needs a container runtime and there is\n' +
      '  no useful thing it can prove without one.',
  );
}

const psBefore = quiet(['compose', 'ps', '--format', '{{.Service}}']);
wasUp = (psBefore.stdout ?? '').trim().length > 0;
process.stdout.write(`\n  stack was ${wasUp ? 'already up' : 'down'} when this started\n`);

if (moved.length > 0) {
  process.stdout.write(
    `  published ports moved (something else holds the defaults): ${moved.join(' ')}\n`,
  );
}

// ── 1. down, then up. Containers only — volumes are somebody's database ────

process.stdout.write('\n  recreating containers (volumes untouched)\n');
run(['compose', 'down', '--remove-orphans']);

if (run(['compose', 'up', '-d', '--build', 'postgres', 'pgbouncer', 'minio', 'api']).status !== 0) {
  fail(
    '`docker compose up -d --build` returned non-zero',
    '  Defect 3 was this command creating no containers at all while exiting 0,\n' +
      '  so a non-zero exit here is a different failure and the output above is it.\n' +
      '  If it says "port is already allocated", something outside this project\n' +
      '  holds a published port AND the probe above failed to move it — that is\n' +
      '  an environment collision, not a defect in this stack.',
  );
}

// Defect 3's exact shape: exit 0 and nothing running. Counting is the check.
const running = (quiet(['compose', 'ps', '--format', '{{.Service}}']).stdout ?? '')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

if (running.length === 0) {
  fail(
    'compose exited 0 and created no containers',
    '  This is defect 3 verbatim. `docker compose ps` lists nothing.',
  );
}
process.stdout.write(`  containers: ${running.join(', ')}\n`);

// ── 2. migrate. Defect 12 was this deadlocking against the API ─────────────

process.stdout.write('\n  applying migrations\n');
if (run(['compose', 'run', '--rm', 'migrate']).status !== 0) {
  fail(
    'the migrate service did not exit zero',
    '  Defect 12 was `migrate` waiting for the API that waited for `migrate`,\n' +
      '  which presented as a hang rather than an error. A non-zero exit is a\n' +
      '  different failure; a hang here will show up as this step timing out.',
  );
}

// ── 3. the API answers, and says its dependencies are healthy ──────────────

process.stdout.write('\n  waiting for /healthz\n');
const health = await waitFor('api', `${API}/healthz`, 180);
if (health === null) {
  fail(
    'the api never answered /healthz',
    '  Defect 4 was the api container crash-looping under the bind mount, and\n' +
      '  defect 13 was stale per-service node_modules volumes. Both look like\n' +
      '  this. `docker compose logs api` is the next thing to read.',
  );
}
if (health.status !== 200) fail(`/healthz answered ${String(health.status)}, not 200`);

// `/readyz` is the one that matters: it checks Postgres AND that the runtime
// role is neither superuser nor BYPASSRLS — the condition under which every
// RLS policy in the system is inert.
process.stdout.write('  checking /readyz\n');
const ready = await waitFor('api', `${API}/readyz`, 120);
if (ready === null) fail('the api never answered /readyz');

const body = /** @type {{ status?: string } | null} */ (
  await ready.json().catch(() => null)
);
if (ready.status !== 200 || body?.status !== 'ok') {
  fail(
    `/readyz answered ${String(ready.status)} with status ${String(body?.status)}`,
    `  ${JSON.stringify(body)}\n` +
      '  This checks the database AND that app_runtime is not a superuser and\n' +
      '  does not hold BYPASSRLS. If that check is what failed, every tenant\n' +
      '  policy is inert and nothing else in this gate means anything.',
  );
}

process.stdout.write('\n  compose: up, migrated, healthy and ready\n');

// ── 4. put it back the way we found it ─────────────────────────────────────

if (wasUp) {
  // Another session may have been using it. Bring the full stack back rather
  // than leaving four apps down because this step ran.
  process.stdout.write('\n  the stack was up before this ran — restoring it\n');
  run(['compose', 'up', '-d']);
} else {
  process.stdout.write('\n  tearing down (volumes untouched)\n');
  run(['compose', 'down', '--remove-orphans']);
}


// ── 5. THE SAME STACK, FROM AN EMPTY VOLUME ────────────────────────
//
// Everything above ran against a database that was already migrated. This runs
// against one that has never existed.

const THROWAWAY = 'cog-compose-probe';

/**
 * Its own ports.
 *
 * Chosen with `own: THROWAWAY`, so the main stack's published ports count as
 * TAKEN — it may well be up again by now, restored a few lines above. That
 * parameter is why `choosePorts` takes one: hardcoding "ours" to
 * `construct-o-genie` is right for phase 1 and wrong in both directions here.
 */
const fresh = choosePorts({ own: THROWAWAY });
const freshApi = `http://localhost:${fresh.ports['API_PORT']}`;
const freshEnv = { ...process.env, POSTGRES_DB: 'cog_fresh', ...fresh.ports };

/**
 * @param {string[]} argv
 * @param {object} [options]
 */
function throwaway(argv, options = {}) {
  return spawnSync('docker', ['compose', '-p', THROWAWAY, ...argv], {
    stdio: 'inherit',
    shell: true,
    env: freshEnv,
    ...options,
  });
}

/**
 * Remove the throwaway project AND its volumes.
 *
 * `-p ${THROWAWAY}` is what makes this safe, and it is not a convention this
 * function observes — it is the only project compose will look at.
 * `construct-o-genie_pgdata` is not in this project and cannot be reached by
 * this command whatever else is passed to it.
 *
 * Called on every exit path, including every failure, so a red gate does not
 * leave a stopped stack and two orphan volumes behind.
 */
function removeThrowaway() {
  spawnSync('docker', ['compose', '-p', THROWAWAY, 'down', '-v', '--remove-orphans'], {
    stdio: 'inherit',
    shell: true,
    env: freshEnv,
  });
}

/**
 * @param {string} what
 * @param {string} [detail]
 * @returns {never}
 */
function failFresh(what, detail) {
  removeThrowaway();
  fail(what, detail);
}

process.stdout.write(`\n  bringing up "${THROWAWAY}" — its own volumes, created empty\n`);
if (fresh.moved.length > 0) {
  process.stdout.write(`  its ports: ${fresh.moved.join(' ')}\n`);
}

// Removed FIRST as well as last. A previous run killed between `up` and its
// teardown would otherwise leave a populated volume here, and this phase would
// quietly become phase 1 again — a check that stops checking without saying so
// is worse than one that fails.
removeThrowaway();

// **POSTGRES ALONE FIRST, and that ordering is the check.**
//
// Bringing up `api` here as well would drag `migrate` along with it —
// `api` depends on it completing — and the explicit migrate run below would
// then find the work already done and print `migrations: already up to date`.
// Which is exactly what the first version of this did: it reported a green
// from-empty migration while the real from-empty migration had happened
// silently inside `up`, unasserted.
if (throwaway(['up', '-d', 'postgres']).status !== 0) {
  failFresh(
    'the throwaway postgres did not come up',
    '  An empty volume is the only difference from phase 1, which passed, so\n' +
      '  read this as a first-boot failure: the image initialising POSTGRES_DB,\n' +
      '  the init scripts under docker/postgres-init/, or a port collision with\n' +
      '  the stack that was just restored.',
  );
}

process.stdout.write('\n  migrating a database that has never existed\n');
const migrated = spawnSync('docker', ['compose', '-p', THROWAWAY, 'run', '--rm', 'migrate'], {
  encoding: 'utf8',
  shell: true,
  env: freshEnv,
});
const migrateOut = `${migrated.stdout ?? ''}${migrated.stderr ?? ''}`;
// Print the summary line itself rather than a tail slice: docker on Windows
// pads the output with blank lines, and a `slice(-4)` printed four of them.
const summary = migrateOut
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l.startsWith('migrations:'));
process.stdout.write(`  ${summary.join(' ') || '(migrate printed no summary line)'}\n`);

if (migrated.status !== 0) {
  failFresh(
    'migrations failed against an EMPTY database',
    `${migrateOut}\n` +
      '  This is the failure phase 1 structurally cannot see. Migrations here are\n' +
      '  forward-only, so one that depends on a state somebody created by hand\n' +
      '  passes forever against a developed database and fails on the first real\n' +
      '  deployment.',
  );
}

// **The volume was actually empty.** Without this the whole phase degrades
// silently into phase 1 the moment anything leaves a populated volume behind:
// migrate would exit 0, /readyz would answer 200, and the from-empty claim
// would be false while every assertion still passed. A check that stops
// checking without saying so is defect 6's shape, and it is the one this repo
// keeps meeting.
if (!/migrations: applied \d+/.test(migrateOut)) {
  failFresh(
    'the throwaway database was not empty',
    `${migrateOut}\n` +
      '  Expected `migrations: applied <n>`. `already up to date` means the\n' +
      '  volume survived from an earlier run, so this phase proved nothing that\n' +
      '  phase 1 had not already proved.',
  );
}

// Now the rest of the stack, against the database those migrations just built.
if (throwaway(['up', '-d', '--build', 'pgbouncer', 'minio', 'api']).status !== 0) {
  failFresh('the throwaway api and pooler did not come up');
}

process.stdout.write('\n  waiting for the throwaway api\n');
const freshHealth = await waitFor('api', `${freshApi}/healthz`, 180);
if (freshHealth === null || freshHealth.status !== 200) {
  failFresh('the throwaway api never answered /healthz with 200');
}

const freshReady = await waitFor('api', `${freshApi}/readyz`, 120);
const freshBody = /** @type {{ status?: string } | null} */ (
  freshReady === null ? null : await freshReady.json().catch(() => null)
);
if (freshReady === null || freshReady.status !== 200 || freshBody?.status !== 'ok') {
  failFresh(
    `the throwaway api answered /readyz with status ${String(freshBody?.status)}`,
    `  ${JSON.stringify(freshBody)}\n` +
      '  On a fresh volume this also proves the role setup in the migrations is\n' +
      '  complete: app_runtime exists, is not a superuser and does not hold\n' +
      '  BYPASSRLS. Phase 1 inherits all three from a database somebody set up\n' +
      '  by hand months ago, so it cannot tell you whether they are reproducible.',
  );
}

process.stdout.write('\n  fresh volume: migrated, healthy and ready\n');
removeThrowaway();
process.stdout.write(`  removed "${THROWAWAY}" and its volumes. Yours were never named.\n`);

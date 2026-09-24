#!/usr/bin/env node
// The browser step of the gate.
//
// It needs something no other step needs: four Next.js apps, the API, Postgres,
// MinIO and a seeded database. That is `docker compose`, which is the supported
// environment anyway (ADR-0015) — so this script does not build a parallel
// world, it starts the real one.
//
// **It never skips.** A step that skips when its environment is missing is the
// gate that was a prose checklist (defect 7): the isolation tests existed,
// passed, and were not in the gate, so step 4 was green for weeks without them.
// If the stack cannot be started, this exits non-zero and says why.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { choosePorts } from './ports.mjs';

// Published ports are CHOSEN, not assumed — see `scripts/ports.mjs`.
//
// The message this script used to print on a collision told the reader to set
// `MINIO_PORT=9010 WEB_PORT=3100` themselves, which needs them to know which
// port collided on a machine they may not own. It also has to agree with
// `compose-check.mjs`, which brings up the same stack one gate step earlier:
// when only that step moved a port, it restored the stack there and this step
// then failed trying to publish the default.
const { ports, moved } = choosePorts();
if (moved.length > 0) {
  process.stdout.write(`\n  published ports moved: ${moved.join(' ')}\n`);
}

const PORTS = {
  web: process.env['E2E_WEB_URL'] ?? `http://localhost:${ports['WEB_PORT']}`,
  admin: process.env['E2E_ADMIN_URL'] ?? `http://localhost:${ports['ADMIN_PORT']}`,
  'vendor-portal':
    process.env['E2E_VENDOR_URL'] ?? `http://localhost:${ports['VENDOR_PORTAL_PORT']}`,
  'client-portal':
    process.env['E2E_CLIENT_URL'] ?? `http://localhost:${ports['CLIENT_PORTAL_PORT']}`,
};
const API = process.env['E2E_API_URL'] ?? `http://localhost:${ports['API_PORT']}`;

// A database of its own, so a full gate never touches whatever a developer has
// in `cog`. Overridable, because the point is that it is disposable.
const DB = process.env['POSTGRES_DB'] ?? 'cog_e2e';

// The chosen ports go to compose AND to the browser suite, which reads the
// URLs from the environment.
/** @type {NodeJS.ProcessEnv} */
const env = {
  ...process.env,
  POSTGRES_DB: DB,
  ...ports,
  E2E_API_URL: API,
  E2E_WEB_URL: PORTS.web,
  E2E_ADMIN_URL: PORTS.admin,
  E2E_VENDOR_URL: PORTS['vendor-portal'],
  E2E_CLIENT_URL: PORTS['client-portal'],
};

/**
 * @param {string} command
 * @param {string[]} argv
 * @param {object} [options]
 */
function run(command, argv, options = {}) {
  return spawnSync(command, argv, { stdio: 'inherit', shell: true, env, ...options });
}

/**
 * @param {string} command
 * @param {string[]} argv
 */
function quiet(command, argv) {
  return spawnSync(command, argv, { encoding: 'utf8', shell: true, env });
}

/**
 * @param {string} url
 * @param {number} [ms]
 * @returns {Promise<boolean>}
 */
async function reachable(url, ms = 3000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    const res = await fetch(url, { signal: controller.signal, redirect: 'manual' });
    clearTimeout(timer);
    // 307 is the unauthenticated redirect and means the app is serving.
    return res.status > 0;
  } catch {
    return false;
  }
}

/**
 * Answering, and answering with a page.
 *
 * @param {string} url
 * @param {number} [ms]
 * @returns {Promise<boolean>}
 */
async function serving(url, ms = 5000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    const res = await fetch(url, { signal: controller.signal, redirect: 'manual' });
    clearTimeout(timer);
    // 404 is NOT ready: a dev server answers before its route tree is built,
    // and a page asked for in that window answers 404 and stays 404 — measured
    // for two minutes on a fresh server (TOOLING-DEFECTS 21).
    return res.status !== 404;
  } catch {
    return false;
  }
}

/**
 * @param {string} what
 * @param {string} url
 * @param {number} seconds
 * @param {(url: string, ms?: number) => Promise<boolean>} [probe]
 * @returns {Promise<boolean>}
 */
async function waitFor(what, url, seconds, probe = reachable) {
  process.stdout.write(`  waiting for ${what} … `);
  for (let i = 0; i < seconds; i += 1) {
    if (await probe(url, 5000)) {
      process.stdout.write('up\n');
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  process.stdout.write('TIMED OUT\n');
  return false;
}

const APPS_DIR = fileURLToPath(new URL('../apps/', import.meta.url));
const ANY_ID = '00000000-0000-4000-8000-000000000001';

/**
 * Every page route of one app, each dynamic segment given a well-formed id.
 *
 * @param {string} dir
 * @param {string[]} [segments]
 * @returns {string[]}
 */
function pageRoutes(dir, segments = []) {
  /** @type {string[]} */
  const routes = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('_') || entry.name.startsWith('@')) continue;
      routes.push(...pageRoutes(join(dir, entry.name), [...segments, entry.name]));
    } else if (entry.name === 'page.tsx') {
      const path = segments
        .filter((s) => !(s.startsWith('(') && s.endsWith(')')))
        .map((s) => (s.startsWith('[') ? ANY_ID : s));
      routes.push(`/${path.join('/')}`);
    }
  }
  return routes;
}

/**
/**
 * Every page route of one app, deepest first.
 *
 * A cold dev server asked for a page before the pages beneath it loses those
 * pages (TOOLING-DEFECTS 21), so no page is ever asked for before the pages
 * under it.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function routesDeepestFirst(dir) {
  return pageRoutes(join(APPS_DIR, dir, 'app')).sort((a, b) => b.split('/').length - a.split('/').length);
}

/**
 * The one route a readiness probe may ask for: `/sign-in`, which every app has.
 *
 * It is a leaf, and it is outside the signed-in tree — so compiling it first
 * costs no other page, while `/` is the parent of everything an app serves and
 * asking for it first is what lost the client portal's project tabs.
 *
 * @param {string} dir
 * @returns {string}
 */
function readyRoute(dir) {
  return routesDeepestFirst(dir).includes('/sign-in') ? '/sign-in' : (routesDeepestFirst(dir)[0] ?? '/');
}

/**
 * The pages an app answers 404 for although their file exists. Signed out, a
 * route the server knows redirects to sign-in or renders it; a route it has no
 * entry for answers 404.
 *
 * @param {string} dir  the app's directory under `apps/`
 * @param {string} base
 * @returns {Promise<string[]>}
 */
async function unmatchedPages(dir, base) {
  /** @type {string[]} */
  const unmatched = [];
  for (const path of routesDeepestFirst(dir)) {
    try {
      const res = await fetch(`${base}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(120_000) });
      if (res.status === 404) unmatched.push(path);
    } catch {
      unmatched.push(`${path} (no answer)`);
    }
  }
  return unmatched;
}

/**
 * @param {string} what
 * @param {string} dir
 * @param {string} base
 * @param {() => unknown} restart
 * @returns {Promise<boolean>}
 */
async function servesEveryPage(what, dir, base, restart) {
  let missing = await unmatchedPages(dir, base);
  // A cold `next dev` loses a page or not by chance (TOOLING-DEFECTS 21 —
  // measured 2026-09-20 at one start in three for the client portal, and a
  // lost page stays lost), so a start that lost one is thrown away and the
  // app started again with no `.next/dev` at all, up to three more times. A
  // warm `.next/dev` never loses a page, which is why the copies keep theirs.
  for (let attempt = 1; missing.length > 0 && attempt <= RESTARTS; attempt += 1) {
    process.stdout.write(
      `\n  ${what} answered 404 for ${String(missing.length)} page(s) that exist (${missing.slice(0, 3).join(', ')}) — starting it afresh (${String(attempt)} of ${String(RESTARTS)})\n`,
    );
    restart();
    if (!(await waitFor(what, `${base}${readyRoute(dir)}`, 240, serving))) return false;
    missing = await unmatchedPages(dir, base);
  }
  if (missing.length === 0) return true;
  process.stderr.write(`\n  ${what} still answers 404 for pages that exist: ${missing.join(', ')}\n`);
  return false;
}
const RESTARTS = 3;

async function everythingUp() {
  /** @type {[string, string][]} */
  const checks = [['api', `${API}/healthz`], ...Object.entries(PORTS)];
  for (const [name, url] of checks) {
    if (!(await reachable(url))) return { ok: false, missing: name };
  }
  return { ok: true };
}

// ── 1. is the stack already up? ────────────────────────────────────────────

let state = await everythingUp();

if (!state.ok) {
  process.stdout.write(`\n  ${state.missing} is not reachable — starting the compose stack\n`);

  if (quiet('docker', ['info']).status !== 0) {
    process.stderr.write(
      '\n  Docker is not running, and this step needs it — four apps, the API, Postgres\n' +
        '  and MinIO. Start Docker Desktop and run `pnpm verify` again.\n',
    );
    process.exit(1);
  }

  // The database has to exist before the stack points at it: the postgres image
  // creates POSTGRES_DB only on FIRST initialisation, and the volume already
  // exists on any machine that has run this before.
  run('docker', ['compose', 'up', '-d', 'postgres']);
  await new Promise((resolve) => setTimeout(resolve, 3000));
  quiet('docker', [
    'compose', 'exec', '-T', 'postgres',
    'psql', '-U', 'cog', '-d', 'postgres', '-c', `"CREATE DATABASE ${DB} OWNER cog"`,
  ]);

  if (run('docker', ['compose', 'up', '-d']).status !== 0) {
    process.stderr.write(
      '\n  `docker compose up -d` failed.\n' +
        '  If it is a port collision, every published port is overridable:\n' +
        '    MINIO_PORT=9010 WEB_PORT=3100 pnpm verify\n',
    );
    process.exit(1);
  }

  if (!(await waitFor('api', `${API}/healthz`, 180))) process.exit(1);
  for (const [name, url] of Object.entries(PORTS)) {
    // A cold Next.js dev server compiles the route on first request. Slow, once,
    // and `/sign-in` first so no page is lost to it (TOOLING-DEFECTS 21).
    if (!(await waitFor(name, `${url}${readyRoute(name)}`, 240, serving))) process.exit(1);
  }
} else {
  // THE STACK IS ALREADY UP, AND THAT IS NOT ENOUGH.
  //
  // `next dev` discovers routes from the filesystem through a watcher, and the
  // watcher does not fire for a file created on a Windows bind mount — the
  // inotify events never cross the boundary. A route file that plainly exists
  // inside the container (`docker compose exec web ls` shows it) answers 404
  // until the server restarts.
  //
  // The failure is worse than slow: a screen added since the stack came up is
  // reported as a broken route, and the obvious reading of that is "my page is
  // wrong" rather than "the server has not seen it". Half an hour went into
  // that once. The restart costs about fifteen seconds per app and is the only
  // thing between here and a suite that measures the wrong tree.
  //
  // THE API IS RESTARTED TOO, and the first version of this said it was not.
  //
  // `tsx watch` has exactly the same problem as `next dev` — it is the same
  // missing inotify event — so a changed route handler keeps serving the old
  // response. That is worse than a 404, because the response is well-formed:
  // the browser suite saw `/purchase-orders` render a 500 whose only symptom
  // was a contract parse failure on four fields the API had not learnt about
  // yet. Nothing about that reads as a stale process.
  //
  // Restarting drops the connection pool, which is fine: seeding happens after
  // this, through the API, and the pool is rebuilt on the first request.
  //
  // Migrations are the same problem one layer down. `migrate` is a one-shot
  // service that ran when the stack came up; a migration written since then has
  // not been applied, and the screen that reads its table renders a refusal
  // that looks exactly like a bug in the screen. Forward-only and idempotent,
  // so re-running it on an up-to-date database is a no-op.
  process.stdout.write('\n  stack is up - applying migrations and restarting the apps\n');
  if (run('docker', ['compose', 'run', '--rm', 'migrate']).status !== 0) {
    process.stderr.write('\n  migrations failed against the running stack.\n');
    process.exit(1);
  }
  run('docker', ['compose', 'restart', 'api', 'worker', ...Object.keys(PORTS)]);
  if (!(await waitFor('api', `${API}/healthz`, 180))) process.exit(1);
  for (const [name, url] of Object.entries(PORTS)) {
    if (!(await waitFor(name, `${url}${readyRoute(name)}`, 240, serving))) process.exit(1);
  }
}

// ── 1b. every page in the checkout is a page the servers have ─────────────
//
// Starting a dev server is not always enough. Measured in full gates, an app
// can start from a route tree that is missing pages the checkout has: the
// client portal served `/projects/<id>` and answered 404 for its `billing`,
// `documents` and `variations` pages on every request, signed in or out, with
// the files plainly present inside the container.
//
// What clears it has had to grow. A plain restart fixed it once and not the
// next time. Starting without Turbopack's cache (`.next/dev/cache/turbopack`)
// fixed it for a while; at 9db88ea it did not — the cache was rebuilt and the
// three pages still answered 404 — and removing the whole of the dev server's
// output, `.next/dev`, did. The unreachable-API copies in 3b, each on a fresh
// anonymous volume, have also missed pages on a first start and been fixed by
// a plain restart. So whatever loses a page lives somewhere in `.next/dev`, not
// only in its cache, and a cold start can still miss one.
//
// **Measured 2026-09-15, it is the order of the first requests.** A cold copy
// of the client portal asked for `/projects/<id>` first answered 404 for
// `billing`, `documents` and `variations` on every later request, restarts
// included, three starts out of three; asked for those three first, it served
// all four pages, `/projects/<id>` too. This check walked the tree parent
// first, so it was the request that lost them. It now asks deepest first
// (TOOLING-DEFECTS 21).
//
// So every page file is requested once, signed out, deepest first, and an app
// that has not got one of them is started again with no `.next/dev` at all — a
// cold compile, paid only when a page is missing. Still missing after that
// fails the step.
for (const [app, url] of Object.entries(PORTS)) {
  const startWithoutCache = () => {
    run('docker', ['compose', 'stop', app]);
    rmSync(join(APPS_DIR, app, '.next', 'dev'), { recursive: true, force: true });
    run('docker', ['compose', 'start', app]);
  };
  if (!(await servesEveryPage(app, app, url, startWithoutCache))) {
    process.exit(1);
  }
}

// ── 2. seed. Idempotent, so this is safe on an already-seeded database. ────

process.stdout.write('\n  seeding\n');
if (run('docker', ['compose', '--profile', 'seed', 'run', '--rm', 'seed']).status !== 0) {
  process.stderr.write('\n  seeding failed — the suite asserts on seeded values, so it stops here\n');
  process.exit(1);
}

// ── 3. the browsers themselves ─────────────────────────────────────────────
//
// `.npmrc` sets `ignore-scripts=true` repo-wide (ADR-0015: postinstall is the
// primary npm attack vector), and Playwright downloads its browsers in a
// postinstall. So the download never happens on install and has to be asked for
// here. It is a no-op once the browser is present.

process.stdout.write('\n  ensuring chromium is installed\n');
if (run('pnpm', ['exec', 'playwright', 'install', 'chromium']).status !== 0) {
  process.stderr.write('\n  could not install the chromium build Playwright needs\n');
  process.exit(1);
}

// ── 3b. the same four apps with nothing behind them ────────────────────────
//
// `states.spec.ts` renders every screen with the API unreachable and requires
// the screen to SAY so. That needs an app whose API address leads nowhere, and
// the running apps must keep theirs — so each app runs a second time, on its
// own port, pointed at a closed port, with its own `.next` so two dev servers
// never write one build directory. Removed again when the suite ends.

const DEAD_BASE = Number.parseInt(process.env['E2E_DEAD_PORT_BASE'] ?? '3100', 10);
/** @type {Record<string, { service: string; dir: string; inner: number; host: number }>} */
const DEAD = {
  web: { service: 'web', dir: 'web', inner: 3000, host: DEAD_BASE },
  admin: { service: 'admin', dir: 'admin', inner: 3001, host: DEAD_BASE + 1 },
  'vendor-portal': { service: 'vendor-portal', dir: 'vendor-portal', inner: 3002, host: DEAD_BASE + 2 },
  'client-portal': { service: 'client-portal', dir: 'client-portal', inner: 3003, host: DEAD_BASE + 3 },
};
const deadName = (/** @type {string} */ app) => `cog-dead-api-${app}`;

/**
 * Where a no-API copy keeps its `.next`: a directory of its own on the host,
 * beside the real app's, so two dev servers never write one build directory
 * and — the point — the copy's Turbopack output SURVIVES to the next run. A
 * cold `next dev` loses a page by chance (TOOLING-DEFECTS 21); a warm one
 * never does, and until 2026-09-20 every copy started cold on an anonymous
 * volume and rolled the dice at every gate. A copy that lost a page has its
 * directory removed and starts cold again (`startDead(app, d, true)`), the
 * same remedy the real apps take with their own `.next/dev`.
 *
 * @param {string} app
 * @returns {string}
 */
const deadNext = (app) => join(APPS_DIR, '..', '.e2e', `next-${app}`);

/**
 * Start one copy: the old container goes, a new one starts on the copy's own
 * `.next` — cold when `fresh`, warm otherwise.
 *
 * @param {string} app
 * @param {{ service: string; dir: string; inner: number; host: number }} d
 * @param {boolean} [fresh]
 * @returns {boolean}
 */
function startDead(app, d, fresh = false) {
  quiet('docker', ['rm', '-f', '-v', deadName(app)]);
  if (fresh) rmSync(deadNext(app), { recursive: true, force: true });
  mkdirSync(deadNext(app), { recursive: true });
  const started = run('docker', [
    'compose', 'run', '-d', '--no-deps', '--name', deadName(app),
    '-p', `${String(d.host)}:${String(d.inner)}`,
    '-e', 'API_URL=http://127.0.0.1:9',
    '-v', `${toPosix(deadNext(app))}:/app/apps/${d.dir}/.next`,
    d.service,
  ]);
  return started.status === 0;
}

/** A host path as Docker on Windows wants it in a bind mount: forward slashes, the drive kept. */
const toPosix = (/** @type {string} */ p) => p.replace(/\\/g, '/');

process.stdout.write('\n  starting the four apps again with no API behind them\n');
for (const [app, d] of Object.entries(DEAD)) {
  if (!startDead(app, d)) {
    process.stderr.write(`\n  could not start the unreachable-API copy of ${app}\n`);
    process.exit(1);
  }
  env[`E2E_DEAD_${app.replace(/-/g, '_').toUpperCase()}_URL`] = `http://localhost:${String(d.host)}`;
}
const removeDead = () => {
  for (const app of Object.keys(DEAD)) quiet('docker', ['rm', '-f', '-v', deadName(app)]);
};
for (const [app, d] of Object.entries(DEAD)) {
  const base = `http://localhost:${String(d.host)}`;
  const up =
    (await waitFor(`${app} (no API)`, `${base}${readyRoute(d.dir)}`, 300, serving)) &&
    (await servesEveryPage(`${app} (no API)`, d.dir, base, () => startDead(app, d, true)));
  if (!up) {
    removeDead();
    process.exit(1);
  }
}

// ── 4. run, one process per shard ──────────────────────────────────────────
//
// The whole suite as ONE Playwright process died for host memory at 508 tests
// (2026-09-20: both workers' browsers crashed 34 s in with 5 GB free beside the
// 12 GB VM). A shard is a fresh process, so what its browsers held is released
// before the next one starts, and the stack — compose, the seed, the four no-API
// copies — is brought up once for all of them. Each shard's outcome is read
// back from its JSON report and printed as its own row, so a green gate names
// the count every shard ran, not one exit status over all of them.

const SHARDS = Math.max(1, Number.parseInt(process.env['E2E_SHARDS'] ?? '4', 10));
const extra = process.argv.slice(2);
const sharded = !extra.some((a) => a.startsWith('--shard'));
/** @type {{ label: string; code: number; counts: string }[]} */
const shards = [];
for (let i = 1; i <= (sharded ? SHARDS : 1); i += 1) {
  const label = sharded ? `${String(i)}/${String(SHARDS)}` : 'all';
  process.stdout.write(`\n  ── browsers · shard ${label} ──\n`);
  const result = run('pnpm', ['exec', 'playwright', 'test', ...(sharded ? [`--shard=${label}`] : []), ...extra], {
    env: { ...env, E2E_SHARD: String(i) },
  });
  shards.push({ label, code: result.status ?? 1, counts: shardCounts(i) });
}
removeDead();
process.stdout.write('\n  browsers, per shard\n');
for (const s of shards) {
  process.stdout.write(`    shard ${s.label.padEnd(5)} ${s.code === 0 ? 'PASS' : 'FAIL'}  EXIT=${String(s.code)}  ${s.counts}\n`);
}
process.exit(shards.some((s) => s.code !== 0) ? 1 : 0);

/**
 * What a shard ran, from the JSON report `playwright.config.ts` writes for it.
 * @param {number} shard
 * @returns {string}
 */
function shardCounts(shard) {
  try {
    const report = JSON.parse(readFileSync(join(APPS_DIR, '..', 'e2e', 'results', `shard-${String(shard)}.json`), 'utf8'));
    const s = report.stats ?? {};
    return `${String(s.expected ?? 0)} passed · ${String(s.unexpected ?? 0)} failed · ${String(s.flaky ?? 0)} flaky · ${String(s.skipped ?? 0)} skipped`;
  } catch {
    return 'no report written';
  }
}

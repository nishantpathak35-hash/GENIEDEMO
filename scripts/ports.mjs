// Which published ports this stack should use on THIS machine.
//
// Every port in `docker-compose.yml` is written `${NAME:-default}` precisely so
// a machine running something else can move it, and the e2e script's own error
// message has always said so:
//
//     MINIO_PORT=9010 WEB_PORT=3100 pnpm verify
//
// That put the burden on a person knowing which port collided, on a machine
// they may not own. This works it out instead. Shared by `compose-check.mjs`
// and `e2e.mjs` because they bring up the same stack and disagreeing about
// ports is worse than either choice: the compose step moved MinIO to 9002,
// restored the stack there, and the e2e step then failed trying to publish
// 9000 — a gate red for a reason that says nothing about this product.
//
// An explicitly set environment variable always wins. This only fills gaps.

import { spawnSync } from 'node:child_process';

const DEFAULTS = {
  POSTGRES_PORT: 5432,
  PGBOUNCER_PORT: 6432,
  MINIO_PORT: 9000,
  MINIO_CONSOLE_PORT: 9001,
  API_PORT: 4000,
  WEB_PORT: 3000,
  ADMIN_PORT: 3001,
  VENDOR_PORTAL_PORT: 3002,
  CLIENT_PORTAL_PORT: 3003,
};

/**
 * Host ports published by containers that are NOT ours.
 *
 * **Docker's own view, not a socket probe.** The first version of this used
 * `net.createServer().listen(port)` and reported 9000 free while an unrelated
 * container was published on it — Docker Desktop's Windows port proxy accepts
 * the second bind. `docker compose up` then failed with
 * `Bind for 0.0.0.0:9000 failed: port is already allocated`, one layer further
 * from the cause. Docker is the authority for a collision with Docker.
 */
/**
 * @param {string} own  The compose project whose own containers do not count.
 * @returns {Set<number>}
 */
function heldByOthers(own) {
  // The format string is QUOTED. With `shell: true` its space is a word
  // separator, so docker received `--format {{.Names}}` plus an orphan argument
  // and printed names with no ports at all — which made every port look free
  // and the whole probe silently useless.
  const listed = spawnSync('docker', ['ps', '--format', '"{{.Names}} {{.Ports}}"'], {
    encoding: 'utf8',
    shell: true,
  });

  const taken = new Set();
  for (const row of (listed.stdout ?? '').split('\n')) {
    const [name, ...rest] = row.trim().split(/\s+/);
    if (name === undefined || name === '') continue;
    // Our own containers are about to be recreated, so they hold nothing.
    //
    // **Which project is "ours" is a PARAMETER, and that is load-bearing.** It
    // was hardcoded to `construct-o-genie`, which is right for the main stack
    // and wrong in both directions for the throwaway one: the throwaway would
    // treat the main stack's published ports as free and fail to bind them,
    // and the main check would treat the throwaway's as foreign and move away
    // from ports that were about to be released.
    if (name.startsWith(own)) continue;
    // `0.0.0.0:9000->9000/tcp`, and the range form `0.0.0.0:9000-9001->…`.
    for (const match of rest.join(' ').matchAll(/:(\d+)(?:-(\d+))?->/g)) {
      const from = Number(match[1]);
      const to = match[2] === undefined ? from : Number(match[2]);
      for (let port = from; port <= to; port += 1) taken.add(port);
    }
  }

  if ((listed.stdout ?? '').trim() !== '' && taken.size === 0) {
    process.stdout.write('  (no published ports parsed from `docker ps`; probe may be blind)\n');
  }
  return taken;
}

/**
 * @param {{ own?: string }} [options] which compose project's containers are
 *   ours — theirs hold ports, ours are about to be recreated and do not.
 * @returns {{ ports: Record<string, string>, moved: string[] }}
 */
export function choosePorts(options = {}) {
  const busy = heldByOthers(options.own ?? 'construct-o-genie');
  /** @type {Record<string, string>} */
  const ports = {};
  /** @type {string[]} */
  const moved = [];

  for (const [name, preferred] of Object.entries(DEFAULTS)) {
    const fromEnv = process.env[name];
    if (fromEnv !== undefined && fromEnv !== '') {
      ports[name] = fromEnv;
      busy.add(Number(fromEnv));
      continue;
    }
    let chosen = preferred;
    for (let port = preferred; port < preferred + 40; port += 1) {
      if (busy.has(port)) continue;
      chosen = port;
      break;
    }
    // CLAIMED, so the next lookup cannot pick it too. Without this MinIO and
    // its console were both handed 9002 — which compose accepts at parse time
    // and fails on at bind time.
    busy.add(chosen);
    ports[name] = String(chosen);
    if (chosen !== preferred) moved.push(`${name}=${String(chosen)}`);
  }

  return { ports, moved };
}

/**
 * Worker entry point.
 *
 * Deliberately minimal: it boots, reports what it is, and waits. The pg-boss
 * job registration lands with the first real job (document rendering, M5).
 *
 * It exists now because `docker/worker.Dockerfile` runs
 * `pnpm --filter @cog/worker dev`, and until this package existed that command
 * matched no project and the container **exited 0** — which looks healthy in
 * `docker compose ps` while doing nothing. That is the same "green proves
 * nothing" failure the tooling defects document exists to prevent.
 */

const started = new Date().toISOString();
console.log(JSON.stringify({ level: 'info', msg: 'worker started', started }));

// Keep the process alive without busy-waiting. Replaced by pg-boss's own
// subscription loop once jobs are registered.
const keepAlive = setInterval(() => undefined, 1 << 30);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    clearInterval(keepAlive);
    console.log(JSON.stringify({ level: 'info', msg: 'worker stopping', signal }));
    process.exit(0);
  });
}

#!/usr/bin/env node
// The tenant-isolation gate.
//
// `turbo run test:isolation` exits 0 when NO package defines the task. That
// makes the most important gate in the repository green and empty — which is
// worse than not having it, because TOPOLOGY.md calls this suite "the artifact
// handed to a customer's security reviewer" and a green tick invites someone to
// cite it as evidence.
//
// This wrapper refuses to be green until the suite actually exists. It lands
// before the suite deliberately: the failure is the reminder.
//
// Removing the guard is fine once step 7 of docs/plans/M1.md lands real tests —
// at that point the check passes on its own and can stay as a regression guard
// against every service quietly dropping the task again.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** Workspace dirs that could plausibly own an isolation suite. */
const OWNERS = ['services', 'packages'];

const declaring = [];
for (const group of OWNERS) {
  const dir = join(ROOT, group);
  if (!existsSync(dir)) continue;
  for (const pkg of readdirSync(dir)) {
    const manifest = join(dir, pkg, 'package.json');
    if (!existsSync(manifest)) continue;
    const json = JSON.parse(readFileSync(manifest, 'utf8'));
    if (json.scripts?.['test:isolation']) declaring.push(`${group}/${pkg}`);
  }
}

if (declaring.length === 0) {
  console.error(`
tenant-isolation gate: FAILING ON PURPOSE

  No package defines a "test:isolation" script, so \`turbo run test:isolation\`
  would exit 0 having executed nothing. A gate that is green and empty is worse
  than one that is missing: it looks like proof of tenant isolation and is not.

  This becomes green when docs/plans/M1.md step 7 lands the real suite —
  RLS forced, policies present, tenant A reading zero rows of tenant B through
  PgBouncer in transaction mode, and the pool-size-1 connection-reuse test.

  Until then, do not cite tenant isolation as proven.
`);
  process.exit(1);
}

console.log(`tenant-isolation gate: ${declaring.length} package(s) declare the suite — ${declaring.join(', ')}`);
// Defect 19: when turbo cannot be spawned (Windows Smart App Control blocks the
// unsigned binary), run the same task through `pnpm -r`, which only visits the
// packages that declare it — the list printed above.
const probe = spawnSync('pnpm', ['exec', 'turbo', '--version'], { shell: true, encoding: 'utf8' });
const argv = probe.status === 0 ? ['turbo', 'run', 'test:isolation'] : ['-r', 'run', 'test:isolation'];
if (probe.status !== 0) console.log('turbo cannot be spawned (defect 19) — running through `pnpm -r run` instead');
const run = spawnSync('pnpm', argv, { stdio: 'inherit', shell: true });
process.exit(run.status ?? 1);

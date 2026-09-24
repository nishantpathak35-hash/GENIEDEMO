#!/usr/bin/env node
// The verification gate, as one command.
//
// It was previously a prose checklist in `.claude/commands/verify.md`, and a
// gate written in prose can be partially run. It was: `pnpm test` is
// `turbo run test`, and `services/host`'s `test` script is
// `vitest run --project unit` — so the per-route tenant-isolation tests, which
// are the whole point of step 4's gate, were never executed by anything the
// checklist named. The tests existed and passed; the GATE did not include them.
//
// Every step below runs even if an earlier one fails, because "typecheck is
// red" and "typecheck is red AND four suites are red" are different situations
// and stopping at the first failure hides which one you are in. The exit status
// is non-zero if any step failed.
//
// `--fast` skips the two slow steps (build, isolation) for the iteration loop.
// It prints what it skipped and its exit status is NOT a pass — the summary
// says so, because a gate that can be silently narrowed is the thing this file
// exists to prevent.

import { spawnSync } from 'node:child_process';

const fast = process.argv.includes('--fast');

// Can turbo be spawned at all? Defect 19: Windows Smart App Control blocks the
// unsigned `turbo.exe` (`spawn UNKNOWN`), and a gate whose first three steps
// cannot start is not a gate. When turbo is unavailable each turbo step runs
// the same task through `pnpm -r run`, which walks the workspace in dependency
// order with no cache — slower, and every bit as strict. The summary says which
// path ran, so a green table never hides that turbo did not.
const turboProbe = spawnSync('pnpm', ['exec', 'turbo', '--version'], { shell: true, encoding: 'utf8' });
const TURBO = turboProbe.status === 0;

// Can Next load its native compiler? Defect 20: the same policy can block
// `@next/swc-win32-x64-msvc`, and `next build` then refuses to run at all. Node
// is asked to load the binding the way Next resolves it, from `next`'s own
// directory; a refusal by the policy names Application Control, and only that
// counts — a machine without the binding is not this defect.
const NEXT_BINDING_PROBE = [
  "const { createRequire } = require('node:module');",
  "const { resolve } = require('node:path');",
  "const fromNext = createRequire(require.resolve('next/package.json', { paths: [resolve('apps/web')] }));",
  "try { fromNext('@next/swc-win32-x64-msvc'); }",
  "catch (error) { process.exit(/Application Control/i.test(String(error && error.message)) ? 3 : 0); }",
].join(' ');
const NEXT_BLOCKED =
  process.platform === 'win32' &&
  spawnSync(process.execPath, ['-e', NEXT_BINDING_PROBE], { encoding: 'utf8' }).status === 3;

/** @type {{name: string, argv: string[], fallback?: string[][], whenNextBlocked?: {turbo: string[][], fallback: string[][]}, slow?: boolean, why: string}[]} */
const STEPS = [
  {
    name: 'lint',
    argv: ['exec', 'eslint', '.'],
    why: 'the only check that catches an import-boundary violation, and the money-arithmetic rule',
  },
  {
    name: 'design',
    argv: ['run', 'design:gates'],
    why:
      'the design gates that need no browser — no colour, radius, shadow or space as a literal ' +
      'outside styles.css, no chart painting a status token, caution only as a fill carrying ink. ' +
      'The browser half runs under test:e2e',
  },
  {
    name: 'typecheck',
    // THREE task names. `typecheck` is per-package; the other two are turbo
    // ROOT tasks, for the two directories that belong to no workspace member
    // and were therefore in no tsconfig `include` — linted, never typechecked.
    // Same shape as defect 17, twice over.
    //
    //   typecheck:e2e      e2e/, the browser suite
    //   typecheck:scripts  every .mjs — the migration runner, the seed the
    //                      browser suite asserts against, and this gate script
    //                      itself. `checkJs` is what makes it more than a parse.
    argv: ['turbo', 'run', 'typecheck', 'typecheck:e2e', 'typecheck:scripts', '--force'],
    fallback: [
      ['-r', 'run', 'typecheck'],
      ['run', 'typecheck:e2e'],
      ['run', 'typecheck:scripts'],
    ],
    why: 'strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes — src, tests, e2e and scripts',
  },
  {
    name: 'build',
    argv: ['turbo', 'run', 'build', '--force'],
    fallback: [['-r', 'run', 'build']],
    // Defect 20: every package and service as above, then the four apps on the
    // WebAssembly compiler. The filters are quoted so no shell reads `!` or `*`.
    whenNextBlocked: {
      turbo: [
        ['turbo', 'run', 'build', '--force', '"--filter=!./apps/*"'],
        ['--filter', '"./apps/*"', 'run', 'build', '--webpack'],
      ],
      fallback: [
        ['-r', '"--filter=!./apps/*"', 'run', 'build'],
        ['--filter', '"./apps/*"', 'run', 'build', '--webpack'],
      ],
    },
    slow: true,
    why: 'a package that typechecks can still fail to emit',
  },
  {
    name: 'test',
    argv: ['turbo', 'run', 'test', '--force'],
    fallback: [['-r', 'run', 'test']],
    why: 'unit suites — domain rules, no database',
  },
  {
    name: 'compose',
    argv: ['run', 'compose:check'],
    slow: true,
    why:
      'the stack comes up, migrates, and answers /healthz and /readyz. Four of ' +
      'the fourteen tooling defects were compose failures and all four are ' +
      'marked fixed; until this step, nothing exercised any of them',
  },
  {
    name: 'test:isolation',
    argv: ['run', 'test:isolation'],
    slow: true,
    why: 'tenant A cannot read tenant B, at the table AND through the route. Never skipped before calling something done',
  },
  {
    name: 'test:e2e',
    argv: ['run', 'test:e2e'],
    slow: true,
    why:
      'every screen renders, against the seeded database, in a browser — one Playwright ' +
      'process per shard, each reported on its own row by scripts/e2e.mjs. The only check that ' +
      'can see money printed as raw paise: a PaiseWire is a string, so printing one is ' +
      'type-correct and lint-clean',
  },
];

// `--force` on every turbo step, deliberately. A cached pass is a statement
// about the past: TOOLING-DEFECTS defect 5 records turbo replaying EXIT=0 while
// four test files were failing, because their inputs had not changed.

/** @type {{name: string, status: string, code: number | null, viaFallback?: boolean, viaWebpack?: boolean}[]} */
const results = [];

/**
 * Every command runs even after one fails, for the reason every step does.
 *
 * @param {string[][]} commands
 * @returns {number}
 */
function runAll(commands) {
  let code = 0;
  for (const argv of commands) {
    const run = spawnSync('pnpm', argv, { stdio: 'inherit', shell: true });
    if (run.status !== 0) code = run.status ?? 1;
  }
  return code;
}

for (const step of STEPS) {
  if (fast && step.slow === true) {
    results.push({ name: step.name, status: 'SKIPPED', code: null });
    continue;
  }
  process.stdout.write(`\n──── ${step.name} ────\n`);
  const viaFallback = step.fallback !== undefined && !TURBO;
  const blocked = NEXT_BLOCKED ? step.whenNextBlocked : undefined;
  if (viaFallback) {
    process.stdout.write('  turbo cannot be spawned (defect 19) — running through `pnpm -r run` instead\n');
  }
  if (blocked !== undefined) {
    process.stdout.write('  Next cannot load its native compiler (defect 20) — building the four apps with webpack\n');
  }
  const commands =
    blocked !== undefined
      ? viaFallback
        ? blocked.fallback
        : blocked.turbo
      : viaFallback && step.fallback !== undefined
        ? step.fallback
        : [step.argv];
  const code = runAll(commands);
  results.push({
    name: step.name,
    status: code === 0 ? 'PASS' : 'FAIL',
    code,
    viaFallback,
    viaWebpack: blocked !== undefined,
  });
}

process.stdout.write('\n════ gate ════\n');
for (const r of results) {
  const code = r.code === null ? '—' : String(r.code);
  const via =
    (r.viaFallback === true ? '  (pnpm -r, no turbo)' : '') +
    (r.viaWebpack === true ? '  (apps: webpack, defect 20)' : '');
  process.stdout.write(`  ${r.name.padEnd(16)} ${r.status.padEnd(8)} EXIT=${code}${via}\n`);
}
if (!TURBO) {
  process.stdout.write(
    '\n  turbo could not be spawned; the turbo steps ran through `pnpm -r run` — same tasks,\n' +
      '  dependency order, no cache. docs/TOOLING-DEFECTS.md defect 19.\n',
  );
}
if (results.some((r) => r.viaWebpack === true)) {
  process.stdout.write(
    "\n  Next's native compiler is blocked on this machine; the apps were built with\n" +
      '  `next build --webpack`, on the WebAssembly compiler. docs/TOOLING-DEFECTS.md defect 20.\n',
  );
}

const failed = results.filter((r) => r.status === 'FAIL');
const skipped = results.filter((r) => r.status === 'SKIPPED');

if (skipped.length > 0) {
  process.stdout.write(
    `\n  NOT A FULL GATE — skipped: ${skipped.map((s) => s.name).join(', ')}\n` +
      '  Run `pnpm verify` with no flags before calling anything done.\n',
  );
}

if (failed.length > 0) {
  process.stdout.write(`\n  FAILED: ${failed.map((f) => f.name).join(', ')}\n`);
  process.exit(1);
}

process.stdout.write(
  skipped.length > 0 ? '\n  partial gate green\n' : '\n  full gate green\n',
);

import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * M1/D8: prove a deliberate boundary violation fails lint.
 *
 * This test exists because the rule spent its whole life so far not working.
 * `eslint.config.mjs` declared four zones plus 42 generated cross-service
 * zones, and configured no TypeScript parser — so every file carrying a type
 * annotation failed to parse and its imports were never examined. TOPOLOGY.md,
 * the package READMEs and CI's own comment all described the boundary as
 * enforced. It was not, and nothing noticed, because a rule that cannot parse a
 * file also cannot fail on it.
 *
 * A configured rule is not an enforced rule. This is the difference.
 */

const REPO = join(import.meta.dirname, '../../..');
const PROBE = join(REPO, 'packages/service-kit/src/__boundary_probe.ts');

/**
 * How long one lint of the whole repo may take here.
 *
 * Alone, `eslint .` takes about 90 s on this host; under the gate — turbo
 * running the other sixteen members' suites beside it at concurrency 2 — it
 * measured 205 s on 2026-09-20 and the 120 s the test allowed then timed the
 * FIRST test out while the probe was still on disk, so the second lint ran
 * against the plant and failed too (TOOLING-DEFECTS 22). A timeout here is
 * not a finding about the boundary; ten minutes is the ceiling below which no
 * honest lint of this repo has ever finished.
 */
const LINT_MS = 600_000;

function lint(): { code: number; output: string } {
  try {
    const output = execFileSync('pnpm', ['exec', 'eslint', '.'], {
      cwd: REPO,
      encoding: 'utf8',
      shell: true,
    });
    return { code: 0, output };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

/**
 * Removed **before** each test as well as after.
 *
 * `afterEach` alone is not enough: it does not run when the process is killed,
 * and this fixture lives inside `packages/service-kit/src/`, where a leftover
 * copy imports `services/tenancy` and drags that whole service into
 * service-kit's compilation. That breaks `rootDir`, emits service files into
 * `dist/`, and every subsequent build then fails `TS5055` — **including builds
 * of packages that have nothing to do with this test**. Turbo then caches the
 * broken `dist/`, so the failure outlives the cause.
 *
 * Measured: one interrupted run left the probe behind and the next three
 * `pnpm verify` runs failed on `TS5055` in seven files. Recorded as
 * TOOLING-DEFECTS 10.
 *
 * Cleaning up first makes the suite self-healing rather than merely tidy.
 */
beforeEach(() => {
  rmSync(PROBE, { force: true });
});

afterEach(() => {
  rmSync(PROBE, { force: true });
});

describe('the import boundary is enforced, not merely configured', () => {
  it('fails lint when a package imports a service', () => {
    writeFileSync(
      PROBE,
      [
        '// Temporary fixture written by tests/boundary.test.ts.',
        "import { mintConnectorKey } from '../../../services/tenancy/src/index.js';",
        'export const probe = mintConnectorKey;',
        '',
      ].join('\n'),
    );

    const { code, output } = lint();
    expect(code, 'a package importing a service must fail lint').not.toBe(0);
    expect(output).toContain('import/no-restricted-paths');
    expect(output).toContain('Packages must never import from services');
  }, LINT_MS);

  it('passes once the violation is removed', () => {
    const { code, output } = lint();
    // the output is the finding: a bare exit status says nothing about which
    // file lint objected to, and once it was the probe a timed-out sibling left behind
    expect(code, output.split('\n').slice(-40).join('\n')).toBe(0);
  }, LINT_MS);
});

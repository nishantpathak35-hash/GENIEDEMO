import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * THE SUITE TESTS SOURCE, NOT `dist/`. (TOOLING-DEFECTS defect 8.)
 *
 * Every workspace package declares `"main": "./dist/index.js"` and no exports
 * map, so `import { … } from '@cog/procurement'` resolved to the BUILT package.
 * A source edit therefore changed nothing this suite tested. `pnpm verify`
 * sequenced `build` before `test:isolation`, so the gate was honest — but the
 * iteration loop was not, and it cost one session a false pass on a value that
 * had been deliberately broken to check the test could fail.
 *
 * The aliases are DISCOVERED, not listed. Naming each package here would
 * reproduce defect 6 exactly: the D8 drift checks named their schemas literally
 * and silently stopped covering new ones. A service added next month is aliased
 * without anybody remembering this file.
 */
const ROOT = join(import.meta.dirname, '../..');

function workspaceAliases(): Record<string, string> {
  const alias: Record<string, string> = {};
  for (const group of ['services', 'packages']) {
    const dir = join(ROOT, group);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = join(dir, entry.name, 'package.json');
      const source = join(dir, entry.name, 'src', 'index.ts');
      if (!existsSync(manifest) || !existsSync(source)) continue;
      const name = (JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string }).name;
      // `@cog/api` is this package. Aliasing a package to its own source while
      // the tests import it by relative path would give two module instances.
      if (name === undefined || name === '@cog/api') continue;
      alias[name] = source;
    }
  }
  return alias;
}

const alias = workspaceAliases();

// A guard on the guard. If the discovery silently found nothing — a moved
// directory, a renamed `src/index.ts` — every import would fall back to `dist/`
// and this file would go on looking like it was working.
if (Object.keys(alias).length < 10) {
  throw new Error(
    `workspace alias discovery found only ${String(Object.keys(alias).length)} packages; ` +
      'the isolation suite would silently fall back to testing dist/. Check services/ and packages/.',
  );
}

// Two projects, because they have very different costs and prove different
// things.
//
//   unit      — repo-wide invariants: the import boundary, the route audit,
//               migration ordering, no build output under src/. Seconds.
//   isolation — the real router, the real middleware, a real Postgres. Never
//               skipped: this is where "tenant A cannot read tenant B THROUGH
//               THE ROUTE" is proved, which the database-layer suite cannot say
//               anything about.
export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/*.test.ts'],
        },
        resolve: { alias },
      },
      {
        test: {
          name: 'isolation',
          include: ['tests/isolation/*.test.ts'],
          testTimeout: 180_000,
          hookTimeout: 300_000,
          fileParallelism: false,
        },
        resolve: { alias },
      },
    ],
  },
});

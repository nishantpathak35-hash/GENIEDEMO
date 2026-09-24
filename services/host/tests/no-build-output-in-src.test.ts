import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **No compiled output may live under a `src/` directory.**
 *
 * `services/tenancy/src/` carried eight of them — `index.js`, `index.d.ts`,
 * `connector-key.js`, their `.map` files — committed alongside the `.ts` they
 * were emitted from. `tests/connector-key.test.ts` imports `'../src/index.js'`,
 * and a real `index.js` existed at that exact path.
 *
 * They happened to be in step at the time, so nothing was wrong yet. That is
 * the whole problem: the next edit to a `.ts` leaves its `.js` stale, and any
 * resolver preferring the `.js` then runs the old code while the suite reports
 * green — this repository's signature failure, and the reason
 * `docs/TOOLING-DEFECTS.md` exists.
 *
 * `.gitignore` does not catch it: it ignores `dist/`, and these were not in
 * `dist/`. Only a check that looks at `src/` can.
 */

const REPO = join(import.meta.dirname, '../../..');
const ROOTS = ['services', 'packages', 'apps'];

/** Emitted artifacts. A `.d.ts` is judged by content, not by name. */
const EMITTED_EXTENSIONS = ['.js', '.jsx', '.js.map', '.d.ts.map', '.mjs.map'];

function walk(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.next') {
        continue;
      }
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

/** Every `src/` directory one level under a workspace package. */
function srcDirectories(): string[] {
  const found: string[] = [];
  for (const root of ROOTS) {
    let packages;
    try {
      packages = readdirSync(join(REPO, root), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const pkg of packages) {
      if (!pkg.isDirectory()) continue;
      const src = join(REPO, root, pkg.name, 'src');
      try {
        if (statSync(src).isDirectory()) found.push(src);
      } catch {
        // A package without a src/ directory — apps/web keeps its code in app/.
      }
    }
  }
  return found;
}

describe('no build output under src/', () => {
  const files = srcDirectories().flatMap((dir) => walk(dir));

  it('finds source directories to check', () => {
    // A check that silently examines nothing is worse than no check.
    expect(files.length).toBeGreaterThan(20);
  });

  it('contains no emitted .js or .map files', () => {
    const offenders = files
      .filter((f) => EMITTED_EXTENSIONS.some((ext) => f.endsWith(ext)))
      .map((f) => relative(REPO, f));
    expect(offenders).toEqual([]);
  });

  it('contains no emitted .d.ts files', () => {
    // An ambient or hand-written .d.ts is legitimate. An emitted one carries a
    // source map reference or a tsc banner, so the content is what decides.
    const offenders = files
      .filter((f) => f.endsWith('.d.ts'))
      .filter((f) => {
        const text = readFileSync(f, 'utf8');
        return text.includes('sourceMappingURL') || text.includes('export declare ');
      })
      .map((f) => relative(REPO, f));
    expect(offenders).toEqual([]);
  });
});

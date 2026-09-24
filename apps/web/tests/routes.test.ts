import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODULE_KEYS, ACTION_KEYS } from '@cog/contracts';
import { ROUTES, matchRoute, toRegExp } from '../lib/routes.js';

/**
 * The route manifest is the filesystem, or the "/" search and the two
 * navigations are lying.
 *
 * Both trees are generated from this manifest (`lib/nav.ts`), and the claim
 * that every route is reachable by name is only true while `lib/routes.ts`
 * lists every `page.tsx` under `app/` — a hand-written list decays the
 * moment somebody adds a screen. So this walks the tree the way
 * `e2e/routes.ts` does and fails on the difference, in both directions: a
 * screen with no name, or a name with no screen. Then it holds every entry
 * to the design's mapping table: a level, a module key that exists, an
 * action key that exists.
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.next'].includes(entry.name)) continue;
      walk(full, out);
    } else if (entry.name === 'page.tsx') {
      out.push(full);
    }
  }
  return out;
}

const APP = join(import.meta.dirname, '..', 'app');

/** `app/(shell)/projects/[projectId]/page.tsx` → `/projects/[projectId]`. Route groups vanish. */
function toPattern(file: string): string {
  const rel = relative(APP, file).split(sep).join('/');
  const segments = rel
    .replace(/\/?page\.tsx$/, '')
    .split('/')
    .filter((s) => s !== '' && !(s.startsWith('(') && s.endsWith(')')));
  return `/${segments.join('/')}`;
}

const onDisk = walk(APP)
  .map(toPattern)
  .filter((p) => p !== '/sign-in')
  .sort();

describe('the route manifest', () => {
  it('names every screen under app/, and nothing else', () => {
    const named = ROUTES.map((r) => r.pattern).sort();
    expect(named).toEqual(onDisk);
  });

  it('has no duplicate patterns', () => {
    const patterns = ROUTES.map((r) => r.pattern);
    expect(new Set(patterns).size).toBe(patterns.length);
  });

  it('every entry names a module key and an action key the contracts know, or none', () => {
    for (const route of ROUTES) {
      if (route.module !== null) expect(MODULE_KEYS, `${route.pattern}: module ${route.module}`).toContain(route.module);
      if (route.action !== null) expect(ACTION_KEYS, `${route.pattern}: action ${route.action}`).toContain(route.action);
    }
  });

  it('a route under a project is at the project level or reached from one; a firm route never carries [projectId]', () => {
    for (const route of ROUTES) {
      const underProject = route.pattern.startsWith('/projects/[projectId]');
      if (underProject) expect(['project', 'neither'], route.pattern).toContain(route.level);
      if (route.level === 'firm') expect(route.pattern, route.pattern).not.toContain('[projectId]');
    }
  });

  it('a record page says which list it is opened from, and that list is a route', () => {
    for (const route of ROUTES.filter((r) => /\[[^\]]+\]$/.test(r.pattern))) {
      if (route.group === 'Project' && route.via === undefined) continue; // a project tab, reached via the project
      expect(route.via, `${route.pattern} needs a via`).toBeDefined();
      expect(ROUTES.some((r) => r.pattern === route.via)).toBe(true);
    }
  });

  it('the four routes with no module are sign-in, export, the operator’s and a person’s own — here, only settings and preferences', () => {
    const none = ROUTES.filter((r) => r.module === null).map((r) => r.pattern);
    for (const pattern of none) expect(pattern, pattern).toMatch(/^\/(settings|preferences)/);
  });
});

describe('matching a pathname', () => {
  it('resolves a concrete path to its pattern, longest first', () => {
    expect(matchRoute('/projects/abc/boq/def')?.pattern).toBe('/projects/[projectId]/boq/[itemId]');
    expect(matchRoute('/projects/abc/boq')?.pattern).toBe('/projects/[projectId]/boq');
    expect(matchRoute('/vendors/rate-contracts')?.pattern).toBe('/vendors/rate-contracts');
    expect(matchRoute('/vendors/xyz')?.pattern).toBe('/vendors/[vendorId]');
    expect(matchRoute('/')?.pattern).toBe('/');
    expect(matchRoute('/nowhere')).toBeUndefined();
  });

  it('a pattern regexp does not over-match', () => {
    expect(toRegExp('/projects').test('/projects/abc')).toBe(false);
    expect(toRegExp('/projects/[projectId]').test('/projects/abc/boq')).toBe(false);
  });
});

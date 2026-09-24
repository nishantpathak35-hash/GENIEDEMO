import { existsSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { DEMO_TENANTS, PLATFORM_OPERATOR } from '../scripts/demo-principals.mjs';

/**
 * Every screen in the repo, discovered from the filesystem.
 *
 * **Discovered, not listed.** A hand-written list of 39 routes is a claim that
 * decays the moment somebody adds a page — and the whole reason this suite
 * exists is that 39 screens were shipped without anybody checking they render.
 * A list would reproduce that failure one screen at a time. `SCREEN_COUNT`
 * below is asserted, so adding a page turns the suite red until it is either
 * covered or explicitly excluded, and excluding one has to be written down.
 *
 * This is the shape of `apps-compute-nothing.test.ts`, and for the same reason:
 * defect 6 was a check that silently examined nothing.
 */

export const APPS = ['web', 'admin', 'vendor-portal', 'client-portal'] as const;
export type AppName = (typeof APPS)[number];

/** Origins. Four deployables, four ports, four cookies. */
export const ORIGIN: Record<AppName, string> = {
  web: process.env['E2E_WEB_URL'] ?? 'http://localhost:3000',
  admin: process.env['E2E_ADMIN_URL'] ?? 'http://localhost:3001',
  'vendor-portal': process.env['E2E_VENDOR_URL'] ?? 'http://localhost:3002',
  'client-portal': process.env['E2E_CLIENT_URL'] ?? 'http://localhost:3003',
};

/** The cookie each app reads its credential from. They are deliberately different. */
/**
 * Who the suite signs in as — read from the seed's own constant, so a renamed
 * demo tenant reaches every spec at once (`scripts/demo-principals.mjs`).
 */
const FIRST_TENANT = DEMO_TENANTS[0];
if (FIRST_TENANT === undefined) throw new Error('demo-principals.mjs lists no tenant');
export const DEMO = {
  admin: FIRST_TENANT.admin.email,
  /** The second tenant's administrator — for tests that must not disturb the first tenant's shape. */
  adminB: DEMO_TENANTS[1]?.admin.email ?? FIRST_TENANT.admin.email,
  finance: FIRST_TENANT.finance.email,
  proc: FIRST_TENANT.proc.email,
  operator: PLATFORM_OPERATOR.email,
  vendor: FIRST_TENANT.vendorPortal.email,
  client: FIRST_TENANT.clientPortal.email,
} as const;

/** The credential each app's suite signs in with. */
export const CREDENTIAL: Record<AppName, string> = {
  web: DEMO.admin,
  admin: DEMO.operator,
  'vendor-portal': DEMO.vendor,
  'client-portal': DEMO.client,
};

export const COOKIE: Record<AppName, string> = {
  web: 'cog_credential',
  admin: 'cog_admin_credential',
  'vendor-portal': 'cog_vendor_credential',
  'client-portal': 'cog_client_credential',
};

export interface Screen {
  readonly app: AppName;
  /** Route with `[param]` segments still in place. */
  readonly pattern: string;
  /** `apps/web/app/(shell)/projects/[projectId]/page.tsx`, for failure messages. */
  readonly file: string;
  readonly dynamic: boolean;
}

/**
 * The repo root.
 *
 * Not `import.meta.dirname`: the root `package.json` is CommonJS, Playwright
 * transpiles specs to CJS, and `import.meta` is a syntax error there. Playwright
 * runs with cwd set to the config's directory, which is the root — walked up
 * from anyway, and asserted, so a wrong cwd fails loudly instead of silently
 * discovering zero screens.
 */
function repoRoot(): string {
  let dir = process.cwd();
  for (let up = 0; up < 5; up += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = join(dir, '..');
  }
  throw new Error(`could not find the repo root from ${process.cwd()}`);
}

const REPO = repoRoot();

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
      if (['node_modules', '.next', 'dist', '.turbo'].includes(entry.name)) continue;
      walk(full, out);
    } else if (entry.name === 'page.tsx') {
      out.push(full);
    }
  }
  return out;
}

/**
 * `app/(shell)/projects/[projectId]/page.tsx` → `/projects/[projectId]`.
 *
 * Route groups — the `(shell)` and `(signed-in)` parentheses — are Next.js
 * layout grouping and contribute nothing to the URL, so they are stripped
 * rather than encoded.
 */
function toPattern(app: AppName, file: string): string {
  const rel = relative(join(REPO, 'apps', app, 'app'), file).split(sep).join('/');
  const withoutFile = rel.replace(/\/?page\.tsx$/, '');
  const segments = withoutFile
    .split('/')
    .filter((s) => s !== '' && !(s.startsWith('(') && s.endsWith(')')));
  return `/${segments.join('/')}`;
}

export const SCREENS: readonly Screen[] = APPS.flatMap((app) =>
  walk(join(REPO, 'apps', app, 'app'))
    .map((file) => ({
      app,
      pattern: toPattern(app, file),
      file: relative(REPO, file).split(sep).join('/'),
      dynamic: /\[[^\]]+\]/.test(file),
    }))
    .sort((a, b) => a.pattern.localeCompare(b.pattern)),
);

/**
 * Asserted, not informational.
 *
 * Raise it in the same commit that adds a screen — and when you do, add the
 * concrete id for any new `[param]` to `resolveParams` in `screens.spec.ts`,
 * or the new screen is "covered" by a test that quietly skips it.
 */
export const SCREEN_COUNT = 79;

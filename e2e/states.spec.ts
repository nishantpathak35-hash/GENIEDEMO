import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { COOKIE, DEMO, ORIGIN, SCREENS, type AppName, type Screen } from './routes.js';

/**
 * The states a screen is in when the good path is not available — asserted on
 * every screen, not described in a comment.
 *
 * `screens.spec.ts` proves each screen renders its data and refuses to accept a
 * degraded state as a pass. That leaves the degraded states themselves unseen,
 * and they are what a person meets on a bad day. Three of them, per route:
 *
 * - **Refused.** Signed in as a login of the wrong KIND for the application —
 *   a vendor on the staff app, staff on a portal, a tenant user on the platform
 *   console. The API refuses it; the screen must say so, and must not crash,
 *   leak a stack or render as though it had data.
 * - **Unreachable.** The same apps run a second time by `scripts/e2e.mjs` with
 *   their API address pointed at a closed port. Every screen must say the API
 *   is not reachable — the notice that once passed this suite 39 times as a
 *   "rendered" screen is here the thing required.
 * - **Not found.** Every screen that takes a record id, given one that exists
 *   nowhere, must say so rather than render an empty record or a 500.
 *
 * Ids are a fixed uuid no seed produces: nothing here needs a real record, and
 * a real one would make "not found" untrue.
 */

const NOBODY = '00000000-0000-4000-8000-00000000dead';

/** The wrong kind of login for each application — the refusal every screen must state. */
const WRONG_KIND: Record<AppName, string> = {
  web: DEMO.vendor,
  admin: DEMO.admin,
  'vendor-portal': DEMO.admin,
  'client-portal': DEMO.vendor,
};

const DEAD: Record<AppName, string | undefined> = {
  web: process.env['E2E_DEAD_WEB_URL'],
  admin: process.env['E2E_DEAD_ADMIN_URL'],
  'vendor-portal': process.env['E2E_DEAD_VENDOR_PORTAL_URL'],
  'client-portal': process.env['E2E_DEAD_CLIENT_PORTAL_URL'],
};

const SIGNED_IN = SCREENS.filter((s) => s.pattern !== '/sign-in');

function withNobody(pattern: string): string {
  return pattern.replace(/\[[^\]]+\]/g, NOBODY);
}

async function signIn(context: BrowserContext, origin: string, app: AppName, credential: string): Promise<void> {
  const { hostname } = new URL(origin);
  await context.addCookies([
    { name: COOKIE[app], value: credential, domain: hostname, path: '/', httpOnly: true, sameSite: 'Lax' },
  ]);
}

/**
 * React's development-only performance tracks call `performance.measure` with
 * the server component's render times; when the dev server's clock (the
 * container's) runs ahead of the browser's (the host's), the start lands in
 * the future and Chromium throws `cannot have a negative time stamp` as a page
 * error — from React's instrumentation, not from the page. Measured 2026-09-20:
 * five screens in one run, none in the next, always this message
 * (TOOLING-DEFECTS 23). It is not a crash of anything this suite guards, so it
 * is the one page error left out of `watch`.
 */
const DEV_CLOCK_SKEW = /'measure' on 'Performance'.*negative time stamp/;

function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (error) => {
    if (!DEV_CLOCK_SKEW.test(error.message)) problems.push(`pageerror: ${error.message}`);
  });
  return problems;
}

/**
 * The stream has settled: the network idle, or thirty seconds of it never
 * going idle — a dev server keeps a socket open and a busy host can hold a
 * request that long — and then no skeleton left standing. What the test
 * asserts next is the CONTENT, so a page that never went idle is judged on
 * what it rendered, not failed on the wait.
 */
/**
 * A dev server compiling a route can drop the connection outright (`net::ERR_CONNECTION_RESET`,
 * once in the 2026-09-21 gate on a no-API copy) rather than answer slowly; the second attempt lands.
 * One retry, on that error alone — every other failure is the screen's to explain.
 */
async function goto(page: Page, url: string): Promise<import('@playwright/test').Response | null> {
  try {
    return await page.goto(url, { waitUntil: 'domcontentloaded' });
  } catch (error) {
    if (!(error instanceof Error && /ERR_CONNECTION_RESET|ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE/.test(error.message))) throw error;
    await page.waitForTimeout(3_000);
    return page.goto(url, { waitUntil: 'domcontentloaded' });
  }
}

async function settled(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
  await page
    .locator('[aria-busy="true"]')
    .first()
    .waitFor({ state: 'detached', timeout: 120_000 })
    .catch(() => undefined);
}

/** No crash in any form: no 5xx, no error boundary, no dev overlay, no exception in the page. */
async function noCrash(page: Page, screen: Screen, status: number, problems: string[]): Promise<string> {
  expect(status, `${screen.file} answered ${String(status)}`).toBeLessThan(500);
  const body = await page.locator('body').innerText();
  expect(body, `${screen.file} rendered an error page`).not.toMatch(
    /Application error: a server-side exception|Unhandled Runtime Error|Internal Server Error/i,
  );
  const portal = page.locator('nextjs-portal');
  if ((await portal.count()) > 0) {
    expect(await portal.first().innerText(), `${screen.file} has a Next.js error overlay`).not.toMatch(
      /unhandled|exception|failed to compile/i,
    );
  }
  expect(problems, `${screen.file} threw in the page:\n${problems.join('\n')}`).toEqual([]);
  return body;
}

test.describe('refused — a login of the wrong kind is told so, on every screen', () => {
  test.describe.configure({ timeout: 120_000 });
  for (const screen of SIGNED_IN) {
    test(`${screen.app} ${screen.pattern}`, async ({ page, context }) => {
      const origin = ORIGIN[screen.app];
      await signIn(context, origin, screen.app, WRONG_KIND[screen.app]);
      const problems = watch(page);
      const response = await goto(page, `${origin}${withNobody(screen.pattern)}`);
      await settled(page);
      const body = await noCrash(page, screen, response?.status() ?? 0, problems);
      // The refusal notice, in words — never a screen that looks like it has data.
      expect(body, `${screen.file} did not say the login was refused`).toMatch(
        /refused|not permitted|do not have permission|cannot see|not available to this login|sign in as/i,
      );
      expect(await page.locator('.notice.bad, [role="alert"]').count(), `${screen.file} shows no refusal notice`).toBeGreaterThan(0);
    });
  }
});

test.describe('unreachable — every screen says the API is not reachable', () => {
  test.describe.configure({ timeout: 180_000 });
  for (const screen of SIGNED_IN) {
    test(`${screen.app} ${screen.pattern}`, async ({ page, context }) => {
      const origin = DEAD[screen.app];
      expect(origin, 'scripts/e2e.mjs starts the unreachable-API apps and names their origins').toBeDefined();
      if (origin === undefined) return;
      const credential = screen.app === 'admin' ? DEMO.operator : screen.app === 'vendor-portal' ? DEMO.vendor : screen.app === 'client-portal' ? DEMO.client : DEMO.admin;
      await signIn(context, origin, screen.app, credential);
      const problems = watch(page);
      const response = await goto(page, `${origin}${withNobody(screen.pattern)}`);
      await settled(page);
      const body = await noCrash(page, screen, response?.status() ?? 0, problems);
      expect(body, `${screen.file} did not say the API is unreachable`).toMatch(/The API is not reachable/);
    });
  }
});

test.describe('not found — a record that exists nowhere is said so', () => {
  test.describe.configure({ timeout: 120_000 });
  const RIGHT_KIND: Record<AppName, string> = {
    web: DEMO.admin,
    admin: DEMO.operator,
    'vendor-portal': DEMO.vendor,
    'client-portal': DEMO.client,
  };
  for (const screen of SIGNED_IN.filter((s) => s.dynamic)) {
    test(`${screen.app} ${screen.pattern}`, async ({ page, context }) => {
      const origin = ORIGIN[screen.app];
      await signIn(context, origin, screen.app, RIGHT_KIND[screen.app]);
      const problems = watch(page);
      const response = await goto(page, `${origin}${withNobody(screen.pattern)}`);
      await settled(page);
      const body = await noCrash(page, screen, response?.status() ?? 0, problems);
      expect(body, `${screen.file} did not say the record was not found`).toMatch(
        /not found|could not be found|no such|does not exist/i,
      );
    });
  }
});

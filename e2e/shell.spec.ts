import { test, expect, type BrowserContext } from '@playwright/test';
import { ROUTES } from '../apps/web/lib/routes.js';
import { COOKIE, DEMO, ORIGIN } from './routes.js';

/**
 * The shell: the navigation cut is safe only because the "/" search reaches
 * every route by name.
 *
 * `screens.spec.ts` proves every screen renders and answers 200 — discovered
 * from the filesystem, so a route cannot vanish without that suite going red.
 * This file proves the other half of the IA change: with eight destinations
 * instead of sixteen, every one of the demoted screens is still one keystroke
 * away. For every named route outside a project, it presses `/`, types the
 * name, presses Enter, and asserts the browser landed on that route. A project
 * tab is checked once through a seeded project, and a record page is checked
 * to land on the list it says it opens from.
 *
 * Then the rest of the keyboard model in `13-decisions.html`: `?` opens the
 * help, Esc closes the top-most thing and never navigates, and the theme
 * control writes `data-theme` on the root and persists nothing.
 */

const API = process.env['E2E_API_URL'] ?? 'http://localhost:4000';
const ADMIN = DEMO.admin;

async function signIn(context: BrowserContext, credential = ADMIN): Promise<void> {
  const { hostname } = new URL(ORIGIN.web);
  await context.addCookies([
    { name: COOKIE.web, value: credential, domain: hostname, path: '/', httpOnly: true, sameSite: 'Lax' },
  ]);
}

/** The bar's search: its accessible name says where it looks — "Search in Orders", "Search everything". */
const searchBox = (page: import('@playwright/test').Page) => page.getByRole('combobox', { name: /^Search/ }).first();

/** Navigate and wait for the client to hydrate — the key listeners are attached by React, not by the HTML. */
async function open(page: import('@playwright/test').Page, path: string): Promise<void> {
  await page.goto(`${ORIGIN.web}${path}`, { waitUntil: 'networkidle' });
  await searchBox(page).waitFor();
}

/**
 * Press "/" until the box takes focus. The box is in the server's HTML before React attaches the key
 * listener, and on a busy dev server `networkidle` can land in that gap: one press then falls on the
 * document and nothing happens (three tests over two gate runs, 2026-09-21). A press that lands after
 * hydration focuses the box; the first press that does ends the loop, so no "/" is ever typed into it.
 */
async function slash(page: import('@playwright/test').Page): Promise<void> {
  await expect(async () => {
    await page.keyboard.press('/');
    await expect(searchBox(page)).toBeFocused({ timeout: 1_000 });
  }).toPass({ timeout: 20_000, intervals: [250, 500, 1_000] });
}

async function seededProject(): Promise<{ id: string; code: string }> {
  const res = await fetch(`${API}/api/v1/projects`, { headers: { authorization: `Bearer ${ADMIN}` } });
  const body = (await res.json()) as { items: { id: string; code: string }[] };
  const first = body.items[0];
  if (first === undefined) throw new Error('no seeded project — run the seed first');
  return first;
}

const NAMED = ROUTES.filter((r) => r.group !== 'Project' && r.via === undefined);
const RECORDS = ROUTES.filter((r) => r.via !== undefined && r.group !== 'Project');
const PROJECT_TABS = ROUTES.filter((r) => r.group === 'Project' && r.via === undefined);

test.describe('the "/" search reaches every route by name', () => {
  // A cold Next.js dev server compiles each route on first request; the
  // navigation itself is instant, the compile is not.
  test.describe.configure({ timeout: 120_000 });

  test('the manifest is not empty', () => {
    expect(NAMED.length).toBeGreaterThan(25);
    expect(PROJECT_TABS.length).toBeGreaterThan(10);
  });

  for (const route of NAMED) {
    test(`${route.name} → ${route.pattern}`, async ({ page, context }) => {
      await signIn(context);
      await open(page, '/settings/audit');
      await slash(page);
      const box = searchBox(page);
      await box.fill(route.name);
      const option = page.getByRole('option', { name: new RegExp(`^${escape(route.name)}\\b`) }).first();
      await expect(option).toBeVisible();
      // The wanted route may not be the first match ("Orders" is also a project tab), so pick it by
      // walking to it with the arrow keys rather than by mouse.
      const options = page.getByRole('option');
      const count = await options.count();
      let index = -1;
      for (let i = 0; i < count; i += 1) {
        const text = (await options.nth(i).innerText()).replace(/\s+/g, ' ').trim();
        if (text.startsWith(`${route.name} `) && text.endsWith(route.group)) {
          index = i;
          break;
        }
      }
      expect(index, `${route.name} is not offered by the search`).toBeGreaterThanOrEqual(0);
      for (let i = 0; i < index; i += 1) await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForURL((url) => url.pathname === route.pattern, { timeout: 90_000 });
      expect(new URL(page.url()).pathname).toBe(route.pattern);
    });
  }

  test('a record page opens from the list it names', async ({ page, context }) => {
    await signIn(context);
    await open(page, '/');
    for (const route of RECORDS) {
      await slash(page);
      const box = searchBox(page);
      await box.fill(route.name);
      await expect(page.getByRole('option').first()).toBeVisible();
      await page.keyboard.press('Enter');
      await page.waitForURL((url) => url.pathname === route.via, { timeout: 90_000 });
    }
  });

  test.describe('every project tab is reachable through the project code', () => {
    let project: { id: string; code: string };
    test.beforeAll(async () => {
      project = await seededProject();
    });
    for (const route of PROJECT_TABS) {
      test(`${route.name}`, async ({ page, context }) => {
        await signIn(context);
        await open(page, '/');
        await slash(page);
        const box = searchBox(page);
        await box.fill(`${project.code} · ${route.name}`);
        await expect(page.getByRole('option').first()).toBeVisible();
        await page.keyboard.press('Enter');
        const expected = route.pattern.replace('[projectId]', project.id);
        await page.waitForURL((url) => url.pathname === expected, { timeout: 90_000 });
      });
    }
  });
});

test.describe('the keyboard model', () => {
  test('"?" opens the help and Esc closes it without navigating', async ({ page, context }) => {
    await signIn(context);
    await open(page, '/projects');
    // the same gap as `slash`: a "?" pressed before React attaches its listener falls on the document
    const help = page.getByRole('dialog', { name: 'Keyboard' });
    await expect(async () => {
      await page.keyboard.press('?');
      await expect(help).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000, intervals: [250, 500, 1_000] });
    await page.keyboard.press('Escape');
    await expect(help).toBeHidden();
    expect(new URL(page.url()).pathname).toBe('/projects');
  });

  test('"/" does not steal the slash from a text field', async ({ page, context }) => {
    await signIn(context);
    await open(page, '/projects');
    const code = page.getByLabel('Code');
    await code.fill('');
    await code.focus();
    await page.keyboard.type('A/B');
    await expect(code).toHaveValue('A/B');
    await expect(searchBox(page)).not.toBeFocused();
  });

  test('the sidebar comes after the content in the DOM', async ({ page, context }) => {
    await signIn(context);
    await open(page, '/projects');
    const order = await page.evaluate(() => {
      const main = document.querySelector('main');
      const aside = document.querySelector('aside.side');
      if (main === null || aside === null) return 'missing';
      return main.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING ? 'after' : 'before';
    });
    expect(order).toBe('after');
    // and the skip link is the first thing Tab reaches
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  });
});

test.describe('the theme control', () => {
  test('writes data-theme on the root and persists nothing', async ({ page, context }) => {
    await signIn(context);
    await open(page, '/projects');
    // the control lives in the account menu, behind the avatar
    await page.getByRole('button', { name: /^Account menu/ }).click();
    await page.getByRole('radio', { name: 'Dark' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('radio', { name: 'Light' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('radio', { name: 'System' }).check();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
    await page.getByRole('radio', { name: 'Dark' }).check();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
    const stored = await page.evaluate(() => ({
      local: Object.keys(localStorage).length,
      session: Object.keys(sessionStorage).length,
      cookies: document.cookie,
    }));
    expect(stored.local).toBe(0);
    expect(stored.session).toBe(0);
    expect(stored.cookies).toBe('');
  });
});

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe('the single-key switch — WCAG 2.1.4', () => {
  // The preference is the person's. This test turns it OFF for a while, and the suite runs its files in
  // parallel: as the admin, every "/" pressed by another worker in that window would type itself
  // (shard 3 of the 2026-09-21 gate). So the person here is the finance login, whose shortcuts nobody
  // else presses, and the admin's stay on throughout.
  const PERSON = DEMO.finance;
  test.afterEach(async () => {
    // the switch goes back on whatever happened above, so a failure here does not leave it off
    await fetch(`${API}/api/v1/shell/preferences`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${PERSON}`, 'content-type': 'application/json' },
      body: JSON.stringify({ singleKeyShortcuts: true }),
    });
  });
  test('turned off in Your preferences, "/" and "?" type themselves; turned on again, they work', async ({ page, context }) => {
    await signIn(context, PERSON);
    await open(page, '/preferences');
    const toggle = page.getByRole('switch', { name: 'Use single-key shortcuts' });
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await page.getByRole('button', { name: 'Save' }).click();
    // the page says it saved — the server's word, not the switch's own state
    await expect(page.getByText(/^Saved/)).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Use single-key shortcuts' })).not.toBeChecked();
    // the switch is the shell's: on another screen the keys are inert
    await open(page, '/projects');
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Keyboard' })).toBeHidden();
    await page.keyboard.press('/');
    await expect(searchBox(page)).not.toBeFocused();
    expect(new URL(page.url()).pathname).toBe('/projects');
    // and back on, so the person this suite signs in as is left as it found them
    await open(page, '/preferences');
    await page.getByRole('switch', { name: 'Use single-key shortcuts' }).check();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/^Saved/)).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Use single-key shortcuts' })).toBeChecked();
    await open(page, '/projects');
    await slash(page);
  });
});

test.describe('Settings › Terminology reaches every label', () => {
  // serial: the words are the firm's, one row per tenant, so a second worker's afterEach would put them back mid-test
  test.describe.configure({ timeout: 120_000, mode: 'serial' });
  const headers = { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' };
  const choose = (body: Record<string, string>) => fetch(`${API}/api/v1/settings/terminology`, { method: 'PUT', headers, body: JSON.stringify(body) });

  test.afterEach(async () => {
    // the words go back to the pairs' first, so no other test reads Suppliers
    const res = await choose({ boq: 'BOQ', variation: 'Variation', dailyReport: 'Daily report', vendor: 'Vendor' });
    expect(res.status).toBe(200);
  });

  test('the sidebar, the list title, its column, the quick-create and the search scope say the firm’s word', async ({ browser }) => {
    const context = await browser.newContext();
    await signIn(context);
    const page = await context.newPage();
    expect((await choose({ vendor: 'Supplier', variation: 'Change order' })).status).toBe(200);

    await open(page, '/vendors');
    // the sidebar's entry, and the section it sits in, in the firm's word
    const side = page.getByRole('navigation', { name: 'Main' });
    await expect(side.getByRole('link', { name: /^Suppliers\b/ })).toBeVisible();
    await expect(side.getByRole('link', { name: /^Vendors\b/ })).toHaveCount(0);
    // the list's title and its first column
    await expect(page.getByRole('heading', { level: 1 })).toContainText('All suppliers');
    await expect(page.getByRole('columnheader', { name: 'Supplier' })).toBeVisible();
    // the quick-create beside the current entry
    await expect(page.getByRole('link', { name: 'New supplier' })).toBeVisible();
    // the search's scope
    await expect(searchBox(page)).toHaveAttribute('placeholder', /Search in Suppliers/);

    // a project's tree: Variations is Change orders
    const project = await seededProject();
    await open(page, `/projects/${project.id}/change-orders`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Change orders');
    await expect(side.getByRole('link', { name: /^Change orders\b/ })).toBeVisible();
    await context.close();
  });

  test('a word outside its pair is refused', async () => {
    const res = await choose({ vendor: 'Merchant' });
    expect(res.status).toBe(400);
  });
});

test.describe('Today › Getting started', () => {
  test.describe.configure({ timeout: 120_000 });

  test('a tab on Today while setup is open: the six steps, the ones the server sees done, and the four with no shortcut', async ({ page, context }) => {
    await signIn(context);
    const res = await fetch(`${API}/api/v1/today/setup`, { headers: { authorization: `Bearer ${ADMIN}` } });
    const setup = (await res.json()) as { done: number; total: number; pct: number; steps: { key: string; state: string }[] };
    expect(setup.total).toBe(6);
    test.skip(setup.done === setup.total, 'every step is done on this seed, so the tab has left');

    await open(page, '/');
    // the card is no longer on Today's body; the tab is beside Today
    await expect(page.locator('.card.setup')).toHaveCount(0);
    const tabs = page.getByRole('navigation', { name: 'Views' });
    await expect(tabs.getByRole('link', { name: 'Getting started' })).toBeVisible();
    await tabs.getByRole('link', { name: 'Getting started' }).click();
    await page.waitForURL(/tab=setup/);
    const card = page.locator('.card.setup');
    await expect(card.locator('ol > li')).toHaveCount(6);
    await expect(card.locator('ol > li.done')).toHaveCount(setup.done);
    // the percent is the server's (`pct`), drawn, never worked out here
    await expect(card.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(setup.pct));
    await expect(page.getByText('Four steps have no shortcut yet')).toBeVisible();
    await expect(page.locator('.kv dt')).toHaveCount(4);
    // the next open step is the one primary button
    await expect(card.locator('a.btn.primary')).toHaveCount(1);
  });
});

test.describe('the scoped search reaches records', () => {
  test.describe.configure({ timeout: 120_000 });

  test('an order number typed on Orders finds the order first; a vendor’s name finds the vendor everywhere', async ({ page, context }) => {
    await signIn(context);
    const res = await fetch(`${API}/api/v1/purchase-orders?limit=1`, { headers: { authorization: `Bearer ${ADMIN}` } });
    const first = ((await res.json()) as { items: { number: string; vendorName: string | null }[] }).items[0];
    if (first === undefined) throw new Error('no seeded order — run the seed first');

    await open(page, '/purchase-orders');
    const box = searchBox(page);
    await box.fill(first.number);
    // the read answers after a pause in typing; "Nothing matches …" is also an option, so wait for a real hit
    const top = page.locator('.search-results li[role="option"]:not(.none)').first();
    await expect(top).toContainText(first.number);
    // the first option is the active one; Enter opens it (the keyboard model), as the search tests above do
    await box.press('Enter');
    await page.waitForURL(/\/purchase-orders\/[0-9a-f-]{36}/);

    if (first.vendorName !== null) {
      await open(page, '/settings/audit');
      await searchBox(page).fill(first.vendorName.slice(0, 8));
      await expect(page.locator('.search-results li[role="option"]:not(.none)').filter({ hasText: new RegExp(escape(first.vendorName.slice(0, 8)), 'i') }).first()).toBeVisible();
    }
  });
});

import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { COOKIE, DEMO, ORIGIN } from './routes.js';

/**
 * The Reports Center — `docs/design/11-settings.html`, "Reports": the nine
 * reads the panels own, each one run, filtered on its own parameters,
 * exported on the existing path, and starred into the person's favourites.
 */
const API = process.env['E2E_API_URL'] ?? 'http://localhost:4000';
const ADMIN = DEMO.admin;
const NINE = ['receivablesAgeing', 'payablesAgeing', 'moneyByMonth', 'spendByTrade', 'projectRollup', 'unsignedVariations', 'milestonesThisWeek', 'siteToday', 'pipelineSummary'];

async function signIn(context: BrowserContext): Promise<void> {
  const { hostname } = new URL(ORIGIN.web);
  await context.addCookies([{ name: COOKIE.web, value: ADMIN, domain: hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);
}
const open = (page: Page, path: string) => page.goto(`${ORIGIN.web}${path}`, { waitUntil: 'networkidle' });

async function seededProject(): Promise<{ id: string; code: string }> {
  const res = await fetch(`${API}/api/v1/projects`, { headers: { authorization: `Bearer ${ADMIN}` } });
  const body = (await res.json()) as { items: { id: string; code: string }[] };
  const first = body.items[0];
  if (first === undefined) throw new Error('no seeded project — run the seed first');
  return first;
}

test.describe('the Reports Center', () => {
  test.describe.configure({ timeout: 180_000, mode: 'serial' });

  const clearStars = () =>
    fetch(`${API}/api/v1/shell/preferences`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ starredReports: [] }),
    });
  // the stars go back off, so no other test reads a favourite
  test.beforeAll(clearStars);
  test.afterAll(clearStars);

  test('lists exactly the nine, grouped, with Favourites first', async ({ page, context }) => {
    await signIn(context);
    await open(page, '/reports');
    const rows = page.locator('.settings-tbl tbody tr:not(.grp)');
    await expect(rows).toHaveCount(9);
    await expect(page.locator('.settings-tbl tr.grp')).toHaveCount(5);
    await expect(page.getByRole('navigation', { name: 'Categories' }).getByRole('link').first()).toContainText('Favourites');
  });

  test('every one of the nine runs — a table or a stated empty, never a raw figure', async ({ page, context }) => {
    await signIn(context);
    for (const key of NINE) {
      await open(page, `/reports?run=${key}`);
      await expect(page.getByRole('heading', { level: 1 }), key).toBeVisible();
      const table = page.locator('.card table.tbl tbody tr');
      const empty = page.locator('.empty');
      expect((await table.count()) + (await empty.count()), `${key} ran to nothing`).toBeGreaterThan(0);
      const body = await page.locator('main').innerText();
      expect(body, `${key} printed raw paise`).not.toMatch(/\b\d{7,}\b/);
    }
  });

  test('a report filters on its read’s own parameters, and exports on the existing path', async ({ page, context }) => {
    await signIn(context);
    await open(page, '/reports?run=spendByTrade');
    await page.getByLabel('Period').selectOption('q');
    await page.getByRole('button', { name: 'Run' }).click();
    await page.waitForURL(/period=q/);
    await expect(page.locator('.card-h .sub')).toContainText(/Q[1-4]/);
    const href = await page.getByRole('link', { name: 'Export' }).getAttribute('href');
    expect(href).toMatch(/\/export\/report-spendByTrade\?.*period=q/);
    const csv = await page.request.get(`${ORIGIN.web}${href ?? ''}`);
    expect(csv.status()).toBe(200);
    expect(csv.headers()['content-type']).toContain('text/csv');
    const text = await csv.text();
    expect(text.split('\n')[0]).toContain('Trade');
  });

  test('a star is the person’s favourite, kept in the preference store', async ({ page, context }) => {
    await signIn(context);
    await open(page, '/reports');
    await page.getByRole('button', { name: 'Favourite Site today' }).click();
    await expect(page.getByRole('button', { name: 'Unfavourite Site today' })).toBeVisible();
    const prefs = (await (await fetch(`${API}/api/v1/shell/preferences`, { headers: { authorization: `Bearer ${ADMIN}` } })).json()) as { starredReports: string[] };
    expect(prefs.starredReports).toContain('siteToday');
    await open(page, '/reports');
    // Favourites first: the one starred report, and nothing else, under the Favourites view
    await expect(page.locator('.settings-tbl tbody tr:not(.grp)')).toHaveCount(1);
    await page.getByRole('button', { name: 'Unfavourite Site today' }).click();
    await expect(page.getByRole('button', { name: 'Favourite Site today' })).toBeVisible();
  });

  test('the project twin narrows the nine to the project, and says which one cannot', async ({ page, context }) => {
    await signIn(context);
    await clearStars();
    const project = await seededProject();
    await open(page, `/projects/${project.id}/reports`);
    await expect(page.locator('.settings-tbl tbody tr:not(.grp)')).toHaveCount(9);
    await expect(page.getByText('firm-wide: leads are not a project’s')).toBeVisible();
    await open(page, `/projects/${project.id}/reports?run=projectRollup`);
    await expect(page.locator('.card table.tbl tbody tr')).toHaveCount(1);
    await expect(page.locator('.card table.tbl tbody tr').first()).toContainText(project.code);
  });
});

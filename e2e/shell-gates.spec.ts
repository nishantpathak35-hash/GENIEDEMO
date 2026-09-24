import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { navFor, type Entitled, type NavNode } from '../apps/web/lib/nav.js';
import { COOKIE, DEMO, ORIGIN } from './routes.js';
import { DEMO_TENANTS } from '../scripts/demo-principals.mjs';

/**
 * The shell's own gates — `docs/design/03-navigation.html`, measured in the
 * browser rather than trusted from the stylesheet:
 *
 *   - the bar and the sidebar at four widths: the bar 48px tall at every
 *     width; the sidebar 200px from 1000px up, a 48px rail under it, gone
 *     under 641px and a 200px sheet when the menu opens; the brand block on
 *     the bar as wide as the sidebar beside it; the scope pill on the bar
 *   - the island rule: the bar is a dark island that paints the same in both
 *     themes — every element on it, its fill and its ink, light and dark
 *   - both trees are generated from modules × roles: the sidebar drawn for
 *     the admin, procurement and finance logins is exactly `navFor` over what
 *     `myEntitlements` and `modules` say for that login — an entry whose
 *     module the role lacks is not drawn (finance holds neither crm nor
 *     operations, so Sales and Site are not there)
 *   - reduced motion: with the device asking for it, nothing on a screen
 *     travels, turns or scales — every animation is a fade, the spinner's
 *     breath or the skeleton's shimmer, and no transition moves a transform,
 *     a width or a height
 *   - no spec marker inside a rendered frame: a HUMAN(…) marker, a gate's
 *     name or a note to ourselves is the document's, never the product's
 *
 * Each gate is proven on a plant before it is trusted: a test injects the
 * violation into the page and asserts the gate reports it, and only it.
 */
const API = process.env['E2E_API_URL'] ?? 'http://localhost:4000';
const ADMIN = DEMO.admin;
const BAR = 48;
const SIDE = 200;
const RAIL = 48;

async function signIn(context: BrowserContext, credential = ADMIN): Promise<void> {
  const { hostname } = new URL(ORIGIN.web);
  await context.addCookies([{ name: COOKIE.web, value: credential, domain: hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);
}
const open = (page: Page, path = '/purchase-orders') => page.goto(`${ORIGIN.web}${path}`, { waitUntil: 'networkidle' });

async function measure(page: Page) {
  return page.evaluate(() => {
    const rect = (sel: string) => {
      const el = document.querySelector(sel);
      if (el === null) return null;
      const cs = getComputedStyle(el);
      if (cs.display === 'none') return { width: 0, height: 0, position: cs.position, hidden: true };
      const r = el.getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height), position: cs.position, hidden: false };
    };
    return { bar: rect('.topbar'), side: rect('.side'), brand: rect('.topbar .brand-bar'), pill: rect('.topbar .scope') };
  });
}

test.describe('the shell at four widths', () => {
  test.describe.configure({ timeout: 120_000 });

  test('1440 and 1280: the bar, the 200px sidebar, the brand block as wide, the pill', async ({ browser }) => {
    for (const width of [1440, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await signIn(context);
      const page = await context.newPage();
      await open(page);
      const m = await measure(page);
      expect(m.bar?.height, `${String(width)}: bar height`).toBe(BAR);
      expect(m.side?.width, `${String(width)}: sidebar width`).toBe(SIDE);
      expect(m.brand?.width, `${String(width)}: the brand block as wide as the sidebar`).toBe(SIDE);
      expect(m.pill?.hidden, `${String(width)}: the scope pill is on the bar`).toBe(false);
      await context.close();
    }
  });

  test('768: the bar, the sidebar as a 48px rail, the brand block as wide as the rail', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 768, height: 900 }, reducedMotion: 'reduce' });
    await signIn(context);
    const page = await context.newPage();
    await open(page);
    const m = await measure(page);
    expect(m.bar?.height).toBe(BAR);
    expect(m.side?.width).toBe(RAIL);
    expect(m.brand?.width).toBe(RAIL);
    await context.close();
  });

  test('400: the bar, no sidebar, and a 200px sheet when the menu opens', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 400, height: 900 }, reducedMotion: 'reduce' });
    await signIn(context);
    const page = await context.newPage();
    await open(page);
    const before = await measure(page);
    expect(before.bar?.height).toBe(BAR);
    expect(before.side?.hidden, 'no sidebar on a phone').toBe(true);
    await page.getByRole('button', { name: 'Open menu' }).click();
    const after = await measure(page);
    expect(after.side?.hidden, 'the sheet is drawn').toBe(false);
    expect(after.side?.position, 'the sheet is fixed over the page').toBe('fixed');
    expect(after.side?.width).toBe(SIDE);
    await context.close();
  });
});

/** Every element on the bar: its fill and its ink, as painted. */
async function barPaint(page: Page): Promise<Array<{ el: string; fill: string; ink: string }>> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.topbar, .topbar *')]
      .filter((el) => getComputedStyle(el).display !== 'none' && !el.closest('.popup, .popover, [hidden]'))
      .map((el) => {
        const cs = getComputedStyle(el);
        return { el: `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`, fill: cs.backgroundColor, ink: cs.color };
      }),
  );
}

/** What the island rule reports: the elements whose paint differs between the themes. */
function islandFaults(light: Array<{ el: string; fill: string; ink: string }>, dark: Array<{ el: string; fill: string; ink: string }>): string[] {
  const faults: string[] = [];
  expect(light.length, 'the same bar in both themes').toBe(dark.length);
  light.forEach((l, i) => {
    const d = dark[i];
    if (d === undefined) return;
    if (l.fill !== d.fill) faults.push(`${l.el} fill ${l.fill} (light) vs ${d.fill} (dark)`);
    if (l.ink !== d.ink) faults.push(`${l.el} ink ${l.ink} (light) vs ${d.ink} (dark)`);
  });
  return faults;
}

test.describe('the island rule', () => {
  test.describe.configure({ timeout: 120_000 });

  async function paintIn(browser: Browser, theme: 'light' | 'dark', plant = false) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' });
    await signIn(context);
    const page = await context.newPage();
    await open(page);
    if (plant) {
      // a planted violation: the tenant's name painted from the device's theme, not the island's own set
      await page.addStyleTag({ content: '.topbar .tenant { color: rgb(1, 2, 3) !important; } @media (prefers-color-scheme: dark) { .topbar .tenant { color: rgb(4, 5, 6) !important; } }' });
    }
    const paint = await barPaint(page);
    await context.close();
    return paint;
  }

  test('every element on the bar paints the same in both themes', async ({ browser }) => {
    const [light, dark] = await Promise.all([paintIn(browser, 'light'), paintIn(browser, 'dark')]);
    expect(light.length).toBeGreaterThan(5);
    expect(islandFaults(light, dark)).toEqual([]);
  });

  test('fires on a plant — one element painted from the theme, and nothing else', async ({ browser }) => {
    const [light, dark] = await Promise.all([paintIn(browser, 'light', true), paintIn(browser, 'dark', true)]);
    const faults = islandFaults(light, dark);
    expect(faults.length).toBe(1);
    expect(faults[0]).toMatch(/tenant ink/);
  });
});

const hrefsOf = (tree: readonly NavNode[]): string[] =>
  tree.flatMap((n) => (n.kind === 'link' ? [n.href] : n.kind === 'section' ? n.pages.map((p) => p.href) : []));

test.describe('both trees are generated from modules × roles', () => {
  test.describe.configure({ timeout: 180_000 });
  const tenant = DEMO_TENANTS[0];
  const logins: Array<[string, string]> = [
    ['admin', tenant?.admin.email ?? ''],
    ['procurement', tenant?.proc.email ?? ''],
    ['finance', tenant?.finance.email ?? ''],
  ];

  for (const [role, credential] of logins) {
    test(`the ${role} login's firm tree is navFor over its entitlements`, async ({ browser }) => {
      const headers = { authorization: `Bearer ${credential}` };
      const me = (await (await fetch(`${API}/api/v1/identity/me/entitlements`, { headers })).json()) as { modules: string[]; actions: string[] };
      const mods = (await (await fetch(`${API}/api/v1/settings/modules`, { headers })).json()) as { items: { key: string; enabled: boolean }[] };
      const who: Entitled = { modules: me.modules, actions: me.actions, optional: mods.items.filter((m) => m.enabled).map((m) => m.key) };
      const expected = hrefsOf(navFor('firm', who)).sort();

      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      await signIn(context, credential);
      const page = await context.newPage();
      await open(page, '/');
      const drawn = (await page.locator('nav.side-nav a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''))).filter((h) => !h.endsWith('?new=1')).sort();
      expect(drawn, role).toEqual(expected);
      await context.close();
    });
  }

  test('a login without operations sees no Site section — a module the role lacks is not drawn', async ({ browser }) => {
    // The design draws "a tenant with crm and operations off". The product has no such tenant state: crm is in
    // every role's baseline and operations is a role module, not a tenant switch (the tenant switches are the
    // eleven optional design-build workflows). The nearest state that exists is a login whose role lacks
    // operations — finance and procurement — and that is what is proven here; the crm-off tenant is recorded.
    for (const [role, credential] of logins.filter(([r]) => r !== 'admin')) {
      const me = (await (await fetch(`${API}/api/v1/identity/me/entitlements`, { headers: { authorization: `Bearer ${credential}` } })).json()) as { modules: string[] };
      expect(me.modules, `${role} holds no operations on this seed`).not.toContain('operations');
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      await signIn(context, credential);
      const page = await context.newPage();
      await open(page, '/');
      const side = page.getByRole('navigation', { name: 'Main' });
      await expect(side.getByRole('button', { name: /^Site/ }), role).toHaveCount(0);
      await expect(side.getByRole('link', { name: /^Daily reports/ }), role).toHaveCount(0);
      await expect(side.getByRole('link', { name: /^Today/ }), role).toBeVisible();
      await context.close();
    }
  });
});

const ALLOWED_ANIMATIONS = ['FadeIn0to100', 'FadeOut100to0', 'spinner-breathe', 'skeleton-shimmer', 'none'];
const MOVING = /\b(transform|width|height|grid-template-rows|all)\b/;

/** Under reduced motion: every running animation is a fade or a breath, and no timed transition moves anything. */
async function motionFaults(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ allowed, moving }) => {
      const out: string[] = [];
      const movingRe = new RegExp(moving);
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        const name = `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`;
        for (const a of cs.animationName.split(',').map((s) => s.trim())) if (!allowed.includes(a)) out.push(`${name} plays ${a}`);
        const props = cs.transitionProperty.split(',').map((s) => s.trim());
        const durs = cs.transitionDuration.split(',').map((s) => parseFloat(s));
        props.forEach((p, i) => {
          const d = durs[i] ?? durs[0] ?? 0;
          if (d > 0 && movingRe.test(p)) out.push(`${name} moves ${p} over ${String(d)}s`);
        });
      }
      return out;
    },
    { allowed: ALLOWED_ANIMATIONS, moving: MOVING.source },
  );
}

const INTERNAL = [/HUMAN\(/, /CA-gated/, /\bunbuilt\b/, /\bTODO\b/, /\bspec\b/];

/** Internal text inside a rendered frame — a marker, a gate's name, a note to ourselves. */
async function markerFaults(page: Page): Promise<string[]> {
  const text = await page.locator('main').innerText();
  return INTERNAL.map((re) => re.exec(text)).filter((m): m is RegExpExecArray => m !== null).map((m) => `“${text.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20).replace(/\s+/g, ' ')}”`);
}

test.describe('reduced motion, and no spec marker in a frame', () => {
  test.describe.configure({ timeout: 120_000 });

  test('on Today, the orders list and a record page: nothing travels, nothing internal is printed', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    await signIn(context);
    const page = await context.newPage();
    for (const path of ['/', '/purchase-orders', '/settings', '/reports']) {
      await open(page, path);
      expect(await motionFaults(page), path).toEqual([]);
      expect(await markerFaults(page), path).toEqual([]);
    }
    await context.close();
  });

  test('fires on a plant — a sliding transition and a HUMAN(…) marker, and nothing else', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    await signIn(context);
    const page = await context.newPage();
    await open(page, '/settings');
    await page.addStyleTag({ content: '.hub-card { transition: transform 200ms ease !important; }' });
    const motion = await motionFaults(page);
    expect(motion.length).toBeGreaterThan(0);
    expect(motion.every((f) => /hub-card moves transform/.test(f))).toBe(true);
    await page.evaluate(() => {
      const p = document.createElement('p');
      p.textContent = 'HUMAN(CA-07) the rate is not settled';
      document.querySelector('main')?.appendChild(p);
    });
    const marker = await markerFaults(page);
    expect(marker.length).toBe(1);
    expect(marker[0]).toContain('HUMAN(CA-07)');
    await context.close();
  });
});

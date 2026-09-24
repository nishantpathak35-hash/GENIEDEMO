import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { COOKIE, CREDENTIAL, DEMO, ORIGIN, SCREENS, type AppName, type Screen } from './routes.js';
import { RULES, SCREEN_RULES, measureBar, measureFocusRing, measureLayout, measurePopover, measureShellStuck, measureSticky, type LayoutArgs, type LayoutResult } from './layout.js';

/**
 * The design's gates, ported — the half that needs a browser — and the
 * layout detector: what the eye sees, measured on every screen.
 *
 * `docs/design/README.md` lists what its own build measures on every file at
 * four widths in both themes; `scripts/design-gates.mjs` holds the static
 * half (no literal outside `styles.css`, chart isolation, caution
 * containment, the token contrast pairs, the breakpoint ladder, scroll
 * traps), and `dashboard-gates.spec.ts` the dashboard grid's.
 *
 * **Caution, amended 19 September 2026 with the design's own gate** (E3 in
 * `docs/design/build/gates/alignment.mjs`): caution as TEXT is allowed — an
 * amber small-capitals label over an ink figure — and the contrast pairs hold
 * it; the caution FILL is for a lozenge or the published section message only,
 * so a figure, a label or a sentence on it is a highlighter and fails; amber
 * is still never a border, an outline or a stroke.
 *
 * One pass over every screen at 1280 in light asserts the structural rules —
 * at most one hero, every empty state illustrated with at most one action,
 * every list counted, no chart mark painted in a status colour, caution ink
 * only on its own fill.
 *
 * **The detector (22 September 2026)** replaced the three alignment rules
 * this file measured before — button heights in a group, a numeric column's
 * right edge, and the document's scroll width. Those passed on a product that
 * was not usable at a laptop width: the bar overflowed its own 48px row
 * without moving `document.scrollWidth`, page widths differed from screen to
 * screen, and popovers opened past the window. `e2e/layout.ts` names the
 * eleven rules; this file runs them over every screen at seven widths (400 ·
 * 640 · 768 · 1024 · 1280 · 1366 · 1440, at 900 tall, and 1024 and 1366 at
 * 600 — a laptop with browser chrome), in both themes, with the page scrolled
 * to its middle for the sticky rule; a record pane open where a screen has
 * one; every bar popover open on the shell; and a tab through every screen
 * for the focus ring. Rule j is static and lives in `scripts/design-gates.mjs`.
 *
 * **The baseline.** `e2e/alignment-baseline.json` holds, per screen, width,
 * theme and state, how many faults of each rule the product had when the
 * detector was written — measured with `LAYOUT_BASELINE=write`, merged by
 * `scripts/layout-baseline.mjs`, and committed BEFORE any fix so the diff of
 * that file shows which fault each fix closed. A fault within its baseline
 * count is reported, not failed; a new one fails. The file shrinks with each
 * fix and goes when it is empty.
 *
 * Read with `screens.spec.ts`, which proves every screen renders and answers
 * 200, and `shell.spec.ts`, which proves every route is reachable by name.
 */

const API = process.env['E2E_API_URL'] ?? 'http://localhost:4000';
const ADMIN = DEMO.admin;
const ROOT = join(__dirname, '..');
const BASELINE_FILE = join(ROOT, 'e2e', 'alignment-baseline.json');
const RECORDS_DIR = join(ROOT, 'e2e', 'results', 'layout');
const WRITE = process.env['LAYOUT_BASELINE'] === 'write';
/** key → rule → the number of faults the product had before the fixes. */
const BASELINE: Record<string, Record<string, number>> = existsSync(BASELINE_FILE) ? (JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as Record<string, Record<string, number>>) : {};

interface Fixture {
  projectId: string;
  boqItemId: string;
  purchaseOrderId: string;
  vendorId: string;
  leadId: string;
  clientProjectId: string;
  billId: string | null;
  invoiceId: string | null;
}
let fixture: Fixture;

async function api<T>(path: string, credential = ADMIN): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${credential}` } });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return (await res.json()) as T;
}

test.beforeAll(async () => {
  type List<T> = { items: T[] };
  const first = <T>(list: T[], what: string): T => {
    const one = list[0];
    if (one === undefined) throw new Error(`the seed produced no ${what}`);
    return one;
  };
  const project = first((await api<List<{ id: string }>>('/api/v1/projects')).items, 'projects');
  fixture = {
    projectId: project.id,
    boqItemId: first((await api<List<{ id: string }>>(`/api/v1/projects/${project.id}/boq`)).items, 'BOQ items').id,
    purchaseOrderId: first((await api<List<{ id: string }>>('/api/v1/purchase-orders')).items, 'orders').id,
    vendorId: first((await api<List<{ id: string }>>('/api/v1/purchase-orders/vendors')).items, 'vendors').id,
    leadId: first((await api<List<{ id: string }>>('/api/v1/projects/leads')).items, 'leads').id,
    clientProjectId: first(
      (await api<List<{ id: string }>>('/api/v1/portal/client/projects', CREDENTIAL['client-portal'])).items,
      'client projects',
    ).id,
    billId: (await api<List<{ id: string }>>('/api/v1/purchase-orders/bills')).items[0]?.id ?? null,
    invoiceId: (await api<List<{ id: string }>>('/api/v1/money/client-invoices')).items[0]?.id ?? null,
  };
});

function resolveFor(screen: Screen): string {
  if (screen.app === 'client-portal') return screen.pattern.replace('[projectId]', fixture.clientProjectId);
  return screen.pattern
    .replace('[projectId]', fixture.projectId)
    .replace('[itemId]', fixture.boqItemId)
    .replace('[id]', fixture.purchaseOrderId)
    .replace('[vendorId]', fixture.vendorId)
    .replace('[leadId]', fixture.leadId);
}

async function signIn(context: BrowserContext, app: AppName): Promise<void> {
  const { hostname } = new URL(ORIGIN[app]);
  await context.addCookies([
    { name: COOKIE[app], value: CREDENTIAL[app], domain: hostname, path: '/', httpOnly: true, sameSite: 'Lax' },
  ]);
}

async function open(page: Page, context: BrowserContext, screen: Screen): Promise<void> {
  if (screen.pattern !== '/sign-in') await signIn(context, screen.app);
  await page.goto(`${ORIGIN[screen.app]}${resolveFor(screen)}`, { waitUntil: 'networkidle' });
}

/** The structural rules, measured in the page. */
async function structure(page: Page) {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const token = (name: string) => root.getPropertyValue(name).trim();
    // A hex or rgb() token, as the browser will report it in computed style.
    const asRgb = (value: string): string => {
      const probe = document.createElement('span');
      probe.style.color = value;
      document.body.appendChild(probe);
      const rgb = getComputedStyle(probe).color;
      probe.remove();
      return rgb;
    };
    const status = ['--ok', '--warn', '--bad', '--waiting', '--accent', '--ok-soft', '--warn-soft', '--bad-soft', '--waiting-soft', '--accent-soft'].map((n) => asRgb(token(n)));
    const warn = asRgb(token('--warn'));
    const warnSoft = asRgb(token('--warn-soft'));

    const heroes = document.querySelectorAll('.hero').length;
    const empties = [...document.querySelectorAll('.empty')].map((el) => ({
      illustrations: el.querySelectorAll('.illo').length,
      actions: el.querySelectorAll('.actions > *').length,
      title: el.querySelector('b, strong')?.textContent?.trim() ?? '',
    }));
    // A list is a data table inside a panel; its count is a pager or a "showing" line in the same panel,
    // or — a record page's table, the design's full order page — the count beside the card's title
    // ("3 lines · checked against…"). A table inside a form is an editing grid (stages of a chain,
    // manpower rows, order lines being typed) — it is written, not browsed, and carries no count.
    const lists = [...document.querySelectorAll('table.tbl')].filter((table) => table.closest('form') === null && !table.classList.contains('kbd-table')).map((table) => {
      const panel = table.closest('.list-frame, section, .card, .pane');
      const titled = panel?.querySelector('.card-h .ct .sub')?.textContent?.trim() ?? '';
      const counted = panel !== null && (panel.querySelector('.pager .count, .showing') !== null || /^\d/.test(titled));
      return { headers: [...table.querySelectorAll('thead th')].map((th) => th.textContent?.trim() ?? '').join(' · '), counted };
    });
    const chartFaults: string[] = [];
    for (const el of document.querySelectorAll('.spark *, .meter *, .chart *, .hbar *')) {
      const cs = getComputedStyle(el);
      // `border-color` defaults to currentColor, so an unbordered link inside a chart row
      // "has" an accent border-color; only a border that is painted counts.
      const bordered = ['top', 'right', 'bottom', 'left'].some(
        (side) => cs.getPropertyValue(`border-${side}-style`) !== 'none' && cs.getPropertyValue(`border-${side}-width`) !== '0px',
      );
      for (const prop of ['fill', 'stroke', 'background-color', 'border-color'] as const) {
        if (prop === 'border-color' && !bordered) continue;
        const v = cs.getPropertyValue(prop);
        if (status.includes(v)) chartFaults.push(`${el.tagName.toLowerCase()}.${el.className.toString()} ${prop} ${v}`);
      }
    }
    const cautionFaults: string[] = [];
    const FILL_HOLDERS = '.pill, .notice, .next, .late, .due.today, .tag, .flag, .banner';
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      const name = `${el.tagName.toLowerCase()}.${el.className.toString()}`;
      // amber is an area, never a border, an outline or a stroke
      for (const side of ['top', 'right', 'bottom', 'left']) {
        const painted = cs.getPropertyValue(`border-${side}-style`) !== 'none' && parseFloat(cs.getPropertyValue(`border-${side}-width`)) > 0;
        if (painted && cs.getPropertyValue(`border-${side}-color`) === warn) cautionFaults.push(`${name} paints caution on its ${side} border`);
      }
      if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 && cs.outlineColor === warn) cautionFaults.push(`${name} paints caution on its outline`);
      if (cs.stroke === warn && parseFloat(cs.strokeWidth) > 0) cautionFaults.push(`${name} paints caution on a stroke`);
      // the caution fill under text is a lozenge or a section message, never a highlighter
      if (cs.backgroundColor === warnSoft && (el.textContent ?? '').trim() !== '' && !el.matches(FILL_HOLDERS)) {
        cautionFaults.push(`${name} is a highlighter: text on the caution fill`);
      }
    }
    // a table's head is small capitals since the familiar look (COMPONENT-MAP §2, "Table heads");
    // sentence case stands everywhere else
    const uppercase = [...document.querySelectorAll('h1, h2, h3, button, .pill, label')].filter((el) => {
      const cs = getComputedStyle(el);
      return cs.textTransform === 'uppercase';
    }).length;
    return { heroes, empties, lists, chartFaults, cautionFaults, uppercase };
  });
}

test.describe('every screen, once, at 1280 light', () => {
  test.describe.configure({ timeout: 90_000 });
  for (const screen of SCREENS) {
    test(`${screen.app} ${screen.pattern}`, async ({ page, context }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await open(page, context, screen);
      const s = await structure(page);
      expect(s.heroes, 'at most one hero per screen').toBeLessThanOrEqual(1);
      if (screen.app === 'web' && screen.pattern === '/') expect(s.heroes, 'Today carries exactly one hero').toBe(1);
      for (const e of s.empties) {
        expect(e.illustrations, `empty state "${e.title}" carries one illustration`).toBe(1);
        expect(e.actions, `empty state "${e.title}" offers at most one action`).toBeLessThanOrEqual(1);
      }
      for (const l of s.lists) expect(l.counted, `the list [${l.headers}] carries a count`).toBe(true);
      expect(s.chartFaults, 'no chart mark paints a status colour').toEqual([]);
      expect(s.cautionFaults, 'caution ink sits only on its own fill').toEqual([]);
      expect(s.uppercase, 'sentence case: no uppercase heading, control or pill').toBe(0);
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// the layout detector
// ───────────────────────────────────────────────────────────────────────────

/** The matrix: seven widths at 900 tall, and the two laptop widths at 600 — a browser with its chrome. */
const VIEWPORTS: ReadonlyArray<{ readonly w: number; readonly h: number }> = [
  { w: 400, h: 900 }, { w: 640, h: 900 }, { w: 768, h: 900 }, { w: 1024, h: 900 }, { w: 1280, h: 900 }, { w: 1366, h: 900 }, { w: 1440, h: 900 },
  { w: 1024, h: 600 }, { w: 1366, h: 600 },
];
const THEMES = ['light', 'dark'] as const;
const CONTEXT = { reducedMotion: 'reduce', locale: 'en-IN', timezoneId: 'Asia/Kolkata' } as const;

/**
 * The ladder's arithmetic for the content's padding edge, per app and width.
 *
 * The shell: the sidebar is 200 from 1000 up, the rail (48) under it, and a
 * sheet (0) under 640; with a record pane open the rail stands in for the
 * sidebar under 1380, where 200 + a usable list + 340 cannot fit. The page's
 * gutter is 32 beside the sidebar, 24 beside the rail, 16 on a phone. A
 * portal has no sidebar and the phone frame's 16 at every width.
 */
function edgeFor(app: AppName, pattern: string, width: number, pane: boolean): LayoutArgs['edge'] {
  if (pattern === '/sign-in') return null; // no shell around the sign-in form
  if (app !== 'web') return { left: 16, right: 16, selector: '.p-body' };
  const railed = width < 1000 || (pane && width < 1380);
  const side = width < 640 ? 0 : railed ? 48 : 200;
  const gutter = width < 640 ? 16 : railed ? 24 : 32;
  return { left: side + gutter, right: gutter, selector: '.page' };
}
/** The touch size at a width: 44 on a phone, 40 on a tablet, nothing to check above 768. */
const touchFor = (width: number): number | null => (width <= 400 ? 44 : width <= 768 ? 40 : null);

interface Target {
  readonly app: AppName;
  readonly pattern: string;
  /** '' for the screen as it opens; ' · pane' with a record open beside the list. */
  readonly state: string;
  readonly pane: boolean;
  readonly url: () => string;
}

/** Every screen, plus the three list screens with a record open beside the list. */
const TARGETS: readonly Target[] = [
  ...SCREENS.map((s): Target => ({
    app: s.app,
    pattern: s.pattern,
    state: '',
    // the approvals queue opens its oldest order beside the list on its own
    pane: s.app === 'web' && s.pattern === '/approvals',
    url: () => `${ORIGIN[s.app]}${resolveFor(s)}`,
  })),
  { app: 'web', pattern: '/money/bills', state: ' · pane', pane: true, url: () => `${ORIGIN.web}/money/bills?bill=${fixture.billId ?? ''}` },
  { app: 'web', pattern: '/money/client-billing', state: ' · pane', pane: true, url: () => `${ORIGIN.web}/money/client-billing?invoice=${fixture.invoiceId ?? ''}` },
];

const keyOf = (t: Target, w: number, h: number, theme: string): string => `${t.app} ${t.pattern}${t.state} · ${String(w)}x${String(h)} ${theme}`;

interface Record_ {
  key: string;
  faults: Record<string, string[]>;
  content: LayoutResult['content'];
}

/** Two frames, so a resize has laid out and any effect keyed to it has run. */
async function settle(page: Page): Promise<void> {
  // a skeleton is a different layout from the screen it stands in for, and a font that has not arrived
  // measures differently from the one that has — both are the page mid-flight, not the page
  await page.locator('[aria-busy="true"]').first().waitFor({ state: 'detached', timeout: 20_000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

/** Hold a measured count to its baseline, or record it when writing the baseline. */
function hold(key: string, rule: string, faults: readonly string[]): void {
  if (WRITE) return;
  const allowed = BASELINE[key]?.[rule] ?? 0;
  const what = (RULES as Record<string, string>)[rule] ?? rule;
  expect.soft(faults.length, `${key} · (${rule}) ${what}\n    ${faults.join('\n    ')}`).toBeLessThanOrEqual(allowed);
}

function keep(records: readonly Record_[], name: string): void {
  if (!WRITE) return;
  mkdirSync(RECORDS_DIR, { recursive: true });
  writeFileSync(join(RECORDS_DIR, `${name.replace(/[^a-z0-9]+/gi, '_')}.json`), JSON.stringify(records, null, 1));
}

test.describe('layout: every screen at seven widths, both themes, scrolled, with its pane', () => {
  test.describe.configure({ timeout: 240_000 });
  for (const t of TARGETS) {
    test(`${t.app} ${t.pattern}${t.state}`, async ({ browser }, testInfo) => {
      test.skip(t.state !== '' && ((t.pattern === '/money/bills' && fixture.billId === null) || (t.pattern === '/money/client-billing' && fixture.invoiceId === null)), 'the seed has no record to open');
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', ...CONTEXT });
      if (t.pattern !== '/sign-in') await signIn(context, t.app);
      const page = await context.newPage();
      await page.goto(t.url(), { waitUntil: 'networkidle' });
      await settle(page);
      const records: Record_[] = [];
      for (const theme of THEMES) {
        await page.emulateMedia({ colorScheme: theme });
        for (const { w, h } of VIEWPORTS) {
          await page.setViewportSize({ width: w, height: h });
          await page.evaluate(() => window.scrollTo(0, 0));
          await settle(page);
          const paneShown = t.pane && (await page.locator('.lv.with-pane .pane').count()) > 0;
          const m = await page.evaluate(measureLayout, { edge: edgeFor(t.app, t.pattern, w, paneShown), touch: touchFor(w) });
          // scrolled to the middle: the sticky rule, and the document's width again
          const scrollable = await page.evaluate(() => {
            const room = document.documentElement.scrollHeight - window.innerHeight;
            window.scrollTo(0, room / 2);
            return room > 0;
          });
          await settle(page);
          const i: string[] = [];
          const note = (found: readonly string[]): void => {
            for (const f of found) if (!i.includes(f)) i.push(f);
          };
          if (scrollable) {
            note(await page.evaluate(measureSticky));
            note(await page.evaluate(measureShellStuck));
          }
          const doc = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          if (doc > 1 && !m.faults.a.some((f) => f.startsWith('the document'))) m.faults.a.push(`the document scrolls sideways by ${String(doc)}px when scrolled down`);
          if (scrollable) {
            // the sidebar's own scroll never moves the page: a wheel over it, from the middle
            const sideAt = await page.evaluate(() => {
              const side = document.querySelector<HTMLElement>('.app > .body > .side');
              if (side === null || getComputedStyle(side).display === 'none' || getComputedStyle(side).position === 'fixed') return null;
              const r = side.getBoundingClientRect();
              const y = Math.min(window.innerHeight - 8, Math.max(r.top, 0) + 120);
              return y > r.top && y < r.bottom ? { x: r.left + r.width / 2, y } : { x: r.left + r.width / 2, y: -1 };
            });
            if (sideAt !== null) {
              if (sideAt.y < 0) note(['aside.side is not on screen to be scrolled']);
              else {
                const before = await page.evaluate(() => window.scrollY);
                await page.mouse.move(sideAt.x, sideAt.y);
                await page.mouse.wheel(0, 2400);
                await settle(page);
                const after = await page.evaluate(() => window.scrollY);
                if (Math.abs(after - before) > 1) note([`a wheel over aside.side moved the page ${String(Math.round(after - before))}px`]);
              }
            }
            // and at the end of the scroll
            await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
            await settle(page);
            note(await page.evaluate(measureSticky));
            note(await page.evaluate(measureShellStuck));
          }
          await page.evaluate(() => window.scrollTo(0, 0));
          const key = keyOf(t, w, h, theme);
          const faults: Record<string, string[]> = { ...m.faults, i };
          records.push({ key, faults, content: m.content });
          for (const rule of SCREEN_RULES) hold(key, rule, faults[rule] ?? []);
        }
      }
      await testInfo.attach('layout', { body: JSON.stringify(records, null, 1), contentType: 'application/json' });
      keep(records, `layout ${t.app} ${t.pattern}${t.state}`);
      await context.close();
    });
  }
});

/** The bar's popovers: the button that opens each, and what opens. */
const POPOVERS: ReadonlyArray<{ readonly name: string; readonly button: string; readonly pop: string; readonly type?: string }> = [
  { name: 'switcher', button: '.topbar .scope-btn', pop: '.scope-pop' },
  { name: 'quick-create', button: '.topbar .new-sq', pop: '.topbar .new-menu' },
  { name: 'history', button: '.topbar .history', pop: '.topbar .history-pop' },
  { name: 'bell', button: '.topbar .bell', pop: '.topbar .bell-pop .popover' },
  { name: 'avatar', button: '.topbar .me', pop: '.topbar .me-pop' },
  { name: 'search', button: '.topbar .search input[type="search"]', pop: '.topbar .search-results', type: 'pro' },
];

/** The shell's bar is one component on every screen; it is measured on Today and on a list with its pane, and each portal's bar on its first screen. */
const SHELLS: readonly Target[] = [
  { app: 'web', pattern: '/', state: '', pane: false, url: () => `${ORIGIN.web}/` },
  { app: 'web', pattern: '/money/bills', state: ' · pane', pane: true, url: () => `${ORIGIN.web}/money/bills?bill=${fixture.billId ?? ''}` },
  ...(['admin', 'vendor-portal', 'client-portal'] as const).map((app): Target => {
    const first = SCREENS.find((s) => s.app === app && s.pattern !== '/sign-in' && !s.dynamic);
    return { app, pattern: first?.pattern ?? '/', state: '', pane: false, url: () => `${ORIGIN[app]}${first === undefined ? '/' : resolveFor(first)}` };
  }),
];

test.describe('the bar: one 48px row that fits by folding, and every popover inside the window', () => {
  test.describe.configure({ timeout: 240_000 });
  for (const t of SHELLS) {
    test(`${t.app} ${t.pattern}${t.state}`, async ({ browser }, testInfo) => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', ...CONTEXT });
      await signIn(context, t.app);
      const page = await context.newPage();
      await page.goto(t.url(), { waitUntil: 'networkidle' });
      await settle(page);
      const records: Record_[] = [];
      for (const { w, h } of VIEWPORTS) {
        await page.setViewportSize({ width: w, height: h });
        await settle(page);
        const key = keyOf(t, w, h, 'light');
        const bar = await page.evaluate(measureBar);
        const faults: Record<string, string[]> = { bar };
        hold(`${key} · bar`, 'bar', bar);
        for (const p of POPOVERS) {
          const button = page.locator(p.button).first();
          if ((await button.count()) === 0 || !(await button.isVisible()) || !(await button.isEnabled())) continue;
          // a portal's bell is a count, not a control; only a button, a box or a summary opens anything
          const tag = await button.evaluate((el) => el.tagName);
          if (tag !== 'BUTTON' && tag !== 'INPUT' && tag !== 'SUMMARY') continue;
          if (p.type === undefined) await button.click();
          else {
            await button.click();
            await button.fill(p.type);
          }
          const opened = await page.locator(p.pop).first().waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false);
          const h_ = opened ? await page.evaluate(measurePopover, p.pop) : [`${p.pop} did not open`];
          const barOpen = opened ? await page.evaluate(measureBar) : [];
          const all = [...h_, ...barOpen.filter((f) => !bar.includes(f)).map((f) => `with it open, ${f}`)];
          faults[p.name] = all;
          hold(`${key} · ${p.name}`, 'h', all);
          // closed by its own control, never by a click in the corner: under 640 the switcher is a sheet
          // over the whole screen, so a blind click lands inside it and the next popover opens beneath it
          await page.keyboard.press('Escape');
          if (p.type !== undefined) await button.fill('');
          for (let tries = 0; tries < 3 && (await page.locator(p.pop).first().isVisible().catch(() => false)); tries += 1) {
            await button.evaluate((el) => { (el as HTMLElement).click(); });
            await page.locator(p.pop).first().waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => undefined);
          }
          expect(await page.locator(p.pop).first().isVisible().catch(() => false), `${key}: the ${p.name} closes again`).toBe(false);
        }
        records.push({ key, faults, content: null });
      }
      await testInfo.attach('bar', { body: JSON.stringify(records, null, 1), contentType: 'application/json' });
      keep(records, `bar ${t.app} ${t.pattern}${t.state}`);
      await context.close();
    });
  }
});

test.describe('focus: a tab through every screen keeps the ring on screen and unclipped', () => {
  test.describe.configure({ timeout: 240_000 });
  for (const t of TARGETS.filter((x) => x.state === '')) {
    test(`${t.app} ${t.pattern}`, async ({ browser }, testInfo) => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', ...CONTEXT });
      if (t.pattern !== '/sign-in') await signIn(context, t.app);
      const page = await context.newPage();
      await page.goto(t.url(), { waitUntil: 'networkidle' });
      await settle(page);
      const records: Record_[] = [];
      for (const w of [1280, 400]) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.evaluate(() => {
          window.scrollTo(0, 0);
          (document.activeElement as HTMLElement | null)?.blur();
          (window as unknown as { __tabbed?: Set<Element> }).__tabbed = new Set();
        });
        await settle(page);
        const faults: string[] = [];
        let stops = 0;
        // 250 stops is past any screen here; the loop ends when focus leaves the page or comes round
        for (let n = 0; n < 250; n += 1) {
          await page.keyboard.press('Tab');
          const again = await page.evaluate(() => {
            const el = document.activeElement;
            const seen = (window as unknown as { __tabbed: Set<Element> }).__tabbed;
            if (el === null || el === document.body || seen.has(el)) return true;
            seen.add(el);
            return false;
          });
          if (again) break;
          stops += 1;
          let fault = await page.evaluate(measureFocusRing);
          // a ring is judged where it rests: the browser's scroll to the focused control may land a frame
          // after the key, so a fault is read again after two frames before it counts
          if (fault !== null) {
            await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
            fault = await page.evaluate(measureFocusRing);
          }
          if (fault !== null && !faults.includes(fault)) faults.push(fault);
        }
        const key = `${t.app} ${t.pattern} · ${String(w)}x900 light`;
        records.push({ key, faults: { g: faults, stops: [String(stops)] }, content: null });
        hold(key, 'g', faults);
      }
      await testInfo.attach('focus', { body: JSON.stringify(records, null, 1), contentType: 'application/json' });
      keep(records, `focus ${t.app} ${t.pattern}`);
      await context.close();
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// the plants: each rule fires on its plant, and on nothing else
// ───────────────────────────────────────────────────────────────────────────

test.describe('the detector fires on its plants, and on nothing else', () => {
  test.describe.configure({ timeout: 120_000 });

  /** Faults in `after` that were not in `before`, per rule. */
  const delta = (before: Record<string, string[]>, after: Record<string, string[]>): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    for (const [rule, faults] of Object.entries(after)) {
      const was = new Set(before[rule] ?? []);
      out[rule] = faults.filter((f) => !was.has(f));
    }
    return out;
  };
  const args: LayoutArgs = { edge: { left: 232, right: 32, selector: '.page' }, touch: 40 };
  const SHELL_CHAIN = ['the document', 'main.page', 'div.main', 'div.body', 'div.app'];
  const named = (faults: string[], plant: string): boolean => faults.length > 0 && faults.every((f) => f.includes(plant) || SHELL_CHAIN.some((s) => f.startsWith(s)));

  test('rules a–f, i and k in the page', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', ...CONTEXT });
    await signIn(context, 'web');
    const page = await context.newPage();
    await page.goto(`${ORIGIN.web}/`, { waitUntil: 'networkidle' });
    await settle(page);
    const before = await page.evaluate(measureLayout, args);
    const scroll = () => page.evaluate(() => { window.scrollTo(0, (document.documentElement.scrollHeight - window.innerHeight) / 2); });
    await scroll();
    const stickyBefore = await page.evaluate(measureSticky);
    await page.evaluate(() => window.scrollTo(0, 0));

    // one plant per rule, each a class of its own
    await page.evaluate(() => {
      const main = document.querySelector('main.page') as HTMLElement;
      const add = (cls: string, css: string, html = '', parent: HTMLElement = main): HTMLElement => {
        const el = document.createElement('div');
        el.className = cls;
        el.setAttribute('style', css);
        el.innerHTML = html;
        parent.prepend(el);
        return el;
      };
      // (a, b) a 1300px child of the page
      add('plant-a', 'width: 1300px; height: 12px; background: transparent');
      // (c) two in-flow flex children pulled over each other
      add('plant-c', 'display: flex; gap: 0', '<div class="plant-c1" style="width: 80px; height: 20px"></div><div class="plant-c2" style="width: 80px; height: 20px; position: relative; left: -40px"></div>');
      // (d) a label clipped without an ellipsis
      add('plant-d', 'width: 60px; overflow: hidden; white-space: nowrap', 'A label far too long for its sixty pixels');
      // (e) a fixed-height box with three lines in it
      add('plant-e', 'height: 18px; line-height: 20px', 'one<br>two<br>three');
      // (f) a 24px control
      add('plant-f', 'display: block', '<button class="plant-f-btn" type="button" style="width: 24px; height: 24px; padding: 0; display: inline-flex">x</button>');
      // (i) two sticky boxes at one top, under the bar's 48 — in the page's own flow, so they stay stuck while it
      // scrolls, and overlap each other and nothing else
      add('plant-i', 'display: contents', '<div class="plant-i1" style="position: sticky; top: 48px; height: 30px"></div><div class="plant-i2" style="position: sticky; top: 48px; height: 30px"></div>');
      // (k) the page's padding moved
      main.style.paddingLeft = '132px';
    });
    await settle(page);
    const after = await page.evaluate(measureLayout, args);
    await scroll();
    const stickyAfter = await page.evaluate(measureSticky);
    const d = delta(before.faults, after.faults);
    expect(named(d['a'] ?? [], 'plant-a'), `(a) fires on the 1300px child and its spill up the shell: ${JSON.stringify(d['a'])}`).toBe(true);
    expect(d['b'], '(b) fires on the child past the window').toEqual([expect.stringContaining('div.plant-a')]);
    expect(d['c'], '(c) fires on the two overlapping siblings').toEqual([expect.stringContaining('div.plant-c1')]);
    expect(d['d'], '(d) fires on the clipped label').toEqual([expect.stringContaining('div.plant-d')]);
    expect(d['e'], '(e) fires on the short box').toEqual([expect.stringContaining('div.plant-e')]);
    expect(d['f'], '(f) fires on the 24px button').toEqual([expect.stringContaining('button.plant-f-btn')]);
    // a moved left padding shifts the edge and narrows the content: two faults, both the plant's
    expect(d['k'], '(k) fires on the moved padding').toEqual([expect.stringContaining('content starts at 332px'), expect.stringContaining('content is 916px wide')]);
    const di = stickyAfter.filter((f) => !stickyBefore.includes(f));
    expect(di, '(i) fires on the two sticky boxes').toEqual([expect.stringContaining('div.plant-i1')]);

    // pulled out again, the page reads as before
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('[class^="plant-"]')) el.remove();
      (document.querySelector('main.page') as HTMLElement).style.paddingLeft = '';
      window.scrollTo(0, 0);
    });
    await settle(page);
    const restored = await page.evaluate(measureLayout, args);
    expect(restored.faults, 'without the plants the page reads as before').toEqual(before.faults);
    await context.close();
  });

  test('rule i, the shell: the bar and the sidebar stay on screen, and fail with overflow on .body', async ({ browser }) => {
    // 600 tall, so Today scrolls
    const context = await browser.newContext({ viewport: { width: 1280, height: 600 }, colorScheme: 'light', ...CONTEXT });
    await signIn(context, 'web');
    const page = await context.newPage();
    await page.goto(`${ORIGIN.web}/`, { waitUntil: 'networkidle' });
    await settle(page);
    const stuck = async (): Promise<string[]> => {
      await page.evaluate(() => window.scrollTo(0, (document.documentElement.scrollHeight - window.innerHeight) / 2));
      await settle(page);
      const found = await page.evaluate(measureShellStuck);
      await page.evaluate(() => window.scrollTo(0, 0));
      return found;
    };
    const clear = await stuck();
    expect(clear, 'the shell stays on screen').toEqual([]);
    // an ancestor that clips: the sidebar's sticky now holds to .body, which never scrolls
    await page.evaluate(() => { (document.querySelector('.app > .body') as HTMLElement).style.overflow = 'hidden'; });
    const planted = await stuck();
    expect(planted, '(i) fires on the sidebar, and only on it').toEqual([expect.stringContaining('aside.side sits at')]);
    await page.evaluate(() => { (document.querySelector('.app > .body') as HTMLElement).style.overflow = ''; });
    expect(await stuck(), 'without the plant the shell reads as before').toEqual(clear);
    await context.close();
  });

  test('rules g and h: a clipped ring and a covered popover', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', ...CONTEXT });
    await signIn(context, 'web');
    const page = await context.newPage();
    await page.goto(`${ORIGIN.web}/`, { waitUntil: 'networkidle' });
    await settle(page);
    // (g) a button flush inside a box that hides its overflow: the ring's 2px offset has nowhere to be
    await page.evaluate(() => {
      const box = document.createElement('div');
      box.className = 'plant-g';
      // outside the tree React owns, so a late render cannot take the plant away before it is focused
      box.setAttribute('style', 'overflow: hidden; padding: 0; display: inline-block; position: fixed; left: 300px; top: 300px; z-index: 30');
      box.innerHTML = '<button class="plant-g-btn" type="button">plant</button>';
      document.body.append(box);
    });
    // the ring is drawn for keyboard focus: one Tab sets the modality, then the plant is focused
    await page.keyboard.press('Tab');
    await page.locator('.plant-g-btn').focus();
    expect(await page.evaluate(() => document.activeElement?.className), 'the planted button holds focus').toBe('plant-g-btn');
    const g = await page.evaluate(measureFocusRing);
    expect(g, '(g) fires on the clipped ring').toContain('clipped by div.plant-g');
    await page.evaluate(() => document.querySelector('.plant-g')?.remove());

    // (h) the quick-create menu with a fixed box painted over its centre
    await page.locator('.topbar .new-sq').click();
    await page.locator('.topbar .new-menu').waitFor({ state: 'visible' });
    const clear = await page.evaluate(measurePopover, '.topbar .new-menu');
    await page.evaluate(() => {
      const menu = document.querySelector('.topbar .new-menu') as HTMLElement;
      const r = menu.getBoundingClientRect();
      const lid = document.createElement('div');
      lid.className = 'plant-h';
      lid.setAttribute('style', `position: fixed; left: ${String(r.left)}px; top: ${String(r.top)}px; width: ${String(r.width)}px; height: ${String(r.height)}px; z-index: 100`);
      document.body.appendChild(lid);
    });
    const covered = await page.evaluate(measurePopover, '.topbar .new-menu');
    expect(covered.filter((f) => !clear.includes(f)), '(h) fires on the box over the menu').toEqual([expect.stringContaining('div.plant-h')]);
    await page.evaluate(() => document.querySelector('.plant-h')?.remove());
    expect(await page.evaluate(measurePopover, '.topbar .new-menu'), 'without the plant the menu reads as before').toEqual(clear);
    await context.close();
  });
});

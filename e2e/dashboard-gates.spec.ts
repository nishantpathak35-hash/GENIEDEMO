import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { COOKIE, CREDENTIAL, DEMO, ORIGIN } from './routes.js';

/**
 * The dashboard-grid gate — Today and Overview on one grid, one card
 * (`docs/design/build/gates/alignment.mjs` G8, ported 20 September 2026).
 *
 * Twelve columns on a 24px gutter: every card sits on a track — its left edge
 * and width a whole number of columns — every row's spans add to twelve, cards
 * in a row share the row's height, every header is 48px and one line at every
 * width with its title at most 24 characters, the duotone disc sits first in
 * the header of a tile or a money card and nowhere else, a hovered mark's
 * tooltip sits inside its plot and never over the header, and no internal
 * text — a marker, a gate's name, a note to ourselves — is inside a panel.
 *
 * **House rule: each gate fires on a planted violation before it is trusted.**
 * The last test plants a ten-column row, a 27-character title, a two-line
 * header and a disc on a chart into the rendered page, runs the same gate,
 * and asserts it reports the four plants and nothing else. Both themes, three
 * widths: the design's own breakpoints are the shell's (1380 / 1000 / 760), so
 * 1440 draws the four-tile row, 768 the rail and 400 one column.
 */

const API = process.env['E2E_API_URL'] ?? 'http://localhost:4000';
const WIDTHS = [400, 768, 1440] as const;

let overviewPath = '';

test.beforeAll(async () => {
  const res = await fetch(`${API}/api/v1/projects`, { headers: { authorization: `Bearer ${DEMO.admin}` } });
  if (!res.ok) throw new Error(`GET /projects → ${String(res.status)}`);
  const first = ((await res.json()) as { items: Array<{ id: string }> }).items[0];
  if (first === undefined) throw new Error('the seed produced no projects');
  overviewPath = `/projects/${first.id}`;
});

async function signIn(context: BrowserContext): Promise<void> {
  const { hostname } = new URL(ORIGIN.web);
  await context.addCookies([
    { name: COOKIE.web, value: CREDENTIAL.web, domain: hostname, path: '/', httpOnly: true, sameSite: 'Lax' },
  ]);
}

interface Fault {
  readonly gate: string;
  readonly what: string;
  /** The plant the faulting element sits in, when this is a planted run. */
  readonly plant: string | null;
}

/** The gate, measured in the page. Visible tooltips only: a hidden one is not a specimen. */
async function dashboard(page: Page): Promise<{ faults: Fault[]; grids: number; cards: number; tooltips: number }> {
  return page.evaluate(() => {
    const faults: Array<{ gate: string; what: string; plant: string | null }> = [];
    let cards = 0;
    let tooltips = 0;
    const R = (el: Element) => el.getBoundingClientRect();
    const vis = (el: Element): boolean => {
      const r = R(el);
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
    };
    const push = (gate: string, el: Element, what: string): void => {
      faults.push({ gate, what, plant: el.closest('[data-plant]')?.getAttribute('data-plant') ?? null });
    };
    const spread = (xs: number[]): number => Math.max(...xs) - Math.min(...xs);
    const grids = [...document.querySelectorAll('.dash-grid')].filter(vis);
    for (const grid of grids) {
      const gr = R(grid);
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
      const colW = (gr.width - 11 * gap) / 12;
      const kids = [...grid.children].filter(vis);
      const rows: Array<{ top: number; cells: Array<{ k: Element; span: number; h: number }> }> = [];
      for (const k of kids) {
        const r = R(k);
        const start = Math.round((r.left - gr.left) / (colW + gap));
        const span = Math.round((r.width + gap) / (colW + gap));
        const ex = gr.left + start * (colW + gap);
        const ew = span * colW + (span - 1) * gap;
        if (Math.abs(r.left - ex) > 1 || Math.abs(r.width - ew) > 1) {
          push('grid', k, `not on a track: left ${(r.left - gr.left).toFixed(0)} width ${r.width.toFixed(0)} (nearest ${String(start + 1)}/${String(span)})`);
        }
        const row = rows.find((x) => Math.abs(x.top - r.top) <= 1);
        if (row) row.cells.push({ k, span, h: r.height });
        else rows.push({ top: r.top, cells: [{ k, span, h: r.height }] });
      }
      rows.forEach((row, i) => {
        const total = row.cells.reduce((a, c) => a + c.span, 0);
        const first = row.cells[0]?.k ?? grid;
        if (total !== 12) push('grid', first, `row ${String(i + 1)} spans ${String(total)} of 12 columns${row.cells.length === 1 ? ' — a card sits alone' : ''}`);
        const dh = spread(row.cells.map((c) => c.h));
        if (dh > 1) push('grid', first, `row ${String(i + 1)}: cards differ in height ${row.cells.map((c) => c.h.toFixed(0)).join(' / ')}`);
      });
      for (const card of kids.filter((k) => k.matches('.card'))) {
        cards += 1;
        const h = card.querySelector(':scope > .card-h');
        if (h === null) {
          push('card-head', card, 'a dashboard card without a header');
          continue;
        }
        const hr = R(h);
        if (Math.abs(hr.height - 48) > 1) push('card-head', h, `header ${hr.height.toFixed(0)}px tall (want 48, one line)`);
        const ct = h.querySelector(':scope > .ct');
        if (ct !== null) {
          const words = [...ct.childNodes]
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent ?? '')
            .join('')
            .trim();
          if (words.length > 24) push('card-head', ct, `title “${words}” is ${String(words.length)} characters (at most 24)`);
          if (R(ct).height > 24.5) push('card-head', ct, `title “${words}” wraps (${R(ct).height.toFixed(0)}px tall)`);
        }
        for (const d of card.querySelectorAll('.disc')) {
          if (d.parentElement !== h || d !== h.firstElementChild) push('disc', d, 'a disc anywhere but first in the card’s header');
          else if (!card.matches('.tile, .owe')) push('disc', d, 'a disc on a card that is not a tile or a money card');
        }
        for (const tip of card.querySelectorAll('.chart .tooltip')) {
          if (!vis(tip)) continue;
          tooltips += 1;
          const plot = tip.closest('.plot') ?? tip.closest('.chart');
          if (plot === null) continue;
          const tr = R(tip);
          const pr = R(plot);
          if (tr.top < pr.top - 1 || tr.bottom > pr.bottom + 1 || tr.left < pr.left - 1 || tr.right > pr.right + 1) {
            push('hover', tip, `the hover specimen leaves its plot (${(tr.top - pr.top).toFixed(0)}, ${(pr.bottom - tr.bottom).toFixed(0)}, ${(tr.left - pr.left).toFixed(0)}, ${(pr.right - tr.right).toFixed(0)})`);
          }
          if (tr.top < hr.bottom) push('hover', tip, 'the hover specimen sits over the header row');
        }
        // no internal text in a product panel: a marker, a gate's name or a note to ourselves is the document's
        const words = card.textContent ?? '';
        for (const re of [/HUMAN\(/, /CA-gated/, /\bunbuilt\b/, /\bTODO\b/, /\bspec\b/]) {
          const m = re.exec(words);
          if (m) push('text', card, `internal text inside a panel: “${words.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20).replace(/\s+/g, ' ').trim()}”`);
        }
      }
    }
    return { faults, grids: grids.length, cards, tooltips };
  });
}

async function openAt(page: Page, context: BrowserContext, path: string): Promise<void> {
  await signIn(context);
  await page.goto(`${ORIGIN.web}${path}`, { waitUntil: 'networkidle' });
}

test.describe('the dashboard grid — Today and Overview, three widths, both themes', () => {
  test.describe.configure({ timeout: 240_000 });
  for (const screen of [
    { name: 'Today', path: () => '/' },
    { name: 'Overview', path: () => overviewPath },
  ]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`${screen.name} · ${theme}`, async ({ browser }, testInfo) => {
        for (const width of WIDTHS) {
          const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: 'reduce', locale: 'en-IN', timezoneId: 'Asia/Kolkata' });
          const page = await context.newPage();
          await openAt(page, context, screen.path());
          const g = await dashboard(page);
          await testInfo.attach(`${String(width)}px-${theme}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
          expect(g.grids, `${String(width)}px ${theme}: the page is on the grid`).toBeGreaterThanOrEqual(1);
          expect(g.cards, `${String(width)}px ${theme}: the grid holds cards`).toBeGreaterThan(3);
          expect(g.faults.map((f) => `${f.gate}: ${f.what}`), `${String(width)}px ${theme}`).toEqual([]);
          // the measured widths the report cites: every card's columns at this width
          const spans = await page.evaluate(() =>
            [...document.querySelectorAll('.dash-grid > .card')].map((c) => `${c.querySelector('.ct')?.textContent?.trim().slice(0, 24) ?? '?'}=${c.getBoundingClientRect().width.toFixed(0)}`),
          );
          await testInfo.attach(`${String(width)}px-${theme}-widths`, { body: spans.join('\n'), contentType: 'text/plain' });
          await context.close();
        }
      });
    }
  }

  /**
   * The figures the design derived from the demo seed (`docs/design/build/panels.mjs`
   * on `scripts/seed-demo.mjs`), asserted on the seeded tenant. Only the ones
   * fixed by the seed's own streams, never by the day it ran: the two quotes a
   * client is sitting on add to ₹7,75,000.00 (the design set prints it twice;
   * the brief's "₹7,75,00,000.00" is that figure with two zeros too many), and
   * the one overdue receivable carries the whole overdue balance in one bucket.
   */
  test('prints the figures the design derived from the seed', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', locale: 'en-IN', timezoneId: 'Asia/Kolkata' });
    const page = await context.newPage();
    await openAt(page, context, '/');
    const pipeline = page.locator('.dash-grid > .card[data-module="crm"]');
    await expect(pipeline.locator('.fig-line')).toHaveText('₹7,75,000.00');
    await expect(pipeline).toContainText('2 quotes awaiting a client’s decision');
    const overdue = page.locator('.dash-grid > .card.tile', { hasText: 'Overdue receivables' });
    const figure = (await overdue.locator('.fig').textContent())?.trim() ?? '';
    expect(figure).toMatch(/^₹[\d,]+\.\d\d$/);
    // one invoice is overdue, so exactly one bucket carries the whole of it and the other two are nothing
    const buckets = await overdue.locator('.owe-split dd').allTextContents();
    expect(buckets.filter((b) => b.trim() === figure)).toHaveLength(1);
    expect(buckets.filter((b) => b.trim() === '₹0.00')).toHaveLength(2);
    await expect(overdue).toContainText('1 invoice');
    // site today: the seed puts a report on two of the four sites in progress and none on the other two
    const site = page.locator('.dash-grid > .card[data-module="operations"]');
    await expect(site.locator('.lead-line')).toContainText('of 4');
    await expect(site.locator('.site-rows li')).toHaveCount(4);
    await expect(site.locator('.site-rows li .no')).toHaveCount(2);
    await context.close();
  });

  test('a hovered mark shows its tooltip inside the plot, never over the header', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', locale: 'en-IN', timezoneId: 'Asia/Kolkata' });
    const page = await context.newPage();
    await openAt(page, context, '/');
    const column = page.locator('.chart.bars .bars > li').first();
    const month = page.locator('.chart.lines .hits > .hit').first();
    let hovered = 0;
    if ((await column.count()) > 0) {
      await column.hover();
      const g = await dashboard(page);
      expect(g.faults.filter((f) => f.gate === 'hover')).toEqual([]);
      hovered += g.tooltips;
    }
    if ((await month.count()) > 0) {
      await month.hover();
      const g = await dashboard(page);
      expect(g.faults.filter((f) => f.gate === 'hover')).toEqual([]);
      hovered += g.tooltips;
    }
    // A check with nothing to look for proves nothing: at least one tooltip was measured.
    expect(hovered).toBeGreaterThanOrEqual(1);
    await context.close();
  });

  /**
   * The plants. Each is injected into the rendered Today and marked
   * `data-plant`; the gate must report a fault for every plant, and every
   * fault it reports must sit in a plant — the plant and nothing else.
   */
  test('fires on a ten-column row, a 27-character title, a two-line header and a disc on a chart — and on nothing else', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', locale: 'en-IN', timezoneId: 'Asia/Kolkata' });
    const page = await context.newPage();
    await openAt(page, context, '/');
    const clean = await dashboard(page);
    expect(clean.cards, 'the grid rendered').toBeGreaterThan(3);
    expect(clean.faults).toEqual([]);
    // The plants are DOM edits, and React's hydration replays the server's
    // tree over the DOM when it lands — planting before it does is planting
    // on sand. So plant, wait, and plant again until the four plants survive
    // a second look: only then is the page the plants' to fault.
    const plant = () => page.evaluate(() => {
      if (document.querySelectorAll('[data-plant]').length === 4) return;
      const cards = [...document.querySelectorAll('.dash-grid > .card')];
      // 1. a ten-column row: the money card row (6·6) with one card narrowed to 4
      const owe = cards.find((c) => c.classList.contains('owe'));
      if (owe) {
        owe.classList.replace('c6', 'c4');
        owe.setAttribute('data-plant', 'ten-column-row');
      }
      // 2. a 27-character title on a chart card
      const chart = cards.find((c) => !c.classList.contains('tile') && !c.classList.contains('owe') && c.querySelector('.card-h .ct'));
      const ct = chart?.querySelector('.card-h .ct');
      if (chart && ct && ct.firstChild) {
        ct.firstChild.textContent = 'A title of twenty-seven cha';
        chart.setAttribute('data-plant', 'title-27');
      }
      // 3. a two-line header: a title allowed to wrap, in a card of its own
      const tile = cards.find((c) => c.classList.contains('tile') && c !== owe);
      const head = tile?.querySelector('.card-h');
      const tct = head?.querySelector('.ct') as HTMLElement | null;
      if (tile && head && tct && tct.firstChild) {
        tct.firstChild.textContent = 'Margin at risk on it';
        tct.style.whiteSpace = 'normal';
        tct.style.width = '60px';
        (head as HTMLElement).style.height = 'auto';
        tile.setAttribute('data-plant', 'two-line-header');
      }
      // 4. a disc on a chart card
      const another = cards.find((c) => !c.classList.contains('tile') && !c.classList.contains('owe') && c !== chart);
      const h = another?.querySelector('.card-h');
      if (another && h) {
        const disc = document.createElement('span');
        disc.className = 'disc blue';
        h.insertBefore(disc, h.firstChild);
        another.setAttribute('data-plant', 'disc-on-chart');
      }
    });
    for (let tries = 0; tries < 10; tries += 1) {
      await plant();
      await page.waitForTimeout(1000);
      if ((await page.locator('[data-plant]').count()) === 4) break;
    }
    expect(await page.locator('[data-plant]').count(), 'the four plants are in the page').toBe(4);
    const g = await dashboard(page);
    const byPlant = new Map<string | null, string[]>();
    for (const f of g.faults) byPlant.set(f.plant, [...(byPlant.get(f.plant) ?? []), `${f.gate}: ${f.what}`]);
    expect(byPlant.get(null) ?? [], 'every fault sits in a plant').toEqual([]);
    expect(byPlant.get('ten-column-row')?.some((w) => /spans 10 of 12/.test(w)), 'the ten-column row fires').toBe(true);
    expect(byPlant.get('title-27')?.some((w) => /is 27 characters/.test(w)), 'the 27-character title fires').toBe(true);
    expect(byPlant.get('two-line-header')?.some((w) => /wraps|px tall \(want 48/.test(w)), 'the two-line header fires').toBe(true);
    expect(byPlant.get('disc-on-chart')?.some((w) => /a disc on a card that is not a tile or a money card/.test(w)), 'the disc on a chart fires').toBe(true);
    await context.close();
  });
});

// frame.mjs — the gate for the frame and the patterns this pass added, measured on the rendered set.
//
//  SCOPE   every app frame's top bar leads with the product's mark, then the project switcher, then the search; a frame
//          that draws its address agrees with its switcher — a filled switcher means the project's id is in
//          the address (or the address names a record, which decides the project), and an id in the
//          address means the switcher holds a project.
//  HEADER  no screen draws the old header; every page header puts its title on the page's left edge and its
//          actions against the page's right edge, centred on the title's row, with the primary action last.
//  LIST    every list toolbar runs search, then filters, then Columns and Export; no toolbar holds a project
//          filter; every list holding a table states its count in a pager.
//
//   node frame.mjs <dir>
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');   // the workspace's own copy — resolved from this folder upward
const DIR = process.argv[2];
const files = readdirSync(DIR).filter(f => f.endsWith('.html')).sort();
const browser = await chromium.launch({ headless: true });
let fails = 0;
const totals = { frames: 0, scoped: 0, heads: 0, toolbars: 0, lists: 0 };
console.log(`FRAME GATE  ${DIR}\n`);
for (const theme of ['light', 'dark']) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' })).newPage();
  for (const f of files) {
    await page.goto(`file:///${DIR}/${f}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const r = await page.evaluate(() => {
      const out = [], n = { frames: 0, scoped: 0, heads: 0, toolbars: 0, lists: 0 };
      const R = (e) => e.getBoundingClientRect();
      const vis = (e) => { const b = R(e); return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
      const label = (e) => (e ? e.textContent || '' : '').trim().replace(/\s+/g, ' ').slice(0, 40);
      for (const fr of document.querySelectorAll('.dsx-frame')) {
        const app = fr.querySelector(':scope > .app');
        const bar = (app || fr).querySelector('.topbar');
        if (!bar) continue;   // a frame with no top bar is a card or a form drawn on its own, not an app frame
        n.frames++;
        const name = label(fr.querySelector('.bar .lbl'));
        const kids = [...bar.children].filter(c => !c.matches('.nav-open'));   // the hamburger is a phone's control, not the frame's
        const which = bar.getAttribute('data-app') || 'web';
        if (!kids[0] || !kids[0].matches('.brand-bar')) out.push(`SCOPE the product's mark does not lead the top bar of “${name}”`);
        // each app states its controls: web and operator carry a switcher second; the vendor portal none; the client portal only with more than one project
        if ((which === 'web' || which === 'operator') && !(kids[1] && kids[1].matches('.scope'))) out.push(`SCOPE the switcher does not follow the mark in the top bar of “${name}”`);
        if (which === 'vendor' && bar.querySelector('.scope, .new-sq, .settings-link')) out.push(`SCOPE the vendor portal's bar carries a switcher, a square or a gear in “${name}”`);
        if (which === 'client' && bar.querySelector('.new-sq, .settings-link')) out.push(`SCOPE the client portal's bar carries a square or a gear in “${name}”`);
        const sc = bar.querySelector('.scope'), search = bar.querySelector('.search');
        if (sc && search && !(sc.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING)) out.push(`SCOPE the search comes before the switcher in “${name}”`);
        const url = label(fr.querySelector('.bar .meta.url')) && fr.querySelector('.bar .meta.url').textContent.trim();
        const on = !!sc && sc.matches('.on:not(.held)');
        if (on) n.scoped++;
        // (19 September) a project filter belongs on a firm-level list and never on a project's: inside a project every row is the project's
        for (const b of fr.querySelectorAll('.lv-tb .fbtn')) if (/^(Project|Site)\b/.test(b.textContent.trim()) && on) out.push(`LIST a project filter on a list inside a project: “${label(b)}” in “${name}”`);
        if (!app) continue;   // a portal frame: its bar is held to the rules above; the page rules below are the staff app's
        if (url) {
          const hasId = /[?&]project=[0-9a-f-]{36}|\/projects\/[0-9a-f-]{36}/.test(url);
          const namesRecord = /\/purchase-orders\/|[?&](order|bill|payment|invoice|holding)=/.test(url);
          if (on && !hasId && !namesRecord) out.push(`SCOPE the switcher holds a project but the address does not: ${url}`);
          if (hasId && !(sc && sc.matches('.on'))) out.push(`SCOPE the address names a project but the switcher says all projects: ${url}`);
        }
        if (fr.querySelector('.page-head')) out.push(`HEADER an old page header in “${name}”`);
        // (19 September, the grid) NO INTERNAL TEXT IN A PRODUCT FRAME: a marker, a gate's name or a note to ourselves is
        // the document's, and it lives in VALUE-MAP and the README; an absent state speaks in product words
        const INTERNAL = [/HUMAN\(/, /CA-gated/, /\bunbuilt\b/, /\bTODO\b/, /\bspec\b/];
        const words = fr.textContent;
        for (const re of INTERNAL) { const m = re.exec(words); if (m) out.push(`TEXT internal text inside a product frame, “${name}”: “${words.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30).replace(/\s+/g, ' ').trim()}”`); }
        const pg = app.querySelector('.page');
        if (pg && vis(pg)) {
          const cs = getComputedStyle(pg);
          const left = R(pg).left + parseFloat(cs.paddingLeft), right = R(pg).right - parseFloat(cs.paddingRight);
          for (const h of pg.querySelectorAll('.pgh')) {
            if (!vis(h)) continue;
            n.heads++;
            const t = h.querySelector('.pt');
            if (t && Math.abs(R(t).left - left) > 1) out.push(`HEADER the title “${label(t)}” starts ${(R(t).left - left).toFixed(1)}px off the page edge`);
            const a = h.querySelector(':scope > .pgh-a');
            if (a && vis(a)) {
              const narrow = R(pg).width < 640;
              if (!narrow && Math.abs(R(a).right - right) > 1) out.push(`HEADER the actions of “${label(t)}” end ${(right - R(a).right).toFixed(1)}px short of the page edge`);
              if (!narrow && t && Math.abs((R(a).top + R(a).height / 2) - (R(t).top + R(t).height / 2)) > 4) out.push(`HEADER the actions of “${label(t)}” are not centred on the title’s row`);
              const btns = [...a.children].filter(vis);
              const pi = btns.findIndex(b => b.matches('.primary'));
              if (pi !== -1 && pi !== btns.length - 1) out.push(`HEADER the primary action of “${label(t)}” is not last`);
            }
          }
        }
      }
      for (const tb of document.querySelectorAll('.dsx-frame .lv-tb')) {
        n.toolbars++;
        const kids = [...tb.children];
        const s = kids.findIndex(k => k.matches('.search'));
        const filters = kids.map((k, i) => (k.matches('.fbtn') ? i : -1)).filter(i => i >= 0);
        const cols = kids.findIndex(k => k.matches('.colwrap'));
        if (s > 0) out.push('LIST the search is not first in a toolbar');
        if (cols !== -1 && filters.some(i => i > cols)) out.push('LIST a filter comes after Columns');
      }
      for (const l of document.querySelectorAll('.dsx-frame .lv-list')) {
        if (!l.querySelector('table.lv-t')) continue;
        n.lists++;
        if (!l.querySelector('.pager .count')) out.push(`LIST a list with a table states no count: “${l.getAttribute('aria-label')}”`);
      }
      return { out, n };
    });
    if (theme === 'light') for (const k of Object.keys(totals)) totals[k] += r.n[k];
    if (r.out.length) {
      fails += r.out.length;
      console.log(`  ✗ ${f} (${theme})`);
      for (const o of [...new Set(r.out)].slice(0, 8)) console.log(`      ${o}`);
    } else if (theme === 'light') {
      console.log(`  ok ${f.padEnd(24)} ${String(r.n.frames).padStart(3)} app frames · ${String(r.n.scoped).padStart(2)} in a project · ${String(r.n.heads).padStart(3)} headers · ${String(r.n.toolbars).padStart(2)} toolbars · ${String(r.n.lists).padStart(2)} counted lists`);
    }
  }
  await page.close();
}
await browser.close();
console.log(`\nFRAME GATE: ${fails ? `FAIL (${fails})` : 'PASS'} — ${totals.frames} app frames, each led by the product’s mark, with the switcher second in the staff app’s bar and none in the vendor’s; ${totals.scoped} inside a project and saying so in the address; ${totals.heads} page headers on one edge and one row; ${totals.toolbars} toolbars in one order, a project filter only at the firm level; ${totals.lists} lists each stating a count — both themes`);
process.exit(fails ? 1 : 0);

// NEW GATE — cross-file metric consistency.
//
// A set of thirteen files can pass every per-file check and still be thirteen designs: the alignment
// gate proves a button is one height on the page it is on, not that it is the same height on the next
// page. This walks every file, measures the canonical components where they occur, and fails if a
// metric takes more than one value across the set. The table is the deliverable: it is the evidence.
//
//   node gates/consistency.mjs <dir> [--theme light|dark] [--width 1280]
import { readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const SET = fileURLToPath(new URL('../..', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');   // the workspace's own copy — resolved from this folder upward

const args = process.argv.slice(2);
const DIR = args.shift() || SET;
const THEMES = ['light', 'dark'];
const WIDTH = 1280;

// What is measured, and on which element. Each probe returns one string; the string must be identical in
// every file that has the component. Nothing here is a colour — colour has its own gates.
const PROBES = `
const px = v => Math.round(parseFloat(v) * 100) / 100 + '';
const box = el => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
const pad = c => [c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft].map(px).join(' ');
const rad = c => [c.borderTopLeftRadius, c.borderTopRightRadius, c.borderBottomRightRadius, c.borderBottomLeftRadius].map(px).join(' ');
const type = c => px(c.fontSize) + '/' + px(c.lineHeight) + ' ' + c.fontWeight;
// A phone or tablet frame is a DIFFERENT rendering of the same component on purpose — bigger controls
// for touch — so it is measured separately rather than averaged in with the desktop one.
const touch = el => !!el.closest('.dsx-frame.phone, .dsx-frame.tablet');
const first = (sel, want = false) => { for (const el of document.querySelectorAll(sel)) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0 && touch(el) === want) return el; } return null; };

const PROBE = [
  ['button · height',        '.btn:not(.sm):not(.lg):not(.icon)', el => box(el).h + 'px'],
  ['button · padding',       '.btn:not(.sm):not(.lg):not(.icon)', (el, c) => pad(c)],
  ['button · radius',        '.btn:not(.sm):not(.lg):not(.icon)', (el, c) => rad(c)],
  ['button · type',          '.btn:not(.sm):not(.lg):not(.icon)', (el, c) => type(c)],
  ['button small · height',  '.btn.sm',                           el => box(el).h + 'px'],
  ['button (touch) · height', '.btn:not(.sm):not(.lg):not(.icon)', el => box(el).h + 'px'],
  ['text input (touch) · h', '.field input[type="text"], .field input:not([type]), input[type="search"]:not(.topbar *)', el => box(el).h + 'px'],
  ['text input · height',    '.field input[type="text"], .field input:not([type]), input[type="search"]:not(.topbar *)', el => box(el).h + 'px'],
  ['text input · radius',    '.field input[type="text"], .field input:not([type]), input[type="search"]:not(.topbar *)', (el, c) => rad(c)],
  ['top bar · height',       '.topbar',                           el => box(el).h + 'px'],
  ['top bar control · h',    '.topbar .scope-btn, .topbar .search input[type="search"]', el => box(el).h + 'px'],
  ['top bar square',         '.topbar .new-sq',                   el => box(el).w + '×' + box(el).h],
  ['top bar square · radius', '.topbar .new-sq',                  (el, c) => rad(c)],
  ['top bar avatar',         '.topbar .me .avatar',               el => box(el).w + '×' + box(el).h],
  ['checkbox · size',        'input[type="checkbox"]',            el => box(el).w + '×' + box(el).h],
  ['card · padding',         '.card > .card-b:not(.tight):not(.board):not(.continued)', (el, c) => pad(c)],
  ['card body · tight',      '.card > .card-b.tight',             (el, c) => pad(c)],
  ['card · radius',          '.card',                             (el, c) => rad(c)],
  ['card header · padding',  '.card:not(.fig) > .card-h:not(.grid > .card > .card-h)', (el, c) => pad(c)],   // the dashboard's header has its own rows
  ['dashboard card head · h', '.grid > .card > .card-h',            el => box(el).h + 'px'],
  ['dashboard card head · pad', '.grid > .card > .card-h',          (el, c) => pad(c)],
  ['disc small · size',      '.disc.sm',                          el => box(el).w + '×' + box(el).h],
  ['duotone small · size',   '.disc.sm svg.duo',                  el => box(el).w + '×' + box(el).h],
  ['tile figure · type',     '.tile > .card-b > .fig',            (el, c) => type(c)],
  ['total figure · type',    '.owe .owe-total .fig',              (el, c) => type(c)],
  ['figure card strip · pad', '.stats.fig-row > .owe.fig > .card-h', (el, c) => pad(c)],   // a row of figure cards: a tighter, fixed two-line strip (19 September)
  ['figure card strip · h',  '.stats.fig-row > .owe.fig > .card-h', el => box(el).h + 'px'],
  ['card title · type',      '.card-h .ct',                       (el, c) => type(c)],
  ['table cell · padding',   'table.tbl tbody tr:not(.group) td:not(.check):not(:first-of-type):not(:last-child)', (el, c) => pad(c)],
  ['table first cell · start pad', 'table.tbl tbody tr:not(.group) td:first-of-type', (el, c) => c.paddingLeft],
  ['table last cell · end pad', 'table.tbl tbody tr:not(.group) td:last-child', (el, c) => c.paddingRight],
  ['table group row · pad',  'table.tbl tbody tr.group td',       (el, c) => pad(c)],
  ['table check cell · pad', 'table.tbl tbody td.check',          (el, c) => pad(c)],
  ['table head · type',      'table.tbl thead th',                (el, c) => type(c)],
  ['pill · padding',         '.pill',                             (el, c) => pad(c)],
  ['pill · radius',          '.pill',                             (el, c) => rad(c)],
  ['pill · type',            '.pill',                             (el, c) => type(c)],
  ['icon · size',            'svg.i:not(.sm)',                    el => box(el).w + '×' + box(el).h],
  ['icon small · size',      'svg.i.sm',                          el => box(el).w + '×' + box(el).h],
  ['duotone · size',         '.disc:not(.sm) svg.duo',            el => box(el).w + '×' + box(el).h],
  ['disc · size',            '.disc:not(.sm)',                    el => box(el).w + '×' + box(el).h],
  ['stat label · type',      '.stat .l',                          (el, c) => type(c)],
  ['section heading · type', '.dsx-section > h2',                 (el, c) => type(c)],
  ['body · type',            'body',                              (el, c) => type(c)],
  ['nav item · padding',     '.dsx-nav ol a',                     (el, c) => pad(c)],
  ['nav rail · width',       '.dsx-nav',                          el => box(el).w + 'px'],
  ['page gutter · padding',  '.dsx-main',                         (el, c) => pad(c)],
  ['notice · padding',       '.notice',                           (el, c) => pad(c)],
  ['empty illustration',     '.empty > .illo',                    el => box(el).w + '×' + box(el).h],
  ['focus ring',             null, () => { const c = getComputedStyle(document.documentElement); const w = c.getPropertyValue('--focus-ring-width').trim(), o = c.getPropertyValue('--focus-ring-offset').trim(); return w && o ? w + ' / ' + o : 'MISSING — the focus tokens did not resolve'; }],
  ['app frame · radius',     '.dsx-frame',                        (el, c) => rad(c)],
];
`;

const browser = await chromium.launch({ headless: true });
const files = readdirSync(DIR).filter(f => f.endsWith('.html')).sort();
const rows = new Map();   // label -> Map(file -> value) per theme

for (const theme of THEMES) {
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  for (const f of files) {
    await page.goto(`file:///${DIR}/${f}`, { waitUntil: 'load' });
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(80);
    const got = await page.evaluate(new Function(PROBES + `
      const out = {};
      for (const [label, sel, fn] of PROBE) {
        if (sel === null) { out[label] = fn(); continue; }
        const touchRow = label.includes('(touch)');
        const el = first(sel, touchRow);
        if (!el) continue;
        out[label] = fn(el, getComputedStyle(el));
      }
      return out;
    `));
    for (const [label, v] of Object.entries(got)) {
      const key = `${theme} · ${label}`;
      if (!rows.has(key)) rows.set(key, new Map());
      rows.get(key).set(f, v);
    }
  }
  await ctx.close();
}
await browser.close();

// ---- the table -----------------------------------------------------------------------------------------
let fails = 0;
const short = f => f.replace(/\.html$/, '').replace(/^(\d+)-.*/, '$1').replace('index', 'ix');
console.log(`CROSS-FILE CONSISTENCY  ${DIR}  (${files.length} files, ${THEMES.length} themes, ${WIDTH}px)\n`);
console.log('  ' + 'metric'.padEnd(26) + 'files  value(s)');
console.log('  ' + '-'.repeat(26) + '-----  ' + '-'.repeat(46));
for (const [key, byFile] of rows) {
  const vals = new Map();
  for (const [f, v] of byFile) (vals.get(v) || vals.set(v, []).get(v)).push(short(f));
  const ok = vals.size === 1;
  if (!ok) fails++;
  const shown = [...vals.entries()].map(([v, fs]) => vals.size === 1 ? v : `${v}  ← ${fs.join(',')}`).join('\n' + ' '.repeat(41));
  console.log(`  ${ok ? ' ' : '✗'} ${key.padEnd(24)} ${String(byFile.size).padStart(3)}   ${shown}`);
}
console.log(`\nCONSISTENCY GATE: ${fails ? `FAIL — ${fails} metrics take more than one value across the set` : 'PASS — every metric takes exactly one value in every file that has it'}`);
process.exit(fails ? 1 : 0);

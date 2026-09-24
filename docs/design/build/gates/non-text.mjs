// gates/non-text.mjs — WCAG 1.4.11 non-text contrast, measured from the RENDERED document.
// Three classes, because pass/fail against 3:1 misrepresents the standard:
//   obligated  — the standard requires ≥3:1 (control boundaries, focus, meaningful graphics, chart marks)
//   raised     — not obligated; raised by choice, with the reason
//   exempt     — carries no information (surface layering, loading placeholders), with the reason
// Writes non-text.json, which the document renders — so the table cannot drift from what is painted.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const SET = fileURLToPath(new URL('../..', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');   // the workspace's own copy — resolved from this folder upward
import { COLOR_TOKENS, semVar } from '../tokens.mjs';
// (19 September, charts) the dark island: the semantic vars of the subtlest family, read on the bar itself, so a fill
// painted there can be matched against what a tint would have resolved to in the island's own set
const SUBTLE_VARS = COLOR_TOKENS.filter(n => /^color\.background\..*\.(subtlest|subtler)$/.test(n)).map(semVar);
// one file per run, named on the command line: the set is walked by the runner
const FILES = (process.argv[2] || SET + '/00-foundations.html').split(',').map(f => 'file:///' + f);

const parse = s => {
  s = String(s).trim();
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) { const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
  const h = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (h) { let x = h[1]; if (x.length === 3) x = x.split('').map(c => c + c).join(''); const a = x.length === 8 ? parseInt(x.slice(6), 16) / 255 : 1; const n = parseInt(x.slice(0, 6), 16); return [n >> 16, (n >> 8) & 255, n & 255, a]; }
  return null;
};
const over = (fg, bg) => (fg[3] ?? 1) >= 1 ? fg : [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// sRGB → OKLab, for the salience score
const oklab = (rgb) => {
  const [r, g, b] = rgb.map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
};
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 100;

const browser = await chromium.launch({ headless: true });
const seen = {};
for (const theme of ['light', 'dark']) {
  for (const FILE of FILES) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1200 }, colorScheme: theme, reducedMotion: 'reduce' })).newPage();
  await page.goto(FILE, { waitUntil: 'load' });
  await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
  await page.waitForTimeout(150);
  const got = await page.evaluate((SV) => {
    const v = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const NAMES = ['ground', 'panel', 'elevated', 'sunk', 'select', 'line', 'line-strong', 'accent',
      'illo-line', 'illo-a', 'illo-b', 'illo-c', 'illo-n', 'illo-accent', 'series-1', 'series-2', 'series-3', 'chart-point-bad',
      'chart-threshold', 'chart-band', 'track', 'focus', 'ok', 'warn', 'warn-soft', 'waiting', 'bad',
      'ink', 'ink-soft', 'skeleton', 'idle-soft',
      // 18 September: the accents that now carry meaning
      'nav-current', 'nav-current-ink', 'owed-overdue', 'owed-current', 'chart-area', 'card-head', 'row-mine', 'side', 'nav-open', 'disc-blue', 'disc-blue-icon', 'disc-teal', 'disc-teal-icon', 'disc-green', 'disc-green-icon', 'disc-purple', 'disc-purple-icon', 'disc-magenta', 'disc-magenta-icon', 'disc-red', 'disc-red-icon', 'disc-yellow', 'disc-yellow-icon', 'disc-gray', 'disc-gray-icon'];
    const tok = Object.fromEntries(NAMES.map(n => [n, v('--' + n)]));
    const painted = {};
    // the first match painted in THIS theme — a specimen pane drawn in the other theme is skipped
    const T = document.documentElement.getAttribute('data-theme');
    const treatment = {};   // how a mark is drawn beside what colour it is: dashed, ringed, or a plain fill
    // (19 September, charts) LABELLED-REDUNDANT is a lookup, not a declaration: a mark is granted the class only when
    // the gate finds its value printed inside the card, chart, stat or hero that holds it — a rupee figure, a
    // percentage, a quantity, or the legend word that names the band. What it found is recorded beside the grant.
    const labelled = {};
    const VALUE = /₹\s?[\d,]+\.\d\d|\d+(?:\.\d+)?\s?%|\b\d[\d,]*\s(?:sqm|nos|m|bags?|sheets?|boxe?s?|coils?|days?|on site)\b/;
    const lookup = (sel, key, own = false, re = VALUE) => {   // re: the value's own shape, when the mark has one (an overrun prints as “₹… over”)
      for (const one of sel.split('|')) { const el = [...document.querySelectorAll(one.trim())].find(e => !e.closest(`[data-theme]:not([data-theme="${T}"])`)); if (!el) continue;
        // the mark's card first (the split beneath an owed bar is the card's, not the chart's); a chart or figure only when it stands alone
        const scope = own ? el.closest('span, li') : (el.closest('.card, .stat, .hero, .owe:not(.chart), figure') || el.closest('.chart'));
        const text = (scope ? scope.textContent : '').replace(/\s+/g, ' ').trim();
        const m = own ? (text.replace(/[^\p{L}\p{N} %₹.,]/gu, '').trim() || null) : (text.match(re) || [null])[0];
        labelled[key] = { found: m !== null, text: m, where: scope ? ((scope.querySelector('.ct, figcaption, .l, .eyebrow') || scope.closest('.card')?.querySelector('.ct'))?.textContent.trim().slice(0, 40) || scope.className.split(' ')[0]) : '' };
        return; }
    };
    const grab = (sel, prop, key, any = false) => {   // any: an island paints the same in both themes, so read it in either
      const opaque = v => !/rgba\(.*,\s*0\)$/.test(v.replace(/\s/g, '').replace(/,0\)$/, ', 0)'));
      for (const one of sel.split('|')) { const el = [...document.querySelectorAll(one.trim())].find(e => (any || !e.closest(`[data-theme]:not([data-theme="${T}"])`)) && (key !== 'panel-real' || opaque(getComputedStyle(e).backgroundColor)) && (e.closest('symbol') || e.getBoundingClientRect().width > 0)); if (el) {   // a symbol's parts have no box of their own; anything else must be painted to count
        const c = getComputedStyle(el); let v = c.getPropertyValue(prop).trim();
        // (19 September) the property that paints, per element: an SVG fill or stroke carries its own opacity, so the alpha
        // it is read at is the alpha it is seen at — a gate that read background on a stroked element reported rgb(0,0,0)
        if (prop === 'fill' || prop === 'stroke') { const op = parseFloat(c.getPropertyValue(prop + '-opacity')); const m = v.match(/rgba?\(([^)]+)\)/); if (m && op < 1) { const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); v = `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${(p.length > 3 ? p[3] : 1) * op})`; } }
        painted[key] = v;
        treatment[key] = (prop.startsWith('border') ? c.getPropertyValue(prop.replace('-color', '-style')) : prop === 'stroke' ? (c.strokeDasharray && c.strokeDasharray !== 'none' ? 'dashed' : 'solid') : 'fill') + (c.boxShadow && c.boxShadow !== 'none' && /inset/.test(c.boxShadow) ? '+ring' : '');
        return; } }
    };
    grab('.card | .dsx-frame > .app | .dsx-sample | .spec-pane | .mo | body', 'background-color', 'panel-real');   // a surface that paints — the empty state has none of its own
    grab('symbol.illo-art .l', 'stroke', 'illo-stroke');
    grab('symbol.illo-art .fa', 'fill', 'illo-fa'); grab('symbol.illo-art .fb', 'fill', 'illo-fb'); grab('symbol.illo-art .fc', 'fill', 'illo-fc');
    grab('symbol.illo-art .fn', 'fill', 'illo-fn'); grab('symbol.illo-art .a', 'fill', 'illo-a');
    { const el = document.querySelector('.popover .notifs .n.unread'); if (el) painted['unread'] = getComputedStyle(el, '::before').backgroundColor; }
    grab('.icon, svg.i', 'color', 'icon');
    grab('.field input[type="text"] | .field input:not([type]) | .search input[type="search"] | .field select', 'border-top-color', 'control-border');
    grab('.meter .fill', 'background-color', 'meter-fill');
    grab('.meter .track', 'background-color', 'meter-track');
    // (19 September) every chart mark and legend swatch, read from the property that paints it
    grab('.meter .band', 'background-color', 'mark-band'); lookup('.meter .band', 'mark-band', false, /₹\s?[\d,]+\.\d\d over|₹\s?[\d,]+\.\d\d of ₹/);
    grab('.owe-bar i.over', 'background-color', 'owe-over'); lookup('.owe-bar i.over', 'owe-over');
    grab('.owe-bar i.cur', 'background-color', 'owe-cur');
    grab('.meter .thr', 'border-left-color', 'mark-thr');
    grab('.meter .point', 'background-color', 'mark-point');
    grab('.chart:has(.meter-list) .legend i.over', 'background-color', 'legend-over'); lookup('.chart:has(.meter-list) .legend i.over', 'legend-over', true);
    grab('.chart:has(.meter-list) .legend i.thr', 'border-left-color', 'legend-thr');
    grab('.chart:has(.meter-list) .legend i.point', 'background-color', 'legend-point');
    grab('.chart:has(.meter-list) .legend i.track', 'background-color', 'legend-track');
    grab('.chart:has(.meter-list) .legend i:not(.over):not(.thr):not(.point):not(.track)', 'background-color', 'legend-fill');
    grab('.spark .band', 'fill', 'spark-band'); lookup('.spark .band', 'spark-band');
    grab('.spark .thr', 'stroke', 'spark-thr');
    grab('.spark .cross', 'fill', 'spark-cross');
    grab('.spark .line', 'stroke', 'spark-line');
    grab('.spark .area', 'fill', 'spark-area');
    grab('.chart.bars .bars i', 'background-color', 'bars-bar');
    grab('.chart.bars .grid span:not(.axis)', 'border-top-color', 'bars-grid');
    grab('.chart.stack .seg.done', 'background-color', 'seg-done'); grab('.chart.stack .seg.caution', 'background-color', 'seg-caution'); lookup('.chart.stack .seg.caution', 'seg-caution', false, /at risk\s*\d+/i);   // the legend's own count is the value
    grab('.chart.stack .seg.bad', 'background-color', 'seg-bad'); grab('.chart.stack .seg.paused', 'background-color', 'seg-paused');
    grab('.chart.stack .sw.done', 'background-color', 'legend-done'); grab('.chart.stack .sw.caution', 'background-color', 'legend-caution'); lookup('.chart.stack .sw.caution', 'legend-caution', true);
    grab('.chart.stack .sw.bad', 'background-color', 'legend-bad'); grab('.chart.stack .sw.paused', 'background-color', 'legend-paused');
    // the top bar is a dark island: its colours are read as painted, never from the theme's own tokens
    grab('.topbar', 'background-color', 'topbar-real', true);
    grab('.topbar .search input[type="search"]', 'border-top-color', 'topbar-lift-border', true);
    grab('.topbar .btn.ghost svg.i', 'color', 'topbar-icon', true);
    grab('.topbar .new-sq', 'background-color', 'topbar-sq', true);
    grab('.topbar .new-sq svg.i', 'color', 'topbar-sq-plus', true);
    grab('.side-nav .nav-plus svg.i', 'color', 'nav-plus-ink', true);
    grab('.topbar .avatar', 'background-color', 'topbar-avatar', true);
    // ISLAND (19 September, charts): every semantic element on the dark top bar — a badge, a chip, a count, a dot —
    // read where it paints, with the subtlest-family fills the island's own set would give, for the match
    const island = [];
    { const bar = document.querySelector('.topbar');
      if (bar) {   // an island paints the same in both themes, so it is read in either
        const bs = getComputedStyle(bar);
        const tints = SV.map(n => bs.getPropertyValue(n).trim()).filter(Boolean);
        for (const el of bar.querySelectorAll('.badge, .chip, .count, .dot, .lozenge, .pill, .tag')) {
          const c = getComputedStyle(el); const fill = c.backgroundColor;
          if (!fill || /rgba\(.*,\s*0\)$/.test(fill.replace(/\s/g, '').replace(/,0\)$/, ', 0)'))) continue;
          island.push({ what: el.className, text: el.textContent.trim().slice(0, 12), fill, ink: c.color, tint: tints.includes(fill) });
        } } }
    return { tok, painted, treatment, labelled, island };
  }, SUBTLE_VARS);
  await page.close();
  if (got.island && got.island.length && !(seen[theme] && seen[theme].island && seen[theme].island.length)) { if (seen[theme]) seen[theme].island = got.island; }
  if (!seen[theme]) seen[theme] = got; else { for (const [k, v] of Object.entries(got.painted)) if (!(k in seen[theme].painted)) { seen[theme].painted[k] = v; seen[theme].treatment[k] = got.treatment[k]; } for (const [k, v] of Object.entries(got.labelled)) if (!(k in seen[theme].labelled)) seen[theme].labelled[k] = v; }
  }
}
await browser.close();

const CLASSES = [
  { cls: 'obligated', why: 'WCAG 1.4.11 requires ≥ 3:1 — a control boundary, a focus indicator, or a graphic that carries meaning.', min: 3, pairs: [
    ['Control border — input, select', 'control-border', 'panel-real'],
    ['Focus ring', 'focus', 'panel'],
    ['Focus ring on the page', 'focus', 'ground'],
    ['Icon beside text', 'icon', 'panel-real'],
    ['Chart series 1 — the default line', 'series-1', 'panel'],
    ['Chart series 2', 'series-2', 'panel'],
    ['Chart series 3', 'series-3', 'panel'],
    ['Chart series 1 against its own track', 'series-1', 'track'],
    // 19 September — every mark that carries meaning, read from the element that paints it: a band, a threshold line,
    // a series fill, a marker, and the legend swatch that names each
    ['Chart — the watch line, as its border paints it', 'mark-thr', 'panel-real'],
    ['Chart — the series fill (a meter)', 'meter-fill', 'panel-real'],
    ['Chart — the marker where a series crossed', 'mark-point', 'panel-real'],
    ['Legend — the watch-line swatch, as its border paints it', 'legend-thr', 'panel-real'],
    ['Legend — the series swatch', 'legend-fill', 'panel-real'],
    ['Legend — the marker swatch', 'legend-point', 'panel-real'],
    ['Sparkline — the threshold stroke', 'spark-thr', 'panel-real'],
    ['Sparkline — the crossing marker', 'spark-cross', 'panel-real'],
    ['Sparkline — the series stroke', 'spark-line', 'panel-real'],
    ['Bars — a bar', 'bars-bar', 'panel-real'],
    ['Stacked bar — on track', 'seg-done', 'panel-real'],
    ['Stacked bar — off track', 'seg-bad', 'panel-real'], ['Stacked bar — paused', 'seg-paused', 'panel-real'],
    ['Stacked bar legend — on track', 'legend-done', 'panel-real'],
    ['Stacked bar legend — off track', 'legend-bad', 'panel-real'], ['Stacked bar legend — paused', 'legend-paused', 'panel-real'],
    ['Progress bar — fill against track', 'meter-fill', 'meter-track'],
    ['Progress bar — boundary', 'line-strong', 'track'],
    ['Illustration — the line', 'illo-stroke', 'panel-real'],
    ['Unread dot', 'unread', 'panel'],
    ['Status — done', 'ok', 'panel'], ['Status — caution ink on its own fill', 'warn', 'warn-soft'], ['Status — waiting', 'waiting', 'panel'], ['Status — bad', 'bad', 'panel'],
    // 18 September — colour where it carries meaning
    ['Sidebar — the current page’s pill on the sidebar', 'nav-current', 'side'],
    ['Top bar — the search’s boundary against the bar', 'topbar-lift-border', 'topbar-real'],
    ['Top bar — an icon on the bar', 'topbar-icon', 'topbar-real'],
    // 19 September — the navigation
    ['Top bar — the quick-create square against the bar (a control boundary)', 'topbar-sq', 'topbar-real'],
    ['Top bar — the plus on the square (the only thing that identifies it)', 'topbar-sq-plus', 'topbar-sq'],
    ['Top bar — the avatar’s disc against the bar', 'topbar-avatar', 'topbar-real'],
    ['Sidebar — the plus on the current page’s pill', 'nav-plus-ink', 'nav-current'],
    ['Sidebar — the icon and badge on the pill', 'nav-current-ink', 'nav-current'],
    ['Owed bar — the not-yet-due part, as it paints', 'owe-cur', 'panel-real'],
    ['Stat disc — the blue icon on its disc', 'disc-blue-icon', 'disc-blue'],
    ['Stat disc — the teal icon on its disc', 'disc-teal-icon', 'disc-teal'],
    ['Stat disc — the green icon on its disc', 'disc-green-icon', 'disc-green'],
    ['Stat disc — the purple icon on its disc', 'disc-purple-icon', 'disc-purple'],
    ['Stat disc — the magenta icon on its disc', 'disc-magenta-icon', 'disc-magenta'],
    ['Stat disc — the red icon on its disc', 'disc-red-icon', 'disc-red'],
    ['Stat disc — the yellow icon on its disc', 'disc-yellow-icon', 'disc-yellow'],
    ['Stat disc — the gray icon on its disc', 'disc-gray-icon', 'disc-gray'],
  ]},
  // (19 September, charts) LABELLED-REDUNDANT — a mark whose value is printed beside it takes the fixed status amber,
  // the same in both themes (yellow darkened to 3:1 on white is olive-brown; that is physics), separated from its
  // neighbour by a 2px surface gap, and is not held to 3:1. The class is GRANTED by the lookup above, per mark, only
  // when the value text is found inside the mark's card; a mark the lookup finds no value for is obligated at 3:1.
  { cls: 'labelled-redundant', why: 'A mark whose value is printed beside it — granted only when the gate finds the value text within the mark’s card; otherwise obligated at 3:1.', min: 0, lookup: true, pairs: [
    ['Owed bar — the overdue part, amber, its figure beneath', 'owe-over', 'panel-real'],
    ['Chart — the overrun band, amber, the overrun printed beside it', 'mark-band', 'panel-real'],
    ['Legend — the band swatch, named in words', 'legend-over', 'panel-real'],
    ['Sparkline — the band, its stat’s value beside it', 'spark-band', 'panel-real'],
    ['Stacked bar — at risk, amber, its count in the legend', 'seg-caution', 'panel-real'],
    ['Stacked bar legend — at risk, named with its count', 'legend-caution', 'panel-real'],
  ]},
  // The owner's decision of 17 September 2026: an illustration is decorative — aria-hidden on every reference, and the
  // heading and the text beside it say everything it does — so WCAG 1.4.11 does not apply to its fills. The line over
  // the fills stays obligated above, so the drawing reads on its card in both themes.
  { cls: 'exempt', why: 'A decorative image. Every illustration is aria-hidden and the heading and text beside it carry its whole meaning, so 1.4.11 does not apply to its fills; the line over them is held to 3:1 above (the owner\'s decision, 17 September 2026).', min: 0, pairs: [
    ['Illustration — block a (blue)', 'illo-fa', 'panel-real'],
    ['Illustration — block b (yellow)', 'illo-fb', 'panel-real'],
    ['Illustration — block c (teal)', 'illo-fc', 'panel-real'],
    ['Illustration — paper (grey)', 'illo-fn', 'panel-real'],
    ['Illustration — the highlight (magenta)', 'illo-a', 'panel-real'],
  ]},
  { cls: 'raised', why: 'Not obligated — a row divider is not a control boundary. Raised by choice: 31 dense tables are read by scanning across them, and a hairline below about 1.4:1 disappears at arm’s length. Capped well under 3:1 so a grid of rules never out-shouts the figures inside it.', min: 1.4, pairs: [
    ['Table and card hairline on a card', 'line', 'panel'],
    ['Table and card hairline on the page', 'line', 'ground'],
  ]},
  { cls: 'exempt', why: 'Carries no information, so 1.4.11 does not apply. Surface layering is depth, not data — the content on each surface carries its own contrast, and forcing 3:1 between two backgrounds would destroy the elevation system. A loading placeholder states nothing. The meter track is exempt as a fill because the bar’s extent is carried by its border, measured above.', min: 0, pairs: [
    ['Card against the page', 'panel', 'ground'],
    ['Drawer and menu against the page', 'elevated', 'ground'],
    ['Grouped rows against a card', 'sunk', 'panel'],
    ['Selected row against a card', 'select', 'panel'],
    ['Loading placeholder', 'skeleton', 'panel'],
    // 19 September — the backdrops, named: 1.4.11 applies to graphics needed to understand the content, and a backdrop
    // behind a bar is not the information — the bar is. The track, the area fill under a line and a gridline are exempt.
    ['Meter track against a card (a backdrop)', 'meter-track', 'panel-real'],
    ['Legend — the track swatch (a backdrop’s swatch)', 'legend-track', 'panel-real'],
    ['Filled area under a single-series line (a backdrop)', 'spark-area', 'panel-real'],
    ['Bars — a gridline (a backdrop)', 'bars-grid', 'panel-real'],
    ['Card header strip against its card', 'card-head', 'panel'],
    ['Row waiting on this person against a card', 'row-mine', 'panel'],
    ['An open section’s tint against the sidebar', 'nav-open', 'side'],
  ]},
];

const rows = [];
for (const theme of ['light', 'dark']) {
  const { tok, painted } = seen[theme];
  const get = k => parse(painted[k] ?? tok[k]);
  for (const { cls, min, pairs, lookup } of CLASSES)
    for (const [label, a, b] of pairs) {
      // a translucent background is composited over the page's own card; a translucent mark over its background
      const base = get('panel-real') || get('panel');
      if (!get(a) || !get(b)) { if (!lookup) console.error('MISSING', theme, label, a, b); continue; }
      const B = over(get(b), over(base, [255, 255, 255, 1])), A = over(get(a), B);
      const r = ratio(A, B);
      if (lookup) { const l = seen[theme].labelled[a]; const granted = !!(l && l.found); rows.push({ theme, cls, label: granted ? `${label} — granted: “${l.text}” in ${l.where}` : `${label} — NO VALUE FOUND, obligated`, r: +r.toFixed(2), ok: granted ? null : r >= 3, min: granted ? 0 : 3, granted }); continue; }
      rows.push({ theme, cls, label, r: +r.toFixed(2), ok: min === 0 ? null : r >= min, min });
    }
}

{ const at = process.argv.indexOf('--json'); if (at > 0) writeFileSync(process.argv[at + 1], JSON.stringify({ rows }, null, 1)); }

const pad = (s, n) => String(s).padEnd(n);
console.log('WCAG 1.4.11 — measured from the rendered document\n');
for (const { cls, why } of CLASSES) {
  console.log(`  ${cls.toUpperCase()} — ${why.slice(0, 96)}…`);
  for (const theme of ['light', 'dark']) {
    const rs = rows.filter(r => r.theme === theme && r.cls === cls);
    console.log(`    ${theme}`);
    for (const r of rs) console.log(`      ${pad(r.label, cls === 'labelled-redundant' ? 96 : 40)} ${r.r.toFixed(2).padStart(6)}  ${r.ok === null ? (r.granted ? 'granted' : '—') : r.ok ? 'pass' : 'FAIL'}`);
  }
  console.log('');
}
// (19 September) a legend swatch and the mark it names resolve to the same painted colour AND the same treatment —
// dashed, ringed, or a plain fill — in both themes. A legend that says one thing while the chart draws another is a lie.
const LEGEND = [['the series', 'meter-fill', 'legend-fill'], ['the overrun band', 'mark-band', 'legend-over'], ['the watch line', 'mark-thr', 'legend-thr'], ['the marker', 'mark-point', 'legend-point'], ['the track', 'meter-track', 'legend-track'],
  ['stacked — on track', 'seg-done', 'legend-done'], ['stacked — at risk', 'seg-caution', 'legend-caution'], ['stacked — off track', 'seg-bad', 'legend-bad'], ['stacked — paused', 'seg-paused', 'legend-paused']];
const legendRows = [];
for (const theme of ['light', 'dark']) {
  const { painted, treatment } = seen[theme];
  for (const [label, mark, sw] of LEGEND) {
    if (!(mark in painted) || !(sw in painted)) continue;
    const a = parse(painted[mark]), b = parse(painted[sw]); if (!a || !b) continue;
    const same = dE(oklab(over(a, [255, 255, 255, 1])), oklab(over(b, [255, 255, 255, 1]))) < 1 && Math.abs((a[3] ?? 1) - (b[3] ?? 1)) < 0.02;
    const drawn = treatment[mark] === treatment[sw];
    legendRows.push({ theme, label, same, drawn, mark: `${painted[mark]} ${treatment[mark]}`, sw: `${painted[sw]} ${treatment[sw]}` });
  }
}
if (legendRows.length) {
  console.log('  LEGEND — a swatch and the mark it names: the same painted colour, the same treatment');
  for (const r of legendRows) console.log(`    ${r.theme.padEnd(5)} ${pad(r.label, 22)} ${r.same && r.drawn ? 'same' : 'DIFFERS'}  mark ${r.mark}  swatch ${r.sw}`);
  console.log('');
}
// (19 September, charts) the island block: a subtlest-family fill on the dark top bar fails
const islandRows = [];
for (const theme of ['light', 'dark']) for (const e of (seen[theme].island || [])) islandRows.push({ theme, ...e });
if (islandRows.length) {
  console.log('  ISLAND — a semantic element on the dark top bar paints a bold fill with the light set’s inverse ink, in both themes');
  for (const r of islandRows) console.log(`    ${r.theme.padEnd(5)} ${pad(r.what, 18)} “${r.text}”  fill ${r.fill}  ink ${r.ink}  ${r.tint ? 'SUBTLEST-FAMILY TINT' : 'bold'}`);
  console.log('');
}
const islandBad = islandRows.filter(r => r.tint);
const legendBad = legendRows.filter(r => !(r.same && r.drawn));
const bad = rows.filter(r => r.ok === false);
console.log(`  obligated + raised failures: ${bad.length + legendBad.length + islandBad.length}${legendBad.length ? ` (of which legend mismatches: ${legendBad.length})` : ''}${islandBad.length ? ` (of which island tints: ${islandBad.length})` : ''}`);
islandBad.forEach(r => console.log(`    ${r.theme} island — ${r.what} “${r.text}” paints a subtlest-family tint ${r.fill}`));
legendBad.forEach(r => console.log(`    ${r.theme} legend — ${r.label}: mark ${r.mark} ≠ swatch ${r.sw}`));
bad.forEach(b => console.log(`    ${b.theme} ${b.label} ${b.r}`));

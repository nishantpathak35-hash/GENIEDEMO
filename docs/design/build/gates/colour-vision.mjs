// Deuteranopia and protanopia on every chart. Red-versus-amber is the commonest confusion and this
// product shows money to a male-dominated industry, so this is a requirement, not a nicety.
// Two passes: the numbers (every pair of colours a chart actually paints, simulated), and a picture
// (the whole screen re-rendered through the simulation, so it can be looked at rather than asserted).
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const SET = fileURLToPath(new URL('../..', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');   // the workspace's own copy — resolved from this folder upward
import { tmpdir } from 'node:os';
import { mkdirSync } from 'node:fs';
// the simulated screenshots go to the OS temp folder unless the runner says where — never beside this script
const SHOTS = process.env.CVD_SHOTS || `${tmpdir().replace(/\\/g, '/')}/cog-design-gates`;
mkdirSync(SHOTS, { recursive: true });
// one file per run, named on the command line: the set is walked by the runner
const FILE = 'file:///' + (process.argv[2] || SET + '/00-foundations.html');

const SIM = `
const _lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const _gam = c => { c = Math.min(1, Math.max(0, c)); return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; };
function oklab(rgb) { const [r, g, b] = rgb.map(_lin);
  const l = Math.cbrt(0.4122214708*r + 0.5363325363*g + 0.0514459929*b);
  const m = Math.cbrt(0.2119034982*r + 0.6806995451*g + 0.1073969566*b);
  const s = Math.cbrt(0.0883024619*r + 0.2817188376*g + 0.6299787005*b);
  return [0.2104542553*l + 0.7936177850*m - 0.0040720468*s,
          1.9779984951*l - 2.4285922050*m + 0.4505937099*s,
          0.0259040371*l + 0.7827717662*m - 0.8086757660*s]; }
function dE(a, b) { return Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]) * 100; }
function dichromat(rgb, kind) { let [r, g, b] = rgb.map(_lin);
  const L = 0.31399022*r + 0.63951294*g + 0.04649755*b;
  const M = 0.15537241*r + 0.75789446*g + 0.08670142*b;
  const S = 0.01775239*r + 0.10944209*g + 0.87256922*b;
  let L2 = L, M2 = M, S2 = S;
  if (kind === 'protan') L2 = 1.05118294*M - 0.05116099*S;
  if (kind === 'deutan') M2 = 0.9513092*L + 0.04866992*S;
  r = 5.47221206*L2 - 4.6419601*M2 + 0.16963708*S2;
  g = -1.1252419*L2 + 2.29317094*M2 - 0.1678952*S2;
  b = 0.02980165*L2 - 0.19318073*M2 + 1.16364789*S2;
  return [r, g, b].map(c => Math.round(_gam(c) * 255)); }
const parseRgb = s => { const m = /rgba?\\(([^)]+)\\)/.exec(s); return m ? m[1].split(',').slice(0,3).map(parseFloat) : null; };
`;

const browser = await chromium.launch({ headless: true });
for (const theme of ['light', 'dark']) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1200 }, colorScheme: theme, reducedMotion: 'reduce' })).newPage();
  await page.goto(FILE, { waitUntil: 'load' });
  await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);

  const out = await page.evaluate(new Function(SIM + `
    const charts = [...document.querySelectorAll('.chart, .spark, .meter-list, .hero .hbar')].filter(ch => !(ch.matches('.spark') && ch.parentElement.closest('.chart')));   // a sparkline inside a chart is part of that chart, not a chart of its own
    const rows = [];
    for (const ch of charts) {
      const r = ch.getBoundingClientRect(); if (!r.width || !r.height) continue;
      // every colour this chart actually paints, de-duplicated. Amended 19 September 2026 (charts): a translucent
      // fill is composited over the ground it sits on (a 7% track read as its own rgb had matched a neutral fill at
      // ΔE 1); fill and stroke are read on svg elements only (an html element's default fill is black, which is
      // not painted); an element with no box — the table view behind its closed toggle — paints nothing.
      const ground = (el) => { for (let n = el.parentElement; n; n = n.parentElement) { const bg = getComputedStyle(n).backgroundColor; const m = /rgba?\\(([^)]+)\\)/.exec(bg); if (!m) continue; const q = m[1].split(',').map(parseFloat); if (q.length < 4 || q[3] >= 1) return q.slice(0, 3); } return [255, 255, 255]; };
      // the 2px surface gap between marks (--chart-gap) is the grammar's spacer, painted and meaningless: left out
      const gapV = getComputedStyle(ch).getPropertyValue('--chart-gap').trim();   // on the chart: a specimen pane in the other theme resolves its own
      const gapH = /^#([0-9a-f]{6})$/i.exec(gapV), gapM = /rgba?\\(([^)]+)\\)/.exec(gapV);
      const GAP = gapH ? [0, 2, 4].map(i => parseInt(gapH[1].slice(i, i + 2), 16)).join(',') : gapM ? gapM[1].split(',').slice(0, 3).map(parseFloat).join(',') : null;
      const cols = new Map();
      for (const el of [ch, ...ch.querySelectorAll('*')]) {
        if (!el.getClientRects().length) continue;
        const c = getComputedStyle(el);
        for (const prop of (el instanceof SVGElement ? ['fill', 'stroke'] : ['background-color'])) {
          const v = c.getPropertyValue(prop); const m = /rgba?\\(([^)]+)\\)/.exec(v);
          if (!m) continue;
          const q = m[1].split(',').map(parseFloat); const a = q.length > 3 ? q[3] : 1;
          if (a === 0) continue;
          let p = q.slice(0, 3);
          if (a < 1) { const gd = ground(el); p = p.map((x, i) => Math.round(x * a + gd[i] * (1 - a))); }
          if (p.join(',') === GAP) continue;
          cols.set(p.join(','), p);
        }
      }
      const list = [...cols.values()];
      let worst = { d: Infinity };
      for (const kind of ['protan', 'deutan']) {
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
          const d = dE(oklab(dichromat(list[i], kind)), oklab(dichromat(list[j], kind)));
          if (d < worst.d) worst = { d, kind, a: list[i].join(','), b: list[j].join(',') };
        }
      }
      // the non-colour channels this chart carries
      const channels = [];
      if (ch.querySelector('.thr, .threshold')) channels.push('dashed threshold');
      if (ch.querySelector('.cross, .point')) channels.push('diamond marker');
      if (ch.querySelector('.end.bad')) channels.push('marked end point');
      if (ch.querySelector('.seg.bad, .seg.paused')) channels.push('hatched and stippled segments');
      if (ch.querySelector('.legend.counts b')) channels.push('legend with counts');
      if (ch.matches('.parts') && ch.querySelector('.legend b')) channels.push('values in the legend, in the marks’ order · 2px gaps');
      const perGroup = ch.querySelectorAll('.bars li:first-child i').length;
      if (ch.querySelector('.x, .cash-x') && !ch.querySelector('.seg') && perGroup <= 1) channels.push('one colour, labelled axis');
      if (perGroup > 1 && ch.querySelector('.legend')) channels.push('a legend naming each series, the marks in its order within each group');
      const host = ch.closest('.stat, .card, .hero');
      if (host && /over|above|below|past|still to|watch|renegotiate/i.test(host.textContent || '')) channels.push('text annotation');
      const label = (ch.closest('.stat')?.querySelector('.l')?.textContent
        || ch.closest('.card')?.querySelector('.card-h')?.textContent
        || ch.closest('.hero')?.querySelector('.eyebrow')?.textContent || ch.className).trim().slice(0, 38);
      rows.push({ pair: worst.a + ' vs ' + worst.b, label, cls: (typeof ch.className === 'string' ? ch.className : ch.className.baseVal).split(/\\s+/)[0],
        colours: list.length, worst: +worst.d.toFixed(1), kind: worst.kind, channels });
    }
    return rows;
  `));

  console.log(`\\n================ ${theme.toUpperCase()} ================`);
  let fails = 0;
  const seen = new Set();
  for (const r of out) {
    const key = r.label + '|' + r.cls + '|' + r.worst; if (seen.has(key)) continue; seen.add(key);
    const bad = r.worst < 8 && r.channels.length === 0;
    if (bad) fails++;
    console.log(`  ${r.worst < 8 ? (r.channels.length ? 'OK*' : 'FAIL') : 'OK  '} ${String(r.worst).padStart(5)} ΔE (${r.kind})  ${r.colours} colours  ${r.label.padEnd(38)} ${r.channels.length ? '[' + r.channels.join(' · ') + ']' : '(colour only)'}  ${r.worst < 8 ? 'tightest: rgb(' + r.pair.replace(' vs ', ') vs rgb(') + ')' : ''}`);
  }
  console.log(`  charts whose meaning survives only in full colour vision: ${fails}`);
  console.log('  OK* = under ΔE 8 to a dichromat, but carrying a non-colour channel, which is what the standard requires');

  // the picture: re-render the Today screen through each simulation so it can be looked at
  for (const kind of ['deutan', 'protan']) {
    await page.evaluate(new Function('kind', SIM + `
      document.querySelectorAll('[data-cvd]').forEach(e => e.remove());
      const st = document.createElement('style'); st.setAttribute('data-cvd', '1');
      const M = kind === 'deutan'
        ? '0.29 0.70 0.01 0 0  0.29 0.70 0.01 0 0  -0.02 0.03 1 0 0  0 0 0 1 0'
        : '0.15 0.85 0 0 0  0.15 0.85 0 0 0  -0.01 0.01 1 0 0  0 0 0 1 0';
      st.textContent = 'svg.cvdf{position:fixed;width:0;height:0}';
      document.head.appendChild(st);
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('class', 'cvdf'); svg.setAttribute('data-cvd', '1');
      const f = document.createElementNS(ns, 'filter'); f.setAttribute('id', 'cvd-' + kind); f.setAttribute('color-interpolation-filters', 'linearRGB');
      const m = document.createElementNS(ns, 'feColorMatrix'); m.setAttribute('type', 'matrix'); m.setAttribute('values', M);
      f.appendChild(m); svg.appendChild(f); document.body.appendChild(svg);
      document.documentElement.style.filter = 'url(#cvd-' + kind + ')';
    `), kind);
    await page.waitForTimeout(120);
    // the evidence picture is of the first frame on the page; a file with no frame has nothing to picture
    const loc = page.locator('.dsx-section .dsx-frame').first();
    if (await loc.count() === 0) { await page.evaluate(() => { document.documentElement.style.filter = ''; }); continue; }
    await loc.scrollIntoViewIfNeeded();
    const box = await loc.boundingBox();
    const y = box.y + await page.evaluate(() => window.scrollY);
    await page.screenshot({ path: `${SHOTS}/cvd-${theme}-${kind}.png`, clip: { x: box.x, y, width: box.width, height: Math.min(box.height, 900) }, fullPage: true });
    await page.evaluate(() => { document.documentElement.style.filter = ''; });
    console.log(`  wrote cvd-${theme}-${kind}.png`);
  }
  await page.close();
}
await browser.close();

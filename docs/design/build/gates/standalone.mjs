// The gate the split exists to satisfy: the folder opens from disk with no server — every page by
// double-clicking it, with no network — and everything renders. Since 19 September a page is not one file:
// tokens.css, design.css and design.js sit beside it and every page loads the three. Four things fail
// silently under file:// if they are wrong — an external SVG sprite, a stylesheet that did not load, a
// script that did not run, and a font that never arrives — so each is measured rather than assumed.
import { readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const SET = fileURLToPath(new URL('../..', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');   // the workspace's own copy — resolved from this folder upward

const DIR = process.argv[2] || SET;
const files = readdirSync(DIR).filter(f => f.endsWith('.html')).sort();
const browser = await chromium.launch({ headless: true });
let fails = 0;

for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, offline: true, colorScheme: theme, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const blocked = [];
  page.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) blocked.push(r.url()); });
  console.log(`\n================ ${theme.toUpperCase()} · offline ================`);
  for (const f of files) {
    blocked.length = 0;
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`file:///${DIR}/${f}`, { waitUntil: 'load' });
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    await page.waitForTimeout(120);
    const r = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      // did tokens.css arrive? if it did not, every token resolves to the empty string
      const tok = ['--accent', '--space-200', '--font-size-body', '--radius-large', '--ground'].map(n => [n, cs.getPropertyValue(n).trim()]);
      // did design.css arrive? the document's own layout grid is a rule only it holds
      const layout = getComputedStyle(document.querySelector('.dsx-layout')).display;
      // does every <use> resolve to a symbol that exists IN THIS DOCUMENT?
      const uses = [...document.querySelectorAll('use')];
      const missing = new Set();
      let painted = 0;
      for (const u of uses) {
        const href = u.getAttribute('href') || u.getAttribute('xlink:href') || '';
        if (!href.startsWith('#')) { missing.add('EXTERNAL ' + href); continue; }
        if (!document.getElementById(href.slice(1))) missing.add(href);
      }
      // an icon that resolved still has to paint: measure the rendered box of the <svg> that holds it
      for (const svg of document.querySelectorAll('svg.i, .illo')) {
        const b = svg.getBoundingClientRect();
        if (b.width > 0 && b.height > 0) painted++;
      }
      const body = getComputedStyle(document.body);
      return {
        tok, layout, uses: uses.length, missing: [...missing], painted,
        bg: body.backgroundColor, fg: body.color,
        illos: document.querySelectorAll('.illo').length,
        symbols: document.querySelectorAll('symbol').length,
        sections: document.querySelectorAll('.dsx-section').length,
        navLinks: [...document.querySelectorAll('.dsx-nav ol a')].map(a => a.getAttribute('href')),
        current: document.querySelectorAll('.dsx-nav ol a[aria-current]').length,
        h: document.documentElement.scrollHeight,
      };
    });
    // did design.js run? the theme control is its first duty
    const dark = await page.evaluate(() => { const r = document.querySelector('input[name="theme"][value="dark"]'); if (!r) return 'no control'; r.click(); const on = document.documentElement.getAttribute('data-theme'); return on; });
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    const noTokens = r.tok.filter(([, v]) => !v).map(([n]) => n);
    const bad = [];
    if (noTokens.length) bad.push('tokens.css did not apply: ' + noTokens.join(' '));
    if (r.layout !== 'grid') bad.push('design.css did not apply: .dsx-layout is ' + r.layout);
    if (dark !== 'dark') bad.push('design.js did not run: the theme control gave ' + dark);
    if (r.missing.length) bad.push('unresolved <use>: ' + r.missing.join(' '));
    if (r.painted < 1) bad.push('no icon or illustration painted');
    if (blocked.length) bad.push('network requested: ' + blocked.slice(0, 2).join(' '));
    if (errors.length) bad.push('script error: ' + errors[0]);
    if (f !== 'index.html' && r.current !== 1) bad.push(`nav marks ${r.current} current items, expected 1`);
    if (bad.length) fails++;
    console.log(`  ${bad.length ? 'FAIL' : 'ok  '} ${f.padEnd(24)} ${String(r.symbols).padStart(3)} symbols · ${String(r.uses).padStart(4)} uses · ${String(r.painted).padStart(4)} painted · ${String(r.h).padStart(6)}px tall · bg ${r.bg}${bad.length ? '\n       ' + bad.join('\n       ') : ''}`);
  }
  await ctx.close();
}
await browser.close();
console.log(`\nSTANDALONE GATE: ${fails ? 'FAIL (' + fails + ')' : 'PASS'} — the folder opens from disk with no server: every page, offline, in both themes, with its three shared files`);
process.exit(fails ? 1 : 0);

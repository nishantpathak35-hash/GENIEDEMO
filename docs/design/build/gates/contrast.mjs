import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const SET = fileURLToPath(new URL('../..', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');   // the workspace's own copy — resolved from this folder upward
// one file per run, named on the command line: the set is walked by the runner
const PAGE = 'file:///' + (process.argv[2] || SET + '/00-foundations.html');
const browser = await chromium.launch({ headless: true });
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme, offline: true });
  const page = await ctx.newPage(); await page.goto(PAGE, { waitUntil: 'load' });
  const res = await page.evaluate(() => {
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = '1'] = m[1].split(',').map(s => parseFloat(s)); return { r, g, b, a }; };
    const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
    const ratio = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); };
    const bgOf = (el) => { let e = el; const stack = []; while (e && e !== document.documentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; } e = e.parentElement; } let bg = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 }; for (const c of stack.reverse()) bg = c.a >= 1 ? c : blend(c, bg); return bg; };
    const out = []; let checked = 0; let bodyChecked = 0, bodyMin = 99; let inactive = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    while (walker.nextNode()) {
      const t = walker.currentNode; if (!t.nodeValue.trim()) continue; const el = t.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
      if (el.closest('script,style,svg,[hidden],.tip')) continue;
      // text in an inactive control has no contrast requirement (WCAG 1.4.3, incidental) — the disabled state is drawn in the published disabled ink
      if (el.closest(':disabled, [aria-disabled="true"], .is-disabled')) { inactive++; continue; }
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || el.offsetParent === null && cs.position !== 'fixed') continue;
      let fg = parse(cs.color); if (!fg) continue; const bg = bgOf(el); if (fg.a < 1) fg = blend(fg, bg);
      const size = parseFloat(cs.fontSize); const weight = parseInt(cs.fontWeight, 10) || 400; const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const root = getComputedStyle(document.documentElement); const tok = k => parse(root.getPropertyValue(k).trim().replace(/^#([0-9a-f]{6})$/i, (m, h) => `rgb(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)})`));
      const same = (a, b) => a && b && Math.abs(a.r - b.r) < 2 && Math.abs(a.g - b.g) < 2 && Math.abs(a.b - b.b) < 2;
      const isBody = same(fg, tok('--ink')) && size >= 13 && size <= 17 && weight < 600 && ['--ground', '--panel', '--elevated', '--sunk'].some(k => same(bg, tok(k)));
      const need = large ? 3 : isBody ? 7 : 4.5; const r = ratio(fg, bg); checked++; if (isBody) { bodyChecked++; bodyMin = Math.min(bodyMin, r); }
      if (r < need) out.push({ r: +r.toFixed(2), need, size, text: t.nodeValue.trim().slice(0, 40), el: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0, 2).join('.') : ''), fg: cs.color, bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})` });
    }
    // placeholders (informational) and control borders (3:1 non-text)
    const ph = []; document.querySelectorAll('input[placeholder]').forEach(i => { if (i.offsetParent === null) return; const s = getComputedStyle(i, '::placeholder'); const fg = parse(s.color); const bg = bgOf(i); if (fg) ph.push(+ratio(fg.a < 1 ? blend(fg, bg) : fg, bg).toFixed(2)); });
    const borders = []; document.querySelectorAll('input, select, textarea, button:not(.quiet):not(.primary):not(.danger):not(.hit)').forEach(i => { if (i.offsetParent === null || i.matches(':disabled, .is-disabled')) return; /* an inactive control's boundary has no contrast requirement (1.4.11) */ const s = getComputedStyle(i); const bc = parse(s.borderTopColor); if (!bc || bc.a === 0 || s.borderTopWidth === '0px') return; const bg = bgOf(i.parentElement); const r = ratio(bc.a < 1 ? blend(bc, bg) : bc, bg); if (r < 3) borders.push({ r: +r.toFixed(2), el: i.tagName.toLowerCase() + '.' + i.className }); });
    return { checked, inactive, bodyChecked, bodyMin: +bodyMin.toFixed(2), fails: out, phMin: Math.min(...ph), phCount: ph.length, borderFails: borders.slice(0, 5), borderFailCount: borders.length };
  });
  console.log(`== ${scheme}: ${res.checked} text elements checked (${res.inactive} inactive, exempt), ${res.fails.length} below target (AA, or AAA for body ink on neutrals: ${res.bodyChecked} body nodes, min ${res.bodyMin}); placeholders min ${res.phMin} over ${res.phCount}; control borders below 3:1: ${res.borderFailCount}`);
  for (const f of res.fails.slice(0, 20)) console.log('  ', JSON.stringify(f));
  for (const b of res.borderFails) console.log('   border', JSON.stringify(b));
  await ctx.close();
}
await browser.close();

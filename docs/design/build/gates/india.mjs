// The India layer, measured rather than asserted.
//  1. RED CONFINEMENT — every element painting --bad / --bad-soft / --mark-bad, with its text, so each
//     one can be checked against "money going the wrong way, refused, or failed" and nothing else.
//  2. FLAG ADJACENCY — saffron above/beside green on white is the Indian flag. Find every place an
//     amber element and a green element are visually adjacent on a near-white surface, and rank by how
//     close each hue sits to the flag's own (saffron ~ OKLCH 62°, India green ~ 152°).
//  3. TEMPERATURE VS STAKES — the rule is that colour temperature tracks stakes inversely: the higher
//     the stake, the cooler and quieter the screen. Measure mean chroma per app surface.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const SET = fileURLToPath(new URL('../..', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');   // the workspace's own copy — resolved from this folder upward
// one file per run, named on the command line: the set is walked by the runner
const FILE = 'file:///' + (process.argv[2] || SET + '/00-foundations.html');
const browser = await chromium.launch({ headless: true });

for (const theme of ['light', 'dark']) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1200 }, colorScheme: theme, reducedMotion: 'reduce' })).newPage();
  await page.goto(FILE, { waitUntil: 'load' });
  await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
  await page.waitForTimeout(200);

  const out = await page.evaluate(() => {
    const V = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const rgb = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s); if (m) { const p = m[1].split(',').map(parseFloat); return [p[0], p[1], p[2]]; }
      const h = /^#?([0-9a-f]{6})$/i.exec(s.trim()); if (h) { const n = parseInt(h[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; } return null; };
    const key = c => c ? c.join(',') : '';
    const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const oklch = (c) => { const [r, g, b] = c.map(lin);
      const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
      const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
      const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
      const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
      const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
      const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
      let h = Math.atan2(B, A) * 180 / Math.PI; if (h < 0) h += 360;
      return { L, C: Math.hypot(A, B), h }; };

    // ---- 1. red confinement ----------------------------------------------------------------------
    const REDS = new Set([key(rgb(V('--bad'))), key(rgb(V('--bad-soft'))), key(rgb(V('--bad-bold')))]);
    const reds = [];
    for (const el of document.querySelectorAll('*')) {
      const c = getComputedStyle(el);
      for (const prop of ['color', 'background-color', 'fill', 'stroke', 'border-top-color', 'border-left-color']) {
        const k = key(rgb(c.getPropertyValue(prop)));
        if (!REDS.has(k) || !k) continue;
        // only report the element that OWNS the colour, not every descendant inheriting it
        if (prop === 'color' && el.parentElement && key(rgb(getComputedStyle(el.parentElement).color)) === k) continue;
        const sec = el.closest('section[id]')?.id || '';
        const app = el.closest('[data-app]')?.dataset.app || '—';
        const sam = el.closest('.dsx-sample')?.querySelector('h3')?.textContent.trim().slice(0, 34) || '';
        reds.push({ app, prop, tag: el.tagName.toLowerCase(), cls: (typeof el.className === 'string' ? el.className : '').slice(0, 30), text: (el.textContent || '').trim().slice(0, 46), sec, sam });
      }
    }

    // ---- 2. flag adjacency ------------------------------------------------------------------------
    // saffron 62 degrees, India green 152 degrees, both above chroma 0.05, on a surface above L 0.9
    const warmish = [], greenish = [];
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const c = getComputedStyle(el);
      for (const prop of ['color', 'background-color', 'fill']) {
        const v = rgb(c.getPropertyValue(prop)); if (!v) continue;
        if (prop === 'color' && el.parentElement && key(rgb(getComputedStyle(el.parentElement).color)) === key(v)) continue;
        const o = oklch(v); if (o.C < 0.05) continue;
        const rec = { r: { x: r.x, y: r.y, w: r.width, h: r.height }, h: o.h, C: o.C, el: el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : ''), text: (el.textContent || '').trim().slice(0, 28) };
        if (Math.abs(o.h - 62) <= 22) warmish.push(rec);
        else if (Math.abs(o.h - 152) <= 22) greenish.push(rec);
      }
    }
    const near = (a, b) => { const gx = Math.max(0, Math.max(a.r.x - (b.r.x + b.r.w), b.r.x - (a.r.x + a.r.w)));
      const gy = Math.max(0, Math.max(a.r.y - (b.r.y + b.r.h), b.r.y - (a.r.y + a.r.h))); return Math.hypot(gx, gy); };
    const pairs = [];
    for (const w of warmish) for (const g of greenish) { const d = near(w, g); if (d <= 24) pairs.push({ d: +d.toFixed(0), warm: w.el + ' “' + w.text + '” h' + w.h.toFixed(0), green: g.el + ' “' + g.text + '” h' + g.h.toFixed(0) }); }
    pairs.sort((a, b) => a.d - b.d);

    // ---- 3. temperature vs stakes ------------------------------------------------------------------
    // mean chroma of everything painted inside each app frame, by app
    const apps = {};
    for (const f of document.querySelectorAll('.dsx-frame')) {
      const app = f.dataset.app || 'web';
      const bucket = (apps[app] ||= { n: 0, sumC: 0, frames: 0 });
      bucket.frames++;
      for (const el of f.querySelectorAll('*')) {
        const r = el.getBoundingClientRect(); if (r.width * r.height < 40) continue;
        const c = getComputedStyle(el); const v = rgb(c.backgroundColor); if (!v) continue;
        if (c.backgroundColor === 'rgba(0, 0, 0, 0)') continue;
        const o = oklch(v); bucket.n++; bucket.sumC += o.C;
      }
    }
    const tones = {};
    for (const f of document.querySelectorAll('.dsx-frame')) {
      const app = f.dataset.app || 'web';
      const t = (tones[app] ||= {});
      for (const p of f.querySelectorAll('.pill')) {
        const k = ['ok', 'warn', 'waiting', 'bad', 'active'].find(c => p.classList.contains(c)) || 'idle';
        t[k] = (t[k] || 0) + 1;
      }
      for (const n of f.querySelectorAll('.notice')) { const k = 'notice.' + (n.className.split(/\s+/)[1] || 'plain'); t[k] = (t[k] || 0) + 1; }
      for (const b of f.querySelectorAll('.btn.danger')) { t['btn.danger'] = (t['btn.danger'] || 0) + 1; }
    }
    return { reds, pairs: pairs.slice(0, 14), pairCount: pairs.length, apps, tones };
  });

  console.log(`\n================ ${theme.toUpperCase()} ================`);
  const byText = new Map();
  for (const r of out.reds) { const k = `${r.app}|${r.text}|${r.cls}`; if (!byText.has(k)) byText.set(k, r); }
  console.log(`RED: ${out.reds.length} painted properties, ${byText.size} distinct places`);
  for (const r of [...byText.values()]) console.log(`   [${r.app}] ${r.prop} ${r.tag}.${r.cls} — “${r.text}”`);
  console.log(`\nFLAG ADJACENCY (saffron 62° within 22° beside India green 152°, gap <= 24px): ${out.pairCount} pairs`);
  for (const p of out.pairs) console.log(`   ${String(p.d).padStart(3)}px  ${p.warm}   ||   ${p.green}`);
  console.log('');
  console.log('TONES SHOWN TO EACH AUDIENCE:');
  for (const [a, t] of Object.entries(out.tones)) console.log(`   ${a.padEnd(9)} ${Object.entries(t).map(([k, v]) => k + ' ' + v).join(' | ')}`);
  console.log('\nMEAN BACKGROUND CHROMA BY APP (temperature vs stakes):');
  for (const [a, v] of Object.entries(out.apps).sort((x, y) => y[1].sumC / y[1].n - x[1].sumC / x[1].n))
    console.log(`   ${a.padEnd(9)} ${(v.sumC / v.n).toFixed(4)}  over ${v.n} painted areas in ${v.frames} frames`);
  await page.close();
}
await browser.close();

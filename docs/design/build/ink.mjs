// ink.mjs — rasterises every empty-state illustration and measures the proportion of non-background
// pixels inside the optical box. node ink.mjs [light|dark] [--json out.json]
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');   // the workspace's own copy — resolved from this folder upward
const theme = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'light';
const jsonAt = process.argv.indexOf('--json');
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: theme, reducedMotion: 'reduce' })).newPage();
await page.goto('file:///' + process.env.INK_FILE, { waitUntil: 'load' });
await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
await page.waitForTimeout(150);

const rows = await page.evaluate(async () => {
  const SIZE = 240;                       // rasterise big, so thin strokes are not lost to rounding
  const BOX = { x0: 17, y0: 20, x1: 143, y1: 140 };   // the optical box, in viewBox units — the same fraction of the 160-unit canvas as 10–86 × 12–84 was of 96
  const PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray'];
  const inline = (src, dst) => {
    const cs = getComputedStyle(src);
    for (const p of PROPS) { const v = cs.getPropertyValue(p); if (v && v !== 'none' || p === 'fill' || p === 'stroke') dst.setAttribute(p, v); }
    dst.removeAttribute('class');
    const a = [...src.children], b = [...dst.children];
    for (let i = 0; i < a.length; i++) inline(a[i], b[i]);
  };
  const drawNode = (node) => new Promise((res, rej) => {
    node.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    node.setAttribute('width', SIZE); node.setAttribute('height', SIZE);
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(node));
    const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = url;
  });
  const out = [];
  const panelEl = document.querySelector('.empty') || document.body;
  const panelBg = getComputedStyle(panelEl).backgroundColor;
  for (const sym of document.querySelectorAll('symbol.illo-art')) {
    const name = sym.id.replace('illo-', '');
    const holder = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    holder.setAttribute('viewBox', sym.getAttribute('viewBox') || '0 0 160 160');
    for (const ch of sym.children) holder.appendChild(ch.cloneNode(true));
    const a = [...sym.children], b = [...holder.children];
    for (let i = 0; i < a.length; i++) inline(a[i], b[i]);
    const img = await drawNode(holder);
    const c = document.createElement('canvas'); c.width = c.height = SIZE; const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = panelBg; ctx.fillRect(0, 0, SIZE, SIZE);
    const bg = ctx.getImageData(0, 0, 1, 1).data;
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    const k = SIZE / 160;
    const x0 = Math.round(BOX.x0 * k), y0 = Math.round(BOX.y0 * k), x1 = Math.round(BOX.x1 * k), y1 = Math.round(BOX.y1 * k);
    const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let ink = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      n++;
      if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 12) ink++;
    }
    out.push({ name, coverage: +(100 * ink / n).toFixed(1) });
  }
  return out;
});
await browser.close();

rows.sort((a, b) => b.coverage - a.coverage);
const vals = rows.map(r => r.coverage);
const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
console.log(`ink coverage inside the optical box (x 17–143, y 20–140 of 160×160), ${theme}`);
for (const r of rows) console.log(`  ${r.name.padEnd(14)} ${r.coverage.toFixed(1).padStart(5)}%  ${'█'.repeat(Math.round(r.coverage / 1.5))}`);
console.log(`  ${'—'.repeat(14)}`);
console.log(`  mean ${mean.toFixed(1)}% · lightest ${vals[vals.length - 1].toFixed(1)}% · heaviest ${vals[0].toFixed(1)}% · spread ${(vals[0] - vals[vals.length - 1]).toFixed(1)} points · ratio ${(vals[0] / vals[vals.length - 1]).toFixed(2)}×`);
if (jsonAt > 0) writeFileSync(process.argv[jsonAt + 1], JSON.stringify(rows, null, 1));

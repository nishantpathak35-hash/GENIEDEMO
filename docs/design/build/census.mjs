// census.mjs — the element census over the built set.
//   node census.mjs <dir>            every class and control inside product frames, and the document's own chrome
//   node census.mjs <dir> --json     count each INVENTORY selector inside product frames of every file except the
//                                     components page and the motion page, and write inventory.json for the components page
import { readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { INVENTORY } from './inventory.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');   // the workspace's own copy — resolved from this folder upward
const DIR = process.argv[2]; const JSON_MODE = process.argv.includes('--json');
const b = await chromium.launch(); const p = await b.newPage();
const inFrame = new Map(), chrome = new Map(), roles = new Map(), counts = {};
const files = readdirSync(DIR).filter(x => x.endsWith('.html') && !(JSON_MODE && /^(13|14)-/.test(x)));
for (const f of files) {
  await p.goto(`file:///${DIR}/${f}`);
  if (JSON_MODE) {
    const r = await p.evaluate((inv) => Object.fromEntries(inv.map(([name, sel]) => [name, [...document.querySelectorAll(sel)].filter(e => e.closest('.dsx-frame') && (e.matches('svg.i, svg.illo') || !e.closest('svg'))).length])), INVENTORY);
    for (const [k, n] of Object.entries(r)) counts[k] = (counts[k] || 0) + n;
    continue;
  }
  const r = await p.evaluate(() => { const a = [], c = [], ro = [];
    for (const el of document.querySelectorAll('body *')) { if (el.closest('svg')) continue; const fr = !!el.closest('.dsx-frame');
      const tag = el.tagName.toLowerCase(); const cls = [...el.classList];
      (fr ? a : c).push(`${tag}${cls.length ? '.' + cls[0] : ''}`);
      if (el.getAttribute('role')) ro.push(el.getAttribute('role') + (fr ? '' : ' (doc)'));
      if (['input','select','textarea','button','kbd','progress','dialog','details','summary'].includes(tag)) (fr ? a : c).push(`<${tag}${el.type && tag==='input' ? '['+el.type+']' : ''}>`);
    } return { a, c, ro }; });
  for (const k of r.a) inFrame.set(k, (inFrame.get(k) || 0) + 1);
  for (const k of r.c) chrome.set(k, (chrome.get(k) || 0) + 1);
  for (const k of r.ro) roles.set(k, (roles.get(k) || 0) + 1);
}
await b.close();
if (JSON_MODE) {
  writeFileSync(new URL('./inventory.json', import.meta.url), JSON.stringify(counts, null, 1));
  const kinds = { component: 0, composed: 0, custom: 0 }; for (const r of INVENTORY) kinds[r[3]] += counts[r[0]] || 0;
  console.log(`inventory.json: ${INVENTORY.length} rows over ${files.length} files · in product frames: ${Object.values(counts).reduce((a, b) => a + b, 0)} elements — component ${kinds.component}, composed ${kinds.composed}, custom ${kinds.custom}`);
  for (const [name, sel, , kind] of INVENTORY) console.log(`  ${String(counts[name] || 0).padStart(5)}  ${kind.padEnd(9)} ${name}`);
} else {
  const dump = (m, min) => [...m].filter(([k, n]) => n >= min && !/^(div|span|p|b|small|li|td|tr|th|strong|em|i|a|h[1-6]|ul|ol|thead|tbody|tfoot|table|dt|dd|dl|section|main|nav|header|footer|aside|label|br|code|use)$/.test(k)).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${String(n).padStart(5)} ${k}`).join('\n');
  console.log('IN FRAMES:\n' + dump(inFrame, 1)); console.log('\nDOC CHROME:\n' + dump(chrome, 1)); console.log('\nROLES:\n' + [...roles].map(([k, n]) => `${k} ${n}`).join(' · '));
}

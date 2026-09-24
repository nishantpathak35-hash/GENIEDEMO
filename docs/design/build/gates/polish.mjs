// The three polish claims that had no number behind them.
//
//  1. FOOTPRINT PARITY. A screen must not change size when its data arrives. Measured on the ROW, which
//     is the unit where the rule is decidable: a whole screen legitimately differs between roles (an
//     accountant sees more than a site engineer), but a table row is the same row loading or loaded.
//  2. FOCUS. The claim is a 2px ring in the focus colour, set 2px outside the control, on every button and link —
//     and on a field, the published focused state: the border in the focus colour, 2px in all, no outer ring —
//     and nothing else (the glow of the previous system is withdrawn). A component outline at equal or higher
//     specificity would win, so it is measured on a real focused control rather than read off the rule.
//  3. TYPE HYGIENE. One label case across the set, and no heading left as the last thing in its box.
//
//   node polish.mjs [dir]
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const SET = fileURLToPath(new URL('../..', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');   // the workspace's own copy — resolved from this folder upward

const DIR = process.argv[2] || SET;
const files = readdirSync(DIR).filter(f => f.endsWith('.html')).sort();
const browser = await chromium.launch({ headless: true });
let fails = 0;

// ---- 2. focus -------------------------------------------------------------------------------------------
{
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' })).newPage();
  await page.goto(`file:///${DIR}/00-foundations.html`, { waitUntil: 'load' });
  await page.waitForTimeout(150);
  console.log('FOCUS — the ring, on a real focused control\n');
  for (const [label, sel] of [['button', '.btn:not(.ghost):not(.primary)'], ['primary button', '.btn.primary'], ['ghost button', '.btn.ghost'], ['text input', 'input[type="text"], input:not([type])'], ['link', '.dsx-main a[href]:not(.btn)'], ['select', 'select']]) {
    const found = await page.evaluate((s) => { const el = [...document.querySelectorAll(s)].find(e => e.getBoundingClientRect().width > 0); if (!el) return false; el.focus(); return true; }, sel);
    if (found) await page.waitForTimeout(300);   // the published field eases its border into the focused colour; read it once it has arrived
    const r = await page.evaluate((s) => {
      const el = document.activeElement && document.activeElement.matches(s) ? document.activeElement : null;
      if (!el) return null;
      const c = getComputedStyle(el);
      const probe = document.createElement('i'); probe.style.color = 'var(--focus)'; document.body.appendChild(probe); const focus = getComputedStyle(probe).color; probe.remove();
      // a text field or select takes the published focused state: the border in the focused colour, 2px in all (1px border + 1px inset), no outer ring
      const inset = /inset/.test(c.boxShadow) && c.boxShadow.includes(focus) ? 1 : 0;
      const fieldFocus = c.borderTopColor === focus && parseFloat(c.borderTopWidth) + inset >= 2;
      return { outline: `${c.outlineStyle} ${c.outlineWidth} ${c.outlineColor}`, style: c.outlineStyle, width: c.outlineWidth, colour: c.outlineColor, offset: c.outlineOffset, focus, fieldFocus, border: `${c.borderTopWidth} ${c.borderTopColor}${inset ? ' + 1px inset' : ''}` };
    }, sel);
    if (!r) { console.log(`  --   ${label.padEnd(16)} not present`); continue; }
    await page.waitForTimeout(40);
    const field = label === 'text input' || label === 'select';
    const ok = field ? r.fieldFocus : r.style === 'solid' && r.width === '2px' && r.offset === '2px' && r.colour === r.focus;
    if (!ok) fails++;
    console.log(field ? `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(16)} focused border ${r.border}${ok ? '' : `   expected a 2px border in the focus colour ${r.focus}`}`
      : `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(16)} ring ${r.outline} @ ${r.offset}${r.colour === r.focus ? '' : `   expected the focus colour ${r.focus}`}`);
  }
  await page.close();
}

// ---- 1. footprint parity + 3. type hygiene --------------------------------------------------------------
console.log('\nFOOTPRINT PARITY — the loading row against the loaded row\n');
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' })).newPage();
const uppercase = new Map(), orphans = [], skelRows = new Set(), plainRows = new Set();
for (const f of files) {
  await page.goto(`file:///${DIR}/${f}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
  const r = await page.evaluate(() => {
    const up = [];
    for (const el of document.querySelectorAll('*')) {
      const c = getComputedStyle(el);
      if (c.textTransform === 'uppercase' && (el.textContent || '').trim()) up.push((typeof el.className === 'string' ? el.className : '').split(/\s+/).filter(Boolean).pop() || el.tagName);
    }
    const orph = [];
    for (const h of document.querySelectorAll('h2, h3, h4, h5, .lbl, .ct')) {
      const p = h.parentElement; if (!p) continue;
      if (h.matches('.card-h > .ct')) continue;   // (19 September, the grid) a header row's title follows its disc and is followed by the card's body: not an orphan
      const sibs = [...p.children].filter(e => e.getBoundingClientRect().height > 0);
      if (sibs.length > 1 && sibs[sibs.length - 1] === h) orph.push(`${h.tagName}.${(typeof h.className === 'string' ? h.className : '').split(/\s+/)[0]} “${h.textContent.trim().slice(0, 34)}”`);
    }
    // the loading table's row, and the loaded table's PLAIN row — a row carrying a sub-line, a pill or a
    // meter is taller on purpose and is not the row a skeleton stands in for
    const skelTr = document.querySelector('.tbl.skel tbody tr');
    const plain = [...document.querySelectorAll('table.tbl:not(.skel) tbody tr:not(.group)')]
      .filter(x => !x.querySelector('.sub, .pill, .meter, .spark') && x.getBoundingClientRect().height)
      .map(x => Math.round(x.getBoundingClientRect().height));
    return { up, orph, skelRow: skelTr ? Math.round(skelTr.getBoundingClientRect().height) : null, head: !!document.querySelector('.tbl.skel thead th'), plainRows: plain };
  });
  if (r.skelRow !== null) { skelRows.add(r.skelRow); console.log(`  loading   ${f.replace('.html', '').padEnd(22)} row ${r.skelRow}px · header present: ${r.head}`); }
  for (const h of r.plainRows) plainRows.add(h);
  for (const u of r.up) uppercase.set(u, (uppercase.get(u) || 0) + 1);
  for (const o of r.orph) orphans.push(`${f}: ${o}`);
}
await browser.close();
{
  const sk = [...skelRows], pl = [...plainRows].sort((a, b) => a - b);
  const match = sk.length === 1 && pl.includes(sk[0]);
  if (!match) fails++;
  console.log(`  loaded    plain table rows across the set: ${pl.join(', ')}px`);
  console.log(`  ${match ? 'ok  ' : 'FAIL'} the loading row is ${sk.join('/')}px and a loaded plain row is ${pl.join('/')}px — ${match ? 'the table does not change height when the data arrives' : 'THE PAGE JUMPS WHEN THE DATA ARRIVES'}`);
}

console.log('\nTYPE HYGIENE\n');
console.log('  label case — elements set in capitals:');
for (const [k, n] of [...uppercase.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(3)}x  .${k}`);
console.log(`  orphan headings (a heading left as the last visible thing in its container): ${orphans.length}`);
for (const o of orphans.slice(0, 12)) console.log('    ' + o);
if (orphans.length) fails++;
console.log(`\nPOLISH GATE: ${fails ? `FAIL (${fails})` : 'PASS'}`);
process.exit(fails ? 1 : 0);

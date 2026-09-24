// The two money rules, as a gate over the whole set.
//
//  1. INDIAN GROUPING. Every rupee figure groups the last three digits and then in twos — 1,11,111.11,
//     not 111,111.11 — and carries exactly two decimals. This is not a formatting preference: a lakh
//     and a crore are how the number is SAID, and a figure grouped the Western way is read wrong by the
//     person it is shown to.
//  2. PROVISIONAL IS SAID WHERE IT IS TRUE, AND ONLY THERE. This rule replaced "no figure on a CA-gated
//     surface" on 15 September 2026, when ADR-0014's addendums moved the chartered-accountant gate from the
//     build to the statutory output. Measured inside every drawn frame:
//       a. a Provisional pill sits beside a rate or a tax head — never on a bare figure;
//       b. a generated statutory document (a payment voucher, a challan, a 26Q statement, a tax invoice)
//          holding a Provisional pill also carries "Draft: provisional rates";
//       c. "Draft: provisional rates" appears on nothing but such a document — an individual figure
//          carries no banner;
//       d. a refused statutory output shows no figure of its own.
//
//   node money.mjs [dir]
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const SET = fileURLToPath(new URL('../..', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');   // the workspace's own copy — resolved from this folder upward

const DIR = process.argv[2] || SET;
const files = readdirSync(DIR).filter(f => f.endsWith('.html')).sort();

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' })).newPage();

let totalFigures = 0, totalBad = 0, totalProv = 0, totalDrafts = 0, totalLeak = 0;
console.log(`MONEY GATE  ${DIR}\n`);
console.log('  ' + 'file'.padEnd(24) + 'figures  malformed   provisional marks  draft documents  violations');
console.log('  ' + '-'.repeat(24) + '-------  ---------   -----------------  ---------------  ----------');

for (const f of files) {
  await page.goto(`file:///${DIR}/${f}`, { waitUntil: 'load' });
  await page.waitForTimeout(60);
  const r = await page.evaluate(() => {
    // A well-formed figure: ₹ then the last group of three, preceded by groups of two, then .dd
    const GOOD = /^₹-?\d{1,2}(?:,\d{2})*(?:,\d{3})(?:\.\d{2})$|^₹-?\d{1,3}(?:\.\d{2})$/;
    const ANY = /₹\s?-?[\d,]+(?:\.\d+)?(?:L|Cr)?/g;
    // (19 September, charts) a compact tick on an axis — ₹40L, ₹2.4Cr — is the grammar's, never a figure: full figures live in the tooltip and the table
    const TICK = /^₹-?\d{1,3}(?:\.\d)?(?:L|Cr)$/;
    const bad = [], all = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const p = n.parentElement;
      if (!p || /^(SCRIPT|STYLE|CODE|PRE)$/.test(p.tagName)) continue;
      // class="was" marks a figure the document is QUOTING in order to say it was rejected —
      // the brief's ₹12.4 L shorthand, for instance. A quotation is not a figure the product prints.
      if (p.closest('.was')) continue;
      for (const m of (n.nodeValue || '').matchAll(ANY)) {
        const fig = m[0].replace(/\s/g, '');
        all.push(fig);
        if (TICK.test(fig)) { if (!p.closest('.chart .grid, .chart .x, .chart .legend, .ring-list')) bad.push({ fig: fig + ' (a compact figure outside a chart axis)', where: (p.closest('[class]')?.className || p.tagName).toString().slice(0, 40) }); continue; }
        if (!GOOD.test(fig)) bad.push({ fig, where: (p.closest('[class]')?.className || p.tagName).toString().slice(0, 40) });
      }
    }
    // a tax invoice is numbered as the product numbers it since 19 September: INV/<FY>/<n>; a voucher PV/<FY>/<n>
    const DOC = /payment voucher|challan|26q|\bINV\/\d|\bPV\/\d|tax invoice|billing/i;
    const RATE = /%|\b19[0-9][A-Z]?\b|GST|TDS|tax deducted/i;
    const leaks = [];
    const frames = [...document.querySelectorAll('.dsx-frame')];
    const inFrame = (el) => frames.some(f => f.contains(el));
    const headOf = (c) => (c.querySelector('.pane-t, .ct, h5, h4, .top b')?.textContent || '').trim();
    const provs = [...document.querySelectorAll('.pill')].filter(p => p.textContent.trim() === 'Provisional' && inFrame(p));
    for (const p of provs) {
      const cell = p.closest('dd, td, .taxrow, li, p');
      if (!cell || !RATE.test(cell.textContent)) leaks.push(`a. Provisional on a bare figure: “${(cell || p.parentElement).textContent.trim().slice(0, 50)}”`);
      const doc = p.closest('.pane, section.card, .card');
      if (doc && DOC.test(headOf(doc)) && !/Draft: provisional rates/.test(doc.textContent)) leaks.push(`b. a statutory document without the draft notice: “${headOf(doc)}”`);
    }
    const drafts = [...document.querySelectorAll('.notice, p')].filter(n => inFrame(n) && /^\s*Draft: provisional rates/.test(n.textContent) && !n.parentElement.closest('.notice'));
    for (const d of drafts) {
      const doc = d.closest('.pane, section.card, .card');
      if (!doc || !DOC.test(headOf(doc))) leaks.push(`c. a draft banner on something that is not a statutory document: “${doc ? headOf(doc) : d.textContent.slice(0, 40)}”`);
    }
    for (const n of [...document.querySelectorAll('.notice.bad')].filter(n => inFrame(n) && /was not produced/.test(n.textContent))) {
      for (const m of (n.textContent || '').matchAll(ANY)) leaks.push(`d. a figure on a refused output: ${m[0]}`);
    }
    return { all: all.length, bad, prov: provs.length, drafts: drafts.length, leaks };
  });
  totalFigures += r.all; totalBad += r.bad.length; totalProv += r.prov; totalDrafts += r.drafts; totalLeak += r.leaks.length;
  const ok = r.bad.length === 0 && r.leaks.length === 0;
  console.log(`  ${ok ? ' ' : '✗'} ${f.padEnd(22)} ${String(r.all).padStart(7)}  ${String(r.bad.length).padStart(9)}   ${String(r.prov).padStart(17)}  ${String(r.drafts).padStart(15)}  ${String(r.leaks.length).padStart(10)}`);
  for (const b of r.bad.slice(0, 4)) console.log(`        malformed: ${b.fig}  in .${b.where}`);
  for (const l of r.leaks.slice(0, 6)) console.log(`        ${l}`);
}
await browser.close();
console.log('  ' + '-'.repeat(24) + '-------  ---------   -----------------  ---------------  ----------');
console.log(`  ${'TOTAL'.padEnd(22)} ${String(totalFigures).padStart(7)}  ${String(totalBad).padStart(9)}   ${String(totalProv).padStart(17)}  ${String(totalDrafts).padStart(15)}  ${String(totalLeak).padStart(10)}`);
console.log(`\nMONEY GATE: ${totalBad || totalLeak ? 'FAIL' : 'PASS'} — ${totalFigures} rupee figures across ${files.length} files, every one in Indian grouping with two decimals; ${totalProv} Provisional marks, each beside a rate or a tax head; ${totalDrafts} draft notices, each on a statutory document`);
process.exit(totalBad || totalLeak ? 1 : 0);

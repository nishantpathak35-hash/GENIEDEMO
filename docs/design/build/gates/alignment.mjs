// gates/alignment.mjs — the alignment gate, v4. The v3 gate plus two checks (one hero per screen; every empty state
// illustrated), run twice per width and theme: with the web fonts (online) and on the fallback stack (offline).
//   node gates/alignment.mjs <file.html> [--top 5] [--json out.json] [--widths 400,768,1280,1440] [--themes light,dark] [--net both|online|offline]
// Renders the file in headless Chromium (reduced motion on, so layout is settled) and asserts with getBoundingClientRect:
//   button-group     every container with ≥2 buttons: one top, one height, one row — unless the group is
//                    computed flex-direction:column AND on STACK_ALLOW (both, or it is a fault)
//   card-row         tile grids: siblings in a row share top and height; no orphan cell of a different height
//   caution-highlighter  the caution fill is under a lozenge or a section message only — never a figure, a label
//                    or a sentence (19 September); caution as text is allowed and the contrast gate holds it
//   table-column     header and body cells of a column share left and right
//   table-numeric    numeric columns: every cell right-aligned, text right edges on one x
//   table-decimals   money columns: the decimal point of every figure on one x
//   form-left        a label and its control start on one left edge; control fills its field
//   form-edges       within a form, the set of label left edges equals the set of control left edges
//   pill-baseline    pills in one row, and a pill beside text, share the text baseline
//   icon-xheight     an icon beside text is centred on the text's x-height (multi-line text: or on the block)
//   overflow         nothing wider than its container; no horizontal scroll except inside an overflow-x:auto wrapper
//   component        the same component renders with identical padding and radius (keyed by variant + frame kind)
//   hero             every product screen has exactly one [data-hero]; it is a figure ≥1.6× the largest other text on the
//                    page, or the largest card on the page at ≥25% of it, or the card holding the screen's one large primary action
//   empty-state      every .empty is the published anatomy: one image, then a heading, one description of one or
//                    two sentences, at most two buttons (the secondary before the primary) and at most one link
//   illo             every drawing: the 160×160 canvas, blocks under one line, two or three sparkles, a square render —
//                    and the drawing is decorative, so the empty state's heading and description must be present
//   doc-nav          the document's own section list: one line per label, one left edge, one right edge for the
//                    numbers, one item height — and one row when it collapses to a strip
// Tolerance: ±0.5px is equal; ≥1px is a fault. Circled icons (.tick .ic .stepno .avatar) are components, not icons,
// and are judged by eye. Baselines and x-heights come from canvas font metrics, calibrated in-page at start.
import { createRequire } from 'node:module';
import { writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');   // the workspace's own copy — resolved from this folder upward

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
if (!file) { console.error('usage: node align.mjs <file.html> [--top N] [--json out]'); process.exit(2); }
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const TOP = +opt('--top', 5), JSON_OUT = opt('--json', null);
const WIDTHS = opt('--widths', '400,768,1280,1440').split(',').map(Number);
const THEMES = opt('--themes', 'light,dark').split(',');
const NETS = { both: ['online', 'offline'], online: ['online'], offline: ['offline'] }[opt('--net', 'both')];

// Groups allowed to stack (must ALSO compute flex-direction: column at that width). One line of reason each.
const STACK_ALLOW = [
  ['.actions', 'action rows stack under 520px container width so every button keeps its full label'],
  ['.drawer-f', 'drawer footer stacks with the actions under 520px'],
  ['.gate .actions', 'gate actions stack under 520px'],
  ['.hero .a', 'the hero’s actions stack under 520px'],
];

const inPage = ({ STACK_SEL }) => {
  const T = 0.5;
  const faults = []; const cov = { chartsWithLegend: 0, cautionAreas: 0, chartParts: 0, valueLineDupes: 0, pillsWithText: 0, marigoldUses: 0, buttonGroups: 0, tileGrids: 0, tables: 0, numericColumns: 0, decimalColumns: 0, fields: 0, pillRows: 0, pillsBesideText: 0, icons: 0, iconsMultiline: 0, components: 0, codes: 0, navItems: 0, illos: 0, illoRefs: 0, screenSamples: 0, valueLines: 0 };
  const R = el => el.getBoundingClientRect();
  const cs = el => getComputedStyle(el);
  const secOf = el => { const s = el.closest('.dsx-section'); if (!s) return 'document'; const h = s.querySelector('h2'); const n = h.querySelector('b'); return (n ? n.textContent.trim() + ' ' : '') + [...h.childNodes].filter(x => x.nodeType === 3).map(x => x.data).join('').trim(); };
  const desc = el => { const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''; const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 42); return `${el.tagName.toLowerCase()}${cls}${t ? ` “${t}”` : ''}`; };
  const vis = el => { if (!el || el.closest('.sr-only')) return false; const r = R(el); if (r.width === 0 && r.height === 0) return false; const c = cs(el); return c.visibility !== 'hidden' && c.display !== 'none' && c.opacity !== '0'; };
  const push = (check, el, what, px) => faults.push({ check, section: secOf(el), element: desc(el), what, px: +(+px).toFixed(2) });
  const walker = root => { const out = []; const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.data.trim() && !n.parentElement.closest('.sr-only') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP }); let n; while ((n = w.nextNode())) out.push(n); return out; };
  const firstText = el => walker(el)[0] || null;
  const spread = xs => Math.max(...xs) - Math.min(...xs);
  const lineRects = node => { const r = document.createRange(); r.selectNodeContents(node); return [...r.getClientRects()].filter(x => x.width > 0 && x.height > 0); };
  const textRect = el => { const r = document.createRange(); r.selectNodeContents(el); const b = r.getBoundingClientRect(); return b.width ? b : null; };

  // ---- font metrics via canvas, calibrated against a live line box -------------------------------------
  const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); const mcache = new Map();
  const fontOf = el => { const c = cs(el); return { key: `${c.fontStyle} ${c.fontWeight} ${c.fontSize} ${c.fontFamily}`, size: parseFloat(c.fontSize) }; };
  const metrics = el => { const f = fontOf(el); if (!mcache.has(f.key)) { ctx.font = f.key; const m = ctx.measureText('x'); const H = ctx.measureText('H'); mcache.set(f.key, { fba: m.fontBoundingBoxAscent, fbd: m.fontBoundingBoxDescent, xh: m.actualBoundingBoxAscent, cap: H.actualBoundingBoxAscent }); } return mcache.get(f.key); };
  // calibration: a 0×0 inline-block sits on the baseline; compare with range-top + ascent
  const probe = document.createElement('div'); probe.style.cssText = 'position:absolute;left:-2000px;top:0;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif'; probe.innerHTML = 'xHg<span style="display:inline-block;width:0;height:0"></span>'; document.body.appendChild(probe);
  const pm = metrics(probe); const ptext = walker(probe)[0]; const prect = lineRects(ptext)[0]; const marker = R(probe.querySelector('span'));
  const calibration = { rangeTopPlusAscent: +(prect.top + pm.fba).toFixed(2), markerBaseline: +marker.top.toFixed(2), rangeHeight: +prect.height.toFixed(2), contentArea: +(pm.fba + pm.fbd).toFixed(2), xh: +pm.xh.toFixed(2), cap: +pm.cap.toFixed(2) };
  // the range rect height is the content area; the baseline is range.top + ascent. Correct if the two agree.
  const baselineOffset = marker.top - (prect.top + pm.fba); // residual, applied to every baseline
  probe.remove();
  const baselineOf = (node) => { const rs = lineRects(node); if (!rs.length) return null; const m = metrics(node.parentElement); return { baseline: rs[0].top + m.fba + baselineOffset, first: rs[0], lines: rs.length, m }; };

  // ---- A. button groups ------------------------------------------------------------------------------
  const isBtn = el => el.matches('button, a.btn, .btn, input[type=button], input[type=submit]');
  const seenGroups = new Set();
  document.querySelectorAll('button, a.btn, .btn').forEach(b => {
    const p = b.parentElement; if (!p || seenGroups.has(p)) return; seenGroups.add(p);
    const btns = [...p.children].filter(c => isBtn(c) && vis(c)); if (btns.length < 2) return; cov.buttonGroups++;
    const c = cs(p);
    const stacked = (c.display.includes('flex') && c.flexDirection.startsWith('column')) || (c.display.includes('grid') && c.gridTemplateColumns.split(' ').length === 1 && !c.gridAutoFlow.includes('column'));
    if (stacked) { if (!STACK_SEL.some(s => p.matches(s))) push('button-group', p, 'stacked group is not on the allowlist', 0); return; }
    const rs = btns.map(R);
    // A group that is ALLOWED to wrap is still checked — but row by row. Filter chips and a bulk
    // action bar wrap on a phone by design; what must hold is that the buttons sharing a line share
    // a baseline and a height. Requiring one row of a wrapping container only proves it is narrow.
    const wraps = getComputedStyle(p).flexWrap === 'wrap';
    const lines = [];
    rs.forEach(r => { const ln = lines.find(x => Math.abs(x.top - r.top) <= T); if (ln) ln.rs.push(r); else lines.push({ top: r.top, rs: [r] }); });
    if (!wraps && lines.length > 1) push('button-group', p, `${btns.length} buttons not on one row (tops differ)`, spread(rs.map(r => r.top)));
    for (const ln of lines) {
      const dt = spread(ln.rs.map(r => r.top)), dh = spread(ln.rs.map(r => r.height));
      if (dt > T) push('button-group', p, `${ln.rs.length} buttons on a line do not share a top`, dt);
      if (dh > T) push('button-group', p, `button heights differ on one line: ${ln.rs.map(r => r.height.toFixed(1)).join(' / ')}`, dh);
    }
  });

  // ---- A2. the value line ------------------------------------------------------------------------
  // Every sample holding a product screen answers "what is this for?" in the client's words, or is
  // explicitly ruled exempt. A screen nobody can write that sentence for is decoration.
  document.querySelectorAll('.dsx-sample').forEach(sm => {
    if (!vis(sm) || !sm.querySelector('.dsx-frame')) return;
    if (sm.closest('section[id]')?.id === 's12') return;   // variants, not canonical renders — see A3; true in both shapes because the section keeps its id when it becomes its own file
    cov.screenSamples++;
    const has = !!sm.querySelector('.vline'), exempt = sm.getAttribute('data-value') === 'exempt';
    if (has) cov.valueLines++;
    else if (!exempt) push('value-line', sm, `no value line on “${(sm.querySelector('h3')?.textContent || '').trim().slice(0, 40)}”`, 99);
  });

  // ---- A3. the inverse rule ----------------------------------------------------------------------
  // A value line attaches to a screen ONCE, on its canonical render. Two ways that breaks, both fatal:
  // the same sentence appearing twice, and a sentence on a sample in section 12 — which holds the SAME
  // screens in other states and for other roles, so every value line there is a second attachment.
  // A2 catches a screen with no value line; without this, five duplicates went unseen for a whole build.
  {
    const seen = new Map();
    document.querySelectorAll('.vline').forEach(v => {
      if (!vis(v)) return;
      const sm = v.closest('.dsx-sample');
      const title = (sm?.querySelector('h3')?.textContent || '').trim().slice(0, 46);
      const sec = v.closest('section[id]')?.id || '';
      if (sec === 's12') { cov.valueLineDupes++; push('value-line', sm || v, `value line on “${title}” — section 12 holds states and role variants, not canonical screens`, 99); }
      const txt = (v.textContent || '').replace(/^\s*What this is for\s*/i, '').trim();
      if (!txt) { push('value-line', sm || v, `empty value line on “${title}”`, 99); return; }
      if (seen.has(txt)) { cov.valueLineDupes++; push('value-line', sm || v, `value line on “${title}” repeats the one already on “${seen.get(txt)}”`, 99); }
      else seen.set(txt, title);
    });
  }

  // ---- B. tile grids ---------------------------------------------------------------------------------
  const TILE = '.stats, .two, .dsx-grid, .dsx-targets, .dsx-states, .health, .dsx-swatches, .row, .kanban, .dsx-tokens, .dsx-pairs';
  document.querySelectorAll(TILE).forEach(g => {
    if (!vis(g)) return;
    const kids = [...g.children].filter(vis); if (kids.length < 2) return; cov.tileGrids++;
    const rows = []; kids.forEach(k => { const r = R(k); const row = rows.find(x => Math.abs(x.top - r.top) <= T); if (row) row.cells.push({ k, r }); else rows.push({ top: r.top, cells: [{ k, r }] }); });
    const multi = rows.some(x => x.cells.length >= 2);
    rows.forEach((row, i) => {
      if (row.cells.length >= 2) { const dh = spread(row.cells.map(c => c.r.height)); if (dh > T) push('card-row', g, `row ${i + 1}: sibling heights differ ${row.cells.map(c => c.r.height.toFixed(0)).join(' / ')}`, dh); }
      else if (multi) {
        // a lone cell in any row of a multi-column grid must span the full width (a deliberate wide row) — otherwise it is an orphan
        const cell = row.cells[0]; const gc = cs(g); const inner = R(g).width - parseFloat(gc.paddingLeft) - parseFloat(gc.paddingRight);
        if (cell.r.width < inner - T) { const prev = i > 0 ? rows[i - 1].cells[0].r.height : cell.r.height; const dh = Math.abs(cell.r.height - prev); push('card-row', g, `orphan cell “${desc(cell.k).slice(0, 40)}” alone in row ${i + 1}`, Math.max(dh, inner - cell.r.width)); }
      }
    });
  });

  // ---- B2. a row of figure cards (19 September) -------------------------------------------------------
  // Sibling cards in one row share their header strip's height and their figure's baseline. The alignment gate measured
  // inside a card and never across a row, so three tiles could sit at three baselines and pass.
  document.querySelectorAll('.stats.fig-row, .stats, .two, .grid').forEach(g => {
    if (!vis(g)) return;
    const cards = [...g.children].filter(k => vis(k) && k.matches('.card') && k.querySelector(':scope > .card-h') && k.querySelector('.fig, .owe-total .fig'));
    if (cards.length < 2) return;
    const rows = []; cards.forEach(k => { const r = R(k); const row = rows.find(x => Math.abs(x.top - r.top) <= T); if (row) row.cells.push(k); else rows.push({ top: r.top, cells: [k] }); });
    rows.forEach((row, i) => {
      if (row.cells.length < 2) return; cov.figRows = (cov.figRows || 0) + 1;
      const hh = row.cells.map(k => R(k.querySelector(':scope > .card-h')).height); const dh = spread(hh);
      if (dh > T) push('card-row', g, `row ${i + 1}: header strips differ in height ${hh.map(h => h.toFixed(0)).join(' / ')}`, dh);
      const bs = row.cells.map(k => { const f = k.querySelector('.fig, .owe-total .fig'); const t = firstText(f); const b = t && baselineOf(t); return b ? b.baseline : R(f).bottom; }); const db = spread(bs);
      if (db > T) push('card-row', g, `row ${i + 1}: figures sit at different baselines ${bs.map(b => b.toFixed(0)).join(' / ')}`, db);
    });
  });

  // ---- C. tables -------------------------------------------------------------------------------------
  const decimalX = cell => { for (const n of walker(cell)) { const m = /₹[\d,]+(\.)\d{2}(?!\d)/.exec(n.data); if (m) { const i = m.index + m[0].indexOf('.'); const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); return r.getBoundingClientRect().left; } } return null; };
  document.querySelectorAll('table').forEach(table => {
    if (!vis(table) || table.closest('.calendar')) return; cov.tables++;   // a date picker's grid is buttons, centred as published — not a data table
    const cols = new Map();
    [...table.rows].filter(vis).forEach(tr => { let ci = 0; [...tr.cells].forEach(cell => { if (cell.colSpan > 1 || cell.rowSpan > 1) { ci += cell.colSpan; return; } const e = cols.get(ci) || { th: [], td: [] }; (cell.tagName === 'TH' && tr.parentElement.tagName === 'THEAD' ? e.th : e.td).push(cell); cols.set(ci, e); ci++; }); });
    cols.forEach((e, ci) => {
      const all = [...e.th, ...e.td]; if (all.length < 2) return;
      const dl = spread(all.map(c => R(c).left)), dr = spread(all.map(c => R(c).right));
      if (dl > T || dr > T) push('table-column', table, `column ${ci + 1} (${(e.th[0] || all[0]).textContent.trim().slice(0, 20)}): cell edges differ left ${dl.toFixed(1)} right ${dr.toFixed(1)}`, Math.max(dl, dr));
      const tds = e.td.filter(c => c.textContent.trim() && !c.matches('.check') && !/^[-–—]$/.test(c.textContent.trim())); // a lone dash is neither
      if (!tds.length) return;
      // numeric by CONTENT (class or figure pattern), never by computed alignment — a left-aligned money column must fail
      const isNumText = c => /^[-–—₹\d.,%\s]+$|^\d[\d.,]*\s+[a-z]+$/.test(c.textContent.trim());
      const numeric = (e.th[0] && e.th[0].classList.contains('num')) || tds.filter(c => c.classList.contains('num') || isNumText(c)).length >= tds.length / 2;
      if (!numeric) return; cov.numericColumns++;
      all.filter(c => c.textContent.trim() && cs(c).textAlign !== 'right').forEach(c => push('table-numeric', c, `cell in numeric column ${ci + 1} is left-aligned`, 0));
      const edges = tds.map(c => textRect(c)?.right).filter(x => x != null);
      if (edges.length > 1) { const d = spread(edges); if (d > T) push('table-numeric', table, `column ${ci + 1}: right text edges differ`, d); }
      const xs = tds.map(decimalX).filter(x => x != null);
      if (xs.length > 1) { cov.decimalColumns++; const d = spread(xs); if (d > T) push('table-decimals', table, `column ${ci + 1}: decimal points differ`, d); }
    });
  });

  // ---- D. forms --------------------------------------------------------------------------------------
  const groups = new Map();
  document.querySelectorAll('.field').forEach(f => { if (!vis(f)) return; const g = f.closest('form') || f.parentElement; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(f); });
  groups.forEach((fields, g) => {
    const labelLefts = new Set(), ctlLefts = new Set();
    fields.forEach(f => {
      const label = f.querySelector('label'); const ctls = [...f.querySelectorAll('input, select, textarea')].filter(c => vis(c) && !c.matches('[type=checkbox],[type=radio]'));
      if (!label || !ctls.length) return; cov.fields++;
      const fl = R(label).left; labelLefts.add(Math.round(fl * 2) / 2);
      const fc = cs(f); const inner = R(f).width - parseFloat(fc.paddingLeft) - parseFloat(fc.paddingRight);
      ctls.forEach(c => { const r = R(c); ctlLefts.add(Math.round(r.left * 2) / 2); if (Math.abs(r.left - fl) > T) push('form-left', f, `label and ${c.tagName.toLowerCase()} start on different left edges`, Math.abs(r.left - fl)); if (Math.abs(r.width - inner) > T && !c.matches('.short')) push('form-left', f, `${c.tagName.toLowerCase()} is ${r.width.toFixed(0)}px in a ${inner.toFixed(0)}px field`, Math.abs(r.width - inner)); });
    });
    const a = [...labelLefts].sort((x, y) => x - y), b = [...ctlLefts].sort((x, y) => x - y);
    if (a.length && b.length && (a.length !== b.length || a.some((x, i) => Math.abs(x - b[i]) > T))) push('form-edges', g, `label left edges {${a.map(x => x.toFixed(0)).join(',')}} ≠ control left edges {${b.map(x => x.toFixed(0)).join(',')}}`, Math.max(...a.map((x, i) => Math.abs(x - (b[i] ?? x)))) || 0);
  });

  // ---- E. pills --------------------------------------------------------------------------------------
  // a pill hugs its text: a stretched pill is a grid/flex item that forgot justify-self
  document.querySelectorAll('.pill').forEach(p => { if (!vis(p)) return; const c = cs(p); const t = textRect(p); if (!t) return; const bc = getComputedStyle(p, '::before'); const bw = bc.content && bc.content !== 'none' ? (parseFloat(bc.width) || 0) + (parseFloat(bc.marginRight) || 0) : 0;
    const want = t.width + bw + parseFloat(c.paddingLeft) + parseFloat(c.paddingRight) + parseFloat(c.borderLeftWidth) + parseFloat(c.borderRightWidth); const d = R(p).width - want; if (d > 4) push('pill-stretch', p, `pill is ${d.toFixed(0)}px wider than its text`, d); });
  const pillBase = p => { const tn = walker(p)[0]; if (!tn) return null; const b = baselineOf(tn); return b ? b.baseline : null; };
  const byParent = new Map();
  document.querySelectorAll('.pill').forEach(p => { if (!vis(p)) return; const k = p.parentElement; if (!byParent.has(k)) byParent.set(k, []); byParent.get(k).push(p); });
  byParent.forEach((pills, parent) => {
    // rows of pills
    const rows = []; pills.forEach(p => { const r = R(p); const row = rows.find(x => Math.abs(x.top - r.top) < r.height / 2); if (row) row.items.push(p); else rows.push({ top: r.top, items: [p] }); });
    rows.forEach(row => { if (row.items.length < 2) return; cov.pillRows++; const bs = row.items.map(pillBase).filter(x => x != null); if (bs.length > 1) { const d = spread(bs); if (d > T) push('pill-baseline', parent, `${row.items.length} pills in one row on different baselines`, d); } });
    // a pill beside text in the same parent
    const texts = [...parent.childNodes].flatMap(n => n.nodeType === 3 ? (n.data.trim() ? [n] : []) : (n.nodeType === 1 && n.matches('span.nowrap, a, b, strong, em, i:not(.i)') && !n.querySelector('.pill') ? [firstText(n)].filter(Boolean) : []));
    pills.forEach(p => {
      const pb = pillBase(p); if (pb == null) return; const pr = R(p);
      for (const tn of texts) { const rs = lineRects(tn); const line = rs.find(r => r.bottom > pr.top && r.top < pr.bottom); if (!line) continue; cov.pillsBesideText++; const m = metrics(tn.parentElement); const tb = line.top + m.fba + baselineOffset; const d = Math.abs(pb - tb); if (d > T) push('pill-baseline', parent, `pill “${p.textContent.trim().slice(0, 24)}” baseline off the text baseline`, d); break; }
    });
  });

  // ---- E2. a pill never carries its meaning in colour alone -------------------------------------
  // The semantic set is four hues at one chroma, so the tightest pair (bad and caution, 40 degrees apart)
  // measures OKLab dE 5.6 in light and 6.9 in dark — under the >= 8 a chart mark would need. That is
  // legitimate here for exactly one reason: the pill is always read, never decoded. This asserts it.
  document.querySelectorAll('.pill').forEach(p => {
    if (!vis(p)) return;
    if (!(p.textContent || '').trim()) push('pill-colour-alone', p, 'pill has no text, so its tone is the only carrier of meaning', 99);
    else cov.pillsWithText++;
  });

  // ---- F. icons beside text --------------------------------------------------------------------------
  const ICON = 'svg.i, .pill .d, input[type=checkbox], input[type=radio]';
  const SKIP = '.tick, .ic, .stepno, .avatar, .empty, .p-nav, td.check, th.check, .legend, .btn.icon, .prog, .meter, .chart, .disc, .brand-bar';
  const adjacentText = ic => {
    let el = ic; const r = R(ic);
    for (let depth = 0; depth < 3 && el.parentElement; depth++) {
      const parent = el.parentElement; const sibs = [...parent.childNodes].filter(n => n !== el);
      const cands = [];
      for (const n of sibs) { if (n.nodeType === 3 && n.data.trim()) cands.push([n, null]); else if (n.nodeType === 1 && !n.matches('svg, .ico, input, .pill .d') && cs(n).position !== 'absolute') { const t = firstText(n); if (t) cands.push([t, n]); } }
      for (const [tn, holder] of cands) { const rs = lineRects(tn); if (!rs.length) continue; const first = rs[0]; const overlap = Math.min(first.bottom, r.bottom) - Math.max(first.top, r.top); const gap = Math.max(first.left - r.right, r.left - first.right); if (overlap > 2 && gap < 48 && gap > -4) { const blk = holder ? textRect(holder) : (() => { const all = lineRects(tn); return { top: Math.min(...all.map(x => x.top)), bottom: Math.max(...all.map(x => x.bottom)) }; })(); return { tn, first, block: { top: blk.top, height: blk.bottom - blk.top }, lines: rs.length }; } }
      el = parent; if (parent.matches('li, tr, .card, .notice, .field, form, .list, section, main')) break;
    }
    return null;
  };
  // a strut cell must hug its icon — a stretched .ico means the icon has drifted away from its text
  document.querySelectorAll('.ico').forEach(w => { if (!vis(w) || w.closest('.empty, .p-nav, .ic, .tick, .stepno')) return; const inner = w.firstElementChild; if (!inner || (w.parentElement && cs(w.parentElement).display.includes('grid'))) return; const ic = cs(inner); const d = R(w).width - (R(inner).width + parseFloat(ic.marginLeft) + parseFloat(ic.marginRight)); if (d > 4) push('icon-cell', w.parentElement || w, `.ico cell is ${d.toFixed(0)}px wider than its icon`, d); });
  document.querySelectorAll(ICON).forEach(ic => {
    if (!vis(ic) || ic.closest(SKIP)) return;
    const btn = ic.closest('.btn');
    if (btn && ic.matches('svg.i')) {
      const iw = parseFloat(cs(ic).width), ih = parseFloat(cs(ic).height); const want = ic.classList.contains('sm') ? 12 : 16; // the published sizes: 16, and 12 for a chevron or a small contained mark — computed size, not the animated bounding box
      if (Math.abs(ih - want) > T || Math.abs(iw - want) > T) push('icon-size', btn, `icon in a button is ${iw.toFixed(0)}×${ih.toFixed(0)}px, not ${want}px`, Math.abs(ih - want));
      if (cs(ic).color !== cs(btn).color) push('icon-colour', btn, `icon colour ${cs(ic).color} ≠ button text colour ${cs(btn).color}`, 1);
      const visibleText = [...btn.childNodes].some(n => n.nodeType === 3 ? n.data.trim() : n.nodeType === 1 && !n.matches('svg, .ico') && vis(n) && n.textContent.trim());
      if (!visibleText) return;   // icon-only control, or one whose label is hidden for a narrow frame and carried by aria-label: there is no text to sit on
      if (!adjacentText(ic)) { push('icon-xheight', btn, 'icon in a button is not beside its label', 99); return; }
    }
    const t = adjacentText(ic); if (!t) return;
    const b = baselineOf(t.tn); if (!b) return;
    cov.icons++;
    const r = R(ic); const icc = r.top + r.height / 2;
    const xc = b.baseline - b.m.xh / 2;
    const dx = icc - xc;
    const multiline = t.block.height > t.first.height * 1.6; if (multiline) cov.iconsMultiline++;
    const dBlock = multiline ? icc - (t.block.top + t.block.height / 2) : Infinity;
    if (Math.abs(dx) > 1 && Math.abs(dBlock) > 1) push('icon-xheight', ic.closest('a, button, label, li, .notice, .field, div, span') || ic, `icon centre ${dx > 0 ? 'below' : 'above'} the x-height centre of “${t.tn.data.trim().slice(0, 24)}”`, Math.abs(dx));
  });

  // ---- G. overflow -----------------------------------------------------------------------------------
  const W = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > W + 1) push('overflow', document.body, `document scrolls horizontally: ${document.documentElement.scrollWidth} > ${W}`, document.documentElement.scrollWidth - W);
  document.querySelectorAll('body *').forEach(el => {
    if (!vis(el) || el.closest('.sr-only, .dsx-skip, svg')) return;
    const r = R(el); const wrap = el.closest('.tbl-wrap, .kanban, .tabs, .subtabs, .phases, .ptabs, .dsx-nav ol');
    // (19 September, the grid) a desktop frame runs past the document's column and scrolls sideways in it: what is inside is
    // measured against the frame's own right edge, never excused
    const wide = el.closest('.dsx-wide'); const limit = wide ? R(wide.firstElementChild).right : W;
    // an element an ancestor clips (a banner's ellipsis) is cut, not overflowing
    const clipped = (() => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const o = cs(n).overflowX; if ((o === 'hidden' || o === 'clip') && r.right > R(n).right + 1) return true; } return false; })();
    if (r.right > limit + 1 && !wrap && !clipped) push('overflow', el, `extends past the ${wide ? 'frame' : 'viewport'} by ${(r.right - limit).toFixed(0)}px`, r.right - limit);
    const c = cs(el); const ox = c.overflowX;
    // a popup anchored inside an element overflows that element by design; the popup's own box is checked against the viewport above
    // amended 19 September 2026 (charts): a chart's tooltip is the same popup, drawn on the hovered mark, but a chart
    // must still be measured — so the tooltip is lifted out for the measurement and put back, rather than excusing the
    // whole chart the way a popup excuses its anchor.
    if ((ox === 'visible' || ox === 'clip') && el.clientWidth > 0 && !wrap && !el.matches('table, tr, tbody, thead, td, th, .tbl-wrap') && !el.querySelector('.popup, .menu, .inline-msg-pop, .tooltip:not(.chart .tooltip), .calendar')) {
      const tips = [...el.querySelectorAll('.chart .tooltip')].map(t => [t, t.style.display]);
      for (const [t] of tips) t.style.display = 'none';
      const sw = el.scrollWidth, cw = el.clientWidth;
      for (const [t, d] of tips) t.style.display = d;
      if (sw > cw + 1) push('overflow', el, `content ${sw}px wider than its ${cw}px box`, sw - cw);
    }
  });

  // ---- G2. identifiers never break across lines ---------------------------------------------------
  // A project, order, bill or lead code (SAN-01, PO-0019, RA-3, BILL-2026-014) is one word; a line break at its
  // hyphen leaves “KRA-” on one line and “01” on the next. Measured with a Range around every code in every
  // visible text node: more than one client rect (on different lines) is a split.
  {
    const CODE = /(?<![A-Za-z0-9/])((?:[A-Z]{2,5}-(?:[A-Z]{2,5}-)?\d{1,4}(?:-\d{1,4})*)|(?:[A-Z]{2,5}(?:\/(?:[A-Z]{2,5}|\d{2,4}(?:-\d{2})?))*\/\d{2,4})|(?:\d{4}-\d{2}-\d{2}))(?![A-Za-z0-9/])/g;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let tn; while ((tn = walker.nextNode())) {
      const p = tn.parentElement; if (!p || !vis(p) || p.closest('.sr-only, .dsx-skip, script, style, code, pre')) continue;
      let m; CODE.lastIndex = 0;
      while ((m = CODE.exec(tn.data))) {
        cov.codes++;
        const rg = document.createRange(); rg.setStart(tn, m.index); rg.setEnd(tn, m.index + m[0].length);
        const rects = [...rg.getClientRects()].filter(r => r.width > 0);
        if (rects.length > 1 && Math.abs(rects[0].top - rects[rects.length - 1].top) > T) push('code-split', p, `“${m[0]}” breaks across lines`, Math.abs(rects[0].top - rects[rects.length - 1].top));
      }
    }
  }

  // ---- G3. one hero per screen -------------------------------------------------------------------------
  // A product screen is a frame with an .app (web) or a .p-body (portal). It carries exactly one [data-hero]. The hero
  // is a figure at a size nothing else approaches (its largest font ≥ 1.6× the largest text outside it) or the list
  // itself (a card whose area is ≥ 45% of the page's). Measured, not asserted.
  {
    const screens = [...document.querySelectorAll('.dsx-frame')].filter(f => vis(f) && f.querySelector(':scope > .app, :scope > .p-body'));
    cov.screens = 0;
    for (const f of screens) {
      if (f.querySelector(':scope > .drawer, :scope > .psheet')) continue; // a drawer or sheet state re-renders a screen already judged
      cov.screens++;
      const heroes = [...f.querySelectorAll('[data-hero]')].filter(vis);
      if (heroes.length !== 1) { push('hero', f, `${heroes.length} hero elements on this screen (want exactly 1)`, 99); continue; }
      const h = heroes[0]; const page = f.querySelector('.page, .p-body'); const pr = R(page);
      const fontOf = el => parseFloat(cs(el).fontSize);
      const maxIn = Math.max(...[h, ...h.querySelectorAll('*')].filter(vis).map(fontOf));
      const maxOut = Math.max(...[...page.querySelectorAll('*')].filter(e => vis(e) && !h.contains(e) && !e.closest('.side, .topbar')).map(fontOf));
      const area = R(h).width * R(h).height / (pr.width * pr.height);
      const cards = [...page.querySelectorAll('.card, .hero, .gate, .empty')].filter(vis).map(c => R(c).width * R(c).height);
      const largest = Math.max(...cards, 0); const heroArea = R(h).width * R(h).height;
      const figureOk = maxIn >= 1.6 * maxOut;                      // a figure at a size nothing else approaches
      const cardOk = area >= 0.25 && heroArea >= largest - 1;      // the largest card on the page, at least a quarter of it
      const lgIn = h.querySelectorAll('.btn.primary.lg').length, lgOut = [...page.querySelectorAll('.btn.primary.lg')].filter(b => !h.contains(b)).length;
      const actionOk = lgIn >= 1 && lgOut === 0;                   // the one large primary action on the screen lives in it
      cov.heroBy = cov.heroBy || ''; const clause = figureOk ? 'figure' : cardOk ? 'card' : actionOk ? 'action' : h.querySelector('.setup') ? 'setup' : 'none'; cov.heroBy += (cov.heroBy ? ',' : '') + clause;
      if (!(figureOk || cardOk || actionOk || h.querySelector('.setup'))) push('hero', f, `hero is not dominant: largest text ${maxIn.toFixed(0)}px vs ${maxOut.toFixed(0)}px outside (want ≥1.6×), area ${(area * 100).toFixed(0)}% of the page and ${heroArea >= largest - 1 ? '' : 'not '}the largest card (want largest and ≥25%), large primary actions in/out ${lgIn}/${lgOut}`, Math.max(1.6 * maxOut - maxIn, (0.25 - area) * 100, 1));
    }
  }
  // ---- G4. every empty state on the published anatomy ------------------------------------------------
  // Image, heading, description, the actions (secondary then primary), a tertiary link — as the published component
  // orders them. The owner's anatomy of 17 September 2026: two buttons are allowed, one sentence or two, and the
  // description is required because the image is decorative and says nothing on its own.
  {
    cov.empties = 0;
    document.querySelectorAll('.empty').forEach(e => {
      if (!vis(e)) return; cov.empties++;
      const kids = [...e.children].filter(vis).map(k => k.matches('svg.illo') ? 'image' : k.matches('h1,h2,h3,h4,h5,h6,.es-h') ? 'heading' : k.matches('p.es-t') ? 'tertiary' : k.matches('p') ? 'description' : k.matches('.actions') ? 'actions' : k.tagName.toLowerCase());
      const want = ['image', 'heading', 'description', 'actions', 'tertiary'];
      const order = kids.filter(k => want.includes(k));
      if (order.join() !== want.filter(w => order.includes(w)).join()) push('empty-state', e, `parts out of the published order: ${kids.join(' › ')}`, 99);
      const illo = e.querySelector(':scope > svg.illo'); const heading = e.querySelector(':scope > .es-h, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6'); const p = e.querySelectorAll(':scope > p:not(.es-t)'); const acts = e.querySelectorAll('.actions .btn'); const links = e.querySelectorAll(':scope > p.es-t a');
      if (!illo) push('empty-state', e, 'no image', 99);
      else if (R(illo).height < 60) push('empty-state', e, `image ${R(illo).height.toFixed(0)}px tall`, 60 - R(illo).height);
      if (!heading || !heading.textContent.trim()) push('empty-state', e, 'no heading — the image is decorative and cannot carry the meaning', 99);
      if (p.length !== 1 || !p[0].textContent.trim()) push('empty-state', e, `${p.length} descriptions (want one)`, 99);
      else { const sentences = (p[0].textContent.match(/[.!?](\s|$)/g) || []).length; if (sentences > 2) push('empty-state', e, `${sentences} sentences (want one, two at most)`, sentences); }
      if (acts.length > 2) push('empty-state', e, `${acts.length} buttons (want at most two: the secondary, then the primary)`, acts.length);
      if (acts.length === 2 && !acts[1].classList.contains('primary')) push('empty-state', e, 'two buttons but the primary is not last', 99);
      if (links.length > 1) push('empty-state', e, `${links.length} tertiary links (want at most one)`, links.length);
      const tw = R(e).width; const max = e.classList.contains('narrow') ? 304 : 464;
      if (tw > max + 2 * 16 + T) push('empty-state', e, `text column ${tw.toFixed(0)}px wide (want ${max}px plus its 16px sides)`, tw - max - 32);
    });
  }

  // ---- G4b. the drawing system ------------------------------------------------------------------------------
  // Stated on 00-foundations, enforced here on each <symbol>: the 160-unit canvas, at least one block, one or more
  // line paths over them, two or three sparkles, and no block drawn after the line (the line sits over the blocks).
  // Every reference renders square from the sprite, never pasted inline.
  {
    const syms = [...document.querySelectorAll('symbol.illo-art')];
    cov.illos = syms.length;
    for (const sym of syms) {
      if (sym.getAttribute('viewBox') !== '0 0 160 160') push('illo', sym, `viewBox ${sym.getAttribute('viewBox')} (want 0 0 160 160)`, 99);
      const kids = [...sym.querySelectorAll(':scope > *, :scope > g > *')];
      const blocks = kids.filter(k => k.matches('.fa, .fb, .fc, .fn, .a')), lines = kids.filter(k => k.matches('.l')), sparks = kids.filter(k => k.matches('.sp'));
      if (!blocks.length) push('illo', sym, 'no colour block', 99);
      if (!lines.length) push('illo', sym, 'no line over the blocks', 99);
      if (sparks.length < 2 || sparks.length > 3) push('illo', sym, `${sparks.length} sparkles (want two or three)`, 99);
      const top = [...sym.children];
      const firstLine = top.findIndex(k => k.matches('.l') || (k.tagName === 'g' && k.querySelector('.l')));
      const lastBlock = top.map((k, i) => (k.matches('.fa, .fb, .fc, .fn, .a') || (k.tagName === 'g' && k.querySelector('.fa, .fb, .fc, .fn, .a'))) ? i : -1).filter(i => i >= 0).pop();
      if (firstLine >= 0 && lastBlock > firstLine && !top[lastBlock].matches('g')) push('illo', sym, 'a block is drawn over the line — the line goes over the blocks', 99);
    }
    const refs = [...document.querySelectorAll('svg.illo')].filter(vis);
    cov.illoRefs = refs.length;
    for (const svg of refs) {
      const u = svg.querySelector('use'); const href = u && u.getAttribute('href');
      if (!href || !document.querySelector(`symbol${href}`)) push('illo', svg, `references ${href || 'nothing'}, which is not defined in the sprite`, 99);
      if (svg.querySelector('path, rect, circle, ellipse')) push('illo', svg, 'the drawing is pasted inline instead of referenced', 99);
      if (svg.getAttribute('aria-hidden') !== 'true') push('illo', svg, 'not aria-hidden — the drawing is decorative and the text beside it carries the meaning', 99);
      const r = R(svg); if (Math.abs(r.width - r.height) > T) push('illo', svg, `rendered ${r.width.toFixed(0)}×${r.height.toFixed(0)} — not square`, Math.abs(r.width - r.height));
    }
  }

  // ---- G4c. three styles, never a fourth (19 September 2026, the family) ---------------------------------------
  // Monoline (svg.i) in navigation and controls; duotone (svg.duo) on a stat's disc and a hub card's; the spot
  // illustration (svg.illo) in an empty state. Every other svg on a page is a chart, a spinner or the sprite.
  {
    for (const svg of document.querySelectorAll('svg')) {
      if (svg.closest('.sr-only, .dsx-skip')) continue;
      cov.svgs = (cov.svgs || 0) + 1;
      if (svg.getAttribute('width') === '0' || svg.matches('.chart svg, .spark, .spinner svg')) continue;
      if (svg.matches('.i')) { if (svg.closest('.disc, .hub-card')) push('style', svg, 'a monoline icon on a disc or a hub card — those wear the duotone family', 99); }
      else if (svg.matches('.duo')) { if (!svg.closest('.disc')) push('style', svg, 'a duotone icon off a disc — the family lives on a stat’s disc and a hub card’s', 99); }
      else if (svg.matches('.illo')) { if (!svg.closest('.empty, .gate, .spec-illos')) push('style', svg, 'a drawing outside an empty state', 99); }
      else push('style', svg, 'a fourth style — an svg that is none of monoline, duotone, illustration, chart, spinner or the sprite', 99);
    }
  }

  // ---- G8. the dashboard grid (19 September 2026, the grid) -------------------------------------------------
  // Today and Overview sit on a twelve-column grid with a 24px gutter. Every child sits on a track — its left edge and
  // width are a whole number of columns — cards in a row share the row's height, no card sits alone in a row, and the
  // last row is full. The card's header is one line, 48px, its title never wrapped and at most 24 characters; the
  // duotone disc sits first in the header of a tile or a money card and nowhere else in a card; a hover specimen
  // (a tooltip drawn on a mark) sits inside its plot, never over the header row.
  {
    for (const grid of document.querySelectorAll('.grid')) {
      if (!vis(grid)) continue; cov.grids = (cov.grids || 0) + 1;
      const gr = R(grid); const gap = parseFloat(cs(grid).columnGap) || 0; const colW = (gr.width - 11 * gap) / 12;
      const kids = [...grid.children].filter(vis);
      const rows = [];
      for (const k of kids) {
        const r = R(k); const start = Math.round((r.left - gr.left) / (colW + gap)); const span = Math.round((r.width + gap) / (colW + gap));
        const ex = gr.left + start * (colW + gap), ew = span * colW + (span - 1) * gap;
        if (Math.abs(r.left - ex) > 1 || Math.abs(r.width - ew) > 1) push('grid', k, `not on a track: left ${(r.left - gr.left).toFixed(0)} width ${r.width.toFixed(0)} (nearest ${start + 1}/${span}: ${(ex - gr.left).toFixed(0)}, ${ew.toFixed(0)})`, Math.max(Math.abs(r.left - ex), Math.abs(r.width - ew)));
        const row = rows.find(x => Math.abs(x.top - r.top) <= T); if (row) row.cells.push({ k, span, h: r.height }); else rows.push({ top: r.top, cells: [{ k, span, h: r.height }] });
      }
      rows.forEach((row, i) => {
        const total = row.cells.reduce((a, c) => a + c.span, 0);
        if (total !== 12) push('grid', grid, `row ${i + 1} spans ${total} of 12 columns${row.cells.length === 1 ? ' — a card sits alone' : ''}`, Math.abs(12 - total));
        const dh = spread(row.cells.map(c => c.h)); if (dh > 1) push('grid', grid, `row ${i + 1}: cards differ in height ${row.cells.map(c => c.h.toFixed(0)).join(' / ')}`, dh);
      });
      for (const card of kids.filter(k => k.matches('.card'))) {
        const h = card.querySelector(':scope > .card-h'); if (!h) { push('card-head', card, 'a dashboard card without a header', 99); continue; }
        const hr = R(h); if (Math.abs(hr.height - 48) > 1) push('card-head', h, `header ${hr.height.toFixed(0)}px tall (want 48, one line)`, Math.abs(hr.height - 48));
        const ct = h.querySelector(':scope > .ct'); if (ct) {
          const words = [...ct.childNodes].filter(n => n.nodeType === 3).map(n => n.data).join('').trim();
          if (words.length > 24) push('card-head', ct, `title “${words}” is ${words.length} characters (at most 24)`, words.length - 24);
          const lines = lineRects(firstText(ct) || ct); if (R(ct).height > 24.5) push('card-head', ct, `title wraps (${R(ct).height.toFixed(0)}px tall)`, R(ct).height - 24);
        }
        for (const d of card.querySelectorAll('.disc')) {
          if (d.parentElement !== h || d !== h.firstElementChild) push('disc', d, 'a disc anywhere but first in the card’s header', 99);
          else if (!card.matches('.tile, .owe')) push('disc', d, 'a disc on a card that is not a tile or a money card', 99);
        }
        for (const tip of card.querySelectorAll('.chart .tooltip')) {
          const plot = tip.closest('.plot') || tip.closest('.chart'); const tr = R(tip), pr = R(plot);
          if (tr.top < pr.top - 1 || tr.bottom > pr.bottom + 1 || tr.left < pr.left - 1 || tr.right > pr.right + 1) push('hover', tip, `the hover specimen leaves its plot (${(tr.top - pr.top).toFixed(0)}, ${(pr.bottom - tr.bottom).toFixed(0)}, ${(tr.left - pr.left).toFixed(0)}, ${(pr.right - tr.right).toFixed(0)})`, 99);
          if (tr.top < R(h).bottom) push('hover', tip, 'the hover specimen sits over the header row', 99);
        }
      }
    }
  }

  // ---- G5. the document's own nav ---------------------------------------------------------------------
  // The samples file is part of the file it documents. Its section list: every label on one line, all labels
  // on one left edge, all numbers on one right edge, one item height. In the collapsed strip: one row.
  {
    const ol = document.querySelector('.dsx-nav ol');
    const links = ol ? [...ol.querySelectorAll('a')].filter(vis) : [];
    cov.navItems = links.length;
    if (links.length >= 2) {
      const strip = cs(ol).display.includes('flex');
      const heights = links.map(a => R(a).height); const dh = spread(heights);
      if (dh > T) push('doc-nav', ol, `nav item heights differ ${heights.map(h => h.toFixed(0)).join(' / ')}`, dh);
      if (strip) {
        const dt = spread(links.map(a => R(a).top));
        if (dt > T) push('doc-nav', ol, 'the collapsed nav strip is not one row', dt);
      } else {
        links.forEach(a => { const t = a.querySelector('.t'); const tx = t && firstText(t); const n = tx ? lineRects(tx).length : 0; if (n > 1) push('doc-nav', t, `section label wraps onto ${n} lines`, n); });
        const dl = spread(links.map(a => R(a.querySelector('.t')).left));
        if (dl > T) push('doc-nav', ol, `section labels do not share one left edge (spread ${dl.toFixed(1)}px)`, dl);
        const nums = links.map(a => a.querySelector('.n')).filter(vis);
        if (nums.length === links.length) { const dr = spread(nums.map(n => R(n).right)); if (dr > T) push('doc-nav', ol, `section numbers do not share one right edge (spread ${dr.toFixed(1)}px)`, dr); }
      }
    }
  }

  // ---- G8. a sparkline that implies a condition must draw its line --------------------------------
  for (const sp of document.querySelectorAll('.spark')) {
    if (!vis(sp) || sp.querySelector('.thr')) continue;
    const host = sp.closest('.stat, .hero'); if (!host) continue;
    const d = host.querySelector('.d'); if (!d) continue;
    const tone = [...d.classList].find(c => /^(watch|warn|bad|down)$/.test(c));
    if (tone) push('spark-condition', sp, `a sparkline with no threshold sits on a “${tone}” judgement — a trend cannot carry a condition, so draw the line or drop the series`, 99);
    cov.sparks = (cov.sparks || 0) + 1;
  }

  // ---- G6/G7/E3. the chart and caution rules -------------------------------------------------------
  {
    const V = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const norm = (v) => { const mm = /^#?([0-9a-f]{6})$/i.exec(v.trim()); if (mm) { const n = parseInt(mm[1], 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; } return v.trim().toLowerCase(); };
    const CHART = { 's1': norm(V('--series-1')), 's2': norm(V('--series-2')), 's3': norm(V('--series-3')),
                    'point-bad': norm(V('--chart-point-bad')), 'threshold': norm(V('--chart-threshold')) };
    // the series colours: the categorical eight. A threshold rule, a limit marker and the neutral of an emphasis chart
    // are annotations on a series, not series — the x label or the stat beside the chart names them.
    const SERIES = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map(i => [`s${i}`, norm(V(`--series-${i}`))]));
    const STATUS = { ok: norm(V('--ok')), warn: norm(V('--warn')), waiting: norm(V('--waiting')), bad: norm(V('--bad')) };
    // the status chart series has its own tokens; where a published chart colour happens to share a value with a status text colour (dark success does), the chart token is what is painted
    const CHART_OWN = new Set(['--chart-brand', '--chart-brand-hover', '--chart-done', '--chart-caution', '--chart-bad', '--chart-paused', '--chart-gap'].map(n => norm(V(n))));
    const WARN = STATUS.warn, WARN_SOFT = norm(V('--warn-soft'));
    const PAINT = ['color', 'background-color', 'fill', 'stroke', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color'];

    // G7 — a chart may not paint a status colour. A chart line has no text beside it, so its colour is
    // the only channel; a status colour is chosen to be redundant reinforcement and is the wrong tool.
    const CHARTS = [...document.querySelectorAll('.chart, .spark, .meter, .meter-list, .hero .hbar')];
    for (const ch of CHARTS) {
      if (!vis(ch)) continue;
      for (const el of [ch, ...ch.querySelectorAll('*')]) {
        cov.chartParts++;
        const c = getComputedStyle(el);
        for (const prop of PAINT) {
          const val = norm(c.getPropertyValue(prop));
          for (const [name, v] of Object.entries(STATUS))
            if (val === v && !CHART_OWN.has(val)) push('chart-status-token', el, `a chart paints --${name} on ${prop} — charts have their own token set`, 99);
        }
      }
    }

    // G6 — a chart painting more than one SERIES colour must name them in a legend, because at this point
    // colour is the only channel it has. Amended 19 September 2026 (charts): it counted every chart colour, so a
    // sparkline's dashed threshold, a meter's limit marker and the neutral of a one-series emphasis chart each read as
    // a second series wanting a legend. The grammar says a legend for two or more series and none for one; the gate
    // now counts the categorical series colours painted, and a nested chart (a hero's meter inside a card's chart)
    // is measured once, as itself.
    for (const ch of document.querySelectorAll('.chart')) {
      if (!vis(ch)) continue;
      const used = new Set();
      for (const el of ch.querySelectorAll('*')) { if (el.closest('.chart') !== ch) continue; const c = getComputedStyle(el);
        for (const prop of ['background-color', 'fill', 'stroke']) { const v = norm(c.getPropertyValue(prop));
          for (const [k, cv] of Object.entries(SERIES)) if (v === cv) used.add(k); } }
      if (used.size < 2) continue;
      cov.chartsWithLegend++;
      const legend = ch.querySelector('.legend');
      const words = legend ? [...legend.querySelectorAll(legend.matches('ul, ol') ? ':scope > li' : 'span')].map(e => e.textContent.trim()).filter(Boolean) : [];
      if (words.length < used.size) push('chart-legend', ch, `a chart paints ${used.size} series colours but its legend names ${words.length}`, 99);
    }

    // E3 — amended 19 September 2026 (the owner: no highlighter). The caution FILL is for a lozenge and the
    // published section message only: a figure, a label or a sentence never sits on a coloured fill. Caution as
    // TEXT is allowed — an amber small-capitals label over an ink figure, a warning as amber text with an icon —
    // and the contrast gate holds it to 4.5:1. Amber is still never a stroke or a border. This walks every
    // element and proves it rather than trusting the stylesheet.
    const bgOf = (el) => { let n = el; while (n && n !== document.documentElement) {
      const b = norm(getComputedStyle(n).backgroundColor);
      if (b && b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent') return b; n = n.parentElement; } return ''; };
    for (const el of document.querySelectorAll('*')) {
      const c = getComputedStyle(el);
      for (const prop of ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color', 'stroke']) {
        if (norm(c.getPropertyValue(prop)) !== WARN) continue;
        if (prop === 'stroke') { if (parseFloat(c.strokeWidth) > 0) push('caution-stroke', el, 'caution is painted on a stroke — amber is an area, never a stroke', 99); continue; }
        const style = c.getPropertyValue(prop.replace('-color', '-style'));
        const w = parseFloat(c.getPropertyValue(prop.replace('-color', '-width'))) || 0;
        if (style && style !== 'none' && style !== 'hidden' && w > 0)
          push('caution-stroke', el, `caution is painted on ${prop} — amber is an area, never a border`, 99);
      }
      if (norm(c.backgroundColor) === WARN_SOFT && (el.textContent || '').trim()) {   // an area without text — a disc, a bar, a band — is not a highlighter
        if (el.matches('.pill, .notice, .inline-msg, .banner, .flag, .is-specimen, .sw')) cov.cautionAreas++;
        else push('caution-highlighter', el, `a highlighter: “${(el.textContent || '').trim().slice(0, 28)}” sits on the caution fill, which is for a lozenge or a section message`, 99);
      }
      if (norm(c.color) === WARN && !(el.parentElement && norm(getComputedStyle(el.parentElement).color) === WARN)) cov.cautionText = (cov.cautionText || 0) + 1;
    }
  }

  // ---- H2. marigold containment ------------------------------------------------------------------
  // Marigold is a brand colour, never a status and no longer UI chrome. It survives in one place: the
  // accent inside the drawing sprite. Walk every painted property of every element and prove it. A grep
  // could not do this — it would miss an inherited colour and a token aliased through another token.
  {
    const mg = getComputedStyle(document.documentElement).getPropertyValue('--illo-accent').trim().toLowerCase();
    const norm = (v) => { const m = /^#?([0-9a-f]{6})$/i.exec(v.trim()); if (m) { const n = parseInt(m[1], 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; } return v.trim().toLowerCase(); };
    const target = norm(mg);
    const PROPS = ['color', 'background-color', 'fill', 'stroke', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color', 'caret-color'];
    document.querySelectorAll('*').forEach(el => {
      const inArt = el.closest('symbol.illo-art') || (el.tagName.toLowerCase() === 'symbol' && el.classList.contains('illo-art'))
        || el.matches('.dsx-chip, .dsx-swatch, .dsx-swatches *, .sw, .sw *');   // a swatch exists to SHOW the value
      const c = getComputedStyle(el);
      for (const prop of PROPS) {
        if (norm(c.getPropertyValue(prop)) !== target) continue;
        cov.marigoldUses++;
        if (!inArt) push('marigold-escape', el, `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} paints ${prop} marigold outside the drawing sprite`, 99);
      }
    });
  }

  // ---- H. component identity -------------------------------------------------------------------------
  const COMP = { Stat: '.stat', Hero: '.hero', Popover: '.popover', Card: '.card', Drawer: '.drawer', 'Money cell': 'table.tbl td.num', Pill: '.pill', Button: '.btn', Notice: '.notice', Input: 'input:not([type=checkbox]):not([type=radio]), select, textarea', 'Kanban card': '.kcard', Tick: '.tick', 'Card list item': '.card-list > li', 'Filter chip': '.chip', 'Pager control': '.pg', 'Pager': '.pager', 'Bulk bar': '.bulkbar', 'Chips row': '.chips', 'Value line': '.vline', 'Sort header': '.tbl th .sort' };
  const VARIANT = ['primary', 'danger', 'ghost', 'icon', 'lg', 'sm', 'hero', 'mini', 'tight', 'watch', 'lift', 'warn', 'owe', 'cash'];
  Object.entries(COMP).forEach(([name, sel]) => {
    const inst = [...document.querySelectorAll(sel)].filter(vis); cov.components += inst.length;
    const byKey = new Map(); const radii = new Map();
    inst.forEach(el => {
      const c = cs(el); const frame = el.closest('.dsx-frame'); const fw = frame ? R(frame).width : 0; const band = !frame ? '' : fw < 640 ? ' · narrow' : fw < 1000 ? ' · rail' : ''; const kind = (frame ? [...frame.classList].find(k => ['phone', 'tablet', 'web'].includes(k)) || 'frame' : 'doc') + band; // a frame's container state is part of the key
      const variant = ([...el.classList].filter(k => VARIANT.includes(k)).sort().join('.') || 'base') + (name === 'Input' ? ' ' + el.tagName.toLowerCase() + (el.type && el.tagName === 'INPUT' ? '[' + el.type + ']' : '') + (el.closest('.money-in') ? ' money' : el.closest('.ie-field') ? ' quantity' : el.closest('.topbar .search') ? ' search scoped' : el.closest('.search') ? ' search' : el.closest('.select-wrap') ? ' select' : '') : '');   // a composed field (a prefix, a unit, a search icon, a chevron) pads its input for the mark it carries; the top bar's search carries a scope chevron too
      // a money cell at the table's edge is flush with it, as published, so its edge is part of its key
      const edge = name === 'Money cell' ? `${el.matches(':first-of-type') ? ' · first' : ''}${el.matches(':last-child') ? ' · last' : ''}` : '';
      const key = `${variant} · ${kind}${el.closest('.drawer') && name !== 'Drawer' ? ' · in drawer' : ''}${edge}`;
      const props = { padding: [c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft].join(' '), radius: [c.borderTopLeftRadius, c.borderTopRightRadius, c.borderBottomRightRadius, c.borderBottomLeftRadius].join(' '), border: c.borderTopWidth };
      if (!byKey.has(key)) byKey.set(key, { el, props, n: 0 }); byKey.get(key).n++;
      const ref = byKey.get(key).props;
      (name === 'Money cell' ? ['padding', 'radius'] : ['padding', 'radius', 'border']).forEach(k => { if (props[k] !== ref[k]) push('component', el, `${name} (${key}) ${k} ${props[k]} ≠ ${ref[k]} on “${desc(byKey.get(key).el).slice(0, 30)}”`, 1); });
      // one radius per variant: the published compact button takes the small corner, the regular one the medium
      const rk = variant.split(' ')[0]; if (!radii.has(rk)) radii.set(rk, new Map()); radii.get(rk).set(props.radius, (radii.get(rk).get(props.radius) || 0) + 1);
    });
    for (const [rk, rs] of radii) if (rs.size > 1) push('component', inst[0], `${name} (${rk}): ${rs.size} different radii across ${[...rs.values()].reduce((a, b) => a + b, 0)} instances — ${[...rs].map(([r, n]) => `${r} ×${n}`).join(', ')}`, 1);
  });

  return { faults, calibration, cov };
};

const browser = await chromium.launch({ headless: true });
// One file, or every .html in a directory. The set is the unit now: a fault in any file fails the run.
const TARGETS = statSync(file).isDirectory()
  ? readdirSync(file).filter(f => f.endsWith('.html')).sort().map(f => join(file, f))
  : [file];
const perFile = new Map();
const all = new Map(); let calib = null; let cov = null; const fontsSeen = {};
for (const target of TARGETS) for (const net of NETS) for (const width of WIDTHS) for (const theme of THEMES) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, offline: net === 'offline', colorScheme: theme, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('file:///' + resolve(target).replace(/\\/g, '/'), { waitUntil: 'load' });
  await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
  if (net === 'online') await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(120);
  fontsSeen[net] = await page.evaluate(() => ({ display: document.fonts.check('600 30px Newsreader'), text: document.fonts.check('15px Inter') }));
  const { faults, calibration, cov: c } = await page.evaluate(inPage, { STACK_SEL: STACK_ALLOW.map(s => s[0]) });
  calib = calib || calibration; cov = cov || c;
  const base = target.split(/[\\/]/).pop();
  for (const f of faults) { const k = `${base}|${f.check}|${f.section}|${f.element}|${f.what}`; const e = all.get(k) || { ...f, file: base, at: [] }; e.at.push(`${width}/${theme}/${net}`); e.px = Math.max(e.px, f.px); all.set(k, e); }
  const cur = perFile.get(base) || { faults: new Set(), cov: null, renders: 0 };
  for (const f of faults) cur.faults.add(`${f.check}|${f.section}|${f.element}|${f.what}`);
  cur.cov = cur.cov || c; cur.renders++; perFile.set(base, cur);
  await ctx.close();
}
await browser.close();
const list = [...all.values()].sort((a, b) => b.px - a.px);
const byCheck = {}; list.forEach(f => byCheck[f.check] = (byCheck[f.check] || 0) + 1);
if (perFile.size > 1) {
  console.log('PER FILE');
  for (const [f, v] of perFile) console.log(`  ${v.faults.size ? 'FAIL' : 'ok  '} ${f.padEnd(24)} ${String(v.faults.size).padStart(3)} faults · ${v.renders} renders · ${v.cov.components} components · ${v.cov.screens} screens · ${v.cov.pillsWithText} pills · ${v.cov.icons} icons`);
  console.log('');
}
console.log(`ALIGN GATE  ${file}\ncalibration ${JSON.stringify(calib)}\nfonts: ${JSON.stringify(fontsSeen)}\nfaults: ${list.length} distinct (${[...all.values()].reduce((n, f) => n + f.at.length, 0)} occurrences over ${WIDTHS.length}×${THEMES.length}×${NETS.length} renders)`);
console.log(`coverage at ${WIDTHS[0]}/${THEMES[0]}: ` + Object.entries(cov).filter(([k]) => k !== 'heroBy').map(([k, v]) => `${k} ${v}`).join(' · '));
if (cov.heroBy) { const tally = {}; for (const c of cov.heroBy.split(',')) tally[c] = (tally[c] || 0) + 1; console.log('hero clause satisfied (first of figure → card → action → setup): ' + Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(' · ')); }
console.log('by check: ' + Object.entries(byCheck).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
list.slice(0, TOP).forEach((f, i) => console.log(`${String(i + 1).padStart(2)}. [${f.check}] ${f.file ? f.file + ' · ' : ''}${f.section} · ${f.element} · ${f.at.join(' ')} · ${f.what} · off by ${f.px}px`));
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ file, calibration: calib, stackAllow: STACK_ALLOW, faults: list }, null, 1));
console.log(list.length === 0 ? 'ALIGN GATE: PASS' : `ALIGN GATE: FAIL (${list.length})`);
process.exit(list.length === 0 ? 0 : 1);

// pages/foundations.mjs — section 0, Foundations, rewritten for the rebuilt token set (16 September 2026).
//
// Every table on this page is generated from tokens.mjs, adjust.mjs or a measurement file written by a gate —
// never typed beside them. A number printed here that disagrees with the stylesheet is a build defect.
import * as L from '../shell.mjs';
import * as T from '../tokens.mjs';
import { dichromat } from '../tokens-candidates.mjs';
import { ADJUST } from '../adjust.mjs';
import { oweCard, moneyIn, moneyOut, moneyOverdue, warnChip, newMenu } from '../cards.mjs';
import { readFileSync, existsSync } from 'node:fs';
const { fmt, money, td, pill, icon, esc, V2, sample, note, stat, delta, moneyField, projectOf } = L;
const NONTEXT = JSON.parse(readFileSync(new URL('../non-text.json', import.meta.url), 'utf8'));
const INK = existsSync(new URL('../ink.json', import.meta.url)) ? JSON.parse(readFileSync(new URL('../ink.json', import.meta.url), 'utf8')) : null;

// Foundations specimens are components and scales, not screens, so none of them carries a value line.

const V = T.verify();
const kest = projectOf('SAN-01');
const r2 = (x) => x.toFixed(2);
const sw = (v, alpha = false) => alpha ? `<span class="sw alpha" aria-hidden="true"><i style="background:var(${v})"></i></span>` : `<span class="sw" style="background:var(${v})" aria-hidden="true"></span>`;
const swHex = (h) => `<span class="sw is-specimen" style="background:${h}" aria-hidden="true"></span>`;
const code = (t) => `<code>${esc(t)}</code>`;
const row = (mode, label) => V.rows.find(r => r.mode === mode && r.kind === 'contrast' && r.label === label);
const both = (label) => [row('light', label), row('dark', label)];
const rawOf = (name, mode) => { const a = T.adjusted(name, mode); return a ? a.to : T.SEM[name][mode]; };
const cell = (name, mode) => { const raw = rawOf(name, mode); if (!raw) return '<td class="muted">—</td>';
  const prim = T.PRIM[raw] ? T.primVar(raw) : null; const a = T.adjusted(name, mode);
  return `<td>${prim ? sw(prim, raw.endsWith('A')) : ''}${esc(raw)}${a ? ` <span class="dsx-tag">adjusted</span>` : ''}</td>`; };

function sources() {
  const rows = T.SOURCES.map(([title, url, what]) => `<tr><td><b>${esc(title)}</b><small>${esc(url)}</small></td><td>${esc(what)}</td></tr>`).join('');
  return `<div class="tbl-wrap"><table class="dsx-t full"><thead><tr><th>Source · read ${esc(T.READ_ON)}, the packages and the pages below the rule on ${esc(T.READ_AGAIN)}</th><th>What was taken from it</th></tr></thead><tbody>${rows}</tbody></table></div>
${note(`<p>Nothing here is typed from memory. Every primitive was parsed out of the published palette page and every semantic value out of the published token list, then cross-checked against the published package stylesheet for the same token names: <strong>904 values, 0 mismatches</strong>. The documentation says, and this page repeats, that:</p><ul>${T.CAVEATS.map(c => `<li>${esc(c)}</li>`).join('')}</ul><p>Adopted: the colour values, the token structure and names, the space, radius, border, motion and type scales — and since 17 September the anatomy, sizes, appearances and states of every component, read from the published packages. Not adopted, and not negotiable: the typeface, the logo, the product names, the icon set and the illustrations. The product never names the system it borrows from.</p>`, 'Provenance')}`;
}

function layers() {
  return `<div class="dsx-targets"><div><b>${V.primitives}</b><span><strong>Primitives</strong> — the palette as published: eleven ramps, each step a raw value and nothing else. ${code('--blue-700')}, ${code('--neutral-300a')}, ${code('--dark-neutral-minus-100')}. Nothing in a component may reference one.</span></div>
<div><b>${V.semantic}</b><span><strong>Semantic</strong> — the system’s own names, one value per theme. ${code('color.text.subtle')} is ${code('--color-text-subtle')}; ${code('elevation.surface.raised')}, ${code('--space-150')}, ${code('--radius-large')}, ${code('--font-size-heading-large')}. Dark mode redefines only these.</span></div>
<div><b>${V.component}</b><span><strong>Component</strong> — this product’s vocabulary, each a pointer into the semantic layer: ${code('--ink')}, ${code('--panel')}, ${code('--accent')}, the six states, the chart set, the control heights. The stylesheet speaks only this layer and the scales.</span></div></div>
${note(`<p>The component names are the ones the shipped stylesheet already uses, which is what keeps the product’s repaint to a change of <em>values</em> rather than a rename across four apps. <code>TOKEN-DIFF.md</code> counts it. The component layer is where our gates act: when a published value failed a gate, the fix is recorded against the semantic token it replaced (below), so the semantic layer still means what the system means by it, one step moved.</p>`)}`;
}

function ramps() {
  const blocks = T.RAMPS.map(([fam, names]) => {
    const solid = names.filter(n => !n.endsWith('A')), alpha = names.filter(n => n.endsWith('A'));
    const chip = (n) => `<li>${sw(T.primVar(n), n.endsWith('A'))}<span>${esc(n.replace(/^[A-Za-z]+/, ''))}<small>${esc(T.PRIM[n])}</small></span></li>`;
    return `<div class="dsx-ramp"><h4 class="lbl">${esc(fam.replace(/([a-z])([A-Z])/g, '$1 $2'))} <small>${names.length} steps</small></h4><ol>${solid.map(chip).join('')}</ol>${alpha.length ? `<ol class="alpha">${alpha.map(chip).join('')}</ol>` : ''}</div>`;
  }).join('');
  return `${blocks}
${note('<p>The neutral ramps carry alpha steps as well as solid ones; an alpha step is drawn over a checked ground so its transparency is visible. Two neutral ramps are published, one for each theme, because a dark surface is not a light one inverted: the dark ramp runs below zero for the page behind the page.</p>')}`;
}

function semantic() {
  const GROUPS = [['Text and links', /^color\.(text|link)/], ['Icons', /^color\.icon/], ['Borders', /^color\.border/], ['Backgrounds', /^color\.background/], ['Surfaces and shadows', /^elevation\./], ['Loading and overlay', /^color\.(skeleton|blanket)/], ['Charts', /^color\.chart/]];
  return GROUPS.map(([g, re]) => {
    const names = T.COLOR_TOKENS.filter(n => re.test(n));
    const body = names.map(n => /^elevation\.shadow/.test(n)
      ? `<tr><td>${code(T.semVar(n))}</td><td colspan="2"><small>a published shadow list, one per theme</small></td></tr>`
      : `<tr><td>${code(T.semVar(n))}</td>${cell(n, 'light')}${cell(n, 'dark')}</tr>`).join('');
    return `<h4 class="lbl">${esc(g)} <small>${names.length}</small></h4><div class="tbl-wrap" style="margin-bottom:var(--space-250)"><table class="dsx-t dsx-tok full"><thead><tr><th>Token</th><th>Light</th><th>Dark</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }).join('');
}

function component() {
  const L_ = T.componentHex('light'), D_ = T.componentHex('dark');
  const body = T.COMPONENT_COLOUR.map(([k, s, what]) => `<tr><td>${code('--' + k)}</td><td>${code(T.semVar(s))}</td><td>${esc(what)}</td><td class="nowrap">${swHex(L_[k])}${swHex(D_[k])}</td></tr>`).join('');
  const geo = T.COMPONENT_GEOMETRY.filter(([k]) => !/^font-family|^transition/.test(k)).map(([k, v, what]) => `<tr><td>${code('--' + k)}</td><td>${code(v)}</td><td>${esc(what)}</td></tr>`).join('');
  return `<div class="tbl-wrap" style="margin-bottom:var(--space-250)"><table class="dsx-t full"><thead><tr><th>Ours</th><th>Points at</th><th>What it is for</th><th>Light · dark</th></tr></thead><tbody>${body}</tbody></table></div>
<div class="tbl-wrap"><table class="dsx-t full"><thead><tr><th>Ours</th><th>Is</th><th>What it is for</th></tr></thead><tbody>${geo}</tbody></table></div>
${note('<p>Five figure sizes sit above or between the published type steps — the hero, a figure in a pane, a stat, a compact stat and a page title — because a rupee amount at full precision has to fit its card at every width, and a fixed step cannot. Each is a <code>clamp()</code> bounded by published steps; the hero’s upper bound is the one value with no published step above it, and it is marked as an extension in the stylesheet and in <code>TOKEN-DIFF.md</code>.</p>')}`;
}

function states() {
  const S = [
    ['Done', 'ok', 'success', 'Settled and correct: approved, accepted, signed off, in force, in stock.', 'done'],
    ['In progress', 'active', 'information', 'Under way, nothing owed.', 'active'],
    ['Waiting', 'waiting', 'discovery', 'On a named person’s desk. Not a problem, not yours.', 'waiting'],
    ['Caution', 'warn', 'warning', 'Watch it before it becomes a problem: above the agreed rate, below reorder, no receipt yet.', 'caution'],
    ['Bad', 'bad', 'danger', 'Money going the wrong way, refused, failed. Nothing else.', 'bad'],
    ['Idle', '', 'neutral', 'Draft, cancelled, closed, withdrawn. Nothing is happening and nothing is owed.', 'idle'],
  ];
  const body = S.map(([name, tone, sem, what, k]) => { const [l, d] = both(`lozenge-${k}-ink on lozenge-${k}`);
    const tok = T.COMPONENT_COLOUR.find(([n]) => n === `lozenge-${k}`)[1], ink = T.COMPONENT_COLOUR.find(([n]) => n === `lozenge-${k}-ink`)[1];
    return `<tr><td>${pill(tone, name === 'Idle' ? 'Draft' : name)}</td><td><b>${esc(name)}</b><small>${esc(sem)}</small></td><td>${esc(what)}</td><td><code>${esc(ink)}</code> on <code>${esc(tok)}</code></td><td class="num">${r2(l.value)}<small>${r2(d.value)} dark</small></td></tr>`; }).join('');
  const fills = ['light', 'dark'].map(m => `${m}: ${Math.min(...V.rows.filter(r => r.mode === m && r.kind === 'hue-fill').map(r => r.value)).toFixed(1)}°`).join(', ');
  return `<div class="tbl-wrap"><table class="dsx-t full"><thead><tr><th>Lozenge</th><th>State</th><th>What it may say</th><th>Ink on fill</th><th class="num">Contrast</th></tr></thead><tbody>${body}</tbody></table></div>
<div class="notice info" style="margin-top:var(--space-250)">${icon('info')}<div><span class="t">Information is a section message</span><p>A page-level fact that is not a status is an information section message, like this one — never a lozenge standing in for a sentence.</p></div></div>
${note(`<p><strong>Blue carries the brand and every affordance — the primary action, a link, the focus ring, a selected row, the current page — and one status: in progress, as the published lozenge draws it.</strong> The lozenge is a pale fill with a dark ink and no border, which is not the shape of anything you can press, so it is not read as a link. Measured on the fills, the five coloured statuses paint at least ${fills} apart against a floor of 40°. <span class="superseded">Until 17 September in progress was a grey lozenge with a dot, on the reasoning that a blue lozenge beside blue links would read as something to press. That was a taste, not a gate, and the owner dropped it; the published lozenge is used.</span></p>`, 'Brand and status')}`;
}

function adjustments() {
  const body = ADJUST.map(a => `<tr><td>${code(T.semVar(a.token))}</td><td>${a.mode === 'light' ? 'Light' : 'Dark'}</td><td class="nowrap">${sw(T.primVar(a.from))}${esc(a.from)}</td><td class="nowrap">${sw(T.primVar(a.to))}${esc(a.to)}</td><td>${esc(a.gate)}<small>before: ${esc(a.before)} · after: ${esc(a.after)}</small></td><td>${esc(a.why)}</td></tr>`).join('');
  return `<div class="tbl-wrap"><table class="dsx-t full"><thead><tr><th>Token</th><th>Theme</th><th>Published</th><th>Used</th><th>Gate it failed</th><th>Why this step</th></tr></thead><tbody>${body}</tbody></table></div>
${note(`<p><strong>${ADJUST.length} values moved, and no gate did.</strong> Each move is the nearest step on the same ramp, or the nearest documented token beside it, that clears the gate. Two of them contradict something the documentation promises — that chart colours hold 3:1 on every surface, and that adjacent categorical colours stay distinct across colour deficiencies — and the measurement is printed rather than the promise.</p>`)}`;
}

function gateTable() {
  const LABELS = ['body ink on ground (AAA)', 'body ink on panel (AAA)', 'body ink on elevated (AAA)', 'ink-soft on panel', 'ink-faint on panel', 'ink-faint on sunk', 'link on panel', 'on-accent on accent', 'selected-ink on accent-soft', 'ok on ok-soft', 'warn on warn-soft', 'waiting on waiting-soft', 'bad on bad-soft', 'info on info-soft', 'on-accent on bad-bold', 'line-strong on panel', 'line-strong on sunk', 'line-strong on input', 'focus on panel', 'focus on ground', 'selected-line on panel', 'illo-line on panel', 'illo-line on ground', 'progress on its track'];
  const body = LABELS.map(lb => { const [l, d] = both(lb); if (!l) throw new Error(`no gate row ${lb}`);
    return `<tr><td>${esc(lb)}</td><td class="num">${r2(l.value)}</td><td class="num">${r2(d.value)}</td><td class="num">${l.floor} : 1</td></tr>`; }).join('');
  const hue = ['light', 'dark'].map(m => `<tr><td>${m === 'light' ? 'Light' : 'Dark'}</td>${V.rows.filter(r => r.mode === m && r.kind === 'hue').map(r => `<td>${esc(r.label)} <b>${r.value.toFixed(1)}°</b></td>`).join('')}</tr>`).join('');
  return `<div class="tbl-wrap" style="margin-bottom:var(--space-250)"><table class="dsx-t dsx-pairs full"><thead><tr><th>Pair</th><th class="num">Light</th><th class="num">Dark</th><th class="num">Floor</th></tr></thead><tbody>${body}</tbody></table></div>
<h4 class="lbl">The status ring, painted — the brand in it, so no status can read as the brand</h4>
<div class="tbl-wrap"><table class="dsx-t full"><tbody>${hue}</tbody></table></div>
${note(`<p>A selection of the ${V.checks} checks the build runs before it writes a file; every one of them passes in both themes, and the build stops if one does not. The full list includes every text colour on every surface, every control boundary on every surface it can sit on, and the whole chart sequence below.</p>`)}`;
}

function charts() {
  const modeRows = (m) => { const rows = V.rows.filter(r => r.mode === m && r.kind === 'chart' && /^categorical/.test(r.label));
    const sim = (k) => `<tr><th>${k === null ? 'As drawn' : k === 'protan' ? 'Protanopia' : 'Deuteranopia'}</th>${rows.map(r => `<td class="num">${swHex(k ? dichromat(r.hex.slice(0, 7), k) : r.hex.slice(0, 7))}</td>`).join('')}</tr>`;
    const adj = V.rows.filter(r => r.mode === m && r.kind === 'adjacent');
    return `<h4 class="lbl">${m === 'light' ? 'Light' : 'Dark'} — lightness band ${rows[0].band.join('–')}, chroma 0.10 or more, 3:1 on the page and the card</h4>
<div class="tbl-wrap"><table class="dsx-t dsx-cvd full"><thead><tr><th></th>${rows.map((r, i) => `<th class="num">${i + 1}<small>${esc(rawOf(`color.chart.categorical.${i + 1}`, m))}</small></th>`).join('')}</tr></thead><tbody>${sim(null)}${sim('protan')}${sim('deutan')}
<tr><th>L · C</th>${rows.map(r => `<td class="num">${r.L.toFixed(2)}<small>${r.C.toFixed(2)}</small></td>`).join('')}</tr>
<tr><th>ΔE to the next · dichromat / normal</th>${adj.map(a => `<td class="num">${a.cvd.toFixed(1)}<small>${a.normal.toFixed(1)}</small></td>`).join('')}<td class="num">—</td></tr></tbody></table></div>`; };
  return `${modeRows('light')}${modeRows('dark')}
${note(`<p>The categorical sequence is assigned in order and never cycled: this product’s charts use the first three, and a ninth series folds into “Other”. Every adjacent pair clears ΔE 8 for a protanope or a deuteranope and ΔE 15 for normal vision, in both themes. Dark mode is its own set of steps, validated against the dark surface, not the light set flipped. A chart never paints a status token: the failure marker is <code class="nowrap">--color-chart-danger-bold</code>, the limit is <code class="nowrap">--color-chart-neutral</code> drawn dashed, and the out-of-tolerance region is a band — three channels that survive without hue.</p>`, 'The chart palette')}`;
}

function type() {
  const SAMPLE = { 'heading-xxlarge': `${kest.sharePct.toFixed(0)}%`, 'heading-xlarge': 'Workplace refresh, two floors', 'heading-large': 'Krayashala Stores', 'heading-medium': 'Approval steps', 'heading-small': 'Ordered against contract', 'heading-xsmall': 'Agreed rates', 'heading-xxsmall': 'Waiting on you',
    'body-large': 'Two minutes to review your tax settings, and this is where bills received and what’s due will appear.', body: 'Sankhyamani Analytics Private Limited · contract ' + fmt(kest.contract), 'body-small': 'Raised 8 Sep · waiting 3 days',
    'metric-large': fmt(L.TOTAL_COMMITTED), 'metric-medium': fmt(L.BLOCKED_OLDEST.amount), 'metric-small': `${kest.sharePct.toFixed(0)}%` };
  const W = { 653: 'bold', 600: 'semibold', 500: 'medium', 400: 'regular' };
  const steps = T.TYPE.map(t => `<div><small>${esc(t.key.replace('-', ' '))} · ${W[t.weight]}<b>${t.size}/${t.leading}</b></small><span class="ty ty-${t.key}">${esc(SAMPLE[t.key])}</span></div>`).join('\n');
  const FLUID = [['hero', 'the one number on a screen', fmt(L.TOTAL_COMMITTED)], ['figure', 'a figure in a card or a pane', fmt(L.BLOCKED_OLDEST.amount)], ['stat', 'a stat value', fmt(kest.contract)], ['stat-compact', 'a stat in a tight column', '88%'], ['title', 'a page title', 'Workplace refresh, two floors']];
  const fluid = FLUID.map(([n, use, s]) => `<div><small>Extension · ${esc(use)}<b>${esc(T.COMPONENT_GEOMETRY.find(([k]) => k === `font-size-${n}`)[1])}</b></small><span class="fluidbox"><span class="ty tyf-${n}">${esc(s)}</span></span></div>`).join('\n');
  return `<div class="card"><div class="card-b"><div class="dsx-type">${steps}\n${fluid}
<div><small>Tabular figures · every number, so a column of them aligns on its decimal<b>font-variant-numeric</b></small><span class="ty ty-body-large u-tabular">1,11,111.11<br>8,88,888.88</span></div></div></div></div>
${note('<p><strong>One family, Inter, for headings and text</strong>, under the SIL Open Font License, loaded from one stylesheet link; offline it falls to Segoe UI, which holds tabular figures on Windows. Headings are set at weight 653, as published, and at normal tracking. The earlier serif display face is withdrawn with the palette it was chosen for. <strong>Sentence case everywhere — except a table’s head and a small label over a figure, which are set in capitals since 18 September, as the reference the buyers know sets them</strong>; capitals are kept for the one label that names a band — the marker on a value line and the day divider in the notifications panel.</p>')}`;
}

function spacing() {
  const S = T.SEM ? Object.keys(T.SEM).filter(n => /^space\.\d+$/.test(n) && n !== 'space.0') : [];
  return `<div class="card"><div class="card-b"><div class="dsx-space">${S.map(n => `<div><i style="width:var(${T.semVar(n)});height:var(${T.semVar(n)})"></i>${esc(T.SEM[n].light)}<small>${code(T.semVar(n))}</small></div>`).join('')}</div></div></div>
${note('<p>An 8px base with half and quarter steps below it. Inside a control: 4 and 8. Between controls in a row: 8. Card padding: 20 on the web, 16 on a phone. Between cards: 20. Between sections of a page: 40. The old scale had a 10px and a 14px step with no equal here; both moved to the nearest published step, and <code>TOKEN-DIFF.md</code> lists every such move.</p>')}`;
}

function radius() {
  const R = [['radius-xsmall', 'badges, checkboxes, keyboard shortcuts', 'rx-badge'], ['radius-small', 'lozenges, tags, chips, a compact button, a code span', 'rx-small'], ['radius-medium', 'buttons, inputs, selects, text areas, navigation items', 'rx-ctl'], ['radius-large', 'cards, in-page containers, popovers, menus', 'rx-card'], ['radius-xlarge', 'page containers, tables, modals, board columns, a raised hero', 'rx-page'], ['radius-full', 'avatars, and anything that is a person', 'rx-full']];
  return `<div class="dsx-radius">${R.map(([t, use]) => `<div><i style="border-radius:var(--${t})"></i><b>${code('--' + t)}</b><span>${esc(T.SEM[t.replace('-', '.')].light)} · ${esc(use)}</span></div>`).join('')}</div>
${note('<p>A radius is chosen by what the element <em>is</em>, not by its size. The focus ring’s corner is the control’s radius plus its 2px offset — the outline follows the control’s own corner, so no separate focus radius is written anywhere.</p>')}`;
}

function meaning() {
  const hues = [['blue', 'orders, contracts, the pipeline', 'contract'], ['teal', 'cash', 'voucher'], ['green', 'money coming in', 'invoice-in'], ['red', 'money going out', 'invoice-out'], ['yellow', 'what needs watching', 'ceiling'], ['purple', 'what waits on a person', 'people'], ['magenta', 'the site', 'site'], ['gray', 'a plain count', 'count']];
  const discs = `<div class="dsx-showcase">${hues.map(([h, what, ic]) => `<div><span class="disc ${h}" aria-hidden="true">${L.duo(ic)}</span><small>${esc(h)} · ${esc(what)}<br><code>--disc-${h}</code> · <code>--disc-${h}-icon</code> · <code>--duo-${h}</code></small></div>`).join('')}</div>`;
  const dir = `<div class="dsx-showcase"><div>${moneyIn(L.R(2_14_80_000))}<small>money in · <code>--money-in</code> · <code>color.text.accent.green</code></small></div><div>${moneyOut(L.R(1_87_80_000))}<small>money out · <code>--money-out</code> · <code>color.text.accent.red</code></small></div><div><span class="caps overdue">Overdue</span> ${moneyOverdue(L.R(8_40_000))}<small>overdue · an amber label over an ink figure, <code>--warn</code> as text, never a fill</small></div><div>${fmt(L.R(35_83_500))}<small>not yet due · plain ink</small></div><div>${warnChip('GSTIN missing for 2 vendors')}<small>a page-level warning · amber text with its icon, on no fill</small></div></div>`;
  const nav = `<div class="dsx-frame web" style="padding:var(--space-200)"><nav class="side-nav" aria-label="Sections" style="width:240px"><a href="#" aria-current="page">${icon('home')}<span class="nav-t">Today</span></a><a href="#">${icon('check-sq')}<span class="nav-t">Approvals</span><span class="badge">3</span></a><div class="nav-sec open"><button class="nav-h" type="button" aria-expanded="true">${icon('cart')}<span class="nav-t">Buying</span><span class="nav-chev">${icon('chevron', 'i sm')}</span></button><ul class="nav-pages"><li><a href="#">Orders<span class="badge">3</span></a></li><li><a href="#">Vendors</a></li></ul></div></nav></div>`;
  return `<h4 class="lbl">The stat’s disc — one accent per tile, the hue names what the figure is about</h4>${discs}
<h4 class="lbl">Money direction — coloured text with its sign; overdue is the caution ink on its fill, never bare</h4>${dir}
<h4 class="lbl">The money card — the disc in its header, the total, the bar in ageing buckets, the buckets beneath</h4><div style="max-width:420px">${oweCard({ title: 'Total payables', help: 'What is owed to vendors on bills acknowledged and unpaid', total: L.R(44_23_500), current: L.R(35_83_500), buckets: [L.R(8_40_000), '0', '0'], span: '', note: '9 bills unpaid · 2 past due' })}</div>
<h4 class="lbl">The sidebar’s current page — a solid pill, inverse ink</h4>${nav}
${note('<p><strong>Colour where it carries meaning, from the accent tokens the plain retheme left unused.</strong> A disc behind a stat’s icon is <code>color.background.accent.*.subtlest</code> under <code>color.icon.accent.*</code>, one accent per tile, each pair 3:1 or better. Money in is <code>color.text.accent.green</code> and money out <code>color.text.accent.red</code>, each with its sign; overdue is an amber small-capitals label over an ink figure — the caution ink as text, never a fill (the owner’s rule of 19 September: no highlighter; the caution fill is for a lozenge or a section message only) — the orange text accent was tried for money out on 19 September and the India layer measured it: no pair within 24px of green money-in on any product screen — the cash-flow card, the ledger, Client billing — but two pairs 18px apart in the component-token table on part 0, where the money-in and money-out swatches are neighbours; the gate is the authority, so the red text accent stays. The owed bar’s overdue part is <code>color.background.accent.yellow.bolder</code>, 4.63:1 on the card, and its not-yet-due part <code>color.background.accent.gray.bolder</code>, with a hairline of the surface between them. The current page is <code>color.background.selected.bold</code> under <code>color.text.inverse</code>, 5.20:1 in light and 6.00:1 in dark. A row waiting on this person is <code>color.background.accent.purple.subtlest</code>, the tint of the waiting lozenge. The top bar is a dark island — it carries <code>data-theme=&quot;dark&quot;</code>, so <code>--topbar</code> and <code>--topbar-lift</code> resolve to the brand’s subtlest dark surface and an alpha neutral over it, navy in both themes; the sidebar sits on the sunken surface with an open section tinted <code>--nav-open</code>. Blue stays action, link, focus and selection: no disc, tint or text is blue for a state.</p>', 'Colour, 18 September 2026')}`;
}

function elevation() {
  return `<div class="dsx-surfaces four"><div class="s-ground"><b>Sunken</b><code>--ground</code> the page behind cards, and a board column</div><div class="s-panel"><b>Default</b><code>--panel</code> a card, a table, a form: flat, with a border</div><div class="s-raised"><b>Raised</b><code>--raised</code> + <code>--shadow-2</code> the one focal card on a screen</div><div class="s-elevated"><b>Overlay</b><code>--elevated</code> + <code>--shadow-3</code> a popover, a drawer, a sheet</div></div>
${note('<p>Four levels, and a border does the grouping a shadow used to. Raised is spent once per screen — the hero, or the record open beside a list — because a screen of raised cards has no focal point. In dark mode each level is a lighter surface as well as a shadow, since a shadow alone disappears against a dark page.</p>')}`;
}

function focus() {
  const [l, d] = both('focus on panel'); const [lg, dg] = both('focus on ground');
  return `<div class="card"><div class="card-b dsx-showcase dsx-focus">
<div><button class="btn primary is-focus" type="button">Approve</button><small>primary</small></div>
<div><button class="btn is-focus" type="button">Export</button><small>default</small></div>
<div class="field" style="margin:0"><label for="focus-demo">Client rate</label><input id="focus-demo" class="is-focus" type="text" value="1,240.00"></div>
<div><a class="is-focus" href="#s0">A link</a><small>link</small></div>
</div></div>
${note(`<p><strong>2px, in ${code('--color-border-focused')}, set 2px outside the control, and nothing else.</strong> Measured against the card: ${r2(l.value)} : 1 in light and ${r2(d.value)} : 1 in dark; against the page ${r2(lg.value)} and ${r2(dg.value)}. The ring is drawn by <code>:focus-visible</code>, last in the stylesheet so no component can override it, and the polish gate focuses a real control of each kind and reads the painted outline back. The glow the previous system drew around the ring is withdrawn.</p>`)}`;
}

function motion() {
  const D = Object.keys(T.SEM).filter(n => /^motion\.duration\./.test(n)).map(n => [n, T.SEM[n].light]).sort((a, b) => parseInt(a[1]) - parseInt(b[1]));
  const E = Object.keys(T.SEM).filter(n => /^motion\.easing\./.test(n)).map(n => [n, T.SEM[n].light]);
  return `<div class="two even"><div class="tbl-wrap"><table class="dsx-t full"><thead><tr><th>Duration</th><th class="num">ms</th></tr></thead><tbody>${D.map(([n, v]) => `<tr><td>${code(T.semVar(n))}</td><td class="num">${esc(v)}</td></tr>`).join('')}</tbody></table></div>
<div class="tbl-wrap"><table class="dsx-t full"><thead><tr><th>Easing</th><th>Curve</th></tr></thead><tbody>${E.map(([n, v]) => `<tr><td>${code(T.semVar(n))}</td><td><code>${esc(v)}</code></td></tr>`).join('')}</tbody></table></div></div>
<div class="dsx-motion" style="margin-top:var(--space-250)"><div><b>A control changes state</b>background, border and colour<code>short · out, practical</code></div><div><b>A card is hovered</b>its border darkens; nothing lifts<code>medium · out, practical</code></div><div><b>A drawer or a popover opens</b>a short slide with a fade<code>long · out, practical</code></div></div>
${note('<p>The published motion tokens are behind a feature flag on the day they were read, so they are adopted as values and not as a promise. <code>prefers-reduced-motion</code> removes every transition and animation, and every gate measures with it on, so the gates see the settled layout.</p>')}`;
}

function drawing() {
  const [ln, dn] = both('illo-line on panel');
  return `<div class="dsx-illorules">
<div><b>Canvas</b><span>One <code>viewBox</code> for every drawing: <code>0 0 160 160</code>, the published maximum size of an empty state's image. A narrow empty state draws the same symbol at 120px.</span></div>
<div><b>Blocks</b><span>Flat shapes of the accent colours — blue, yellow and teal from the subtler and subtle steps, a grey for paper, one magenta highlight for a stamp or a tag — laid slightly off the line, as a print is off its register.</span></div>
<div><b>The line</b><span>One hand-drawn line over the blocks, 2 units, round caps and joins, in the icon colour: black in light (${r2(ln.value)} : 1 on the card), near-white in dark (${r2(dn.value)} : 1). The line is the only part held to 3:1.</span></div>
<div><b>Imperfect</b><span>No ruler-straight edge longer than a few units: every long edge bows or steps a unit, and corners are not quite square, so the drawing reads as drawn.</span></div>
<div><b>Sparkles</b><span>Two or three small four-point sparkle marks in the line colour, placed off the object, never on it.</span></div>
<div><b>Decorative</b><span><code>aria-hidden</code> on every reference, and the heading and the text say everything the drawing does. That is what exempts the blocks from 3:1; the empty-state gate checks the heading and the text are there.</span></div>
<div><b>Subjects</b><span>From the trade, not the software: a BOQ sheet, a site cone, a tape measure, a drawing roll, a delivery crate, a stamped voucher.</span></div>
<div><b>Dark</b><span>Each drawing has a dark variant by construction: the blocks and the line are tokens with a dark value, so a drawing on a dark card is drawn in the dark accent steps under a light line.</span></div>
</div>`;
}

function inkTable() {
  if (!INK) return note('<p>Ink coverage has not been measured for this palette yet.</p>');
  const rows = INK.slice().sort((a, b) => b.coverage - a.coverage);
  const vals = rows.map(r => r.coverage); const max = Math.max(...vals), min = Math.min(...vals);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const body = rows.map(r => `<tr><td><code>${r.name}</code></td><td class="num">${r.coverage.toFixed(1)}%</td><td><span class="dsx-bar" style="--w:${(100 * r.coverage / max).toFixed(1)}%" aria-hidden="true"></span></td></tr>`).join('');
  return `<div class="tbl-wrap"><table class="dsx-t"><thead><tr><th>Illustration</th><th class="num">Ink</th><th>Coverage</th></tr></thead><tbody>${body}</tbody><tfoot><tr><td>Mean of ${rows.length}</td><td class="num">${mean.toFixed(1)}%</td><td></td></tr></tfoot></table></div>
${note(`<p>Non-background pixels inside the optical box, each drawing rasterised at 240px on the card surface, measured on this palette. The optical box is x 17–143, y 20–140 of the 160-unit canvas. ${rows.length} drawings, one per subject (six until 19 September, fourteen before that); the lightest is ${esc(L.ILLO_CAPTION[rows[rows.length - 1].name] || rows[rows.length - 1].name)}, the heaviest ${esc(L.ILLO_CAPTION[rows[0].name] || rows[0].name)}. The spread between them is ${(max - min).toFixed(1)} points.</p>`)}`;
}

function nontextTable() {
  const CLS = {
    obligated: ['Obligated — WCAG 1.4.11 requires 3:1', 'A control boundary, a focus indicator, or a graphic that carries meaning.'],
    raised: ['Raised by choice — not obligated', 'A row divider is not a control boundary. It is kept visible because dense tables are read by scanning across them, and kept well under 3:1 so a grid of rules never out-shouts the figures inside it.'],
    exempt: ['Exempt, and why', 'Surface layering is depth, not data, and a loading placeholder states nothing; the content on each surface carries its own contrast. An illustration is decorative — aria-hidden, with the heading and the text beside it carrying the meaning — so its five fills are exempt under 1.4.11 by the owner’s decision of 17 September 2026; its line stays obligated above, so the drawing reads on its card in both themes.'],
  };
  const rows = (cls) => [...new Set(NONTEXT.rows.filter(r => r.cls === cls).map(r => r.label))].map(n => {
    const l = NONTEXT.rows.find(r => r.cls === cls && r.theme === 'light' && r.label === n), d = NONTEXT.rows.find(r => r.cls === cls && r.theme === 'dark' && r.label === n);
    const c = (r) => r === undefined ? '<td class="num">—</td>' : `<td class="num ${r.ok === null ? '' : r.ok ? 'used' : 'unused'}">${r.r.toFixed(2)}<small>${r.ok === null ? 'n/a' : r.ok ? '≥ 3 : 1' : 'FAIL'}</small></td>`;
    return `<tr><td>${esc(n)}</td>${c(l)}${c(d)}</tr>`; }).join('');
  return Object.entries(CLS).map(([k, [h, why]]) => `<h4 class="lbl">${esc(h)}</h4><p class="ps" style="margin:0 0 var(--space-100);max-width:78ch">${esc(why)}</p>
<div class="tbl-wrap" style="margin-bottom:var(--space-250)"><table class="dsx-t dsx-pairs full"><thead><tr><th>Pair, as painted</th><th class="num">Light</th><th class="num">Dark</th></tr></thead><tbody>${rows(k)}</tbody></table></div>`).join('')
    + note('<p><span class="superseded">Until 17 September this table also ranked the marks in a drawing, so the one accent carried the meaning in both themes. The drawings are decorative now and carry no meaning of their own, so the ranking is withdrawn.</span></p>');
}

export function foundations() {
  const moneyStates = [['Positive', L.POS[0].gross, 'an order total'], ['Zero', '0', 'GST on the transporter’s order — a nil rate on that line. ₹0.00 is a real value here'], ['Negative', L.VARIATIONS.find(v => v.impact.startsWith('-')).impact, 'a credit variation — the sign travels with the figure']];
  return `<p class="lede">The system this product is drawn in: where every value came from and when it was read, the three token layers, the ramps, the semantic and component tokens in both themes, the six states, every value our gates moved, the chart palette, and the type, spacing, radius, elevation, focus and motion scales.</p>
${sample('Where the system comes from — sources, and the date they were read', sources())}
${sample('Three layers — primitives, semantic, component', layers())}
${sample('Ramps — the palette as published', ramps())}
${sample('Semantic colour — every token this product uses, light and dark', semantic())}
${sample('The component layer — this product’s names, and what each points at', component())}
${sample('The six states — and what blue is for', states())}
${sample('Gate-forced adjustments — the published value, the one used, and why', adjustments())}
${sample('What the token gate measures — both themes, before any file is written', gateTable())}
${sample('Charts — the categorical sequence, as a dichromat sees it, in both themes', charts())}
${sample('Type — one family, the published scale, and five figure sizes for money', type())}
${sample('Spacing — an 8px base', spacing())}
${sample('Radius — chosen by what the element is', radius())}
${sample('Colour where it carries meaning — discs, money direction, the owed bar, the pill', meaning())}
${sample('Elevation — four surfaces', elevation())}
${sample('Focus — one ring, everywhere', focus())}
${sample('Motion — short, practical, and off when asked', motion())}
${sample('Contrast — non-text: borders, focus, chart marks, the progress bar, the illustration', nontextTable())}
${sample('The drawing system — stated first, so the set is consistent by construction', drawing())}
${sample('Ink coverage — the set balanced by measurement', inkTable())}
${sample('The Stat, rebuilt — a large tabular figure, a delta with direction and period, a sparkline', `<div class="dsx-frame web" style="padding:var(--space-250)"><div class="stats">${stat('Ordered so far, all projects', money(L.TOTAL_COMMITTED), { delta: delta('up', fmt(L.ORDERED_DELTA), 'this week'), tone: 'up', series: L.SPARK.ordered })}${stat('Pipeline, weighted by stage', money(L.PIPELINE_WEIGHTED), { delta: `of <b>${fmt(L.PIPELINE_TOTAL)}</b> unweighted · lead 10% to negotiation 70%`, series: L.SPARK.pipeline })}${stat('Margin at risk', money(L.MARGIN_AT_RISK), { delta: `<b>${L.LEAKING.length} projects</b> approved past the cost budget`, tone: 'watch', series: [0, 0, 0, 0, 0, 0, 0, Number(BigInt(L.MARGIN_AT_RISK) / 100000n)], thr: 0, noteHtml: `<span class="next">Renegotiate, or raise a variation</span>` })}</div>
<div class="stats"><div class="stat mini"><div class="l">Compact · a drawer</div><div class="vbox"><div class="v">${fmt(L.POS[0].gross)}</div></div><div class="d"><b>GST ${fmt(L.POS[0].gst)}</b></div></div>${stat('Text value · nothing filed yet', 'Not filed', { txt: true, delta: 'today’s daily report, NCB-02' })}${stat('Absent, not zero', money(null, 'Two lines have no cost rate yet'), { delta: `${icon('info', 'i sm')} add cost rates on 2.2 and 3.1 to see this` })}</div></div>
${note('<p>The label is small and secondary; the figure is tabular at the stat size; the delta says direction, magnitude and period (<em>↑ ₹12,40,000.00 this week</em>); the sparkline is eight weeks in the first chart colour with the end point marked. Money in a delta keeps the full Indian format. A value that is not a figure (<em>Not filed</em>, <em>—</em>) is set as text so it never impersonates a number. Since 18 September every stat carries a disc — its icon on an accent’s subtlest fill, one accent per tile, the hue naming what the figure is about and grey for a plain count; the compact stat in a drawer is the one that does not, there being no room for it.</p>')}`)}
${sample('The money cell in every state', `<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>State</th><th class="num">Figure</th><th>Where you see it</th></tr></thead><tbody>
${moneyStates.map(([s, w, where]) => `<tr><td>${esc(s)}</td>${td(w)}<td>${esc(where)}</td></tr>`).join('')}
<tr><td>Not entered</td><td class="num">${money(null, 'Nothing has been entered here yet')}</td><td>A line with no cost rate; a project with no contract value. Hover for why. Never ₹0.00 — that would be a claim</td></tr>
<tr><td>Provisional</td><td class="num">${fmt(L.R(10_000))}</td><td>Tax deducted at a rate a chartered accountant has not verified yet. The figure carries no banner; the rate beside it says <em>Provisional</em>, and a generated document built from it says <em>Draft: provisional rates</em></td></tr>
</tbody><tfoot><tr><td>Total, calculated for you</td>${td(L.TOTAL_COMMITTED)}<td class="muted">the page never adds up</td></tr></tfoot></table></div></div>`)}
${sample('The money field — text, two decimals, the message says what to type', `<div class="card"><div class="card-b"><div class="dsx-grid">${moneyField('rate-demo', 'Client rate', '1,240.00')}${moneyField('rate-bad', 'Client rate', '10.005', '', false, 'Rupees can have two decimals. Try 10.01 or 10.00.')}</div></div></div>`)}
${sample('Status — the same closed sets, in the customer’s words', `<div class="card"><div class="card-b">
${[['Order', V2.po], ['Project', V2.project], ['Project health', V2.health], ['Vendor’s answer', V2.acceptance], ['RA bill', V2.bill], ['Variation', V2.co], ['Agreed rates', V2.rc], ['Lead', V2.lead], ['Task', V2.task]].map(([lbl, set]) => `<div class="dsx-pills"><span class="lbl">${esc(lbl)}</span>${set.map(([, t, tone]) => pill(tone, t)).join('')}</div>`).join('')}
</div></div>`)}
${sample('Buttons — the published button, in its appearances and sizes', `<div class="card"><div class="card-b dsx-showcase">
<div><button class="btn primary" type="button">${icon('plus')}Raise an order</button><small>primary · one per screen</small></div>
<div><button class="btn" type="button">${icon('download')}Export</button><small>default</small></div>
<div><button class="btn danger" type="button">Cancel order…</button><small>danger · refuses or destroys · a confirm follows</small></div>
<div><button class="btn ghost" type="button">Later</button><small>subtle</small></div>
<div><button class="btn" type="button" disabled>Not yet</button><small>disabled</small></div>
<div>${L.busyButton('Saving')}<small>loading · a spinner in place of the label</small></div>
<div><button class="btn icon" type="button" aria-label="Close">${icon('x')}</button><small>icon-only · always named</small></div>
<div><button class="btn primary lg" type="button">${icon('check')}Approve</button><small>large · the one decision</small></div>
<div><button class="btn sm" type="button">Remind</button><small>compact · 24px, small radius</small></div>
</div></div>`)}`;
}

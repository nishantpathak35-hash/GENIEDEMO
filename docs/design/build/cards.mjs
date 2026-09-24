// cards.mjs — the compositions the familiar look adds (18 September 2026). Every colour is an accent token
// through the component layer; every part is a published component or a composition that says so.
import { esc, fmt, icon, pill, NEG, duo, duoFor } from './shell.mjs';
import { oweBar, lineArea, ageBar } from './charts.mjs';

// a stat tile: the duotone icon on a tinted disc, the figure beside it; `sm` is the 28px disc a dashboard card's
// header wears, left of the title (19 September, the grid)
export const disc = (ic, hue, sm = false) => `<span class="disc ${hue}${sm ? ' sm' : ''}" aria-hidden="true">${duo(duoFor(ic))}</span>`;
// a dashboard card's one-line header: [disc] title · help · one action or a period picker at the right
export const cardHead = (title, { help = '', action = '', disc: dsc = null } = {}) =>
  `<div class="card-h">${dsc ? disc(dsc[1], dsc[0], true) : ''}<h5 class="ct">${esc(title)}${help ? `<button class="btn icon ghost sm help" type="button" aria-label="${esc(help)}">${icon('help', 'i sm')}</button>` : ''}</h5>${action}</div>`;
// a figure or money card's disc, by its title: the hue names what the figure is about, the icon its job
const DISC_BY_TITLE = [[/margin at risk/i, ['yellow', 'margin']], [/payables this week/i, ['red', 'bill']], [/ceiling/i, ['yellow', 'ceiling']], [/ordered and billed|contract, ordered/i, ['blue', 'contract']],
  [/on site|^site/i, ['purple', 'site']], [/overdue receivables/i, ['yellow', 'invoice-in']], [/receivable/i, ['green', 'invoice-in']], [/payable/i, ['red', 'invoice-out']], [/cash/i, ['teal', 'voucher']], [/unsigned variations/i, ['purple', 'tray']]];
const discByTitle = (title) => (DISC_BY_TITLE.find(([re]) => re.test(title)) || [null, null])[1];

// the "+ New" menu: everything this person may create, grouped by area, narrowed by the project in scope
export const NEW_ITEMS = [
  ['Sales', [['Lead', 'sales', false], ['Quote', 'doc', false]]],
  ['Projects', [['Project', 'projects', false], ['Variation', 'pen', true], ['BOQ line', 'doc', true]]],
  ['Buying', [['Order', 'cart', true], ['Vendor', 'users', false], ['Agreed rate', 'rupee', false], ['Stock receipt', 'inbox', true]]],
  ['Site', [['Daily report', 'site', true], ['Measurement sheet', 'doc', true], ['Recce', 'search', false]]],
  ['Money', [['Bill', 'bill', true], ['Payment', 'rupee', true], ['Client invoice', 'bill', true]]],
];
export const newMenu = (scope = null, app = 'web') => `<div class="popup new-menu page-theme" role="menu" aria-label="New"><ul class="menu">${(app === 'operator' ? [['Operator', [['Organisation', 'layers', false]]]] : NEW_ITEMS).map(([area, items]) => `<li role="none" class="menu-t">${esc(area)}</li>${items.map(([t, ic, needsProject]) => `<li role="none"><button class="menu-i" role="menuitem" type="button">${icon(ic)}<span class="menu-c"><span>${esc(t)}</span>${needsProject ? `<small>${scope ? `in ${esc(scope)}` : 'asks which project'}</small>` : `<small>the firm’s</small>`}</span></button></li>`).join('')}`).join('')}</ul></div>`;
// the quick-create square (19 September): 32×32 on the brand's mark colour with a white plus, tooltip “New · C”, the menu on click
export const newButton = (open = false, scope = null, app = 'web') => `<div class="new-wrap"><button class="new-sq" type="button" aria-haspopup="menu" aria-expanded="${open}" aria-label="New · C" title="New · C"><span class="ico" data-theme="light"><svg class="i" aria-hidden="true"><use href="#i-plus"/></svg></span></button>${open ? newMenu(scope, app) : ''}</div>`;

// small uppercase label, as the reference sets its CURRENT and OVERDUE
export const caps = (t) => `<span class="caps">${esc(t)}</span>`;

// money direction: coloured text with its sign — a direction, not a negative number
export const moneyIn = (wire) => `<span class="money in">+${fmt(wire)}</span>`;
export const moneyOut = (wire) => `<span class="money out">${fmt(NEG(wire))}</span>`;   // the sign before the rupee, as every negative figure in the set
export const moneyOverdue = (wire) => `<span class="money overdue">${fmt(wire)}</span>`;   // the figure in ink; the label beside it is amber (19 September: no highlighter)

// a money card: total, a proportion bar (overdue amber, not yet due neutral), the split beneath as labelled figures
// a money card (the grid, 19 September): the disc in the header, the total at 28, the bar in ageing buckets — current,
// then 1–30 · 31–60 · 60+ days overdue in the status amber — and the buckets printed beneath, the overdue ones under
// the amber label
export const oweCard = ({ title, help, total, current, buckets, action = '', note = '', disc: dsc = discByTitle(title), span = 'c6' }) => {
  const names = ['1–30 days', '31–60 days', '60+ days'];
  const overdue = buckets.reduce((a, b) => a + BigInt(b), 0n);
  const pct = BigInt(total) > 0n ? Number(overdue * 1000n / BigInt(total)) / 10 : 0;
  return `<section class="card owe ${span}">${cardHead(title, { help, action, disc: dsc })}<div class="card-b">
<div class="owe-total"><span class="caps">Total</span><b class="fig">${fmt(total)}</b></div>
${ageBar({ current, buckets, total, label: `${pct.toFixed(0)}% overdue — current, then overdue by 1 to 30, 31 to 60 and over 60 days` })}
<dl class="owe-split age"><div><dt>${caps('Current')}</dt><dd>${fmt(current)}</dd></div>${buckets.map((b, i) => `<div class="overdue"><dt>${caps(names[i])}</dt><dd>${moneyOverdue(b)}</dd></div>`).join('')}</dl>${note ? `<p class="hint">${note}</p>` : ''}</div></section>`;
};

// a figure card (19 September 2026): the same card as Total receivables for any headline figure — a grey header
// strip with the title, a help icon and one action; the figure; one line of meaning; a proportion bar where there
// is a ratio; the two figures the ratio is made of beneath. `bar` is { pct, kind } — 'ratio' fills pct of the bar
// in the neutral part over a track, 'short' fills the covered part neutral and the shortfall on the yellow ramp.
// a tile (the grid, 19 September): the disc left of the one-line title, the figure at 24, one line of meaning, a bar
// where there is a ratio (`bar`) or a strip of buckets (`strip`), the split beneath, the one action at the foot
export const tile = ({ title, help = '', action = '', figure, meaning = '', bar = null, strip = null, split = [], disc: dsc = discByTitle(title), span = 'c3', module = '' }) =>
  `<section class="card tile ${span}"${module ? ` data-module="${module}"` : ''}>${cardHead(title, { help, disc: dsc })}<div class="card-b">
<b class="fig">${figure}</b>${meaning ? `<p class="meaning">${meaning}</p>` : ''}${bar ? oweBar({ kind: bar.kind, pct: bar.pct, label: bar.label }) : ''}${strip ? ageBar(strip) : ''}${split.length
    ? `<dl class="owe-split${strip ? ' age' : ''}">${split.map(([k, v, over]) => `<div${over ? ' class="overdue"' : ''}><dt>${caps(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}${action ? `<div class="foot">${action}</div>` : ''}</div></section>`;

// a cash-flow card: a period picker in the header, a filled line with a marker per point, the four figures beside it
export const cashCard = ({ title = 'Cash flow', period = 'This financial year', series, labels, opening, incoming, outgoing, closing }) =>
  `<section class="card cash"><div class="card-h"><h5 class="ct">${esc(title)}<button class="btn icon ghost sm help" type="button" aria-label="Cash in the bank each month, from the payments and receipts recorded here — not from Tally">${icon('help', 'i sm')}</button></h5><button class="fbtn" type="button" aria-haspopup="dialog"><span>${esc(period)}</span>${icon('chevron', 'i sm')}</button></div><div class="card-b cash-b">
<figure class="chart line"><p class="sr-only">${esc(title)}, ${esc(period)}: ${labels.map((l, i) => `${l} ${fmt(series[i])}`).join(', ')}.</p>${lineArea({ labels, series })}</figure>
<dl class="cash-figs"><div><dt>Cash as on ${esc(labels[0])} 1</dt><dd>${fmt(opening)}</dd></div><div><dt>Incoming</dt><dd>${moneyIn(incoming)}</dd></div><div><dt>Outgoing</dt><dd>${moneyOut(outgoing)}</dd></div><div class="closing"><dt>Cash as on today</dt><dd>${fmt(closing)}</dd></div></dl></div></section>`;

// the list's header: the view's name with a chevron, and a warning as ink on its caution fill
export const viewTitle = (name, open = false) => `<button class="view-switch" type="button" aria-haspopup="listbox" aria-expanded="${open}">${esc(name)}${icon('chevron', 'i sm')}</button>${open ? viewsMenu(name) : ''}`;
// the saved views of a list (19 September): the firm's views first, then this person's, a star on each that is a
// favourite, and “+ New view” at the foot — criteria, columns and favourite, kept per person on the server
export const SAVED_VIEWS = { 'All orders': [['All orders', true, 'firm'], ['Waiting for approval', true, 'firm'], ['Received, not checked', false, 'firm'], ['Sent this month', false, 'firm'], ['Raised by me', true, 'mine'], ['ANU-01 MEP', false, 'mine']] };
export const viewsMenu = (current) => {
  const rows = SAVED_VIEWS[current] || [[current, true, 'firm'], ['Waiting on me', true, 'mine']];
  const group = (k, label) => { const rs = rows.filter(r => r[2] === k); return rs.length ? `<li class="menu-t" role="presentation">${label}</li>${rs.map(([n, star]) => `<li role="option" aria-selected="${n === current}"><span class="vname">${n === current ? icon('check', 'i sm') : '<span class="ico sp" aria-hidden="true"></span>'}${esc(n)}</span><button class="star${star ? ' on' : ''}" type="button" aria-pressed="${star}" aria-label="${star ? 'Favourite' : 'Not a favourite'}">${icon('star', 'i sm')}</button></li>`).join('')}` : ''; };
  return `<div class="popup view-menu" role="listbox" aria-label="Views"><ul class="menu views">${group('firm', 'The firm’s')}${group('mine', 'Yours')}</ul><div class="menu-f"><a href="#">${icon('plus', 'i sm')}New view<small>criteria · columns · favourite</small></a></div></div>`;
};
// the kebab on a list: sort, import, export, refresh, columns — the actions that are about the list, not a row
export const kebabMenu = () => `<div class="popup kebab-menu" role="menu" aria-label="More actions"><ul class="menu">${[['Sort by', 'sort', true], ['Import', 'upload', false], ['Export', 'download', false], ['Refresh', 'refresh', false], ['Columns', 'columns', false]].map(([t, ic, sub]) => `<li role="none"><button class="menu-i" role="menuitem" type="button">${icon(ic, 'i sm')}${t}${sub ? `<span class="spacer"></span>${icon('right', 'i sm')}` : ''}</button></li>`).join('')}</ul></div>`;
// a document — an order, an invoice, a voucher — opens with a toolbar (19 September): PDF, Send, then the decision
// or the money action this state allows; the one primary is the thing the reader came to do
// the same document in a pane: PDF and Send at the top of the pane, the money action stays docked at its foot
export const paneTools = () => `<div class="doc-tb" role="toolbar" aria-label="Document"><button class="btn sm" type="button">${icon('doc', 'i sm')}PDF</button><button class="btn sm" type="button">${icon('link', 'i sm')}Send</button></div>`;
export const docToolbar = ({ kind = 'order', state = 'waiting', primary = '' } = {}) => {
  const acts = [`<button class="btn" type="button">${icon('doc')}PDF</button>`, `<button class="btn" type="button">${icon('link')}Send</button>`];
  if (state === 'waiting') acts.push(`<button class="btn" type="button">Decline…</button>`);
  return acts.join('') + (primary || (state === 'waiting' ? `<button class="btn primary" type="button">${icon('check')}Approve</button>` : kind === 'order' ? '' : `<button class="btn primary" type="button">${icon('rupee')}Record payment</button>`));
};
export const warnChip = (text) => `<span class="warn-chip">${icon('alert', 'i sm')}${esc(text)}</span>`;
export const viewBy = () => `<span class="viewby">View by:</span>`;
// an attachment on a record: the clip, named for a reader; nothing when there is none
export const clip = (has, what = 'a file attached') => (has ? `<span class="clip" title="${esc(what)}">${icon('paperclip', 'i sm')}<span class="sr-only">${esc(what)}</span></span>` : '<span class="muted" aria-hidden="true">—</span>');

// Every screen that holds a list, after the page-header pass: the view's name with a chevron as the title, a kebab
// before the one primary action (the frame gate keeps the primary last), and "View by" before the filters.
export const VIEWS = { Orders: 'All orders', Vendors: 'All vendors', Rates: 'All agreed rates', Stock: 'All stock', Leads: 'All leads', Projects: 'All projects', Documents: 'All documents', Bills: 'Bills due', Payments: 'All payments', 'Client billing': 'All invoices', Retention: 'All holdings', Approvals: 'Waiting on you', Tasks: 'All tasks', 'Daily reports': 'All reports', 'Measurement sheets': 'All sheets', Recces: 'All recces', Snags: 'All snags', People: 'All people', Organisations: 'All organisations', Imprest: 'All entries' };
export function listPass(html, counts = { views: 0, kebabs: 0, viewBy: 0 }) {
  return html.split(/(<main class="page">[\s\S]*?<\/main>)/).map(seg => {
    if (!seg.startsWith('<main class="page">') || !/class="toolbar lv-tb"/.test(seg)) return seg;
    const viewsOpen = /<!--views-open-->/.test(seg), kebabOpen = /<!--kebab-open-->/.test(seg);
    let s = seg.replace(/(<h[1-6] class="pt">)([^<]+)(<\/h[1-6]>)/, (m, a, t, b) => { const v = VIEWS[t.trim()]; if (!v) return m; counts.views++; return `${a}${viewTitle(v, viewsOpen)}${b}`; });
    s = s.replace(/(<div class="pgh-a">)([\s\S]*?)(<\/div>)/, (m, a, inner, b) => {
      if (/#i-more/.test(inner)) return m; counts.kebabs++;
      const kebab = `<span class="kebab-wrap"><button class="btn icon" type="button" aria-haspopup="menu" aria-expanded="${kebabOpen}" aria-label="More actions">${icon('more')}</button>${kebabOpen ? kebabMenu() : ''}</span>`;
      const i = inner.indexOf('<button class="btn primary'); const j = inner.indexOf('<a class="btn primary');
      const at = i >= 0 ? i : j >= 0 ? j : inner.length;
      return `${a}${inner.slice(0, at)}${kebab}${inner.slice(at)}${b}`;
    });
    s = s.replace(/(<div class="toolbar lv-tb">(?:<div class="search">[\s\S]*?<\/div>)?)(<button class="fbtn)/, (m, a, b) => { counts.viewBy++; return `${a}${viewBy()}${b}`; });
    // the list is the page: a card header that only repeats the view's name goes
    const view = /class="view-switch"[^>]*>([^<]+)</.exec(s); if (view) s = s.replace(new RegExp(`<div class="card-h"><h5 class="ct">${view[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(<span class="sub">[^<]*</span>)?</h5>(<div class="actions">[\\s\\S]*?</div>)?</div>`), (m) => { counts.dropped = (counts.dropped || 0) + 1; return ''; });
    return s;
  }).join('');
}

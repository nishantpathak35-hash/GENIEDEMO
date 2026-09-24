// pages/components-in-place.mjs — the published components the set had not drawn anywhere, drawn in the screens that use them, and the
// three kinds of wait drawn where the product waits (17 September 2026). Each is the same screen as its canonical
// render in another state, so each carries no value line of its own.
import * as L from '../shell.mjs';
import { projectOverview } from './overview.mjs';
import { tdsHero } from './money.mjs';
import * as S from '../patterns.mjs';
import { todayWorking } from './today-to-buying.mjs';
import { calendar, inlineEdit } from './components.mjs';
import { stackedBar, barChart, progress, columns, parts, ring, ringList, meters, oweBar, legend, tableView, chart, compact } from '../charts.mjs';
import { todayHead, todayHero, todayStats, yourDay } from './today-to-buying.mjs';
const { esc, fmt, fmtQty, icon, pill, card, shell, sample, note, notice, spinner, busyButton, drawer, field, choice } = L;

Object.assign(L.VALUE_LINES, {
  'Today, while the Tally connector is offline': null,
  'Project › Build › BOQ, a quantity changed in place': null,
  'Raising an order — the delivery date': null,
  'Buying › an order, its More menu open': null,
  'Buying › an order, cancelling it': null,
  'Approvals, just after approving': null,
  'Money › Tax deducted, why a rate is provisional': null,
  'Loading · a list the first time': null,
  'Loading · the record beside the list, and the approval being saved': null,
  'Loading · an export whose size is known': null,
  'Today › projects by health': null,
  'Overview › the quick-create menu open': null,
  'Buying › Orders › ordered by month': null,
});

const who = (w, r) => ({ who: w, role: r });
const av = (t, cls = '') => `<span class="avatar${cls}" aria-hidden="true">${t}</span>`;
const team = `<span class="avatar-group" role="group" aria-label="ANU-01 team: Shalini, Farhan, Manjit and Elizabeth">${av('S')}${av('F')}${av('M')}${av('E')}</span>`;

// ---------------------------------------------------------------- 1 · a banner, across the whole app
export function today() {
  const banner = `<div class="banner warning" role="alert">${icon('alert')}<span>Tally offline since 09:40 · <a href="#">see the queued vouchers</a></span></div>`;
  return `${sample('Today, while the Tally connector is offline — a banner across the whole app', shell(todayWorking(), { current: '/', label: 'Today · Tally offline', banner, desktop: true }))}
${note('<p>A <strong>banner</strong> is for a condition that affects everyone in the organisation, and it sits above everything, including the sidebar. It is the warning appearance: the connector being offline does not lose anything, and the sentence says so. It is never used for one record — that is a section message on the record.</p>')}`;
}

// ---------------------------------------------------------------- 1b · the two chart forms, where the product draws them
export function newMenuSample() {
  return `${sample('Overview › the quick-create menu open — everything this person may create, grouped by section, ANU-01 pre-filled', shell(projectOverview('ANU-01'), { current: '/', label: 'Overview · ANU-01 · the quick-create menu open', scope: 'ANU-01', newOpen: true }))}
${note('<p><strong>One place to create anything.</strong> The menu is a published dropdown menu with a group title per area — Sales, Projects, Buying, Site, Money — and every item says whether it belongs to the project in scope or to the firm. Inside ANU-01 an order, a bill or a daily report is created in ANU-01 without asking; across all projects the same items ask which project first. What a role may not create is not listed, rather than listed and disabled.</p>')}`;
}

export function charts() {
  const counts = { bad: L.PROJECTS.filter(p => p.health === 'over-budget').length, caution: L.PROJECTS.filter(p => p.health === 'at-risk').length, done: L.PROJECTS.filter(p => p.health === 'on-track').length, paused: 0 };
  const noContract = L.PROJECTS.filter(p => !p.contract);
  const health = stackedBar({ label: 'Projects by health', counts, caption: false, note: `${noContract.map(p => esc(p.code)).join(', ')} has no contract value yet, so it has no health; a paused project would be the fourth segment.` });
  const todayHealth = todayHead('here is the one thing that needs you, then everything else') + `<div class="grid"><div data-hero class="c12">${todayHero()}</div>` + todayStats()
    + `${card('Projects by health', `<div class="card-b">${health}</div>`, { actions: `<a href="#" class="u-sm">All projects</a>`, cls: 'c6' })}${card('Your day', yourDay(), { actions: `<a href="#" class="u-sm">Approvals</a>`, cls: 'c6' })}</div>`;
  const byMonth = barChart({ label: 'Ordered, by month', unit: '₹ lakh', labels: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'], values: [12.4, 31.6, 27.9, 44.2, 18.7, 36.9], max: 60, step: 20, hover: 3, caption: false });
  const orders = S.pageHead({ crumbs: ['Buying'], title: 'Orders', sub: '41 orders · 3 waiting for approval · next number PO-0019' })
    + `<div data-hero>${card('Ordered, by month', `<div class="card-b">${byMonth}</div>`, { sub: '₹ lakh · this financial year', actions: `<a href="#" class="u-sm">Every order</a>` })}</div>`;
  return `${sample('Today › projects by health — a stacked bar in the status series', shell(todayHealth, { current: '/', label: 'Today · projects by health', desktop: true }))}
${sample('Buying › Orders › ordered by month — bars on axes, a gridline every 20 lakh rupees, the hovered month’s tooltip', shell(orders, { current: '/buying', label: 'Buying · Orders · by month', ...who('Manjit', 'Procurement') }))}
${note('<p><strong>One colour unless the data is a status.</strong> The bars take the brand chart colour and the hovered bar its hovered step; the figure is in the tooltip beside the bar, never on it, and the sentence under the chart says the same numbers for anyone who cannot see it. The health bar is the status series in the owner’s order — off track, at risk, on track, paused — in the status chart colours, with a hairline of the surface between segments as the guidance asks; off track is hatched and paused stippled, so the two problem states are told apart without colour, and the legend carries the counts. The status series is the bold step: the base success and warning chart colours measure 2.44:1 and 2.47:1 on the light card, under the 3:1 the non-text gate holds a chart mark to, so the whole series takes the bold step and stays one family.</p>')}`;
}

// ---------------------------------------------------------------- 3 · inline edit, the date picker, the team
export function projects() {
  const p = L.projectOf('ANU-01');
  const lines = L.BOQ.slice(2, 6);
  const rows = lines.map((l, i) => `<tr><td class="num">${esc(l.no)}</td><td>${esc(l.desc)}<span class="sub">${esc(l.sec)}</span></td><td class="num">${i === 1 ? inlineEdit('edit', fmtQty(l.qty), l.uom) : inlineEdit(i === 2 ? 'hover' : 'read', fmtQty(l.qty), l.uom)}</td><td class="num">${fmt(l.rate)}</td><td class="num">${fmt(l.amount)}</td></tr>`).join('');
  const head = S.pageHead({ crumbs: ['ANU-01', 'Build'], title: 'BOQ', sub: `${esc(p.client)} · contract ${fmt(p.contract)}`, facts: [['Team', team], ['Lines', `${L.BOQ.length}`], ['Trades', '8']], primary: `<button class="btn primary" type="button">${icon('plus')}Add a line</button>` });
  const boq = head + `<div data-hero>${card('Lines', `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="num">#</th><th>Item</th><th class="num">Quantity</th><th class="num">Client rate</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody></table></div>`, { sub: `4 of ${L.BOQ.length} lines` })}</div>`;
  const dp = `<div class="field datepick"><label for="raise-by">Deliver by</label><div class="dp-control"><input id="raise-by" type="text" value="30/09/2026" class="is-focus" aria-describedby="raise-by-h"><button class="btn icon ghost sm dp-btn" type="button" aria-label="Open the calendar" aria-expanded="true">${icon('calendar', 'i sm')}</button></div><span class="hint" id="raise-by-h">The vendor sees this date on the order.</span>${calendar('calc(var(--line-height-body-small) + var(--space-050) + var(--field-height) + var(--space-050))')}</div>`;
  const raise = drawer('Raise an order from 3 lines', `<p class="ps" style="margin:0 0 var(--space-150)">Lines 2.1, 2.2 and 2.3, at the BOQ’s cost rates.</p>${choice('raise-vendor', 'Vendor', [[L.V.Prakashvahini.code, L.V.Prakashvahini.name]], L.V.Prakashvahini.code)}${dp}`, `<button class="btn ghost" type="button">Back</button><button class="btn primary" type="button">Raise the order</button>`);
  return `${sample('Project › Build › BOQ, a quantity changed in place — and the team in the header', shell(boq, { current: '/projects', label: 'Project · ANU-01 · BOQ · editing', scope: 'ANU-01', url: `/projects/${S.idOf('ANU-01')}/boq` }))}
${note('<p>A BOQ quantity is an <strong>inline edit</strong>, composed: the published read view and edit view, with a numeric field and the unit beside it, because the system publishes no quantity field. Enter saves, Esc cancels, and the confirm and cancel buttons sit under the field on the overlay shadow. The team is an <strong>avatar group</strong>: four and a count, each named to a screen reader.</p>')}
${sample('Raising an order — the delivery date, a date picker open', shell(boq, { current: '/projects', label: 'Project · ANU-01 · Raise an order · date', scope: 'ANU-01', drawer: raise, url: `/projects/${S.idOf('ANU-01')}/boq` }))}`;
}

// ---------------------------------------------------------------- 4 · a dropdown menu, a modal dialog
export function buying() {
  const o = L.PO_DEMO;
  const menuOpen = `<div class="has-tip" style="position:relative"><button class="btn is-selected" type="button" aria-haspopup="menu" aria-expanded="true">More${icon('chevron', 'i sm')}</button><div class="popup" style="position:absolute;right:0;top:calc(var(--control-height) + var(--space-100))"><ul class="menu" role="menu" aria-label="More actions for ${o.number}"><li role="none"><button class="menu-i" role="menuitem" type="button">${icon('copy')}Duplicate</button></li><li role="none"><button class="menu-i is-hover" role="menuitem" type="button">${icon('download')}Download the PDF</button></li><li role="none"><button class="menu-i is-disabled" role="menuitem" aria-disabled="true" type="button">${icon('pen')}<span class="menu-c"><span>Edit lines</span><small>Not while it waits for approval</small></span></button></li><li role="separator"><hr></li><li role="none"><button class="menu-i danger" role="menuitem" type="button">Cancel the order…</button></li></ul></div></div>`;
  const page = (actions) => S.pageHead({ crumbs: ['ANU-01', 'Buying', 'Orders'], title: o.number, status: L.labelOf2(L.V2.po, o.state), sub: `${esc(o.vendor.name)} · raised ${o.raised}`, actions, primary: `<button class="btn primary" type="button">${icon('check')}Approve</button>` })
    + `<div data-hero>${L.hero({ eyebrow: 'Total, before GST', value: fmt(o.gross), text: `GST ${fmt(o.gst)} at the provisional 18% — see <b>Settings › Tax</b>. Three lines, none covered by an agreed rate with Prakashvahini.`, delta: `<b>3 lines</b> · no agreed rate to check against` })}</div>`;
  const modal = `<div class="blanket"></div><div class="modal" role="dialog" aria-modal="true" aria-labelledby="cancel-t" style="top:var(--space-1000)"><div class="modal-h"><h5 id="cancel-t">Cancel ${o.number}?</h5></div><div class="modal-b"><p>Prakashvahini Electrical Contracts will be told the order is cancelled, and the ${fmt(o.gross)} committed against ANU-01 is released.</p><p>A cancelled order cannot be raised again; duplicate it instead.</p></div><div class="modal-f"><button class="btn ghost" type="button">Keep the order</button><button class="btn danger" type="button">Cancel the order</button></div></div>`;
  return `${sample('Buying › an order, its More menu open — a dropdown menu', shell(page(menuOpen), { current: '/buying', label: 'Buying · PO-0019 · More', scope: 'ANU-01', ...who('Farhan', 'Finance') }))}
${sample('Buying › an order, cancelling it — a modal dialog', shell(page(`<button class="btn" type="button" aria-haspopup="menu">More${icon('chevron', 'i sm')}</button>`), { current: '/buying', label: 'Buying · PO-0019 · cancel', scope: 'ANU-01', overlay: modal, ...who('Farhan', 'Finance') }))}
${note('<p>A destructive action is a menu item that ends in an ellipsis, and it opens a <strong>modal dialog</strong>: the title is the question, the body says what happens to the money and to the vendor, and the danger button repeats the action in words — never OK. Focus starts on <em>Keep the order</em>, the safe choice, and Esc keeps it. A disabled menu item says why it is disabled.</p>')}`;
}

// ---------------------------------------------------------------- 6 · a flag, an inline message
export function money() {
  const flag = `<div class="flag-group"><div class="flag ok" role="status">${icon('check-circle')}<span class="t">PO-0019 approved</span><button class="btn icon ghost sm" type="button" aria-label="Dismiss">${icon('x', 'i sm')}</button><p>Farhan is next, at Admin sign-off.</p><div class="flag-acts"><button class="link-btn" type="button">Undo</button><button class="link-btn" type="button">Open the order</button></div></div></div>`;
  const queue = S.pageHead({ title: 'Approvals', sub: '2 orders are waiting on you, on every project · oldest first' })
    + `<div data-hero>${S.listView({ label: 'Approvals', search: 'Order, vendor or project', filters: [['Step', '']], cols: [{ label: 'Order', p: 1 }, { label: 'Waiting', p: 1, num: true }], rows: [['PO-0006', 'Sagwan Joinery · KRA-01', '7 days'], ['PO-0003', 'Sagwan Joinery · SAN-01', '6 days']].map(([n, s, w]) => ({ name: n, cells: [`<a href="#">${n}</a><span class="sub">${s}</span>`, w] })), pager: L.pager({ from: 1, to: 2, total: 2, page: 1, pages: 1, unit: 'orders' }), select: false })}</div>`;
  const rate = S.pageHead({ crumbs: ['Money'], title: 'Tax deducted', sub: 'the challan for a month, and 26Q for a quarter' })
    + `<div data-hero>${tdsHero()}</div>${card('Challan · 2026-09', `<div class="card-b"><dl class="kv"><dt>Nature of payment</dt><dd>94C · a payment to a contractor</dd><dt>Rate</dt><dd>2% ${pill('', 'Provisional')} <span class="has-tip" style="position:relative"><button class="inline-msg" type="button" aria-expanded="true" aria-controls="why-prov">${icon('info', 'i sm')}<span>Why provisional?</span></button><span class="inline-msg-pop" id="why-prov" role="dialog" aria-label="Why provisional">A chartered accountant has not signed this rate yet. The figure is computed with it; a challan built from it says <em>Draft: provisional rates</em>.</span></span></dd><dt>Tax deducted</dt><dd>${fmt(L.R(49_600))}</dd></dl></div>`)}`;
  return `${sample('Approvals, just after approving — a flag', shell(queue, { current: '/approvals', label: 'Approvals · approved', overlay: flag, ...who('Farhan', 'Finance') }))}
${note('<p>A <strong>flag</strong> confirms something the person just did, where they did it, and leaves. It arrives at the bottom left, sliding half its width, and offers the one thing worth doing next — here, <em>Undo</em>. A failure is never a flag that leaves on its own: it stays as a section message where the work is.</p>')}
${sample('Money › Tax deducted, why a rate is provisional — an inline message', shell(rate, { current: '/money', label: 'Money · Tax deducted · provisional', ...who('Farhan', 'Finance') }))}`;
}

// ---------------------------------------------------------------- 9 · the three waits, where the product waits
export function loading() {
  const skelRows = Array.from({ length: 5 }, () => `<tr><td class="check"><span class="skeleton" style="width:var(--checkbox-size)"></span></td><td><span class="skeleton"></span></td><td class="num"><span class="skeleton"></span></td><td><span class="skeleton"></span></td></tr>`).join('');
  const listLoading = S.pageHead({ crumbs: ['Buying'], title: 'Orders', sub: 'loading your orders' })
    + `<div data-hero>${card(null, `<div class="toolbar lv-tb"><span class="skeleton" style="width:40%;height:var(--field-height)"></span></div><table class="tbl skel" aria-busy="true" aria-label="Orders, loading"><thead><tr><th class="check"></th><th>Order</th><th class="num">Total</th><th>Status</th></tr></thead><tbody>${skelRows}</tbody></table>`)}</div>`;
  const paneLoading = S.pageHead({ title: 'Approvals', sub: '3 orders are waiting on you · oldest first' })
    + `<div data-hero><div class="lv with-pane">${S.listView({ label: 'Approvals', search: 'Order, vendor or project', filters: [['Step', '']], cols: [{ label: 'Order', p: 1 }, { label: 'Waiting', p: 1, num: true }], rows: [['PO-0006', '7 days'], ['PO-0003', '6 days'], ['PO-0019', '3 days']].map(([n, w], i) => ({ name: n, sel: false, open: i === 2, cells: [`<a href="#">${n}</a>`, w] })), pager: L.pager({ from: 1, to: 3, total: 3, page: 1, pages: 1, unit: 'orders' }), select: false })}<aside class="pane" aria-label="PO-0019" aria-busy="true"><div class="pane-h"><div><h5 class="pane-t">PO-0019</h5><small>Prakashvahini Electrical Contracts · ANU-01</small></div></div><div class="pane-b" style="justify-items:center;padding-block:var(--space-600)">${spinner('l', 'Loading PO-0019')}</div><div class="pane-f">${busyButton('Approving')}</div></aside></div></div>`;
  const exportFlag = `<div class="flag-group"><div class="flag info" role="status">${icon('download')}<span class="t">Preparing your export</span><button class="btn icon ghost sm" type="button" aria-label="Cancel the export">${icon('x', 'i sm')}</button><div style="grid-column:2">${progress(31, { label: 'Export' })}<p style="margin-top:var(--space-075)">1,240 of 4,000 orders · keep working, it downloads when it is ready</p></div></div></div>`;
  const listDone = S.pageHead({ crumbs: ['Buying'], title: 'Orders', sub: '4,000 orders across all projects' })
    + `<div data-hero>${S.listView({ label: 'Orders', search: 'Number or vendor', filters: [['Status', '']], cols: [{ label: 'Order', p: 1 }, { label: 'Total', p: 2, num: true }], rows: L.POS.slice(0, 4).map(o => ({ name: o.number, cells: [`<a href="#">${o.number}</a><span class="sub">${esc(o.vendor.short)}</span>`, fmt(o.gross)] })), pager: L.pager({ from: 1, to: 50, total: 4000, page: 1, pages: 80, unit: 'orders' }) })}</div>`;
  return `${sample('Loading · a list the first time — a skeleton holds its shape', shell(listLoading, { current: '/buying', label: 'Buying · Orders · loading', ...who('Manjit', 'Procurement') }))}
${sample('Loading · the record beside the list, and the approval being saved — spinners', shell(paneLoading, { current: '/approvals', label: 'Approvals · loading the record', ...who('Farhan', 'Finance') }))}
${sample('Loading · an export whose size is known — a progress bar', shell(listDone, { current: '/buying', label: 'Buying · Orders · exporting', overlay: exportFlag, ...who('Manjit', 'Procurement') }))}
${note('<p><strong>Which wait gets which.</strong> A page or a list loading for the first time is a <strong>skeleton</strong> of its own shape, so nothing moves when the rows arrive. A short wait inside something already on screen — a record opening beside its list, an approval being saved — is a <strong>spinner</strong> in that place; the button keeps its size and the person keeps their place. A long job whose size is known — an export of 4,000 orders, an upload — is a <strong>progress bar</strong> that says how far it has got, and the person can keep working. An unknown amount is never a progress bar.</p>')}`;
}

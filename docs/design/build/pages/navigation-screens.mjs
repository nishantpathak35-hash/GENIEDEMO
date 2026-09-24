// pages/navigation-screens.mjs — the screens section 3 (the navigation) draws: the orders list at the firm level and inside a
// project, the same list with a record beside it for the rail, Today in each project state, and the block a
// state with no project to show stands on. The page itself is pages/navigation.mjs; this file holds what it renders.
// The projects are the seed's: SAN-01 past its contract, NCB-01 won and not started, ANU-02 handed over.
import * as L from '../shell.mjs';
import { clip } from '../cards.mjs';
import * as S from '../patterns.mjs';
import { todayHero, todayStats } from './today-to-buying.mjs';
const { esc, fmt, pill, icon, card, stat, hero, notice, sample, note, shell, labelOf2, V2, pager, R } = L;
const P = L.PEOPLE;

export const SAN = L.projectOf('SAN-01');
export const NCB = L.projectOf('NCB-01');
export const ANU2 = L.projectOf('ANU-02');
const flat = (o) => ({ number: o.number, vendor: o.vendor.short, project: o.project || null, raised: o.raised, state: o.state, gross: o.gross, deviation: !!o.deviation, born: o.born });
const POS = [L.PO_DEMO, ...L.POS].map(flat);
const ordersOn = (code) => POS.filter(o => o.project === code);
{
  const sum = ordersOn('SAN-01').reduce((s, o) => s + BigInt(o.gross), 0n);
  if (String(sum) !== SAN.committed) throw new Error(`section 3: SAN-01's orders sum to ${sum}, the project says ${SAN.committed}`);
}
const ALL_ORDERS = POS.slice(0, 12);
const WAITING = POS.filter(o => o.state === 'pending_approval').length;
const NEXT_NO = `PO-${String(Number(L.DEMO_PO.slice(3)) + 1).padStart(4, '0')}`;

// ---------------------------------------------------------------- the orders list, both ways --
const orderCols = (scoped) => [
  { label: 'Raised', p: 3, num: true, sort: 'descending' },
  { label: 'Order', p: 1, sort: false },
  { label: 'Vendor', p: 3 },
  ...(scoped ? [] : [{ label: 'Project', p: 3 }]),
  { label: 'Status', p: 2 },
  { label: 'Total', p: 2, num: true, sort: null },
  { label: 'Rates', p: 2 },
  { label: '', p: 3, clip: true },
];
const orderRow = (o, scoped) => ({
  name: o.number,
  cells: [
    o.raised, `<a href="#">${o.number}</a>`, esc(o.vendor),
    ...(scoped ? [] : [o.project ? esc(o.project) : '<span class="muted">Stock</span>']),
    labelOf2(V2.po, o.state), fmt(o.gross),
    o.deviation ? pill('warn', 'Above agreed rate') : o.born === 'BOQ' ? '<span class="muted">No agreed rate</span>' : '<span class="muted">Agreed</span>',
    clip(o.state === 'approved', 'the vendor’s acceptance'),
  ],
  alt: [o.raised, esc(o.vendor), scoped ? '' : (o.project ?? 'Stock')].filter(Boolean).join(' · '),
});
const BUY_TABS = ['Orders', 'Vendors', 'Agreed rates', 'Stock'];
export function ordersScreen(scope) {
  const scoped = !!scope;
  const mine = scoped ? ordersOn(scope) : ALL_ORDERS;
  const rows = mine.map(o => orderRow(o, scoped));
  const waiting = mine.filter(o => o.state === 'pending_approval').length;
  const head = S.pageHead({
    crumbs: S.crumbsFor(scope, 'Buying'), title: 'Orders',
    sub: scoped ? `${mine.length} orders on ${scope} · ${waiting} waiting for approval · a new order is raised against ${scope}` : `${POS.length} orders · ${WAITING} waiting for approval · next number ${NEXT_NO}`,
    primary: `<button class="btn primary" type="button">${icon('plus')}Raise an order</button>`,
    tabs: L.subtabs(BUY_TABS, 'Orders'),
  });
  const list = S.listView({
    label: 'Orders', search: 'Number or vendor', filters: [['Status', ''], ['Vendor', '']],
    cols: orderCols(scoped), rows,
    pager: pager({ from: 1, to: rows.length, total: scoped ? mine.length : POS.length, page: 1, pages: scoped ? 1 : Math.ceil(POS.length / 12), unit: 'orders' }),
  });
  return head + `<div data-hero>${list}</div>`;
}


// ---------------------------------------------------------------- the sidebar, in sections --
let SHEET_UID = 0;
function navSheet({ current, label, scope, who = P.proc.first, role = P.proc.role }) {
  const id = `nsheet-t-${++SHEET_UID}`;
  return `<div class="psheet nsheet" role="dialog" aria-modal="true" aria-labelledby="${id}"><div class="psheet-h"><b id="${id}">Menu</b><button class="btn icon ghost" type="button" aria-label="Close the menu">${icon('x')}</button></div>
<nav class="side-nav" aria-label="Main">${L.sideNav({ current, label, scope })}</nav>
<div class="nsheet-foot"><nav class="side-nav" aria-label="Secondary"><a href="#" title="Settings">${icon('cog')}<span class="nav-t">Settings</span>${scope ? `<span class="firm">firm<span class="sr-only">’s, not narrowed to ${esc(scope)}</span></span>` : ''}</a></nav></div></div>`;
}
// the orders list with the demo's order open beside it, for the rail
export function ordersScreenPane() {
  const rows = ALL_ORDERS.map(o => orderRow(o, false)).slice(0, 5);
  const head = S.pageHead({ crumbs: ['Buying'], title: 'Orders', sub: `${POS.length} orders · ${WAITING} waiting for approval` });
  const list = S.listView({ label: 'Orders', search: 'Number or vendor', filters: [['Status', '']], cols: orderCols(false).slice(0, 2), rows: rows.map(r => ({ ...r, cells: r.cells.slice(0, 2) })), pager: pager({ from: 1, to: 5, total: POS.length, page: 1, pages: Math.ceil(POS.length / 5), unit: 'orders' }) });
  const pane = `<aside class="pane" aria-label="${L.DEMO_PO}"><div class="pane-h"><div><div class="pane-t">${L.DEMO_PO}</div><small>${esc(L.V.Prakashvahini.short)} · ${L.OPEN}</small></div></div><div class="pane-b"><p class="ps">The order stays open beside the list while Money’s pages are open over the page.</p></div></aside>`;
  return head + `<div data-hero><div class="lv with-pane">${list}${pane}</div></div>`;
}

// ---------------------------------------------------------------- Today, state by state --
export const todayHead = (scope, sub, { name = P.admin.first, acts = true } = {}) => S.pageHead({
  crumbs: scope ? [esc(scope)] : [], title: `Good morning, ${name}`, sub,
  actions: acts ? `<button class="btn" type="button">${icon('plus')}New project</button>` : '',
  primary: acts ? `<button class="btn primary" type="button">${icon('plus')}Raise an order</button>` : '',
});
const heldOn = (code) => L.BLOCKED.filter(b => b.project === code);
const heldElsewhere = (code) => L.BLOCKED.filter(b => b.project !== code);
const owed = (html) => `<div class="owed" role="note">${icon('inbox')}<span>${html}</span><a href="#" class="btn sm">See them across all projects</a></div>`;
const dayList = (items) => `<ul class="list day">${items.map(([t, who, due, today]) => `<li><span class="kind" aria-hidden="true"></span><div>${esc(t)}<small>${esc(who)}</small></div><span class="when ${today ? 'today' : ''}">${esc(due)}</span></li>`).join('')}</ul>`;
const tasksOn = (code) => L.TASK_ROWS.filter(t => !t.done && t.project === code).map(t => [t.t, t.who, t.due, t.due === 'Today' || t.overdue]);
const codes = (list) => [...new Set(list.map(b => b.project))].join(' and ');
const latestReport = (code) => [...L.SEED.DAILY_REPORTS].filter(r => r.project === code).sort((a, b) => (a.date < b.date ? 1 : -1))[0];

export function todayAll() {
  const past = [...L.PROJECTS].filter(p => p.health === 'over-budget').sort((a, b) => b.sharePct - a.sharePct);
  const look = [...past.map(p => [p.code, `ordered past its contract by ${fmt(String(BigInt(p.committed) - BigInt(p.contract)))}`]), ...L.PROJECTS.filter(p => p.health === 'no-budget').map(p => [p.code, 'no contract value entered yet'])];
  return todayHead(null, `across all ${L.PROJECTS.length} projects — the one thing that needs you, then everything else`) + `<div class="grid"><div data-hero class="c12">${todayHero()}</div>` + todayStats()
    + `${card('Your day', dayList(L.TASK_ROWS.filter(t => !t.done).slice(0, 5).map(t => [t.t, t.who, t.due, t.due === 'Today' || t.overdue])), { cls: 'c6' })}${card('Projects to look at', `<ul class="list">${look.map(([c, t]) => `<li><div><a href="#">${c}</a><small>${esc(t)}</small></div><a href="#" class="u-sm">Work in ${c}</a></li>`).join('')}</ul>`, { cls: 'c6' })}</div>`;
}
export function todaySan() {
  const p = SAN; const held = heldOn(p.code); const elsewhere = heldElsewhere(p.code);
  const over = String(BigInt(p.committed) - BigInt(p.contract));
  const trades = [...new Set(ordersOn(p.code).map(o => L.SEED.orderByNumber(o.number).section.toLowerCase()))];
  return todayHead(p.code, `${esc(p.name)} — what on it needs you, then the rest`)
    + owed(`<b>Waiting elsewhere:</b> ${L.TASK_ROWS.filter(t => !t.done && t.due === 'Today' && t.project !== p.code).length} tasks of yours due today, and ${elsewhere.length} approvals holding ${fmt(L.add(...elsewhere.map(b => b.amount)))} — on ${codes(elsewhere)}.`)
    + `<div data-hero>${hero({ eyebrow: `${p.code} · ${L.TODAY_LONG}`, value: `${p.sharePct.toFixed(0)}%`, unit: 'of the contract ordered', text: `<b>${fmt(p.committed)}</b> ordered against a contract of <b>${fmt(p.contract)}</b> — past it by <b>${fmt(over)}</b>, GST included, with ${trades.slice(0, -1).join(', ')} and ${trades.slice(-1)} bought. The seed shapes these orders to 88% before GST; the product sums them gross.`, delta: `<b>past the contract</b> by ${fmt(over)}`, tone: 'watch', cls: 'watch', bar: { w: Math.min(100, p.sharePct), x: 85, label: `${fmt(p.committed)} of ${fmt(p.contract)}`, thrLabel: '85% — watch closely' }, actions: '<a href="#" class="btn primary lg">Open the orders</a><a href="#" class="btn lg">Raise a variation</a>' })}</div>`
    + `<div class="stats">${stat('Held by an approval', fmt(L.add(...held.map(b => b.amount))), { delta: `<b>${held.map(b => b.number).join(', ')}</b> with ${esc(P.finance.first)} · oldest ${Math.max(...held.map(b => b.days))} days`, tone: 'watch' })}${stat('Client billing', fmt(L.SEED.INVOICES.filter(i => i.project === p.code).reduce((a, i) => a + BigInt(i.balance), 0n).toString()), { delta: `<b>${L.SEED.INVOICES.find(i => i.project === p.code).number}</b> · ${L.daysAgo(L.SEED.INVOICES.find(i => i.project === p.code).expectedOn)} days past its expected date`, tone: 'watch' })}${stat('Daily report', 'Never filed', { txt: true, delta: `no report on <b>${p.code}</b> yet` })}</div>`
    + `<div class="two">${card(`Your day on ${p.code}`, dayList(tasksOn(p.code)))}${card('From site', `<ul class="list"><li><div>No daily report has been filed on ${p.code}<small>the site has not reported yet</small></div><span></span></li></ul>`)}</div>`;
}
export function todayNcb() {
  const p = NCB; const elsewhere = heldElsewhere(p.code); const rep = latestReport(p.code);
  return todayHead(p.code, `${esc(p.name)} — won; nothing on it needs you this morning`)
    + owed(`<b>Waiting elsewhere:</b> ${L.TASK_ROWS.filter(t => !t.done && t.due === 'Today' && t.project !== p.code).length} tasks of yours due today, and ${elsewhere.length} approvals holding ${fmt(L.add(...elsewhere.map(b => b.amount)))} on ${codes(elsewhere)}.`)
    + `<div data-hero>${hero({ eyebrow: `${p.code} · ${L.TODAY_LONG}`, value: fmt(p.committed), text: `ordered against a contract of <b>${fmt(p.contract)}</b> — ${p.sharePct.toFixed(0)}%, before the site opens. Nothing on ${p.code} is waiting for you.`, delta: `<b>${p.orders}</b> orders · none waiting`, actions: `<a href="#" class="btn primary lg">Open ${p.code}</a>` })}</div>`
    + `<div class="stats">${stat('Held by an approval', 'Nothing', { txt: true, delta: 'every order is approved or not yet sent' })}${stat('Open site issues', '0', { delta: 'none raised on this site' })}${stat('Latest daily report', L.dueWord(rep.date), { txt: true, delta: `<b>${rep.manpower.reduce((n, m) => n + m.headCount, 0)}</b> on site` })}</div>`;
}
export function todayAnu2() {
  const p = ANU2; const held = heldOn(p.code); const inv = L.SEED.INVOICES.find(i => i.project === p.code);
  return S.pageHead({ crumbs: [p.code], title: 'Overview', sub: `${esc(p.name)} — handed over; the defects period is running`, actions: `<button class="btn" type="button">${icon('download')}Export</button>` })
    + notice('info', `Read-only · handed over on ${L.longDate(L.SEED_DAY)}`, `Snags, final bills and retention are still worked from here, from Money. Nothing else on ${p.code} can be raised or changed; everything stays readable and exportable.`)
    + `<div data-hero>${hero({ eyebrow: `${p.code} · after handover`, value: fmt(inv.total), text: `the final bill on handover, <b>${inv.number}</b>, invoiced ${L.dayDate(inv.invoiceDate)} and received in full on ${L.dayDate(inv.receivedOn)}. No retention is held on this project.`, delta: `<b>${fmt(inv.balance)}</b> still due`, actions: `<a href="#" class="btn primary lg">Open client billing on ${p.code}</a>` })}</div>`
    + `<div class="stats">${stat('Open snags', '0', { delta: 'none raised on this site' })}${stat('Still waiting for approval', `${held.length}`, { delta: held.length ? `<b>${held[0].number}</b> with ${esc(P.finance.first)} · ${held[0].days} days — raised before handover` : 'nothing', tone: held.length ? 'watch' : '' })}${stat('Due from the client', fmt(inv.balance), { delta: `final invoice · <b>${inv.number}</b> · paid` })}</div>`;
}
// the states with no project to show — the switcher cannot name what the server would not
export const stateBlock = (tone, title, body, actions, subject = null) => `<div data-hero>${L.empty(subject || (tone === 'bad' ? 'error' : 'not-found'), title, body, actions.replace(' lg', ''))}</div>`;

// panels.mjs — the panels Today and Overview carry (19 September 2026, the grid), each a card on the dashboard grid
// (css-shell: `.grid`, one 48px header, the figure scale), each on the chart grammar (charts.mjs), each with its
// value line — the sentence, in the client's words, that says what a director does after looking at it. Every figure
// is the seed's (seed.mjs), derived by the product's rules; where the seed cannot produce a panel's data the panel is
// drawn ABSENT in product words and the gap is recorded in VALUE-MAP and the README — never a number invented, and
// never a marker on the screen.
import * as L from './shell.mjs';
import { columns, parts, meters, lines } from './charts.mjs';
import { tile, oweCard, cardHead, moneyIn, moneyOut, moneyOverdue } from './cards.mjs';
import { hrefFor } from './files.mjs';
const { esc, fmt, icon, money, pill } = L;
const S = L.SEED;
const DAY = L.SEED_DAY;

// ---------------------------------------------------------------- the value lines --
export const VALUE = {
  hero: 'The one figure that needs you this morning, and whose door to knock on.',
  margin: 'Raise a variation or renegotiate the rate before the next order goes out on a project already past its cost budget.',
  payables: 'Decide what gets paid on Friday, with what is already overdue in front of you.',
  overdue: 'Who to call today — the overdue money by how long it has been overdue.',
  unsigned: 'Work done that cannot be billed until the client signs — chase the signature, not the site.',
  orderedBilled: 'Where this project stands: how much of the contract is ordered, and how much of it is billed.',
  receivables: 'What clients still owe, and how much of it is already late.',
  totalPayables: 'What the firm owes vendors, and how much of it is already late.',
  moneyInOut: 'The trend of money coming in against money going out, month by month, without a bank feed.',
  cash: 'Cash by account is drawn from Tally once the connector is linked — until then the panel says so, and nothing is estimated.',
  ordered: 'Every project against its own contract at a glance, the one past it printed, not coloured.',
  milestones: 'Which site slips before the client notices — the stages due or slipping this week.',
  site: 'A site with no report is the first sign of a problem: which sites reported, who was on them, what is open.',
  yourDay: 'The five things on your list, the overdue ones marked.',
  spend: 'Which trades your money is going to, so the one running away is obvious before it is over.',
  pipeline: 'What is coming: the quotes a client is sitting on, and what is worth the site visit this month.',
  team: 'Who is on this project, and who signs for the client.',
};

// ---------------------------------------------------------------- helpers --
// a header's one action: its word, and under 1000px its icon in the word's place (a plus to add, an arrow to open)
const act = (href, text) => `<a href="${href}" class="btn sm act" aria-label="${esc(text)}">${icon(/^New /.test(text) ? 'plus' : 'right', 'i sm fold')}<span>${esc(text)}</span></a>`;
// the period picker: its label, and on a phone its calendar icon in the label's place (the header stays one line)
const period = (label) => `<button class="fbtn period" type="button" aria-haspopup="dialog" aria-label="Period: ${esc(label)}">${icon('calendar', 'i sm cal')}<span>${esc(label)}</span>${icon('chevron', 'i sm')}</button>`;
const panel = ({ title, help, action = '', body, cls = '', span = 'c6', module = '', disc = null }) =>
  `<section class="card ${span}${cls ? ' ' + cls : ''}"${module ? ` data-module="${module}"` : ''}>${cardHead(title, { help, action, disc })}<div class="card-b">${body}</div></section>`;
// an absent panel: the reason in product words, one action — the product's copy, not the document's
const absent = (text, action = '') => `<div class="absent"><p>${text}</p>${action}</div>`;
// overdue money in ageing buckets: 1–30 · 31–60 · 60+ days past the date it was due
export const ageBuckets = (items, dueKey, valueKey) => {
  const b = [0n, 0n, 0n];
  for (const it of items) { const d = L.daysAgo(it[dueKey]); if (d <= 0) continue; b[d <= 30 ? 0 : d <= 60 ? 1 : 2] += BigInt(it[valueKey]); }
  return b.map(String);
};
const inProgress = () => S.PROJECTS.filter(p => p.state === 'in_progress');
const projects = (project) => (project ? L.PROJECTS.filter(p => p.code === project) : L.PROJECTS);
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// ================================================================ row 1: the four tiles ==
// Margin at risk — approved orders past the BOQ's cost budget (margin.ts); the bar is the budget against what is approved
export function marginTile({ project = null } = {}) {
  const ps = projects(project);
  const leaking = ps.filter(p => p.atRisk !== '0');
  const over = L.add('0', ...leaking.map(p => p.atRisk));
  const budget = L.add('0', ...ps.filter(p => p.contract).map(p => p.costBudget));
  const pct = BigInt(budget) > 0n ? Math.min(100, L.pct(budget, L.add(budget, over))) : 0;
  const partial = ps.filter(p => p.marginStatus === 'partial').length;
  return tile({ title: 'Margin at risk', help: 'Approved orders past what the BOQ says the work should cost — the cost budget, derived from cost rates and never typed in. A budget with unpriced lines is partial and says so',
    figure: money(over), meaning: leaking.length ? `approved past the cost budget on ${leaking.map(p => `<b>${esc(p.code)}</b>`).join(', ')}${partial ? ` · ${plural(partial, 'budget')} partial` : ''}` : `nothing approved past a cost budget${partial ? ` · ${plural(partial, 'budget')} partial` : ''}`,
    bar: BigInt(over) > 0n ? { kind: 'short', pct, label: 'the cost budget against what is approved — the short part is past it' } : null,
    action: act(hrefFor('7'), 'Orders') });
}
// Payables this week — bills acknowledged and falling due today to Sunday; what is already overdue beneath
export function payablesTile({ project = null } = {}) {
  const inP = (b) => !project || b.project === project;
  const week = S.PAYABLES.thisWeek.filter(inP), over = S.PAYABLES.overdue.filter(inP), ack = S.PAYABLES.toAcknowledge.filter(inP);
  const weekT = L.add('0', ...week.map(b => b.claimed)), overT = L.add('0', ...over.map(b => b.claimed));
  return tile({ title: 'Payables this week', help: 'Bills acknowledged and falling due from today to Sunday, gross; anything already overdue beneath. The cash side is absent until Tally is linked, so nothing here is netted against it',
    figure: money(weekT), meaning: week.length ? `${plural(week.length, 'bill')} · <b>${esc(week[0].vendorShort)}</b>, ${esc(L.dayDate(week[0].dueOn))}` : 'nothing falls due this week',
    split: [['Overdue', moneyOverdue(overT), true], ['To acknowledge', fmt(L.add('0', ...ack.map(b => b.claimed)))]],
    action: act(hrefFor('9'), 'Bills') });
}
// Overdue receivables — the overdue total, a strip of the three ageing buckets, the buckets printed beneath
export function overdueTile({ project = null } = {}) {
  const overdue = S.RECEIVABLES.open.filter(i => i.overdue && (!project || i.project === project));
  const b = ageBuckets(overdue, 'expectedOn', 'balance'); const total = L.add(...b);
  return tile({ title: 'Overdue receivables', help: 'Tax invoices whose expected date has passed, by how long ago it passed',
    figure: money(total), meaning: overdue.length ? `${plural(overdue.length, 'invoice')} · <b>${esc(overdue[0].clientShort)}</b>, ${L.daysAgo(overdue[0].expectedOn)} days past its expected date` : 'nothing past its expected date',
    strip: BigInt(total) > 0n ? { current: '0', buckets: b, total, label: 'overdue by 1 to 30, 31 to 60 and over 60 days' } : null,
    split: [['1–30 days', moneyOverdue(b[0]), true], ['31–60 days', moneyOverdue(b[1]), true], ['60+ days', moneyOverdue(b[2]), true]],
    action: act(hrefFor('9'), 'Client billing') });
}
// Unsigned variations — the value awaiting the client's signature, the count. The seed records no sent date, so
// there is no “oldest” to print (VALUE-MAP records the gap)
export function unsignedTile({ project = null } = {}) {
  const cos = Object.values(S.CHANGE_ORDERS).flat().filter(c => c.state === 'pending_client' && (!project || c.project === project));
  const total = L.add('0', ...cos.map(c => c.costImpact));
  const who = cos.length ? L.projectOf(cos[0].project).clientShort : '';
  return tile({ title: 'Unsigned variations', help: 'Variations sent to the client for sign-off and not yet signed — work that cannot be billed until they are',
    figure: money(total), meaning: cos.length ? `${plural(cos.length, 'variation')} · <b>${esc(cos[0].project)}</b> · with ${esc(who)} for signature` : 'nothing waiting on a signature',
    action: act(hrefFor('6'), 'Variations'), module: 'change_orders' });
}
// Overview's first tile: the project's contract, what is ordered against it, what is billed to the client so far
export function orderedBilledTile(p) {
  const billed = L.add('0', ...S.INVOICES.filter(i => i.project === p.code).map(i => i.total));
  const orderedPct = L.pct(p.committed, p.contract), billedPct = L.pct(billed, p.contract);
  return tile({ title: 'Ordered and billed', help: 'The contract value, what has been ordered from vendors against it so far, and what has been billed to the client so far',
    figure: `${orderedPct.toFixed(0)}%`, meaning: `ordered · <b>${billedPct.toFixed(0)}%</b> billed to ${esc(p.clientShort)}`,
    bar: { kind: 'ratio', pct: Math.min(100, orderedPct), label: `${orderedPct.toFixed(0)}% of the contract ordered` },
    split: [['Contract', fmt(p.contract)], ['Ordered', fmt(p.committed)], ['Billed', fmt(billed)]],
    action: act(hrefFor('7'), 'Orders') });
}
// a row of tiles spans by its count — four at 3, three at 4, two at 6 — so a module switched off re-flows the row
export const tilesRow = (tiles) => { const span = tiles.length === 4 ? 'c3' : tiles.length === 3 ? 'c4' : tiles.length === 2 ? 'c6' : 'c12'; return tiles.map(t => t.replace(/class="card tile c\d+"/, `class="card tile ${span}"`)).join(''); };

// ================================================================ row 2: the two money cards ==
export function receivablesCard({ span = 'c6' } = {}) {
  const R = S.RECEIVABLES; const overdueOnes = R.open.filter(i => i.overdue);
  return oweCard({ title: 'Total receivables', help: 'What clients still owe on tax invoices raised — current, then overdue by how long', total: R.due, current: R.current, buckets: ageBuckets(overdueOnes, 'expectedOn', 'balance'), span,
    action: act(hrefFor('9'), 'New invoice'),
    note: `${plural(R.open.length, 'invoice')} unpaid${overdueOnes.length ? ` · ${overdueOnes.map(i => `${i.number} is ${i.daysPast ?? L.daysAgo(i.expectedOn)} days past its expected date`).join(' · ')}` : ''}` });
}
export function payablesCard({ span = 'c6' } = {}) {
  const P = S.PAYABLES; const unpaid = [...P.overdue, ...P.thisWeek, ...P.nextWeek, ...P.later];
  const current = L.add('0', ...[...P.thisWeek, ...P.nextWeek, ...P.later].map(x => x.claimed));
  return oweCard({ title: 'Total payables', help: 'What is owed to vendors on bills acknowledged and unpaid — current, then overdue by how long', total: P.total, current, buckets: ageBuckets(P.overdue, 'dueOn', 'claimed'), span,
    action: act(hrefFor('9'), 'New bill'),
    note: `${plural(unpaid.length, 'bill')} unpaid · ${P.overdue.length} past due · ${P.toAcknowledge.length} not yet acknowledged` });
}

// ================================================================ row 3: money in and out, and cash ==
// receipts recorded against invoices, and payments recorded against bills (net: what left), by month of the financial
// year to date — the product has receipts and payments and no cash book, and the caption says so
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fyMonths = () => { const y = DAY.slice(0, 4), out = []; for (let m = 4; m <= Number(DAY.slice(5, 7)); m++) out.push(`${y}-${String(m).padStart(2, '0')}`); return out; };
export function moneyInOut({ project = null, span = 'c8' } = {}) {
  const months = fyMonths();
  const inv = S.INVOICES.filter(i => !project || i.project === project), pay = S.PAYMENTS.filter(p => !project || p.project === project);
  const collected = months.map(m => L.add('0', ...inv.filter(i => i.receivedOn && i.receivedOn.startsWith(m)).map(i => i.received)));
  const paid = months.map(m => L.add('0', ...pay.filter(p => p.on.startsWith(m)).map(p => p.net)));
  const inT = L.add(...collected), outT = L.add(...paid), net = String(BigInt(inT) - BigInt(outT));
  const labels = months.map(m => MONTH_NAMES[Number(m.slice(5, 7)) - 1]);
  const body = `<div class="chart-with-figs"><figure class="chart line"><p class="sr-only">Money in and out by month, ${esc(L.FY)}: ${labels.map((l, i) => `${l} collected ${fmt(collected[i])}, paid out ${fmt(paid[i])}`).join('; ')}.</p>${lines({ labels, series: [{ name: 'Collected', cls: 's1', values: collected }, { name: 'Paid out', cls: 's2', values: paid }], hover: months.length - 2 })}</figure>
<dl class="cash-figs"><div><dt>Collected</dt><dd>${moneyIn(inT)}</dd></div><div><dt>Paid out</dt><dd>${moneyOut(outT)}</dd></div><div><dt>Net</dt><dd>${fmt(net)}</dd></div></dl></div>
<p class="hint">Receipts recorded against invoices and payments recorded against bills, net of TDS and retention — not a bank statement.</p>`;
  return panel({ title: 'Money in and out', help: 'Receipts recorded against tax invoices, and payments recorded against bills, by month of the financial year — what came in against what went out, as the product records it', action: period(`FY ${S.FY}`), body, span });
}
// Cash by account — absent until the Tally connector is linked; the product's words, one action
export function cashAbsent({ span = 'c4' } = {}) {
  return panel({ title: 'Cash by account', help: 'The balance on each bank and cash account, from the accounts once the Tally connector is linked', action: period('This month'),
    body: absent('Cash position arrives from Tally once the connector is linked. Until then this panel stays empty rather than estimate.', `<a href="${hrefFor('11')}" class="btn">Connect Tally</a>`), span });
}

// ================================================================ row 4: ordered against contract, milestones ==
export function orderedCard({ span = 'c6' } = {}) {
  const share = (p) => (p.contract ? Number((BigInt(p.committed) * 10000n) / BigInt(p.contract)) / 100 : null);
  const sorted = [...L.PROJECTS].sort((a, b) => (share(b) ?? -1) - (share(a) ?? -1));
  const body = meters({ rows: sorted.map(p => ({ code: p.code, name: p.name, contract: p.contract, committed: p.committed, share: share(p) })),
    legendItems: [['track', 'Contract'], ['', 'Ordered so far'], ['over', 'Past the contract'], ['thr', '85%, watch closely']],
    sr: esc(sorted.map(p => `${p.code}: ${fmt(p.committed)} ordered` + (p.contract ? ` of ${fmt(p.contract)}` : ', no contract value')).join('. ')) + '.' });
  return panel({ title: 'Ordered against contract', help: 'Every order not cancelled, gross, against each project’s own contract value; the watch line at 85%', action: act(hrefFor('6'), 'Projects'), body, span });
}
// Milestones this week — the seed's agreement stages carry no dates, so nothing is due or slipping: the absent state
export function milestonesCard({ project = null, span = 'c6' } = {}) {
  const stages = project ? S.DESIGN_BUILD[project].stages : null;
  const list = stages ? `<ul class="list day">${stages.map(s => `<li><span class="kind" aria-hidden="true"></span><div>${esc(s.name)}<small>${esc(s.trigger)} · ${(s.shareBp / 100).toFixed(0)}% of the contract</small></div><span class="when">no date yet</span></li>`).join('')}</ul>` : '';
  return panel({ title: 'Milestones this week', help: 'The agreement stages due or slipped this week, by project, once each stage carries a date',
    action: act(hrefFor('6'), 'Stages'), body: list + absent(project ? 'No stage on this project has a date yet. Give each stage a date and the ones due or slipping this week show here.' : 'No milestone dates yet. Give each project’s agreement stages a date and the ones due or slipping this week show here, by project.'), span });
}

// ================================================================ row 5: site today, your day ==
// Site today — which sites reported and when, head count by day, the open issues with the blocking one named
export function siteCard({ project = null, span = 'c6' } = {}) {
  const sites = project ? S.PROJECTS.filter(p => p.code === project) : inProgress();
  const reports = S.DAILY_REPORTS.filter(r => sites.some(p => p.code === r.project));
  const latest = reports.map(r => r.date).sort().slice(-1)[0] ?? null;
  const today = reports.filter(r => r.date === DAY); const onLatest = latest ? reports.filter(r => r.date === latest) : [];
  const reported = new Set(onLatest.map(r => r.project));
  const days = [...new Set(reports.map(r => r.date))].sort();
  const counts = days.map(d => reports.filter(r => r.date === d).reduce((n, r) => n + r.manpower.reduce((m, x) => m + x.headCount, 0), 0));
  const issues = S.ISSUES.filter(i => i.open && sites.some(p => p.code === i.project)); const blocking = issues.filter(i => i.severity === 'blocking');
  const max = Math.ceil(Math.max(...counts, 1) / 20) * 20 || 20; const step = max / 4;
  const when = latest ? esc(L.dueWord(latest).toLowerCase()) : '';
  const lead = project
    ? `<p class="lead-line"><b>${today.length ? 'Reported' : 'Not yet reported'}</b> today${latest && !today.length ? ` · last report ${when}` : ''}</p>`
    : `<p class="lead-line"><b>${new Set(today.map(r => r.project)).size} of ${sites.length}</b> sites reported today${latest && !today.length ? ` · <b>${reported.size} of ${sites.length}</b> ${when}` : ''}</p>`;
  const cols = days.length ? columns({ label: project ? `On site at ${project}, by day` : 'On site, all sites, by day', unit: 'people', labels: days.map(d => L.dayDate(d).slice(0, 3)), series: [{ name: 'On site', cls: 's1', values: counts }], max, step, hover: Math.max(0, counts.length - 2), tick: v => String(v), full: v => `${v} on site`, cls: 'short' }) : '';
  const rows = project ? '' : `<ul class="site-rows">${sites.map(p => `<li><b>${esc(p.code)}</b><span class="${reported.has(p.code) ? '' : 'no'}">${reported.has(p.code) ? `reported ${when}` : 'not reported'}</span></li>`).join('')}</ul>`;
  const iss = `<p class="issues-line"><b>${issues.length}</b> open issue${issues.length === 1 ? '' : 's'}${blocking.length ? ` · <b>${blocking.length} blocking</b>: ${esc(blocking[0].title)} (${esc(blocking[0].project)})` : ''}</p>`;
  return panel({ title: project ? 'Site this week' : 'Site today', help: 'From the daily reports filed by site engineers, and the issues open on site — a site with no report is the first sign of a problem', action: act(hrefFor('8'), 'Reports'), body: lead + cols + rows + iss, span, module: 'operations' });
}
// Your day — the list, sized to its content; a task dated in the past carries the overdue lozenge
export function yourDayCard({ span = 'c6' } = {}) {
  const rows = L.TASK_ROWS.filter(t => !t.done).slice(0, 5);
  const body = `<ul class="list day">${rows.map(t => `<li><span class="kind" aria-hidden="true"></span><div>${esc(t.t)}<small>${esc(t.who)}</small></div><span class="when ${t.due === 'Today' ? 'today' : ''}">${t.overdue ? pill('warn', 'Overdue') + ' ' : ''}${esc(t.due)}</span></li>`).join('')}</ul>`;
  return panel({ title: 'Your day', help: 'Tasks people gave you, and the ones the product raised, due soonest first', action: act(hrefFor('9'), 'All tasks'), body, span });
}

// ================================================================ row 6: spend by trade, pipeline ==
export function spendByTrade({ span = 'c6' } = {}) {
  const body = parts({ label: 'Ordered by trade package', items: L.BY_TRADE.map(([t, v]) => [t, v]), top: 5 });
  return panel({ title: 'Spend by trade package', help: 'Every order not cancelled, gross, by the trade package it belongs to — the top five and the rest', action: period(`FY ${S.FY}`), body, span });
}
// Pipeline — the quotes a client is sitting on, and the leads with a next step this month. The seed records no
// expected close date, so “closing this month” is not drawn (VALUE-MAP records the gap)
export function pipelineCard({ span = 'c6' } = {}) {
  const open = L.LEADS.filter(l => !['won', 'unqualified', 'rejected'].includes(l.stage));
  const quoted = open.filter(l => l.stage === 'proposal_shared');
  const soon = open.filter(l => l.nextOn && l.nextOn.startsWith(DAY.slice(0, 7)));
  const body = `<b class="fig">${money(L.add('0', ...quoted.map(l => l.value)))}</b><p class="meaning">${plural(quoted.length, 'quote')} awaiting a client’s decision${quoted.length ? ` · <b>${quoted.map(l => esc(l.short)).join('</b>, <b>')}</b>` : ''}</p>
<dl class="owe-split"><div><dt><span class="caps">Next step this month</span></dt><dd>${plural(soon.length, 'lead')} · ${fmt(L.add('0', ...soon.map(l => l.value)))}</dd></div><div><dt><span class="caps">Open pipeline</span></dt><dd>${fmt(L.PIPELINE_TOTAL)} · ${plural(open.length, 'lead')}</dd></div></dl>
<p class="hint">Closing this month shows here once each lead carries an expected close date.</p>`;
  return panel({ title: 'Pipeline', help: 'The open leads: the quotes shared and not yet decided, the next steps dated this month, and the whole pipeline unweighted', action: act(hrefFor('5'), 'Sales'), body, span, module: 'crm', cls: 'tile' });
}

// ================================================================ the team (Overview) ==
export function teamCard({ span = 'c4' } = {}) {
  const TEAM = [...L.STAFF.map(p => [p.name, p.role, p.initials[0]]), [L.CLIENT_LOGIN.name, 'Client', L.CLIENT_LOGIN.name[0]]];
  const body = `<ul class="list">${TEAM.map(([n, r, i]) => `<li><span class="who"><span class="avatar">${esc(i)}</span><span><b>${esc(n)}</b> ${esc(r.toLowerCase())}</span></span></li>`).join('')}</ul>`;
  return panel({ title: 'Team', help: 'Everyone on this project, and the client’s sign-off', action: act(hrefFor('6'), 'Team'), body, span });
}

// the grammar page's anatomy specimen (01-components): billed against collected by month — the seed's invoices and
// receipts as a grouped column chart in a card with a period picker (it was Today's until the grid)
const MONTH_LABEL = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
export function billedCollected({ cls = '', project = null } = {}) {
  const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
  const inv = S.INVOICES.filter(i => project === null || i.project === project);
  const billed = months.map(m => inv.filter(i => i.invoiceDate.startsWith(m)).reduce((s, i) => s + BigInt(i.total), 0n));
  const collected = months.map(m => inv.filter(i => i.receivedOn && i.receivedOn.startsWith(m)).reduce((s, i) => s + BigInt(i.received), 0n));
  const toL = v => Number(v / 100000n) / 100;
  const totals = { Billed: fmt(String(billed.reduce((a, b) => a + b, 0n))), Collected: fmt(String(collected.reduce((a, b) => a + b, 0n))) };
  const body = columns({ label: 'Billed against collected', unit: 'rupees', labels: MONTH_LABEL, series: [{ name: 'Billed', cls: 's1', values: billed.map(toL) }, { name: 'Collected', cls: 's3', values: collected.map(toL) }],
    max: 200, step: 50, hover: 4, tick: v => (v === 0 ? '0' : `₹${v}L`), full: v => fmt(String(BigInt(Math.round(v * 100000)) * 100n)), totals, cls: 'cat' + (cls ? ' ' + cls : '') });
  return `<section class="card">${cardHead('Billed against collected', { help: 'What was billed against what actually came in, month by month', action: period(`FY ${S.FY}`) })}<div class="card-b">${body}</div></section>`;
}

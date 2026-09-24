// pages/money.mjs — section 9, Approvals, Tasks and Money, redrawn against what shipped.
//
// The design last drew Money as one setup card with no figure on it, because a chartered accountant had not
// signed the rules off. The product has moved past that: ADR-0014's addendums of 15 September move the CA gate
// from the build to the statutory OUTPUT. Every screen computes; a rate on screen says Provisional; a generated
// statutory document says "Draft: provisional rates"; an individual figure carries no banner; a statutory output
// resting on a provisional row is refused unless the deployment was told to produce drafts, and never reaches
// Tally. The five Money screens below are the shipped five, drawn to that rule and to the one list pattern.
import * as L from '../shell.mjs';
import * as S from '../patterns.mjs';
import { hrefFor } from '../files.mjs';
import { ageBuckets } from '../panels.mjs';
import { oweCard, moneyIn, moneyOut, clip, paneTools } from '../cards.mjs';
const { esc, fmt, pill, icon, card, stat, notice, sample, note, shell, labelOf2, V2, pager, R, add, field, moneyField, notes, tag } = L;

Object.assign(L.VALUE_LINES, {
  'Money › Bills — what is due': 'Know what you owe this week and to whom, before the vendor rings to ask — and pay it from the same screen.',
  'Money › Bills, one to acknowledge': null,
  'Money › Bills — a row clicked': null,
  'Money › Payments — a row clicked': null,
  'Money › Client billing — a row clicked': null,
  'Money › Retention — a row clicked': null,
  'Money › Payments': 'See what actually left the bank for each bill, and what was held back for tax and for retention, under which section.',
  'Money › Tax deducted — the challan': 'The month’s challan and the quarter’s 26Q built from the payments you already recorded — not rebuilt in a spreadsheet the night before they are due.',
  'Money › Tax deducted, before the TAN': null,
  'Money › Tax deducted, refused': null,
  'Money › Client billing': 'Raise the invoice against the contract, and know the day each client is due to pay.',
  'Money › Retention': 'Know how much of each vendor’s money you are still holding, and release it as a proper payment rather than a line in somebody’s notebook. Not the exciting screen — the one that keeps the books straight at handover.',
});

const MONEY_TABS = ['Bills', 'Payments', 'Tax deducted', 'Client billing', 'Retention'];
const moneyHead = (title, sub, current, { primary = '', actions = '' } = {}) => S.pageHead({ crumbs: ['Money'], title, sub, primary, actions, tabs: L.subtabs(MONEY_TABS, current) });
const check = (label, got, want) => { if (String(got) !== String(want)) throw new Error(`section 9 fixture: ${label} is ${got}, want ${want}`); };
const sum = (xs) => add(...xs);
const figure = (wire) => `<div class="figbox"><div class="fig">${fmt(wire)}</div></div>`;
const kv = (rows) => `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
const provisional = (yes) => pill(yes ? 'warn' : 'ok', yes ? 'Provisional' : 'Verified');
const DRAFT = (what) => notice('warn', 'Draft: provisional rates', `The tax on this ${what} was worked out from values a chartered accountant has not yet verified. Unless drafts are switched on, it is refused — and a draft is never sent to Tally.`);
// the action row (19 September 2026, one rule): docked at the foot of the pane; the primary at the far right, a
// secondary beside it, the destructive action as a subtle button at the far left — its label says what it does
const paneFoot = (primary, { note: n = '', danger = '', secondary = '' } = {}) => `<div class="ffoot">${danger}<span class="spacer"></span>${n ? `<span class="ffoot-n">${n}</span>` : ''}${secondary}${primary}</div>`;

// ================================================================ fixtures — the seed's money, as the product computes it
// Nine bills the vendors sent from the portal against the money step's five orders on ANU-01; five paid, three
// acknowledged with a due date, one still to acknowledge. Every figure below is derived in build/seed.mjs from
// scripts/seed-demo.mjs @ c6ef045 by the product's own rules — GST heads to the paise, the invoice total to the
// rupee (Sec 170), TDS from the provisional catalogue, the challan to ten rupees (Sec 288B) — and checked here.
const SEED = L.SEED;
const P = L.PEOPLE;
const FY = SEED.FY;
const d = (iso) => iso;   // dates print as the product stores them, YYYY-MM-DD
const WEEK_END = SEED.PAYABLES.weekEnd;
const billRow = (b) => ({ no: b.billNumber, vendor: b.vendorShort, vendorFull: b.vendorName, po: b.order, project: b.project, claimed: b.claimed, due: b.dueOn, overdue: b.overdue, taxable: b.taxable, gst: b.gst, submitted: b.submittedOn, narrative: b.narrative, sentBy: b.sentBy, paidOn: b.paidOn });
// Bills: acknowledged and unpaid, soonest first.
export const BILLS_DUE = [...SEED.BILLS.filter(b => b.state === 'acknowledged' && b.paidOn === null)].sort((a, b) => a.dueOn.localeCompare(b.dueOn)).map(billRow);
const BILLS_TO_ACK = SEED.BILLS.filter(b => b.state === 'submitted').map(billRow);
export const BILL_SUMMARY = {
  overdue: SEED.PAYABLES.overdueTotal, thisWeek: SEED.PAYABLES.thisWeekTotal, nextWeek: SEED.PAYABLES.nextWeekTotal, later: SEED.PAYABLES.laterTotal, toAck: SEED.PAYABLES.toAcknowledgeTotal,
  total: SEED.PAYABLES.total,
};
BILL_SUMMARY.current = String(BigInt(BILL_SUMMARY.total) - BigInt(BILL_SUMMARY.overdue));
check('bills due', sum(BILLS_DUE.map(b => b.claimed)), BILL_SUMMARY.total);
check('the overdue bill', BILLS_DUE.filter(b => b.overdue).length, 1);
{ const b = BILLS_DUE[0]; check(`${b.no} split`, add(b.taxable, b.gst), b.claimed); }

// Payments: the five paid bills as vouchers, and the painter's retention released as the sixth. gross = taxable
// + GST; net = gross − TDS − retention. The section, the class and the rate are the provisional catalogue's.
const RATE_WORD = { company: 'a contractor that is a company', firm: 'a contractor that is a firm', individual: 'a contractor who is an individual', plant_machinery: 'hire of plant and machinery', technical: 'fees for technical services' };
const PAY = SEED.PAYMENTS.map(p => ({ no: p.number, to: p.vendorShort, toFull: p.vendorName, pan: p.pan ?? 'No PAN on record', kind: p.kind, bill: p.bill, order: p.order, project: p.project, on: p.on, ref: p.reference, gross: p.gross, taxable: p.taxable, gst: p.gst, tds: p.tds, section: p.section, payeeClass: p.payeeClass, rate: p.rateBp === null ? null : `${p.rateBp / 100}%`, reason: p.reason, retention: p.retention, retentionBp: SEED.orderByNumber(p.order).retentionBp, provisional: p.provisional, net: p.net,
  why: p.reason === 'transporter_declaration' ? 'A transporter with a 194C(6) declaration on file for the year — nothing is deducted' : p.reason === 'higher_rate_no_valid_pan' ? 'No valid PAN on record, so the higher rate under 206AA' : p.reason === 'below_threshold' ? 'Below the threshold for the section' : p.reason === 'release' ? '' : `A payment to ${RATE_WORD[p.payeeClass] ?? p.payeeClass}` }));
const MONTH = SEED.SEED_DAY.slice(0, 7);
const PAY_THIS_MONTH = PAY.filter(p => p.on.startsWith(MONTH));
const PAY_MONTH = { net: sum(PAY_THIS_MONTH.map(p => p.net)), tds: sum(PAY_THIS_MONTH.map(p => p.tds)), retention: sum(PAY_THIS_MONTH.map(p => p.retention)) };
const MONTH_WORD = L.longDate(SEED.SEED_DAY).split(' ').slice(2).join(' ') + ' 2026';   // "September 2026"
const NEXT_MONTH_7 = '7 October';

// Retention: held per order at the order's rate on its gross; withheld is what the paid bills kept back.
const HOLDINGS = SEED.RETENTION.map(h => ({ po: h.order, vendor: h.vendorShort, project: h.project, rate: `${h.rateBp / 100}%`, holding: h.holding, withheld: h.withheld, released: h.released, bills: h.bills, held: h.heldNow, releasedOn: h.releasedOn }));
const HELD_NOW = SEED.HELD_NOW;
check('retention held now', sum(HOLDINGS.map(h => h.held)), HELD_NOW);
check('the release voucher equals what the painter’s order released', PAY.find(p => p.kind === 'release').net, HOLDINGS.find(h => h.released !== '0').released);

// Client billing: four tax invoices — two on ANU-01, whose site is in Telangana, so IGST; the rest intra-state,
// CGST and SGST in halves. The open ones: SAN-01's running bill, past its expected date; ANU-01's second, part paid.
export const INVOICES = SEED.INVOICES.map(i => ({ no: i.number, client: i.clientShort, clientFull: i.client, project: i.project, dated: i.invoiceDate, expected: i.expectedOn, certified: i.certifiedOn, total: i.total, received: i.received, receivedOn: i.receivedOn, overdue: i.overdue, cancelled: false, taxable: i.taxable, cgst: i.cgst, sgst: i.sgst, igst: i.igst, roundOff: i.roundOff, gstin: i.clientGstin, place: `${i.placeOfSupply} · ${i.placeOfSupply === '36' ? 'Telangana' : 'Karnataka'}`, supply: i.supply, description: i.description, balance: i.balance }));
export const RECEIVABLES = { invoiced: SEED.RECEIVABLES.invoiced, received: SEED.RECEIVABLES.received, due: SEED.RECEIVABLES.due, overdue: SEED.RECEIVABLES.overdue, current: SEED.RECEIVABLES.current, open: SEED.RECEIVABLES.open };
check('receivables due', add(RECEIVABLES.overdue, RECEIVABLES.current), RECEIVABLES.due);
{ const i = INVOICES.find(x => x.supply === 'intra'); check(`${i.no} total`, String(BigInt(add(i.taxable, i.cgst, i.sgst)) + BigInt(i.roundOff)), i.total); }

// 26Q for the quarter, one line per payment under a section, with the form's remark: C for the higher rate
// without a PAN, T for a transporter's declaration. The challan for a month is the month's deductions,
// rounded to the nearest ten rupees under Sec 288B, five up.
const QUARTER_START = '2026-07-01';
const remark = (p) => p.reason === 'higher_rate_no_valid_pan' ? 'C' : p.reason === 'transporter_declaration' ? 'T' : p.reason === 'below_threshold' ? 'Y' : '';
const Q2 = PAY.filter(p => p.kind === 'bill' && p.on >= QUARTER_START).map(p => [p.to, p.pan, p.on, p.taxable, p.tds, p.section, remark(p), p.rate]);
const sec288B = (wire) => String(((BigInt(wire) + 500n) / 1000n) * 1000n);
const CHALLAN = { month: MONTH, exact: sum(Q2.filter(r => r[2].startsWith(MONTH)).map(r => r[4])), lines: Q2.filter(r => r[2].startsWith(MONTH)) };
CHALLAN.amount = sec288B(CHALLAN.exact);
check('September challan equals the month’s tax on Payments', CHALLAN.exact, PAY_MONTH.tds);
// ================================================================ the screens
const code = (c) => c ? esc(c) : '<span class="muted">Stock</span>';
const pane = S.pane;
const weekEndWord = L.dayDate(WEEK_END);
const nextWeekEndWord = L.dayDate(SEED.PAYABLES.nextWeekEnd);
const billsSub = `gross, as each vendor claimed · this week ends ${weekEndWord}`;

function billsDue(withPane = true) {
  const open = BILLS_DUE.find(b => !b.overdue && b.due <= WEEK_END);
  const rows = BILLS_DUE.map(b => ({
    name: b.no, open: withPane && b === open,
    cells: [b.due, `<a href="#">${esc(b.no)}</a>`, esc(b.vendor), `${code(b.project)} · ${b.po}`, b.overdue ? pill('warn', 'Overdue') : pill('idle', 'Due'), fmt(b.claimed), clip(true, 'the vendor’s bill')],
    alt: `${b.due} · ${esc(b.vendor)} · ${b.project ?? 'Stock'} · ${b.po}`,
  }));
  const p = pane({
    title: esc(open.no), status: pill('warn', `Due ${open.due}`), sub: `${esc(open.vendor)} · ${open.po} · ${open.project}`,
    body: paneTools() + figure(open.claimed) + kv([['Order', `${open.po} · ${open.project}`], ['Sent', `${open.submitted} · ${esc(open.sentBy)}, on the portal`], ['For', esc(open.narrative)], ['Taxable value', fmt(open.taxable)], ['GST', fmt(open.gst)], ['Due', open.due], ['Paid', '<span class="muted">Not yet</span>']])
      + `<form onsubmit="return false"><div class="fgrid c2">${field('b-paid', 'Paid on', { type: 'date', required: true })}${field('b-ref', 'Bank reference', { hint: 'The UTR or cheque number.' })}</div><p class="hint muted u-sm">Tax is deducted and retention withheld at the provisional rates; the voucher shows how.</p></form>`,
    actions: paneFoot(`<button class="btn primary" type="submit">Pay this bill</button>`),
  });
  return moneyHead('Bills', billsSub, 'Bills', { actions: `<button class="btn" type="button">${icon('download')}Export</button>` })
    + `<div data-hero><div class="two owe-row">${oweCard({ title: 'Total payables', help: 'What is owed to vendors on bills acknowledged and unpaid — current, then overdue by how long', total: BILL_SUMMARY.total, current: BILL_SUMMARY.current, buckets: ageBuckets(SEED.PAYABLES.overdue, 'dueOn', 'claimed'), span: '', note: `${BILLS_DUE.length} bills unpaid · ${BILLS_DUE.filter(b => b.overdue).length} past due · this week ends ${weekEndWord}` })}<div class="stats col">${stat('Due this week', fmt(BILL_SUMMARY.thisWeek), { delta: `<b>${SEED.PAYABLES.thisWeek.length}</b> bill · to ${weekEndWord}`, disc: ['red', 'rupee'] })}${stat('Due next week', fmt(BILL_SUMMARY.nextWeek), { delta: `<b>${SEED.PAYABLES.nextWeek.length}</b> bill · to ${nextWeekEndWord}`, disc: ['red', 'clock'] })}${stat('To acknowledge', fmt(BILL_SUMMARY.toAck), { delta: `<b>${BILLS_TO_ACK.length}</b> bill`, disc: ['purple', 'inbox'] })}</div></div>`
    + `${S.listView({ label: 'Bills', search: 'Bill number or vendor', filters: [['View', 'Due'], ['Vendor', '']], exportBtn: false, select: false, cols: [{ label: 'Due', p: 3, num: true, sort: 'ascending' }, { label: 'Bill', p: 1 }, { label: 'Vendor', p: 3 }, { label: 'Project · order', p: 3 }, { label: 'Status', p: 2 }, { label: 'Claimed', p: 2, num: true }, { label: '', p: 3, clip: true }], rows, pager: pager({ from: 1, to: BILLS_DUE.length, total: BILLS_DUE.length, unit: 'bills' }), pane: withPane ? p : '' })}</div>`;
}

function billsAck() {
  const open = BILLS_TO_ACK[0];
  const rows = BILLS_TO_ACK.map(b => ({ name: b.no, open: b === open, cells: [b.submitted, `<a href="#">${esc(b.no)}</a>`, esc(b.vendor), `${code(b.project)} · ${b.po}`, pill('idle', 'To acknowledge'), fmt(b.claimed), clip(true, 'the vendor’s bill')], alt: `${b.submitted} · ${esc(b.vendor)} · ${b.project} · ${b.po}` }));
  const p = pane({
    title: esc(open.no), status: pill('idle', 'To acknowledge'), sub: `${esc(open.vendor)} · ${open.po} · ${open.project}`,
    body: notice('bad', 'This bill was not acknowledged', `Nothing was saved. The split does not add up to what ${esc(open.vendor.split(' ')[0])} claimed — the GST field says by how much.`)
      + figure(open.claimed) + kv([['Order', `${open.po} · ${open.project}`], ['Sent', `${open.submitted} · ${esc(open.sentBy)}, on the portal`], ['For', esc(open.narrative)]])
      + `<form onsubmit="return false">${S.formLegend()}<div class="fgrid c2">${moneyField('a-tax', 'Taxable value', '1,20,000.00', 'Before GST, as the invoice shows it.', true)}${moneyField('a-gst', 'GST shown on the invoice', '21,600.00', '', true, `₹1,20,000.00 and ₹21,600.00 make ₹1,41,600.00. ${esc(open.vendor.split(' ')[0])} claimed ${fmt(open.claimed)} — enter the split the invoice shows.`)}</div>${field('a-due', 'Due on', { type: 'date', required: true, value: SEED.PAYABLES.nextWeekEnd, hint: 'The date it is payable. Due this week is read from this.' })}</form>`,
    actions: paneFoot(`<button class="btn primary" type="submit">Acknowledge the bill</button>`),
  });
  return moneyHead('Bills', billsSub, 'Bills', { actions: `<button class="btn" type="button">${icon('download')}Export</button>` })
    + `<div data-hero>${S.listView({ label: 'Bills to acknowledge', search: 'Bill number or vendor', filters: [['View', 'To acknowledge'], ['Vendor', '']], exportBtn: false, select: false, cols: [{ label: 'Submitted', p: 3, num: true, sort: 'descending' }, { label: 'Bill', p: 1 }, { label: 'Vendor', p: 3 }, { label: 'Project · order', p: 3 }, { label: 'Status', p: 2 }, { label: 'Claimed', p: 2, num: true }, { label: '', p: 3, clip: true }], rows, pager: pager({ from: 1, to: BILLS_TO_ACK.length, total: BILLS_TO_ACK.length, unit: 'bills' }), pane: p })}</div>`;
}

function payments(withPane = true) {
  const sorted = [...PAY].sort((a, b) => b.on.localeCompare(a.on) || b.no.localeCompare(a.no));
  const open = PAY[0];   // the first voucher: the electrical contractor's running bill, tax deducted and retention withheld
  const rows = sorted.map(p => ({ name: p.no, open: withPane && p === open, cells: [p.on, `<a href="#">${p.no}</a>`, esc(p.to), p.kind === 'bill' ? esc(p.bill) : '<span class="muted">Retention released</span>', fmt(p.tds), moneyOut(p.net), clip(!!p.ref, 'the bank’s advice')], alt: `${p.on} · ${esc(p.to)} · ${p.kind === 'bill' ? esc(p.bill) : 'Retention released'}`, altPane: `${p.on} · ${esc(p.to)} · ${p.kind === 'bill' ? esc(p.bill) : 'retention released'}` }));
  const pn = pane({
    title: `Payment voucher ${open.no}`, sub: `${esc(open.to)} · ${esc(open.bill)}`,
    body: paneTools() + DRAFT('voucher') + figure(open.net) + kv([
      ['Paid to', `${esc(open.toFull)} · ${open.pan}`], ['Bill', esc(open.bill)], ['Paid on', `${open.on} · ${open.ref}`], ['Gross', fmt(open.gross)], ['Taxable value', fmt(open.taxable)],
      ['Tax deducted', `${fmt(open.tds)} · ${open.section} at ${open.rate} ${provisional(open.provisional)}<br><span class="muted">${esc(open.why)}</span>`],
      ['Retention withheld', `${fmt(open.retention)} · ${open.retentionBp / 100}% held against ${open.order}`], ['Net paid', fmt(open.net)], ['Tally', '<span class="muted">Not sent — a voucher resting on a provisional rate never is</span>'],
    ]),
  });
  return moneyHead('Payments', `what went out, what was deducted, what was withheld · this quarter · ${PAY.filter(p => p.provisional).length} computed from provisional rates`, 'Payments', { actions: `<button class="btn" type="button">${icon('download')}Export</button>` })
    + `<div class="stats n4">${stat('Paid this month', moneyOut(PAY_MONTH.net), { delta: 'net, as it left the bank', disc: ['red', 'rupee'] })}${stat('Tax deducted this month', fmt(PAY_MONTH.tds), { delta: `to deposit by <b>${NEXT_MONTH_7}</b>`, disc: ['yellow', 'clock'] })}${stat('Retention withheld this month', fmt(PAY_MONTH.retention), { delta: 'held against orders', disc: ['purple', 'lock'] })}${stat('Retention held', fmt(HELD_NOW), { delta: 'withheld and not yet released', disc: ['purple', 'lock'] })}</div>`
    + `<div data-hero>${S.listView({ label: 'Payments', search: 'Voucher, vendor or bill', filters: [['Period', 'This quarter'], ['Vendor', '']], exportBtn: false, select: false, cols: [{ label: 'Paid on', p: 3, num: true, sort: 'descending' }, { label: 'Voucher', p: 1 }, { label: 'Paid to', p: 3 }, { label: 'For', p: 3 }, { label: 'Tax', p: 2, num: true }, { label: 'Net paid', p: 2, num: true }, { label: '', p: 3, clip: true }], rows, pager: pager({ from: 1, to: PAY.length, total: PAY.length, unit: 'payments' }), pane: withPane ? pn : '' })}</div>`;
}

// the month's deposit, as the hero of Tax deducted and of its other states
const DEDUCTOR = `${L.TENANT.legalName} · TAN ${L.TENANT.tan}`;
const SECTION_WORD = { '194C': '94C · a payment to a contractor', '194I': '94I · rent of plant and machinery', '194J': '94J · fees for technical services' };
export function tdsHero() {
  const sept = CHALLAN.lines;
  return L.hero({ eyebrow: `${MONTH_WORD} · deposit by ${NEXT_MONTH_7}`, value: fmt(CHALLAN.amount), text: `deducted from <b>${sept.filter(r => r[4] !== '0').length} payments</b> this month — ${fmt(CHALLAN.exact)}, rounded to ten rupees for the challan under Sec 288B — to deposit under ITNS 281; every figure a draft on provisional rates until the review is done. The quarter’s 26Q is below.`, delta: `<b>${Q2.length}</b> deductee lines this quarter · ${fmt(sum(Q2.map(r => r[4])))}` });
}
function tds() {
  const bySection = [...new Set(CHALLAN.lines.map(r => r[5]))].map(s => [s, CHALLAN.lines.filter(r => r[5] === s)]);
  const challan = card(`Challan · ${MONTH}`, `<div class="card-b">${DRAFT('challan')}${kv([['Deductor', DEDUCTOR], ['Minor head', '200 · TDS payable by taxpayer'], ['Due by', `${NEXT_MONTH_7} 2026`]])}</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nature of payment</th><th>Section</th><th class="num">Payments</th><th class="num">Amount</th></tr></thead><tbody>${bySection.map(([s, rows]) => `<tr><td>${SECTION_WORD[s]}</td><td>${s}</td><td class="num">${rows.length}</td><td class="num">${fmt(sum(rows.map(r => r[4])))}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="3">Rounded to the nearest ten rupees, Sec 288B</td><td class="num">${fmt(CHALLAN.amount)}</td></tr></tfoot></table></div><div class="card-b continued"><div class="actions"><button class="btn primary lg" type="button">${icon('download')}Download the draft challan</button></div></div>`,
    { sub: 'ITNS 281, one line per nature of payment', actions: `<div class="actions"><a href="#" class="btn sm">${icon('left', 'i sm')}2026-08</a><a href="#" class="btn sm">2026-10${icon('right', 'i sm')}</a></div>` });
  const q = card(`26Q · ${FY} Q2`, `<div class="card-b">${DRAFT('statement')}${kv([['Deductor', DEDUCTOR], ['Period', 'July to September 2026'], ['Due by', '31 October 2026'], ['Tax deducted', fmt(sum(Q2.map(r => r[4])))]])}</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Deductee</th><th>Section</th><th class="num">Paid</th><th class="num">Tax</th></tr></thead><tbody>${Q2.map(([n, pan, on, paid, t, s, rem, rate]) => `<tr><td>${esc(n)}<span class="sub">${pan} · ${on}</span></td><td>${s.replace('194', '94')} · ${rate === null ? 'nil, declaration on file' : `${rate} ${provisional(true)}`}${rem ? `<span class="sub">remark ${rem}</span>` : ''}</td><td class="num">${fmt(paid)}</td><td class="num">${fmt(t)}</td></tr>`).join('')}</tbody></table></div><p class="skel-note muted">${Q2.length} deductee lines for the quarter · C is the higher rate for want of a PAN, T a transporter’s declaration</p>`,
    { sub: 'each deductee line for the quarter', actions: `<div class="actions"><a href="#" class="btn sm">${icon('left', 'i sm')}Q1</a><a href="#" class="btn sm">Q3${icon('right', 'i sm')}</a></div>` });
  return moneyHead('Tax deducted', 'the challan for a month, and 26Q for a quarter', 'Tax deducted', { actions: `<button class="btn" type="button">${icon('download')}Export 26Q</button>` })
    + `<div data-hero>${tdsHero()}</div>${challan}${q}`   // the month's deposit is the one thing this screen is for
    + notice('info', 'Interest on a late deposit is not worked out here', 'A deposit made after its due date carries interest. This screen does not compute it, so no figure appears for it — ask your chartered accountant for the amount before depositing late.');
}
function tdsNoTan() {
  const e = (t) => L.empty('money', t, 'The deductor’s TAN is not entered yet. Enter it in Settings › Tax and this is built from the payments already recorded.', `<a href="${hrefFor('11')}" class="btn primary">Enter the TAN</a>`);
  return moneyHead('Tax deducted', 'the challan for a month, and 26Q for a quarter', 'Tax deducted')
    + `<div class="two even"><div data-hero>${card(`Challan · ${MONTH}`, e('No challan without a TAN'), { sub: 'ITNS 281' })}</div>${card(`26Q · ${FY} Q2`, e('No 26Q without a TAN'), { sub: 'the quarter’s statement' })}</div>`;
}
function tdsRefused() {
  return moneyHead('Tax deducted', 'the challan for a month, and 26Q for a quarter', 'Tax deducted')
    + `<div data-hero>${card(`Challan · ${MONTH}`, `<div class="card-b">${notice('bad', 'This challan was not produced', 'It rests on rates a chartered accountant has not verified yet, and this deployment was not set to produce drafts. It will be produced once these rows are verified: <b>TDS · 194C · no valid PAN · 20%</b> and <b>TDS · 194J · fees for technical services · 2%</b>.', `<button class="btn" type="button">${icon('copy')}Copy details for support</button>`)}${kv([['Deductor', DEDUCTOR], ['Due by', `${NEXT_MONTH_7} 2026`], ['What is still shown', 'The payments themselves, on Payments — each with its tax marked Provisional']])}</div>`, { sub: 'ITNS 281' })}</div>`;
}

function clientBilling(withPane = true) {
  const open = INVOICES.find(i => i.supply === 'inter' && BigInt(i.balance) > 0n);
  const rows = INVOICES.map(i => ({ name: i.no, open: withPane && i === open, cells: [i.dated, `<a href="#">${i.no}</a>`, esc(i.client), esc(i.project), i.cancelled ? pill('idle', 'Cancelled') : i.overdue ? pill('warn', 'Overdue') : BigInt(i.received) >= BigInt(i.total) ? pill('ok', 'Paid') : pill('idle', 'Due'), fmt(i.total), i.cancelled ? '<span class="muted">—</span>' : i.received === '0' ? fmt(i.received) : moneyIn(i.received), clip(!i.cancelled, 'the tax invoice')], alt: `${i.dated} · ${esc(i.client)} · ${esc(i.project)}`, altPane: `${i.dated} · ${esc(i.client)} · ${esc(i.project)}` }));
  const gstRow = open.supply === 'inter' ? `${fmt(open.igst)} ${provisional(true)}<br><span class="muted">IGST — the site is in another state</span>` : `${fmt(add(open.cgst, open.sgst))} ${provisional(true)}<br><span class="muted">CGST ${fmt(open.cgst)} · SGST ${fmt(open.sgst)}</span>`;
  const nextExpected = RECEIVABLES.open.filter(i => !i.overdue).sort((a, b) => a.expectedOn.localeCompare(b.expectedOn))[0];
  const pn = pane({
    title: open.no, sub: `${esc(open.client)} · ${open.project}`,
    body: paneTools() + DRAFT('invoice') + figure(open.total) + kv([
      ['Billed to', `${esc(open.clientFull)} · ${open.gstin}`], ['Project', `${open.project} · ${esc(L.projectOf(open.project).name)}`], ['For', esc(open.description)], ['Dated', open.dated], ['Certified', open.certified ?? '<span class="muted">Not yet</span>'], ['Place of supply', open.place],
      ['Taxable value', fmt(open.taxable)], ['GST at 18%', gstRow], ['Round off', fmt(open.roundOff)], ['Invoice total', fmt(open.total)], ['Received', `${fmt(open.received)}${open.receivedOn ? ` · ${open.receivedOn}` : ''}`], ['Due', `${fmt(open.balance)} · expected ${open.expected}`],
    ]) + `<form onsubmit="return false">${S.formLegend()}${moneyField('r-amt', 'Received', '', 'Never more than is still due.', true)}<div class="fgrid c2">${field('r-on', 'Received on', { type: 'date', required: true })}${field('r-ref', 'Bank reference', {})}</div></form>`,
    actions: paneFoot(`<button class="btn primary" type="submit">Record the receipt</button>`, { danger: `<button class="btn ghost" type="button">Cancel the invoice…</button>` }),
  });
  return moneyHead('Client billing', 'tax invoices, receipts, and what is still due', 'Client billing', { primary: `<button class="btn primary" type="button">${icon('plus')}Raise an invoice</button>` })
    + `<div class="two owe-row">${oweCard({ title: 'Total receivables', help: 'What clients still owe on tax invoices raised — current, then overdue by how long', total: RECEIVABLES.due, current: RECEIVABLES.current, buckets: ageBuckets(RECEIVABLES.open.filter(i => i.overdue), 'expectedOn', 'balance'), span: '', note: `${RECEIVABLES.open.length} invoices unpaid · ${RECEIVABLES.open.filter(i => i.overdue).map(i => `${i.number} is ${L.daysAgo(i.expectedOn)} days past its expected date`).join(' · ')}` })}<div class="stats col">${stat('Invoiced', fmt(RECEIVABLES.invoiced), { delta: 'issued, not cancelled', disc: ['blue', 'bill'] })}${stat('Received', moneyIn(RECEIVABLES.received), { delta: 'against those invoices', disc: ['green', 'rupee'] })}${stat('Next expected', moneyIn(nextExpected.balance), { delta: `<b>${esc(nextExpected.clientShort)}</b> · ${L.dayDate(nextExpected.expectedOn)}`, disc: ['green', 'clock'] })}</div></div>`
    + `<div data-hero>${S.listView({ label: 'Invoices', search: 'Invoice, client or project', filters: [['Client', ''], ['State', '']], select: false, cols: [{ label: 'Dated', p: 3, num: true, sort: 'descending' }, { label: 'Invoice', p: 1 }, { label: 'Client', p: 3 }, { label: 'Project', p: 3 }, { label: 'Status', p: 2 }, { label: 'Total', p: 2, num: true }, { label: 'Received', p: 2, num: true }, { label: '', p: 3, clip: true }], rows, pager: pager({ from: 1, to: INVOICES.length, total: INVOICES.length, unit: 'invoices' }), pane: withPane ? pn : '' })}</div>`;
}

function retention(withPane = true) {
  const open = HOLDINGS.find(h => h.held !== '0');
  const rows = HOLDINGS.map(h => ({ name: h.po, open: withPane && h === open, cells: [`<a href="#">${h.po}</a>`, esc(h.vendor), esc(h.project), h.rate, h.released !== '0' && h.held === '0' ? pill('ok', 'Released') : pill('warn', 'Held'), fmt(h.held)], alt: `${esc(h.vendor)} · ${esc(h.project)} · ${h.rate}`, altPane: `${esc(h.vendor)} · ${esc(h.project)} · ${h.rate}` }));
  const pn = pane({
    title: open.po, status: pill('warn', 'Held'), sub: `${esc(open.vendor)} · ${open.project}`,
    body: figure(open.held) + kv([['Rate held', `${open.rate} · ${fmt(open.holding)} over the whole order`], ['Withheld from bills', `${fmt(open.withheld)} · ${open.bills} bill`], ['Released', fmt(open.released)], ['Stage', pill('warn', 'Held')]])
      + `<form onsubmit="return false">${S.formLegend()}<div class="fgrid c2">${field('rl-on', 'Released on', { type: 'date', required: true })}${field('rl-ref', 'Bank reference', { hint: 'The UTR or cheque number.' })}</div></form>`,
    actions: paneFoot(`<button class="btn primary" type="submit">Release ${fmt(open.held)}</button>`, { note: 'paid as a voucher, with nothing further deducted' }),
  });
  const heldN = HOLDINGS.filter(h => h.held !== '0').length;
  return moneyHead('Retention', 'withheld from bills, released as payments', 'Retention', { primary: `<button class="btn primary" type="button">${icon('plus')}Record a holding</button>` })
    + `<div class="stats">${stat('Held now', fmt(HELD_NOW), { delta: `across <b>${heldN}</b> order`, disc: ['purple', 'lock'] })}${stat('Released', moneyOut(sum(HOLDINGS.map(h => h.released))), { delta: 'paid out as a voucher', disc: ['red', 'rupee'] })}${stat('Holdings', String(HOLDINGS.length), { delta: `<b>${heldN}</b> held · ${HOLDINGS.length - heldN} released` })}</div>`
    + `<div data-hero>${S.listView({ label: 'Held against orders', search: 'Order or vendor', filters: [['Stage', 'Held'], ['Vendor', '']], select: false, cols: [{ label: 'Order', p: 1 }, { label: 'Vendor', p: 3 }, { label: 'Project', p: 3 }, { label: 'Rate', p: 3, num: true }, { label: 'Stage', p: 2 }, { label: 'Held now', p: 2, num: true, sort: 'descending' }], rows, pager: pager({ from: 1, to: HOLDINGS.length, total: HOLDINGS.length, unit: 'holdings' }), pane: withPane ? pn : '' })}</div>`;
}

// ================================================================ approvals and tasks, in the one pattern
// The queue is the seed's: six orders at the default chain's one stage, which finance holds, aged 9 to 0 days.
function approvalsQueue(withPane = true) {
  const queue = L.BLOCKED.map(b => ({ no: b.number, vendor: L.SEED.vendorByKey(L.SEED.orderByNumber(b.number).vendor).short, project: b.project, total: b.amount, step: b.stage, days: b.days, description: L.SEED.orderByNumber(b.number).description })).sort((a, b) => b.days - a.days || a.no.localeCompare(b.no));
  const open = queue[0];
  const rows = queue.map(q => ({ name: q.no, open: withPane && q === open, mine: true, cells: [`<a href="#">${q.no}</a>`, esc(q.vendor), esc(q.project), pill('waiting', q.step), `${q.days} days`, fmt(q.total)], alt: `${esc(q.vendor)} · ${q.project}`, altPane: `${esc(q.vendor)} · ${q.project}` }));
  const steps = `<ol class="steps">${L.ORDER_STEPS.map(s => `<li class="${s.state}">${L.tick(s.state === 'done')}<div>${esc(s.name)}<small>${s.state === 'done' ? `${esc(s.by)} · ${esc(s.when)}` : s.state === 'now' ? `Waiting for ${esc(s.by)}` : 'Not reached yet'}</small></div></li>`).join('')}</ol>`;
  const pn = pane({
    title: open.no, status: labelOf2(V2.po, 'pending_approval'), sub: `${esc(open.vendor)} · ${open.project} · at ${open.step}`,
    body: figure(open.total) + kv([['Sent for approval', `${P.proc.name} · ${open.days} days ago`], ['For', esc(open.description)], ['Rates', `<span class="muted">No agreed rate to check against</span>`]]) + steps
      + `<form onsubmit="return false">${notes('ap-note', 'A note (optional)', 2, 'Goes on the order’s record with your decision.')}</form>`,
    actions: paneFoot(`<button class="btn primary" type="submit">${icon('check')}Approve</button>`, { danger: `<button class="btn ghost" type="button">Decline…</button>` }),
  });
  return S.pageHead({ title: 'Approvals', sub: `${queue.length} orders waiting, on every project · all ${queue.length} on you · oldest first`, actions: `<a href="#" class="btn">Approval steps</a>`, tabs: L.subtabs(['Approvals', 'Tasks'], 'Approvals') })
    + `<div data-hero>${S.listView({ label: 'Waiting for you', search: 'Order, vendor or project', filters: [['Step', ''], ['Vendor', '']], exportBtn: false, select: false, cols: [{ label: 'Order', p: 1 }, { label: 'Vendor', p: 3 }, { label: 'Project', p: 3 }, { label: 'Step', p: 2 }, { label: 'Waiting', p: 2, num: true, sort: 'descending' }, { label: 'Total', p: 2, num: true }], rows, pager: pager({ from: 1, to: queue.length, total: queue.length, unit: 'orders' }), pane: withPane ? pn : '' })}</div>`;
}
function tasksList() {
  const rows = L.TASK_ROWS.map(t => ({ name: t.t, mine: !t.done && t.who === P.admin.first, cells: [`${esc(t.t)}`, esc(t.who), t.done ? pill('ok', 'Done') : t.overdue ? pill('warn', `Overdue · ${t.due}`) : t.due === 'Today' ? pill('active', 'Due today') : esc(t.due)], alt: '' }));
  const dueToday = L.TASK_ROWS.filter(t => !t.done && t.due === 'Today');
  const overdue = L.TASK_ROWS.filter(t => !t.done && t.overdue);
  const people = new Set(L.TASK_ROWS.map(t => t.who)).size;
  return S.pageHead({ title: 'Tasks', sub: `${L.TASK_ROWS.length} open · ${dueToday.length} due today · ${overdue.length} overdue · across ${people} people`, primary: `<button class="btn primary" type="button">${icon('plus')}New task</button>`, tabs: L.subtabs(['Approvals', 'Tasks'], 'Tasks') })
    + `<div class="stats">${stat('Due today', `${dueToday.length}`, { delta: dueToday.map((t, i) => i === 0 ? `<b>${esc(t.who)}</b>` : esc(t.who)).join(' · '), tone: 'watch' })}${stat('Open, all people', `${L.TASK_ROWS.length}`, { delta: L.delta('down', '3', 'this week'), tone: 'up', series: [13, 12, 14, 11, 12, 10, 8, L.TASK_ROWS.length] })}${stat('Overdue', `${L.TASKS_OVERDUE}`, { delta: `<b>${new Set(overdue.map(t => t.who)).size} people</b> · oldest ${L.daysAgo(L.SEED.TASKS.filter(t => t.overdue).sort((a, b) => a.due.localeCompare(b.due))[0].due)} days`, tone: 'watch' })}</div>`
    + `<div data-hero>${S.listView({ label: 'All tasks', search: 'Task or person', filters: [['Person', ''], ['About', ''], ['Due', '']], cols: [{ label: 'Task', p: 1 }, { label: 'Person', p: 2 }, { label: 'Due', p: 1, sort: 'ascending' }], rows, bulk: { n: 2, actions: `<button class="btn sm" type="button">${icon('check')}Mark done</button><button class="btn sm" type="button">Reassign…</button>` }, pager: pager({ from: 1, to: L.TASK_ROWS.length, total: L.TASK_ROWS.length, unit: 'tasks' }) })}</div>`;
}

export function decide() {
  const who = (p) => ({ who: p.first, role: p.role });
  const fin = who(P.finance), adm = who(P.admin);
  const openBill = BILLS_DUE.find(b => !b.overdue && b.due <= WEEK_END);
  const openInvoice = INVOICES.find(i => i.supply === 'inter' && BigInt(i.balance) > 0n);
  const openHolding = HOLDINGS.find(h => h.held !== '0');
  const release = PAY.find(p => p.kind === 'release');
  const slug = (s) => s.replace(/[^A-Za-z0-9]+/g, '-');
  return `<p class="lede">Approvals is one queue with the decision open beside it. Tasks is everyone’s work, in the same list as every other list. Money is the five screens that shipped — bills, payments, tax deducted, client billing and retention — each a list with the record beside it, computing every figure, and marking plainly what rests on a rate a chartered accountant has not verified yet. The money is the seed’s: nine bills from five vendors on ${L.OPEN}, six vouchers, four tax invoices.</p>

${sample('Approvals — the queue', shell(approvalsQueue(false), { current: '/approvals', label: 'Approvals', ...fin, url: '/approvals' }), '', 'approvals')}
${sample('Approvals — a row clicked: the oldest decision open beside the queue', shell(approvalsQueue(), { current: '/approvals', label: 'Approvals', ...fin, url: `/approvals?order=${L.BLOCKED_OLDEST.number}` }), tag('Approvals is firm-wide — pinned at both levels, so no project hides a decision'), 'approvals')}
${card('When it is your own order', `<div class="card-b">${L.refuse('self-approval')}</div>`)}
${card('Approval steps', `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="num">Step</th><th>Name</th><th>Who</th><th class="num">Approvals needed</th><th>Up to</th></tr></thead><tbody>${L.CHAIN.stages.map(s => `<tr><td class="num">${s.sequence}</td><td>${esc(s.name)}</td><td>${s.approverRole.replace('_', ' ')}</td><td class="num">${s.minApprovals}</td><td><span class="muted">Any amount</span></td></tr>`).join('')}</tbody></table></div>`, { sub: 'purchase orders — the one step the product seeds for a new organisation' })}
${note(`<p>The decision sits in the pane, and the queue beside it stays live: <kbd>↑</kbd> <kbd>↓</kbd> move to the next order and the pane follows, with the address saying which — <code>?order=${L.BLOCKED_OLDEST.number}</code> — so a link to a decision opens that decision. Approve and Decline are in the pane’s docked footer, the destructive one alone on the left; neither has a keyboard shortcut. <code>approval refused: self-approval · FORBIDDEN · request req_…</code> still becomes <em>You raised this order, so someone else needs to approve it</em>, with <em>Copy details for support</em> carrying the code and the request id.</p>`)}

${sample('Approvals › Tasks — everyone’s work, in the one list', shell(tasksList(), { current: '/approvals', label: 'Approvals · Tasks', ...adm, url: '/tasks' }), '', 'tasks')}

${sample('Money › Bills — what is due this week', shell(billsDue(false), { current: '/money', label: 'Money · Bills', ...fin, url: '/money/bills' }), '', 'bills')}
${sample('Money › Bills — a row clicked: one bill open beside the list', shell(billsDue(), { current: '/money', label: 'Money · Bills', ...fin, url: `/money/bills?view=due&bill=${slug(openBill.no)}` }))}
${sample('Money › Bills, one to acknowledge — the split that does not add up, said where it happens', shell(billsAck(), { current: '/money', label: 'Money · Bills · to acknowledge', ...fin, url: `/money/bills?view=to_acknowledge&bill=${slug(BILLS_TO_ACK[0].no)}` }))}
${note('<p><strong>Every figure on Bills is gross</strong> — what the vendor claimed. Tax and retention are decided when a bill is paid, at the provisional rates, and appear on Payments; a payable shown net of a provisional deduction would be a statutory figure wearing a payables label. So Bills carries no Provisional marker at all, and the pay form says in one line where the deductions will be worked out.</p><p>The acknowledgement that failed shows the form pattern whole: the banner says nothing was saved, the field says what is wrong in figures — <em>₹1,20,000.00 and ₹21,600.00 make ₹1,41,600.00</em> — and the button sits in the pane’s docked footer. A form in a pane has no Cancel button: the pane’s own × is the way out.</p>')}

${sample('Money › Payments — what left the bank', shell(payments(false), { current: '/money', label: 'Money · Payments', ...fin, url: '/money/payments' }), '', 'payments')}
${sample('Money › Payments — a row clicked: the voucher beside the list', shell(payments(), { current: '/money', label: 'Money · Payments', ...fin, url: `/money/payments?payment=${slug(PAY[0].no)}` }))}
${note(`<p>The rule from ADR-0014’s addendums, drawn: <strong>a rate on screen says Provisional; a generated statutory document says <em>Draft: provisional rates</em>; an individual figure carries no banner.</strong> The voucher is a generated document, so it carries the draft notice; its section and rate carry the pill; the net paid, the gross and the retention carry nothing. The release voucher, ${release.no}, deducts nothing and so rests on no rate — it is not a draft, and it is the one row that went to Tally. The five vouchers show the catalogue’s reasons in one screen: a company at 2%, plant hire at 2%, a painter with no PAN at the higher rate, a transporter with a declaration and nothing deducted, technical fees at 2%.</p>`)}

${sample('Money › Tax deducted — the challan for September, and 26Q for the quarter', shell(tds(), { current: '/money', label: 'Money · Tax deducted', ...fin, url: `/money/tds?period=${MONTH}&quarter=${FY}-Q2` }), tag('Compliance — never demoed as a feature'))}
<div class="dsx-grid">
<div>${sample('Money › Tax deducted, before the TAN is entered', shell(tdsNoTan(), { current: '/money', label: 'Money · Tax deducted · no TAN', ...fin, url: '/money/tds' }))}</div>
<div>${sample('Money › Tax deducted, refused — the output rests on a provisional rate and drafts are off', shell(tdsRefused(), { current: '/money', label: 'Money · Tax deducted · refused', ...fin, url: `/money/tds?period=${MONTH}` }))}</div>
</div>
${note('<p>Three states, and they are three different sentences. <strong>No TAN</strong> is a setup step: an empty state, one action, and no figure invented in its place. <strong>Drafts on</strong> is the working state before the chartered accountant’s details arrive: everything computes, and the document says it is a draft. <strong>Drafts off</strong> — every deployment nobody configured — refuses the output by name, lists the rows it would have relied on, and still shows the payments themselves, because a payment is a record, not a statutory output. Interest on a late deposit is not computed anywhere, and the screen says so instead of leaving a gap that looks like zero.</p>')}

${sample('Money › Client billing — invoices, and what each client has paid', shell(clientBilling(false), { current: '/money', label: 'Money · Client billing', ...fin, url: '/money/client-billing' }), '', 'invoices')}
${sample('Money › Client billing — a row clicked: one invoice open beside the list', shell(clientBilling(), { current: '/money', label: 'Money · Client billing', ...fin, url: `/money/client-billing?invoice=${slug(openInvoice.no)}` }))}
${sample('Money › Retention — held against orders', shell(retention(false), { current: '/money', label: 'Money · Retention', ...fin, url: '/retention' }), '', 'retention')}
${sample('Money › Retention — a row clicked: one holding open beside the list', shell(retention(), { current: '/money', label: 'Money · Retention', ...fin, url: `/retention?holding=${openHolding.po}` }), tag('Compliance — never demoed as a feature'), 'retention')}
${note('<p>Retention is recorded as a rate against an order, never typed as an amount: what is held is what each bill payment kept back at that rate, and releasing it is a payment voucher or nothing — the two failures of the legacy system, closed together. A cancelled invoice keeps its number and its row. All five Money screens are both-ways in the scope model: inside a project they narrow to that project’s bills, vouchers, invoices and holdings, except Tax deducted, which is the firm’s — see <a href="' + hrefFor('3') + '">3 · Navigation</a>.</p>')}`;
}

// shell.mjs — v4 data and components. Data, vocabulary and money formatting come from lib2 unchanged;
// this file adds the fixtures the four un-rendered modules need (rates, stock, daily reports, imprest,
// measurement, recce, tasks, documents), the sparkline series, and the rebuilt components: Stat with delta
// and sparkline, the hero, the designed sidebar, illustrated empty states, the notifications popover.
import * as L from './vocabulary.mjs';
export * from './vocabulary.mjs';
import { scopeTrigger, removableTag, projectBlock } from './patterns.mjs';
import { NAV_FIRM, NAV_PROJECT } from './nav.mjs';
export { removableTag };
const { R, NEG, esc, fmt, fmtQty, pill, labelOf2, V2 } = L;

// ------------------------------------------------------------ icons --
export const icon = (name, cls = 'i') => `<span class="ico"><svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg></span>`;

// ------------------------------------------------------------ the 18 links --
// The shipped product's navigation, every link, and where it lives in v4. The third column is NOT typed here:
// the build scans the rendered HTML for data-renders="<key>" and fails if any key has no visible sample.
export const LINKS = [
  ['dashboard', 'Overview', 'Dashboard', 'Today (nav); inside a project, Overview'],
  ['notifications', 'Overview', 'Notifications', 'the bell in the top bar, with a count; opens the notifications panel'],
  ['leads', 'Sales', 'Leads and pipeline', 'Sales (nav) › Pipeline · Leads'],
  ['projects', 'Delivery', 'Projects', 'Projects (nav) › All projects; picking one changes the sidebar to its lifecycle'],
  ['rates', 'Delivery', 'Rate analysis', 'Sales › Rate analysis — agreed rate against last paid and BOQ, per item and vendor'],
  ['variations', 'Delivery', 'Change orders', 'Inside a project, Commercial › Variations'],
  ['orders', 'Procurement', 'Purchase orders', 'Buying (nav) › Orders; inside a project, Build › Orders'],
  ['vendors', 'Procurement', 'Vendors', 'Buying › Vendors'],
  ['stock', 'Procurement', 'Inventory', 'Buying › Stock; inside a project, Build › Stock'],
  ['retention', 'Procurement', 'Retention', 'Money (nav) › Retention — held against orders, released as payment vouchers'],
  ['daily', 'Site', 'Daily reports', 'Site (nav) › Daily reports; inside a project, Build › Site'],
  ['imprest', 'Site', 'Imprest', 'Site › Measurements & imprest — the site cash ledger'],
  ['measure', 'Site', 'Measurement', 'Site › Measurements & imprest — the sheet behind every RA bill'],
  ['recce', 'Site', 'Site recce', 'Inside a project, Build › Recce; also opened from a lead'],
  ['tasks', 'Work', 'Tasks', 'Approvals (nav) › Tasks (tab); today’s tasks also on Today'],
  ['approvals', 'Work', 'Approvals', 'Approvals (nav, with the count)'],
  ['documents', 'Work', 'Document vault', 'Projects › Documents, the firm’s vault; inside a project, Design › Drawings; the top-bar search reaches every document'],
  ['settings', 'Administration', 'Settings', 'The gear in the top bar › the settings hub › Tax — the two-minute review'],
];

// ------------------------------------------------------------ the sample, from the seed --
// Every fixture below is either read from seed.mjs — the product's demo seed, and what the product
// computes from it — or, where the seed holds no such record, is the design's own demonstration on the
// seed's names, and says so in its comment. CHANGES.md lists the second kind.
const S = L.SEED;
const P = L.PEOPLE;
const first = (person) => person.first;

// ------------------------------------------------------------ sparkline series --
// The seed holds no history: it writes everything on one day. Eight weeks of each series are DRAWN so
// that the last point is the seeded present (ordered so far, the pipeline, stock below reorder), the
// rest a shape the component needs to show. A demonstration, not a read.
const trail = (end, steps) => steps.map(f => String(BigInt(Math.round(Number(end) * f))));
export const SPARK = {
  ordered: trail(L.TOTAL_COMMITTED, [0.52, 0.58, 0.63, 0.71, 0.78, 0.86, 0.94, 1]),
  approvals: [4, 3, 5, 2, 3, 1, 3, S.BLOCKED.length],
  pipeline: trail(L.PIPELINE_TOTAL, [0.81, 0.84, 0.9, 0.9, 0.93, 0.97, 0.97, 1]),
  sales: L.LEADS.slice(0, 8).map(l => l.value),
  stock: [64, 60, 58, 51, 47, 44, 40, S.STOCK.filter(s => s.low).length * 12],
  imprest: [R(48_200), R(41_650), R(36_100), R(52_400), R(47_900), R(39_250), R(33_800), R(28_450)],
  measured: [12, 18, 24, 31, 37, 44, 52, 58],
};
export const ORDERED_DELTA = String(BigInt(SPARK.ordered[7]) - BigInt(SPARK.ordered[6]));

// ------------------------------------------------------------ what Monday actually decides --
// The contract is what the client pays. The cost BUDGET is what the BOQ says the work should cost —
// Σ quantity × cost rate over the lines that carry one, so a BOQ with unpriced lines has a budget that is
// too low, and the product says `partial` (margin.ts). Margin at risk is APPROVED orders past that budget:
// on the seed, KRA-01 and SAN-01, the two fully priced BOQs.
export const BUDGET = Object.fromEntries(L.PROJECTS.map(p => [p.code, p.costBudget]));
export const LEAKING = S.MARGIN.over.map(p => ({ ...p, budget: p.costBudget, over: p.atRisk }));
export const MARGIN_AT_RISK = S.MARGIN.total;
export const MARGIN_PARTIAL = S.MARGIN.partial.length;
export const MARGIN_UNPRICED = S.MARGIN.unpricedLines;

// Payables this week, gross, as `payablesSummary` buckets them: overdue is due before today, this week runs
// today to Sunday, next week the Monday to Sunday after. The cash side is ABSENT — the product holds no
// cash position (`ABSENT_CANDIDATES`, cash-shortfall) — so the tile shows the bills and says so.
export const PAYABLES = S.PAYABLES;
export const CASH = {
  inHand: null,
  dueThisWeek: S.PAYABLES.thisWeekTotal, bills: S.PAYABLES.thisWeek.length,
  overdue: S.PAYABLES.overdueTotal, overdueBills: S.PAYABLES.overdue.length,
  biggest: S.PAYABLES.thisWeek.length ? { vendor: S.PAYABLES.thisWeek[0].vendorShort, amount: S.PAYABLES.thisWeek[0].claimed, on: L.dayDate(S.PAYABLES.thisWeek[0].dueOn) } : null,
  oldestOverdue: S.PAYABLES.overdue.length ? { vendor: S.PAYABLES.overdue[0].vendorShort, amount: S.PAYABLES.overdue[0].claimed, on: L.dayDate(S.PAYABLES.overdue[0].dueOn), days: L.daysAgo(S.PAYABLES.overdue[0].dueOn) } : null,
  expected: S.RECEIVABLES.open.filter(i => !i.overdue).map(i => ({ client: i.clientShort, amount: i.balance, on: L.dayDate(i.expectedOn), certified: i.certifiedOn !== null }))[0] ?? null,
};
export const CASH_GAP = null;

// An approval that is waiting is waiting WITH SOMEBODY. On the seed every order awaiting approval sits at
// the default chain's one stage, Pending Approval, which finance holds — Farhan Qadri. Aged by
// `backdateForDemo`: 9, 6, 3, 1, 0 days in number order.
export const BLOCKED = S.BLOCKED.map(o => ({ what: `${o.number} · ${S.vendorByKey(o.vendor).short}`, number: o.number, amount: o.gross, who: P.finance.name, first: P.finance.first, role: P.finance.role, days: o.waitingDays, project: o.project, stage: o.stage }));
export const BLOCKED_TOTAL = S.BLOCKED_TOTAL;
export const BLOCKED_OLDEST = BLOCKED.reduce((a, b) => (b.days > a.days ? b : a));

// Pipeline weighted by stage. An unweighted pipeline adds a lead somebody mentioned on the phone to a
// contract that is out for signature, and calls the sum a forecast.
export const STAGE_WEIGHT = { lead: 0.1, qualified: 0.25, proposal_shared: 0.4, negotiation: 0.7 };
export const PIPELINE_WEIGHTED = String(L.LEADS
  .filter(l => STAGE_WEIGHT[l.stage] !== undefined)
  .reduce((s, l) => s + BigInt(Math.round(Number(l.value) * STAGE_WEIGHT[l.stage])), 0n));

// the small exception counts the sweep needs, from the seed
export const RC_EXPIRING = { count: 0, soonest: null, days: null, validTo: L.dayDate(S.RATE_CONTRACT.items[0].validTo) };
export const RECEIVED_UNCHECKED = { count: S.STOCK.filter(s => s.atGate).length, oldest: `${S.STOCK.find(s => s.atGate).name} · ${S.STOCK.find(s => s.atGate).atGate.qty} ${S.STOCK.find(s => s.atGate).uom}s at the gate` };
export const SITES_NO_REPORT = { count: S.SITES_NO_REPORT.length, names: S.SITES_NO_REPORT.join(', ') };

// ------------------------------------------------------------ rate analysis --
// One rate contract exists on the seed — RC-MEP-01, Prakashvahini, one item — and one order against it
// at 11.24% above the agreed rate, left in draft. The other rows are the demo order's lines: the BOQ's
// client rate, the cost rate the order copied, and no agreed rate because no contract covers them.
const rcItem = S.RATE_CONTRACT.items[0];
export const RATES = [
  { item: rcItem.description, uom: rcItem.uom, trade: 'MEP', boq: null, agreed: [[L.V.Prakashvahini.short, rcItem.contractRate]], paid: L.RC_OVER.unitRate, paidBy: L.V.Prakashvahini.short, paidOn: L.RC_OVER.number, dev: L.RC_OVER.excessBp, state: 'draft' },
  ...L.PO_DEMO.lines.map(l => ({ item: l.desc, uom: l.uom, trade: l.trade, boq: L.BOQ.find(b => b.no === l.boq).rate, cost: l.rate, agreed: [], paid: l.rate, paidBy: L.V.Prakashvahini.short, paidOn: L.PO_DEMO.number, dev: null, state: 'pending_approval' })),
  ...L.BOQ.filter(b => b.sec === 'Flooring').slice(0, 2).map(b => ({ item: b.desc, uom: b.uom, trade: b.sec, boq: b.rate, cost: b.cost, agreed: [], paid: null, paidBy: null, paidOn: null, dev: null, state: null })),
];

// ------------------------------------------------------------ vendors --
const openOf = (key) => L.POS.filter(o => o.vendor.key === key && (o.state === 'approved' || o.state === 'pending_approval'));
export const VENDOR_ROWS = L.VENDORS.map(v => ({ v, trades: v.trade, rates: S.RATE_CONTRACT.vendor === v.key ? S.RATE_CONTRACT.items.length : 0, open: openOf(v.key).length, openValue: L.add('0', ...openOf(v.key).map(o => o.gross)), bills: S.BILLS.filter(b => b.vendor === v.key).length, last: S.SEED_DAY, state: 'active', tds: v.tds, pan: v.pan, desk: v.desk }));

// ------------------------------------------------------------ stock --
// Six items in two stores, Central and Site; the first three sit below their reorder level; a delivery of
// cement is at the gate, received but not yet counted in.
export const STOCK = S.STOCK.map(s => ({ item: s.name, uom: s.uom, store: s.transfer ? 'Central store · Site store' : 'Central store', onHand: String(s.onHand * 1000000), central: s.central, site: s.site, reorder: String(s.reorderWhole * 1000000), last: s.atGate ? `${s.atGate.qty} ${s.uom}s at the gate, not counted in` : s.transfer ? `${s.transfer} ${s.uom}s moved to Site store · ${L.TODAY_SHORT}` : `Issued ${s.issue} ${s.uom}s to site · ${L.TODAY_SHORT}`, low: s.low }));

// ------------------------------------------------------------ daily reports --
// The seed files five reports a day for five days on the first four projects, by the finance login —
// notes and a manpower line per floor; no weather, no photos. The open issues are the site's own.
const latest = (code) => [...S.DAILY_REPORTS].filter(r => r.project === code).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
const rep = latest(L.OPEN);
export const DAILY = {
  date: L.longDate(rep.date), iso: rep.date, site: `${L.OPEN} · ${L.OPEN_PROJECT.name}`, by: `${rep.by.name} · ${rep.by.role.toLowerCase()}`,
  manpower: rep.manpower.map(m => [`${m.trade}, ${m.floor}`, m.headCount]),
  notes: rep.notes,
  issues: S.ISSUES.filter(i => i.project === L.OPEN && i.open).map(i => `${i.title} — ${i.severity}`),
};
export const DAILY_LIST = [...S.DAILY_REPORTS].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.project < b.project ? -1 : 1)).slice(0, 6)
  .map(r => [L.dayDate(r.date), r.project, r.manpower.reduce((n, m) => n + m.headCount, 0), r.manpower.length, S.ISSUES.filter(i => i.project === r.project && i.open).length]);

// ------------------------------------------------------------ imprest --
// NOT SEEDED. The site cash ledger is a screen the seed does not reach; this ledger is the design's
// demonstration of it on ANU-01, held by procurement and topped up by finance — the two seeded people who
// touch site money. The figures are illustrative and are recorded as such in CHANGES.md.
export const IMPREST = {
  site: L.OPEN, holder: P.proc.name, float: R(50_000), balance: R(28_450),
  rows: [
    { on: L.shortDate(L.dayFrom(-1)), what: 'Hardware — anchor bolts, 200 nos', who: P.proc.name, out: R(3_850), receipt: true },
    { on: L.shortDate(L.dayFrom(-1)), what: 'Tempo hire — tile pallets from store', who: P.proc.name, out: R(1_500), receipt: true },
    { on: L.shortDate(L.dayFrom(-2)), what: 'Top-up from head office', who: P.finance.name, in: R(20_000), receipt: false },
    { on: L.shortDate(L.dayFrom(-2)), what: 'Tea and water, site (week 37)', who: P.proc.name, out: R(2_200), receipt: true },
    { on: L.shortDate(L.dayFrom(-3)), what: 'Cutting discs and blades', who: P.proc.name, out: R(1_460), receipt: false },
    { on: L.shortDate(L.dayFrom(-4)), what: 'Electrician overtime — Sunday', who: P.proc.name, out: R(4_800), receipt: true },
  ],
};

// ------------------------------------------------------------ measurement --
// NOT SEEDED. The sheet behind an RA bill: the contract quantities are ANU-01's seeded BOQ lines; what
// was claimed before and what is claimed now are the design's demonstration, including the one line
// measured past its contract quantity. No quantity surveyor exists in the seed; procurement plays it.
const bq = (no) => L.BOQ.find(b => b.no === no);
export const MEASURE = {
  project: L.OPEN, period: `RA bill 03 · 1–30 September`, by: `${P.proc.name} · ${P.proc.role.toLowerCase()}`,
  rows: [
    { no: '1.1', desc: bq('1.1').desc, uom: bq('1.1').uom, contract: bq('1.1').qty, prev: '286000000', now: '38000000' },
    { no: '1.2', desc: bq('1.2').desc, uom: bq('1.2').uom, contract: bq('1.2').qty, prev: '120000000', now: '92500000' },
    { no: '2.2', desc: bq('2.2').desc, uom: bq('2.2').uom, contract: bq('2.2').qty, prev: '96000000', now: '48000000' },
    { no: '2.3', desc: bq('2.3').desc, uom: bq('2.3').uom, contract: bq('2.3').qty, prev: '420000000', now: '210000000' },
    { no: '4.2', desc: bq('4.2').desc, uom: bq('4.2').uom, contract: bq('4.2').qty, prev: '0', now: '208000000' },
    { no: '5.1', desc: bq('5.1').desc, uom: bq('5.1').uom, contract: bq('5.1').qty, prev: '400000000', now: '212000000' },
  ],
};

// ------------------------------------------------------------ recce --
// NOT SEEDED. A site recce on a seeded lead — Upabhogika Stores, Pune, the site visit the seed books
// next — with the design's demonstration facts.
const recceLead = L.LEADS.find(l => l.nextKind === 'site_visit');
export const RECCE = {
  lead: recceLead.name, title: recceLead.title, city: recceLead.city, when: `${L.dayDate(recceLead.nextOn)}, 11:00`, by: `${P.admin.first} · ${P.proc.first}`,
  facts: [['Carpet area', '1,840 sqm'], ['Floors', '1 (14th)'], ['Ceiling height', '3.2 m slab · 2.7 m false'], ['Power', '2 × 200 A, one DB'], ['Access', 'Service lift 1,000 kg · loading 22:00–06:00'], ['Working hours', 'Nights and weekends only']],
  checks: [['Existing drawings received', 'From the client’s facilities team', true], ['Floor plan measured', 'Laser, 48 points', true], ['Photos taken', '24 photos, tagged by zone', true], ['Services traced', 'HVAC ducts, sprinkler, data', false], ['Client sign-off on scope', 'Awaiting the facilities head', false]],
  notes: 'Existing raised floor stays. Retail fixtures are client-supplied; we do the floor, ceiling, power and data. Two columns in the east bay limit the fixture runs to 6.',
};

// ------------------------------------------------------------ tasks & notifications --
// The seed's six tasks, one per project, round-robin over the three staff; two already overdue.
export const TASK_ROWS = S.TASKS.map(t => ({ t: `${t.title} — ${t.project}`, who: t.owner.first, due: L.dueWord(t.due), kind: t.priority === 'high' ? 'approval' : 'project', done: false, overdue: t.overdue, priority: t.priority, project: t.project }));
export const TASKS_OVERDUE = TASK_ROWS.filter(t => !t.done && t.overdue).length;
// Every notification has an actor, a day and one thing you would do about it. The rows are the seed's
// events as the panel would show them to the admin: a bill from the portal, a variation signed, an issue
// raised, a project past its contract, a report filed, a bill gone overdue.
const y = L.dayFrom(-1);
export const NOTIF_ROWS = [
  { day: 'Today', when: '09:42', actor: L.V.Prakashvahini.short, mark: 'P', kind: 'vendor',
    rest: `sent ${S.BILLS.find(b => b.billNumber === 'PEC-RA-02').billNumber}`, sub: `Vendor portal · ${fmt(S.BILLS.find(b => b.billNumber === 'PEC-RA-02').claimed)} · ${S.BILLS.find(b => b.billNumber === 'PEC-RA-02').narrative}`, act: 'Acknowledge the bill', unread: true },
  { day: 'Today', when: '08:15', actor: 'KRA-01', mark: 'K', kind: 'record',
    rest: 'is past its contract', sub: `${L.projectOf('KRA-01').sharePct}% of the contract ordered, every trade bought`, act: 'Open the project', unread: true },
  { day: 'Today', when: '07:50', actor: P.proc.name, mark: P.proc.initials[0], kind: 'person',
    rest: `raised a blocking issue on ${L.OPEN}`, sub: `Site · ${S.ISSUES[0].title}`, act: 'Open the issue', unread: true },
  { day: 'Yesterday', when: '18:05', actor: P.finance.name, mark: P.finance.initials[0], kind: 'person',
    rest: `filed the daily report for ${L.OPEN}`, sub: `Site · ${rep.manpower.reduce((n, m) => n + m.headCount, 0)} on site · ${rep.notes}`, act: 'Open the report', unread: false },
  { day: 'Yesterday', when: '17:20', actor: L.CLIENT_LOGIN.name, mark: 'E', kind: 'client',
    rest: `signed off ${L.VARIATIONS.find(v => v.state === 'client_approved').number}`, sub: `Client portal · ${L.OPEN_PROJECT.clientShort} · ${L.VARIATIONS.find(v => v.state === 'client_approved').title}`, act: 'Open the change order', unread: false },
  { day: L.longDate(S.PAYABLES.overdue[0].dueOn), when: '11:30', actor: S.PAYABLES.overdue[0].vendorShort, mark: 'M', kind: 'vendor',
    rest: `${S.PAYABLES.overdue[0].billNumber} fell due unpaid`, sub: `Money · ${fmt(S.PAYABLES.overdue[0].claimed)} · acknowledged, due ${L.dayDate(S.PAYABLES.overdue[0].dueOn)}`, act: 'Pay the bill', unread: false },
];

// ------------------------------------------------------------ documents --
// Twenty-seven documents across the six projects; the folders are the seed's entity types.
const FOLDER_NAMES = { agreement: 'Agreement and commercial', drawing: 'Drawings — GFC', selection: 'Material selections', site_report: 'Site reports' };
export const DOC_FOLDERS = Object.entries(FOLDER_NAMES).map(([k, name]) => [name, S.DOCUMENTS.filter(d => d.entityType === k).length, L.TODAY_SHORT]);
export const DOC_ROWS = L.DOCS.map(([n, m]) => [n, m, P.admin.name, L.TODAY_SHORT]);

// ------------------------------------------------------------ components --
export const pt = (t, cls = '') => `<h4 class="pt ${cls}">${t}</h4>`;
export const ct = (t) => `<h5 class="ct">${t}</h5>`;
export const h6 = (t, cls = '') => `<h6 class="${cls}" style="margin:0;font-size:inherit">${t}</h6>`;
// ------------------------------------------------------------ the value line --
// One sentence per screen, in the client's words, as an outcome and not a feature. Keyed by the
// sample's own title so it cannot drift from the sample it describes; align.mjs asserts that every
// sample holding a product screen has one.
export const VALUE_LINES = {
  'The Stat, rebuilt': null,   // a component, not a screen
  'Colour where it carries meaning': null,   // specimens, not a screen
  'Today — the working screen': 'Open it at nine and you know the three things that will cost you money this week, and who to ring about each one.',
  'Today, week one': 'On day one it says what to enter before anything else works, and how much of it is left.',
  'Today with Sales and Site switched off': null,   // Today in another state: two modules off, the rows re-flowed
  'Overview — a project’s Today': 'Inside one project it is the same morning screen: the thing on it that needs you, then contract against ordered against billed, what the client is sitting on, and what is next on site.',
  'Reports — the Reports Center': 'Every report the firm runs, in one place, the ones you use starred at the top — and each is a number this product already shows on a card somewhere.',
  'Settings › Terminology': 'Call it what your engineers call it, and every screen and PDF says the same word.',
  'Today · Getting started': 'A tab that stays until the seven setup steps are done — company, GSTIN and TAN, numbering, people, the first project, vendors, Tally — and then leaves.',
  'The same card at five of six': null,   // a later state of the screen above
  'Notifications': 'Everything that moved while you were on site, with the one thing that needs you at the top.',
  'Sales › Pipeline': 'See which deals have stopped moving, and what the quarter is really worth once each one is weighted by how far it has got.',
  'Sales › Leads': 'Find one lead by name when the board has grown too big to scan.',
  'A won lead becomes a project': 'Turn a won lead into a live project without retyping the client, the value or the scope.',
  'Projects — the list': 'See which projects have ordered past their contract before the client works it out.',
  'Project › Build › BOQ': 'Turn the lines you priced into a purchase order without retyping a single quantity.',
  'Step 2 of 3': 'Raise the order against the right vendor and the right project, so it can never be filed under a name that matches two suppliers.',
  'Project › Commercial › Variations': 'Know what extra work the client has agreed to pay for, and what they have gone quiet on.',
  'Project › Documents': 'Find the signed drawing in seconds when the client says that is not what we agreed.',
  'Buying › Orders': 'See every order still waiting on somebody, and which somebody.',
  'Buying › Orders — a row clicked': null,   // the same list, a record open beside it
  'Buying › Orders — the saved views': null,
  'Buying › Orders — the kebab': null,
  'The full order page': 'Approve an order knowing, line by line, whether it is at the rate you already agreed.',
  'Buying › Vendors': 'Pick the vendor you already have a rate with, instead of asking three people for a quote again.',
  'Buying › Rates': 'See when a vendor is quoting above the rate you already agreed, before you approve the order.',
  'Buying › Stock': 'Know what is actually in the store before you buy it twice, or before the site runs out mid-week.',
  'Site › Daily log': 'Know what happened on site without ringing five people, and have it written down when the client asks in four months.',
  'Site › Imprest': 'Know where the site cash went, and which spends still have no receipt behind them.',
  'Site › Measurement': 'Build the running bill from what was actually measured, so the client’s QS has nothing to argue with.',
  'Site › Recce': 'Price the job from what the site actually is — the levels, the access, what is already there — instead of from the brief.',
  'Approvals — the queue': 'Clear the decisions that are holding up other people’s work, oldest first.',
  'Approvals — a row clicked': null,   // the same queue, the decision open beside it
  'Approvals › Tasks': 'See what is overdue and who has it, so nothing sits for a week because two people each thought it was the other’s.',
  'Vendor portal': 'Your vendor accepts the order and sends the bill here, so you stop chasing PDFs around WhatsApp.',
  'Client portal': 'Your client signs off the variation in writing before you build it, so the extra work is agreed and not argued about at the end.',
  'Settings — the hub the gear opens': 'Find the setting you need without remembering which of fourteen pages it lives on.',
  'Settings › Tax': 'Two minutes once, and every tax figure in the product is worked out for your business — each rate marked provisional until a chartered accountant signs it. Nobody enjoys this screen; it is the one that keeps you filing on time.',
  // Section 12 holds the SAME screens in other states and for other roles. A value line belongs to a
  // screen, not to a rendering of it, so each of these is an explicit ruling: no line of its own.
  'A form that would not submit': null,
  'Empty because a filter excluded everything': null,
  'Today — procurement': null,
  'Buying › an order — procurement': null,
  'Site › Imprest — procurement': null,
  'Operator console': 'Not a customer screen. How we create, plan and suspend an organisation — and what we can see of one, which is deliberately very little.',
};
// The keys are short prefixes of long descriptive titles, so the match is by prefix and the LONGEST
// key wins. That is what makes a ruling possible: 'Site › Imprest — procurement…' is longer than
// 'Site › Imprest', so its explicit null beats the screen's sentence and no line is drawn.
// The real guard is below — a key that resolves for two different samples fails the build, because
// a value line attaches to a screen ONCE, on its canonical render.
const USED = new Map();
const valueOf = (title) => {
  const k = Object.keys(VALUE_LINES).filter(x => title.startsWith(x)).sort((a, b) => b.length - a.length)[0];
  if (k === undefined) return undefined;
  if (!USED.has(k)) USED.set(k, new Set());
  USED.get(k).add(title);
  return VALUE_LINES[k];
};
// A key that matched no sample is a dead entry — a screen renamed out from under its own sentence.
export const unusedValueKeys = () => Object.keys(VALUE_LINES).filter(k => !USED.has(k));
// A key that matched two is the failure this whole mechanism exists to prevent.
export const valueKeyCollisions = () => Object.keys(VALUE_LINES)
  .filter(k => (USED.get(k)?.size || 0) > 1)
  .map(k => `${k} -> ${[...USED.get(k)].join(' AND ')}`);
export const vline = (title) => { const v = valueOf(title); return v ? `<p class="vline"><span class="vl-l">What this is for</span>${esc(v)}</p>` : ''; };
// An explicit null is a RULING — this sample is a component or a later state of the screen above, so it
// carries no line of its own. It is marked in the DOM so the gate can tell a ruling from an omission.
export const vexempt = (title) => (valueOf(title) === null ? ' data-value="exempt"' : '');
export const sample = (title, html, tag = '', renders = '') => `<div class="dsx-sample"${renders ? ` data-renders="${renders}"` : ''}${vexempt(title)}><h3>${esc(title)}${tag}</h3>${vline(title)}${html}</div>`;
export const note = (html, head = 'Design note') => `<aside class="dsx-note"><strong class="h">${esc(head)}</strong>${html}</aside>`;
export const say = (text) => `<aside class="dsx-say"><strong class="h">Say this</strong><p>${text}</p></aside>`;
export const tag = (t) => `<span class="dsx-h3-note">${esc(t)}</span>`;   // the document's note on a sample title — not the product's Tag
// A spinner: 12, 16, 24 or 48px. Named when it stands alone; hidden when a busy control already says it is busy.
export const spinner = (size = 's', label = '', cls = '') => `<span class="spinner ${size}${cls ? ' ' + cls : ''}"${label ? ` role="img" aria-label="${esc(label)}"` : ' aria-hidden="true"'}><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7"/></svg></span>`;
export const busyButton = (label, cls = 'primary') => `<button class="btn ${cls}" type="button" aria-busy="true"><span>${esc(label)}</span><span class="spinner-slot">${spinner('s')}</span><span class="sr-only">, working</span></button>`;
// `app` is the audience this frame is calibrated for, and it is declared rather than inferred so the
// India-layer gate can check the rules per audience — no red in the client's own view, no caution
// tone in the vendor's, least chroma in the operator console.
const APP_OF = (meta = '') => /vendor/i.test(meta) ? 'vendor' : /client/i.test(meta) ? 'client' : /operator/i.test(meta) ? 'operator' : 'web';
export const frame = (content, kind, label, meta) => `<div class="dsx-frame ${kind}" data-app="${APP_OF(meta)}"><div class="bar"><i></i><i></i><i></i><span class="lbl">${esc(label)}</span><span class="meta">${esc(meta)}</span></div>${content}</div>`;

// The sidebar, in sections. A section holds three or more pages someone thinks of together; two pages stay one
// flat entry with tabs on the page. Today and Approvals are pinned above everything and never fold. `sc` is the
// page's scope from the route table in 12: 'tenant' pages are the firm's and are marked when a project is chosen.
// A section is a disclosure — a button with aria-expanded controlling a list of links — never a menu or a tree.
// ============================================================ the two navigations, one shell --
// (19 September 2026) Picking a project in the top bar changes the sidebar; it does not filter it. At the
// firm level the sidebar is the firm's functions; inside a project it is that project's lifecycle. Both trees
// are in nav.mjs, with the routes table that says which module and action gate each entry.
export const NAV_TREE = NAV_FIRM;   // the name earlier parts of the set import
const NAV_OPERATOR = [
  { href: '/operator', t: 'Organisations', ic: 'layers', pin: true, m: /^Organisations/ },
  { href: '/operator/provisioning', t: 'Provisioning', ic: 'cog', m: /^Provisioning/ },
  { href: '/operator/activity', t: 'Activity', ic: 'clock', m: /^Activity/ },
];
const treeFor = (level) => (level === 'project' ? NAV_PROJECT : level === 'operator' ? NAV_OPERATOR : NAV_FIRM);
// the flyout is lifted out of the nav and placed by the shell beside the rail; its top is the section's row
let FLY_OUT = '';
export const takeFlyout = () => { const f = FLY_OUT; FLY_OUT = ''; return f; };
let NAV_UID = 0;
// a label such as 'Project · MERI-01 · BOQ' names its project; so does a scope passed outright
const CODE = /^[A-Z]{4}-\d{2}$/;
export const inferScope = (scope, label = '') => scope || (label.split(' · ').find((p, i) => i > 0 && CODE.test(p)) ?? null);
// which page is current: the frame's label names it ('Buying · Orders', 'Money · Bills', 'Project · MERI-01 · BOQ');
// a record opened from a list ('Buying · PO-0041') marks that list with aria-current="true"
export function navCurrent(current, label = '', level = 'firm') {
  const parts = label.split(' · ').filter(p => !CODE.test(p));
  const names = parts.slice().reverse();
  const tree = treeFor(level);
  for (const name of names) {
    for (const n of tree) {
      if (n.sep) continue;
      if (!n.pages) { if (n.m && n.m.test(name)) return { section: null, href: n.href, exact: !/^(PO-|setup)/.test(name) }; continue; }
      for (const p of n.pages) if (p.m.test(name)) return { section: n.id, href: p.href, exact: !/^(PO-|setup)/.test(name) };
    }
  }
  return { section: null, href: null, exact: true };
}
const countOf = (n, badge) => (n.count === 'badge' ? badge : n.count || 0);
const cnt = (n, what) => (n ? `<span class="badge" title="${n} ${esc(what)}">${n}<span class="sr-only"> ${esc(what)}</span></span>` : '');
// the "+" on the current page's pill: that module's quick-create
const NEW_OF = { Orders: 'New order', Bills: 'New bill', Leads: 'New lead', Pipeline: 'New lead', 'All projects': 'New project', Documents: 'Upload a document', Drawings: 'Upload a drawing', Vendors: 'New vendor', 'Agreed rates': 'New agreed rate', Stock: 'Stock receipt', 'Daily reports': 'File today’s report', Site: 'File today’s report', Payments: 'New payment', 'Client billing': 'New invoice', Variations: 'New variation', BOQ: 'New BOQ line', Takeoff: 'New takeoff', Milestones: 'New milestone', Team: 'Add a person', Timesheets: 'New timesheet', Organisations: 'New organisation', 'Rate analysis': 'New rate', Selections: 'New selection', Joinery: 'New joinery item', 'Client actions': 'New client action', Recce: 'New recce' };
// open: which sections are open — by default the one holding the current page, because arriving by a link opens it
export function sideNav({ current = '/', label = '', badge = BLOCKED.length, scope = null, open = null, closed = [], rail = false, fly = null, app = 'web' } = {}) {
  const level = app === 'operator' ? 'operator' : scope ? 'project' : 'firm';
  const cur = navCurrent(current, label, level);
  const tree = treeFor(level);
  const isOpen = (id) => !closed.includes(id) && (open ? open.includes(id) : id === cur.section);
  const rowsBefore = (id) => tree.slice(0, tree.findIndex(n => n.id === id)).filter(n => !n.sep).length;
  const link = (href, t, n, ic = '', say = '') => {
    const here = href === cur.href;
    const a = `<a href="#" ${here ? `aria-current="${cur.exact ? 'page' : 'true'}"` : ''} title="${esc(t)}">${ic ? icon(ic) : ''}<span class="nav-t">${esc(t)}</span>${cnt(n, say)}</a>`;
    const plus = here && NEW_OF[t] ? `<button class="nav-plus" type="button" aria-label="${esc(NEW_OF[t])}">${icon('plus', 'i sm')}</button>` : '';
    return here ? `<div class="nav-cur">${a}${plus}</div>` : a;
  };
  const items = tree.map(n => {
    if (n.sep) return '<div class="nav-sep" role="presentation"></div>';
    if (!n.pages) return link(n.href, n.t, countOf(n, badge), n.ic, n.say);
    const uid = `nav-${n.id}-${++NAV_UID}`; const o = isOpen(n.id); const total = n.pages.reduce((s, p) => s + (p.count || 0), 0);
    const holds = cur.section === n.id;
    const exp = rail ? fly === n.id : o;
    const target = rail ? `${uid}-fly` : uid;
    const head = `<button class="nav-h${holds ? ' has-current' : ''}" type="button" aria-expanded="${exp}" aria-controls="${target}" title="${esc(n.t)}">${icon(n.ic)}<span class="nav-t">${esc(n.t)}</span>${total ? `<span class="badge nav-sum" title="${total} need attention inside">${total}<span class="sr-only"> need attention inside</span></span>` : ''}<span class="nav-chev">${icon('caret', 'i sm')}</span></button>`;
    const pages = `<ul class="nav-pages" id="${uid}"${o ? '' : ' hidden'}>${n.pages.map(p => `<li>${link(p.href, p.t, p.count, '', p.say)}</li>`).join('')}</ul>`;
    const flyout = rail && fly === n.id ? `<div class="nav-fly" id="${target}" style="top:calc(var(--space-150) + ${rowsBefore(n.id)} * (var(--nav-item-height) + var(--space-025)))"><div class="nav-fly-t">${icon(n.ic)}${esc(n.t)}</div><nav class="side-nav" aria-label="${esc(n.t)}">${pages.replace(' hidden', '')}</nav></div>` : '';
    if (flyout) FLY_OUT = flyout;
    return `<div class="nav-sec${o ? ' open' : ''}">${head}${pages}</div>`;
  }).join('');
  // inside a project the tree sits under the project's own block, with the way back above it
  const p = level === 'project' ? projectBlock(scope) : null;
  const head = p ? `<a class="nav-back" href="#">${icon('left', 'i sm')}<span class="nav-t">All projects</span></a><div class="nav-proj"><b class="code">${esc(p.code)}</b><span class="name">${esc(p.name)}</span>${p.mark}<small>${esc(p.client)} · ${p.contract}</small></div>` : '';
  return head + items;
}
// the project block at the head of the project-level sidebar

// The shell — one template every app frame wears. The top bar spans the whole window on --topbar (navy, the
// brand's subtlest surface read in the dark set: the bar carries data-theme="dark" and resolves the dark set in
// both themes): a 200px brand column over the sidebar with a line-icon mark and the product's name, the project
// switcher on the lifted fill, the recent-history clock, the search on the lifted fill with its scope in the
// placeholder; at the right the demo notice when it is one, the tenant's name, a divider, the quick-create square
// in the brand's mark colour with a white plus, the bell, the gear, a 28px avatar. Each app states its controls:
// vendor — no switcher, no square, no gear; client — a switcher only with more than one project, no square, no
// gear; operator — its own switcher, tenants not projects.
const searchScope = (label, scope, app) => {
  if (app === 'vendor') return 'Search your orders and bills';
  if (app === 'client') return 'Search in your project';
  if (app === 'operator') return 'Search organisations';
  // the page's name from the frame's label: a section may lead, a code or a description ("the sheet open", "an order") never counts
  const SECTION = /^(Buying|Money|Site|Sales|Projects|Project|Settings|Reports|Approvals)$/;
  const parts = label.split(/ [·›] /).filter(p => !CODE.test(p) && /^[A-Z]/.test(p) && !/^(A|An|The) /.test(p));
  let page = parts.length > 1 && SECTION.test(parts[0]) ? parts[1] : parts[0] || '';
  if (/^(PO-|TI-|PV-|RA-)/.test(page)) page = 'Orders';
  // (19 September) Today is not a scope: at the firm it is everything; inside a project, Overview is the project
  if (scope && (/^(Today|Overview|Not found|Project)$/.test(page) || !page)) return `Search in ${scope}`;
  if (/^(Today|Project|Projects)?$/.test(page) && !scope) return 'Search everything';
  return `Search in ${page}${scope ? ` · ${scope}` : ''}`;
};
export function topBar({ app = 'web', current = '/', label = '', who = L.ME.first, role = L.ME.role, bell = 3, scope = null, scopePop = '', held = '', newOpen = false, tenant = L.TENANT.short, demo = false, tenants = 1, projects = 1, historyOpen = false } = {}) {
  const brand = `<a class="brand-bar" href="#" aria-label="Construct-O-Genie, home"><span class="mark" aria-hidden="true">${icon('mark')}</span><span class="brand-t">Construct-O-Genie</span></a>`;
  const switcher = app === 'web' ? scopeTrigger(scope, { open: !!scopePop, pop: scopePop, held })
    : app === 'operator' ? tenantSwitcher()
    : app === 'client' && projects > 1 ? scopeTrigger(scope, { open: !!scopePop, pop: scopePop }) : '';
  const history = app === 'web' || app === 'operator' ? `<div class="history-wrap"><button class="btn icon ghost history" type="button" aria-haspopup="dialog" aria-expanded="${historyOpen}" aria-label="Recent history">${icon('clock')}</button>${historyOpen ? recentPanel() : ''}</div>` : '';
  const ph = searchScope(label, scope, app);
  const search = `<div class="search"><span class="ico">${icon('search')}</span><input type="search" aria-label="${esc(ph)}" placeholder="${esc(ph)} ( / )"><button class="search-scope" type="button" aria-label="Choose where to search">${icon('chevron', 'i sm')}</button></div><button class="btn icon ghost search-btn" type="button" aria-label="Search">${icon('search')}</button>`;
  const notice = demo ? `<span class="demo-note" title="This organisation is a demonstration. Nothing in it is real.">Demo organisation</span>` : '';
  const org = app === 'vendor' || app === 'client' ? `<span class="tenant" title="Whose portal this is">${esc(tenant)}</span>`
    : tenants > 1 ? `<button class="tenant tenant-btn" type="button" aria-haspopup="listbox" aria-label="${esc(tenant)}. Change organisation">${esc(tenant)}${icon('chevron', 'i sm')}</button>` : `<span class="tenant" title="The organisation signed in">${esc(tenant)}</span>`;
  const square = app === 'web' || app === 'operator' ? `<span class="bar-div" role="presentation"></span>${newButton(newOpen, scope, app)}` : '';
  const gear = app === 'web' || app === 'operator' ? `<a class="btn icon ghost settings-link" href="#" ${current === '/settings' ? 'aria-current="page"' : ''} aria-label="Settings">${icon('settings')}</a>` : '';
  const bellBtn = `<button class="btn icon ghost bell" type="button" aria-label="Notifications, ${bell} unread">${icon('bell')}${bell ? `<span class="badge important" aria-hidden="true">${bell}</span>` : ''}</button>`;
  const me = `<button class="me" type="button" aria-haspopup="menu" aria-label="Account menu for ${esc(who)}, ${esc(role)}"><span class="avatar">${esc(who[0])}</span></button>`;
  const portal = app === 'vendor' || app === 'client';   // no sidebar behind a menu button, no square, no gear
  return `<header class="topbar" data-theme="dark" data-app="${app}">${portal ? '' : `<button class="btn icon ghost nav-open" type="button" aria-label="Open menu">${icon('menu')}</button>`}${brand}${switcher}${history}${search}<span class="spacer"></span>${notice}${org}${square}${bellBtn}${gear}${me}</header>`;
}
// the operator's switcher: tenants, not projects
const tenantSwitcher = () => `<div class="scope"><button class="scope-btn" type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="Working across all organisations. Choose one">${icon('layers')}<span class="sc">All organisations</span>${icon('chevron', 'i sm')}</button></div>`;
// the recent-history panel: the last records this person opened, newest first
const RECENT = [[L.PO_DEMO.number, `${L.V.Prakashvahini.short} · ${L.OPEN}`, 'cart', '2 minutes ago'], [S.INVOICES[3].number, `${S.INVOICES[3].clientShort} · ${S.INVOICES[3].project}`, 'bill', 'today, 09:12'], ['SAN-01', L.projectOf('SAN-01').name, 'projects', 'yesterday'], [L.V.Sagwan.short, 'vendor', 'users', 'yesterday'], ['RA bill 03', `measurement sheet · ${L.OPEN}`, 'doc', 'Tue']];
export const recentPanel = () => `<div class="popup history-pop page-theme" role="dialog" aria-label="Recent history"><p class="menu-t">Recently opened</p><ul class="menu">${RECENT.map(([t, s, ic, when]) => `<li role="none"><a class="menu-i" role="menuitem" href="#">${icon(ic)}<span class="menu-c"><span>${esc(t)}</span><small>${esc(s)} · ${esc(when)}</small></span></a></li>`).join('')}</ul></div>`;

export function shell(content, { desktop = false, current = '/', keep = false, label = '', who = L.ME.first, role = L.ME.role, badge = BLOCKED.length, drawer = '', popover = '', bell = 3, app = 'web', scope = null, scopePop = '', url = '', phone = false, overlay = '', navOpen = null, navClosed = [], navFly = null, banner = '', newOpen = false, tenant = L.TENANT.short, demo = false, tenants = 1, historyOpen = false, held = '' } = {}) {
  scope = inferScope(scope, label);
  const nav = sideNav({ current, label, badge, scope, open: navOpen, closed: navClosed, rail: !!navFly, fly: navFly, app });
  const fly = takeFlyout();
  const bar = topBar({ app, current, label, who, role, bell, scope, scopePop, held, newOpen, tenant, demo, tenants, historyOpen });
  const pinned = scope && app === 'web' ? `<nav class="side-nav" aria-label="Firm-wide"><a href="#" title="Approvals">${icon('check-sq')}<span class="nav-t">Approvals</span>${cnt(badge, 'waiting on you, firm-wide')}</a></nav>` : '';
  const side = `<aside class="side"><nav class="side-nav" aria-label="Main">${nav}</nav>`
    + `<div class="foot">${pinned}<a class="nav-foot" href="#" title="Configure features">${icon('cog')}<span class="nav-t">Configure features</span></a><button class="nav-collapse" type="button" aria-label="Collapse the sidebar to its icons">${icon('collapse')}<span class="nav-t">Collapse</span></button></div></aside>`;
  // (19 September, the grid) `desktop`: the frame runs to 1400px — a director's laptop, where the four-tile row fits — and
  // scrolls sideways in the document's column; at the document's narrower renders it is the window's width
  return `${desktop ? '<div class="dsx-wide">' : ''}<div class="dsx-frame web${desktop ? ' desktop' : ''}${phone ? ' phone-w' : ''}${keep ? ' keep' : ''}" data-app="${app}"><div class="bar"><i></i><i></i><i></i><span class="lbl">${esc(label)}</span>${url ? `<span class="meta url"><code>${esc(url)}</code></span>` : '<span class="meta">apps/web · rail under 1000px · hidden under 640px</span>'}</div>
${banner}<div class="app">${bar}<div class="body">${side}<div class="main"><main class="page">${content}</main></div>${fly}</div></div>${popover}${drawer}${overlay}</div>${desktop ? '</div>' : ''}`;
}
export const card = (title, body, { actions = '', sub = '', cls = '' } = {}) => `<section class="card ${cls}">${title === null ? '' : `<div class="card-h">${ct(title + (sub ? `<span class="sub">${esc(sub)}</span>` : ''))}${actions}</div>`}${body}</section>`;

// Sparkline. The line carries SERIES IDENTITY and never condition — it is always --series-1, because a
// line that turns red says "everything is bad" and that is almost never what the data means. Where a
// real limit exists the EXCEPTION is marked instead, on three channels none of which is hue:
//   · a shaded BAND over the out-of-tolerance region (an area, the one shape amber can hold)
//   · a neutral dashed THRESHOLD rule saying where the limit is
//   · a DIAMOND at the point it was crossed, and on the end dot if it is still out
// `limit` is in the same units as `values`; `worse` says which side of it is the bad side.
// the sparkline, the hero's meter and every other chart are the grammar's — charts.mjs
import { spark, meterOne } from './charts.mjs';
export { spark };
export * as CH from './charts.mjs';
import { duo, duoFor, DUO_NAMES, DUO_WHERE, HUB_DISC } from './duotone.mjs';
export { duo, duoFor, DUO_NAMES, DUO_WHERE, HUB_DISC };
// the Stat: label · large tabular figure · delta (direction, magnitude, period) · sparkline · optional note row
// a stat's disc: the hue names what the figure is about — green money in, red money out, yellow what needs watching,
// teal cash, blue orders and contracts, purple people and what waits on them — and a neutral grey when it is a plain count
const DISC_HUES = [
  [/overdue|at risk|above the agreed|below reorder|short|snag|issue|you owe|expiring|no agreed rate|statutory|not checked|carpet tile/, 'yellow'],
  [/won|due from the client|client value|next expected|measured to date|received\b(?!.*not)/, 'green'],
  [/^cost|paid|declined|withdrawn/, 'red'],
  [/cash|imprest/, 'teal'],
  [/waiting|held by|to acknowledge|open, all people|on site today|approval/, 'purple'],
  [/order|contract|invoiced|pipeline|margin$|agreed rate|ceiling/, 'blue'],
];
// the icon is the duotone family's (duotone.mjs), by the figure's job: the invoice with its arrow for money with a
// direction, the voucher for money without one, the gauge for a share of a contract, the in-tray for what waits
const discFor = (label, value) => {
  const l = String(label).toLowerCase(), v = String(value);
  const ic = /margin/.test(l) ? 'margin' : /ceiling|past its contract|over the contract/.test(l) ? 'ceiling' : /contract|ordered against/.test(l) ? 'contract'
    : /held by|approv|waiting|to acknowledge/.test(l) ? 'tray' : /retention|held now|held back/.test(l) ? 'held' : /order/.test(l) ? 'orders'
    : /site|report|snag|visit|recce/.test(l) ? 'site' : /people|client|vendor|person/.test(l) ? 'people' : /due|today|date|day|expir|next/.test(l) ? 'due'
    : /receiv|due from|won|client value|billed/.test(l) && /₹/.test(v) ? 'invoice-in' : /^cost|paid|payable|declined|withdrawn|released/.test(l) && /₹/.test(v) ? 'invoice-out'
    : /₹/.test(v) ? 'voucher' : /rate|item|stock|tile|material/.test(l) ? 'stock' : 'count';
  const hue = (DISC_HUES.find(([re]) => re.test(l)) || [null, 'gray'])[1];
  return [hue, ic];
};
export const stat = (label, value, { delta = '', tone = '', series = null, limit = null, worse = 'above', noteHtml = '', cls = '', txt = false, thr = null, disc = null } = {}) => {
  const d = disc || discFor(label, value);
  return `<div class="stat ${cls}"><span class="disc ${d[0]}" aria-hidden="true">${duo(duoFor(d[1]))}</span><div class="l">${esc(label)}</div><div class="vbox"><div class="v${txt ? ' txt' : ''}">${value}</div></div>${delta ? `<div class="d ${tone}">${delta}</div>` : ''}${series ? spark(series, { limit, worse, thr }) : ''}${noteHtml ? `<div class="n">${noteHtml}</div>` : ''}</div>`;
};
export const delta = (dir, amount, period) => `<b>${dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→'}&nbsp;${amount}</b> ${esc(period)}`;
// the hero: the one thing on the screen
export const hero = ({ eyebrow, value, unit = '', text, delta: d = '', tone = '', series = null, limit = null, worse = 'above', thr = null, actions = '', foot = '', cls = '', bar = null }) =>
  `<section class="hero ${cls}" aria-label="${esc(eyebrow)}"><span class="eyebrow">${esc(eyebrow)}</span><div class="v">${value}${unit ? `<small>${unit}</small>` : ''}</div><p class="p">${text}</p><div class="hs">${series ? spark(series, { w: 220, h: 64, limit, worse, thr }) : ''}${d ? `<div class="d ${tone}">${d}</div>` : ''}</div>${bar ? meterOne(bar) : ''}${actions ? `<div class="a">${actions}</div>` : ''}${foot ? `<div class="foot">${foot}</div>` : ''}</section>`;

// illustrations — six drawings from the trade, in illustrations.mjs; every empty state names its subject
import { illoSymbols, illo, ILLO_SUBJECTS, ILLO_FOR, ILLO_CAPTION } from './illustrations.mjs';
import { newButton } from './cards.mjs';
export { illoSymbols, illo, ILLO_SUBJECTS, ILLO_FOR, ILLO_CAPTION };
export const afterSetup = () => `<span class="pill">${icon('cog', 'i sm')}After setup</span>`;
// empty state, as published: image, heading, description, then the secondary action before the primary, and a
// tertiary link under them; wide (464px of text) or narrow (304px). The image is decorative — aria-hidden — and the
// heading and description say everything it does.
export const empty = (ic, title, text, action = '', { secondary = '', tertiary = '', narrow = false, cls = '' } = {}) =>
  `<div class="empty${narrow ? ' narrow' : ''}${cls ? ' ' + cls : ''}">${illo(ic)}<h4 class="es-h">${esc(title)}</h4><p>${text}</p>${action || secondary ? `<div class="actions">${secondary}${action}</div>` : ''}${tertiary ? `<p class="es-t">${tertiary}</p>` : ''}</div>`;
export const emptyFiltered = (ic, title, text, action = '') => empty(ic, title, text, action, { narrow: true, cls: 'filtered' });
// a section message's actions are links, whatever the caller drew them as — the published action is a link
export const notice = (kind, title, body, actions = '') => `<div class="notice ${kind}" role="${kind === 'bad' ? 'alert' : 'note'}">${icon(kind === 'bad' ? 'alert' : kind === 'warn' ? 'alert' : 'info')}<div><span class="t">${esc(title)}</span><p>${body}</p>${actions ? `<div class="actions">${actions.replace(/class="btn[^"]*"/g, 'class="link-btn"')}</div>` : ''}</div></div>`;
export const refuse = (reason, title = 'Not possible right now') => notice('bad', title, esc(L.REFUSAL_SENTENCES[reason] ?? reason), `<button class="btn" type="button">${icon('copy')}Copy details for support</button>`);
// a full-page answer — unreachable, not found, gone wrong, signed out — is an empty state with a primary action, as published; a refusal inside a screen stays a section message
export const unreachable = (narrow = true) => empty('unreachable', 'We can’t reach Construct-O-Genie right now', 'Nothing was saved. Check your connection and try again — your work on this page is still here.', `<button class="btn primary" type="button">${icon('refresh')}Try again</button>`, { narrow, tertiary: '<a href="#">Copy details for support</a>' });
// The loading state is the table it replaces, with shimmer where the text will be — so the page cannot
// change height when the data arrives, and the header is readable while you wait.
export const skeleton = (n = 3, cols = [['Order', ''], ['Vendor', ''], ['Raised', 'num'], ['Amount', 'num']]) =>
  `<div class="tbl-wrap"><table class="tbl skel" role="status" aria-label="Loading"><thead><tr>${cols.map(([c, k]) => `<th${k ? ` class="${k}"` : ''}>${esc(c)}</th>`).join('')}</tr></thead><tbody>${Array.from({ length: n }, () => `<tr>${cols.map(([, k]) => `<td${k ? ` class="${k}"` : ''}><span class="skeleton"></span></td>`).join('')}</tr>`).join('')}</tbody></table><p class="skel-note muted">Loading…</p></div>`;
export const field = (name, label, { type = 'text', value = '', hint = '', placeholder = '', required = false, error = '', money = false } = {}) =>
  `<div class="field${error ? ' invalid' : ''}"><label for="${name}">${esc(label)}${required ? '<span class="req" aria-hidden="true">*</span>' : ''}</label>${money ? '<div class="money-in">' : ''}<input id="${name}" name="${name}" type="${type}" ${value ? `value="${esc(value)}"` : ''} ${placeholder ? `placeholder="${esc(placeholder)}"` : ''} ${required ? 'required' : ''} ${error ? `aria-invalid="true" aria-describedby="${name}-err"` : ''} ${money ? 'inputmode="decimal"' : ''}>${money ? '</div>' : ''}${error ? `<span class="err" id="${name}-err">${esc(error)}</span>` : hint ? `<span class="hint">${esc(hint)}</span>` : ''}</div>`;
export const moneyField = (name, label, value = '', hint = 'Rupees, up to two decimals. Commas are fine.', required = false, error = '') => field(name, label, { value, hint, placeholder: '0.00', required, money: true, error });
export const choice = (name, label, options, value = '', hint = '') => `<div class="field"><label for="${name}">${esc(label)}</label><select id="${name}" name="${name}"><option value="">Choose…</option>${options.map(([v, t]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</div>`;
export const notes = (name, label, rows = 3, hint = '') => `<div class="field"><label for="${name}">${esc(label)}</label><textarea id="${name}" name="${name}" rows="${rows}"></textarea>${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</div>`;
// a searchable select: one control, the published select's anatomy — typing into it filters the list (a datalist, so it works on the page)
export const picker = (name, label, options, hint = '', error = '') => `<div class="field${error ? ' invalid' : ''}"><label for="${name}">${esc(label)}</label><div class="select-wrap"><input id="${name}" name="${name}" type="text" list="${name}-list" role="combobox" aria-autocomplete="list" aria-expanded="false" autocomplete="off" placeholder="Choose…" ${error ? `aria-invalid="true" aria-describedby="${name}-err"` : ''}><datalist id="${name}-list">${options.map(([v, t]) => `<option value="${esc(t)}"></option>`).join('')}</datalist></div>${error ? `<span class="err" id="${name}-err">${esc(error)}</span>` : hint ? `<span class="hint">${esc(hint)}</span>` : ''}</div>`;
export const drawer = (title, body, footer, sub = '') => `<div class="scrim" aria-hidden="true"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="drawer-h"><div>${ct(title)}${sub ? `<p class="ps" style="margin-top:var(--space-025)">${sub}</p>` : ''}</div><button class="btn icon ghost" type="button" aria-label="Close">${icon('x')}</button></div><div class="drawer-b">${body}</div>${footer ? `<div class="drawer-f">${footer}</div>` : ''}</aside>`;
// The notifications panel. Grouped by day, one actor per row, one action per row.
export const popover = (title, rows, foot = '') => {
  let day = null;
  const body = rows.map(r => {
    const head = r.day !== day ? `<li class="day" role="presentation"><span>${esc(r.day)}</span></li>` : '';
    day = r.day;
    return head + `<li class="n${r.unread ? ' unread' : ''}">`
      + `<span class="avatar${r.kind === 'record' ? ' rec' : ''}" aria-hidden="true">${esc(r.mark)}</span>`
      + `<div class="b"><p><b>${esc(r.actor)}</b> ${esc(r.rest)}</p><small>${esc(r.sub)}</small>`
      + `<div class="acts"><button class="btn sm" type="button">${esc(r.act)}</button>${r.unread ? '<button class="btn sm ghost" type="button">Mark read</button>' : ''}</div></div>`
      + `<span class="when">${esc(r.when)}${r.unread ? '<i class="dot" aria-label="Unread"></i>' : ''}</span></li>`;
  }).join('');
  const unread = rows.filter(r => r.unread).length;
  return `<div class="popover" role="dialog" aria-label="${esc(title)}"><div class="ph"><span>${esc(title)}<b>${unread} unread</b></span><button class="link-btn" type="button">Mark all read</button></div><ol class="notifs">${body}</ol>${foot ? `<div class="pf">${foot}</div>` : ''}</div>`;
};
export const gate = (title, text, bullets, action = '') => `<div class="gate">${illo('money')}<div><b>${esc(title)}</b><p>${text}</p>${bullets.length ? `<ul>${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}${action ? `<div class="actions">${action}</div>` : ''}</div></div>`;
export const tick = (done) => `<span class="tick" aria-hidden="true">${done ? icon('check', 'i sm') : ''}</span>`;
export const tabs = (items, current) => `<nav class="tabs" aria-label="Sections">${items.map(t => `<a href="#" ${t === current ? 'aria-current="page"' : ''}>${esc(t)}</a>`).join('')}</nav>`;
// ------------------------------------------------------------ applied state --
// A filter that is ON says so, and says what it did. The chip carries the field and the value, because
// "Trade" alone does not tell you which trade is hiding the other 46 rows.
export const chips = (items) => `<div class="chips"><span class="chips-l">Filtered by</span>${items.map(([k, v]) => removableTag(k, v)).join('')}<button class="btn sm ghost" type="button">Clear all</button></div>`;

// The row count is not decoration. A buyer with three years of history needs to know whether they are
// looking at everything or at the first page of it, and which of those two the count means.
export const pager = ({ from, to, total, page = 1, pages = 1, unit = 'rows', filtered = null, per = null }) => {
  const perPage = per ?? (pages > 1 ? to - from + 1 : 50);   // the page size: what a page holds, or the default when all fits on one
  const nums = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
  const count = total === 0
    ? `<b>No ${esc(unit)}</b>${filtered === null ? '' : ` <span class="of">of ${filtered.toLocaleString('en-IN')} match</span>`}`
    : `Total <b>${total.toLocaleString('en-IN')}</b> ${esc(unit)}${filtered === null ? '' : ` <span class="of">filtered from ${filtered.toLocaleString('en-IN')}</span>`} · ${perPage} per page · <b>${from.toLocaleString('en-IN')}–${to.toLocaleString('en-IN')}</b>`;
  return `<div class="pager"><p class="count">${count}</p>
<nav class="pages" aria-label="Pages"><button class="pg" type="button" ${page === 1 ? 'disabled' : ''} aria-label="Previous page">${icon('left', 'i sm')}</button><span class="sr-only">Page ${page} of ${pages}</span><button class="pg" type="button" ${page === pages ? 'disabled' : ''} aria-label="Next page">${icon('right', 'i sm')}</button></nav></div>`;
};

// A selection is a mode. It says how many, it offers only what applies to a set, and it can be left.
export const bulkbar = (n, actions) => `<div class="bulkbar" role="region" aria-label="${n} selected"><span class="n"><b>${n}</b> selected</span><div class="ba">${actions}</div><button class="btn sm ghost" type="button">Clear selection</button></div>`;

// A sortable column header. The arrow points the way the rows are actually ordered, and aria-sort says it.
export const sortTh = (label, { dir = null, num = false } = {}) => `<th ${num ? 'class="num" ' : ''}${dir ? `aria-sort="${dir}"` : ''}><button class="sort" type="button">${esc(label)}${dir ? icon(dir === 'ascending' ? 'up' : 'down', 'i sm') : icon('sort', 'i sm off')}</button></th>`;

// A row checkbox.
export const selTh = () => `<th class="sel"><input type="checkbox" aria-label="Select all rows on this page"></th>`;
export const selTd = (on = false) => `<td class="sel"><input type="checkbox" ${on ? 'checked' : ''} aria-label="Select this row"></td>`;

// A page inside a sidebar section has no tab strip of its own: the section IS its navigation, and a second copy of the
// same four links under the title is two places to look for one thing. Two-page destinations keep their tabs.
const SECTION_SETS = NAV_TREE.filter(n => n.pages).map(n => n.pages.map(p => p.t));
const isSectionSet = (items) => SECTION_SETS.some(set => set.length === items.length && items.every(t => set.includes(t)));
export const subtabs = (items, current) => isSectionSet(items) ? '' : `<nav class="subtabs" aria-label="Views">${items.map(t => `<a href="#" ${t === current ? 'aria-current="page"' : ''}>${esc(t)}</a>`).join('')}</nav>`;
export const pct100 = (part, whole) => L.pct(part, whole).toFixed(0);

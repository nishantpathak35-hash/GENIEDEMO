// data.mjs — money formatting, the contract's state tables, and the sample (from the seed, below).
// Every rupee figure in the output passes through fmt(), a verbatim port of
// packages/money/src/format.ts. It THROWS on anything that is not a canonical
// paise wire string, so a mistyped figure fails the build instead of shipping.

const WIRE = /^-?(?:0|[1-9][0-9]*)$/;
function groupIndian(digits) {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3); const rest = digits.slice(0, -3); const pairs = [];
  let i = rest.length;
  while (i > 2) { pairs.unshift(rest.slice(i - 2, i)); i -= 2; }
  if (i > 0) pairs.unshift(rest.slice(0, i));
  return `${pairs.join(',')},${last3}`;
}
function parseWire(wire, caller) {
  if (typeof wire !== 'string') throw new Error(`${caller}: wire must be a string, got ${typeof wire} (${String(wire)})`);
  if (!WIRE.test(wire)) throw new Error(`${caller}: "${wire}" is not a canonical amount of paise`);
  const negative = wire.startsWith('-'); const digits = negative ? wire.slice(1) : wire;
  return { negative: negative && digits !== '0', digits };
}
function split(digits) { const p = digits.padStart(3, '0'); return { rupees: p.slice(0, -2), paise: p.slice(-2) }; }
export function fmt(wire) {
  const { negative, digits } = parseWire(wire, 'fmt'); const { rupees, paise } = split(digits);
  return `${negative ? '-' : ''}₹${groupIndian(rupees)}.${paise}`;
}
export function fmtQty(micros) {
  const { negative, digits } = parseWire(micros, 'fmtQty'); const p = digits.padStart(7, '0');
  const whole = p.slice(0, -6); const frac = p.slice(-6).replace(/0+$/, '');
  return `${negative ? '-' : ''}${groupIndian(whole)}${frac.length ? '.' + frac : ''}`;
}
export function fmtBp(bp) {
  if (!Number.isInteger(bp)) throw new Error('bp must be integer');
  const neg = bp < 0; const d = String(neg ? -bp : bp).padStart(3, '0');
  const whole = d.slice(0, -2); const frac = d.slice(-2).replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac.length ? '.' + frac : ''}%`;
}
// Rupees -> wire, generator-side only (the app never does this).
export const R = (rupees, paise = 0) => { if (!Number.isInteger(rupees) || !Number.isInteger(paise)) throw new Error('R takes integers'); return String(BigInt(rupees) * 100n + BigInt(paise)); };
export const NEG = (wire) => wire === '0' ? '0' : (wire.startsWith('-') ? wire.slice(1) : '-' + wire);
export const add = (...wires) => String(wires.reduce((s, w) => s + BigInt(w), 0n));
export const mulQty = (micros, rateWire) => String((BigInt(micros) * BigInt(rateWire)) / 1000000n);
export const pct = (part, whole) => Number((BigInt(part) * 10000n) / BigInt(whole)) / 100; // bar widths only

// ---------------------------------------------------------------- html --
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const money = (wire, why = 'absent, not zero') => wire === null
  ? `<span class="num absent" title="${esc(why)}" aria-label="absent: ${esc(why)}">—</span>`
  : `<span class="num">${fmt(wire)}</span>`;
export const td = (wire, why) => `<td class="num">${money(wire, why)}</td>`;
export const gated = (label = 'Not yet available') => `<span class="gated" title="CA-gated: no figure is shown until a chartered accountant has verified the rule"><svg class="i" aria-hidden="true"><use href="#i-lock"/></svg>${esc(label)}</span>`;
export function pill(tone, text) { return `<span class="pill${tone === 'idle' ? '' : ' ' + tone}">${esc(text)}</span>`; }
export const icon = (name, cls = 'i') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
export const note = (html) => `<aside class="dsx-note"><strong>Design note</strong>${html}</aside>`;
export const proposed = (text = 'Proposed') => `<span class="dsx-tag">${esc(text)}</span>`;
export const kv = (rows) => `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;

// PO state labels: the values are the contract's (purchase-orders.ts:623); the label is ours.
export const PO_STATES = [['draft', 'Draft', 'idle'], ['pending_approval', 'Pending approval', 'warn'], ['approved', 'Approved', 'ok'], ['cancelled', 'Cancelled', 'idle']];
export const PROJECT_STATES = [['lead', 'Lead', 'idle'], ['won', 'Won', 'ok'], ['in_progress', 'In progress', 'active'], ['handed_over', 'Handed over', 'ok'], ['closed', 'Closed', 'idle'], ['lost', 'Lost', 'idle']];
export const HEALTH = [['on-track', 'On track', 'ok'], ['at-risk', 'At risk', 'warn'], ['over-budget', 'Over budget', 'bad'], ['no-budget', 'No budget entered', 'idle']];
export const ACCEPTANCE = [['accepted', 'Accepted', 'ok'], ['rejected', 'Rejected', 'bad'], [null, 'Awaiting your answer', 'warn']];
export const BILL_STATES = [['submitted', 'Submitted', 'warn'], ['acknowledged', 'Acknowledged', 'ok'], ['returned', 'Returned', 'bad']];
export const CO_STATES = [['draft', 'Draft', 'idle'], ['pending_client', 'Pending client', 'waiting'], ['client_approved', 'Client approved', 'ok'], ['client_rejected', 'Client rejected', 'bad'], ['withdrawn', 'Withdrawn', 'idle']];
export const RC_STATES = [['draft', 'Draft', 'idle'], ['active', 'Active', 'ok'], ['withdrawn', 'Withdrawn', 'idle']];
export const VENDOR_STATES = [['active', 'Active', 'ok'], ['inactive', 'Inactive', 'idle']];
export const PROVISION = [['created', 'Created', 'ok'], ['refused', 'Refused', 'bad']];
export const SERIES = [['provisional', 'Provisional', 'warn'], ['confirmed', 'Confirmed', 'ok']];
export const LEAD_STAGES = [['lead', 'Lead', 'idle'], ['qualified', 'Qualified', 'active'], ['proposal_shared', 'Proposal shared', 'waiting'], ['negotiation', 'Negotiation', 'warn'], ['won', 'Won', 'ok'], ['unqualified', 'Unqualified', 'idle'], ['rejected', 'Rejected', 'bad']];
export const TASK_STATUSES = [['pending', 'Pending', 'idle'], ['in_progress', 'In progress', 'active'], ['completed', 'Completed', 'ok'], ['cancelled', 'Cancelled', 'idle']];
export const REFUSAL_REASONS = ['not-entitled', 'self-approval', 'already-approved-this-stage', 'chain-complete', 'unknown-stage', 'above-ceiling'];
export const labelOf = (set, v) => { const f = set.find(([k]) => k === v); return f ? pill(f[2], f[1]) : pill('idle', String(v)); };

// ---------------------------------------------------------------- data --
// The sample is the product's own demo seed, derived in seed.mjs (scripts/seed-demo.mjs @ c6ef045):
// the tenant, its people, vendors, clients, projects, BOQs, orders and money, and every figure the
// product computes from them. Nothing here is typed in; the shapes below are what the pages consume.
import * as SEED from './seed.mjs';
export { SEED };
export const SEED_DAY = SEED.SEED_DAY;
export const TODAY_LONG = SEED.longDate(SEED.SEED_DAY);            // "Monday 14 September"
export const TODAY_SHORT = SEED.shortDate(SEED.SEED_DAY);          // "14 Sep"
export const { longDate, shortDate, dayDate, dueWord, dayFrom, daysAgo } = SEED;
export const PEOPLE = SEED.PEOPLE;
export const STAFF = SEED.STAFF;
export const ME = SEED.PEOPLE.admin;                                // the person the staff screens are played as

export const TENANT = { slug: SEED.TENANT.slug, legalName: SEED.TENANT.legalName, short: SEED.TENANT.short, pan: SEED.TENANT.pan, gstin: SEED.TENANT.gstin, tan: SEED.TENANT.tan, city: SEED.TENANT.city, address: SEED.TENANT.address, bank: SEED.TENANT.bank };

export const VENDORS = SEED.VENDORS;
// by the first word of the short name: V.Prakashvahini, V.Kaveri, V.Himanil, V.Sagwan, V.Bhumitala, V.Chhatrika,
// V.Kanchbharati, V.Aasandika, V.Pathvahak, V.Sthambhika, V.Lepankar, V.Machaan
export const V = Object.fromEntries(VENDORS.map(v => [v.short.split(' ')[0], v]));
export const CLIENTS = SEED.CLIENT_LIST;

// a project: code, name, client, state, contract, committed (Σ gross of every non-cancelled order, as
// committedByProject sums it), the count, and health (85% at-risk line, over past the contract, no-budget without one)
export const PROJECTS = SEED.PROJECTS;
export const projectOf = (code) => SEED.projectByCode(code);
export const UNATTACHED = SEED.UNATTACHED;
export const TOTAL_COMMITTED = SEED.TOTAL_COMMITTED;
export const BY_TRADE = SEED.BY_TRADE;
export const NO_TRADE = SEED.NO_TRADE;
// The project the design opens: ANU-01, the first by code — the one the client portal login is linked to,
// with the money step's orders, bills and invoices on it, the site issues, and every document.
export const OPEN = 'ANU-01';
export const OPEN_PROJECT = projectOf(OPEN);
export const CLIENT_LOGIN = SEED.PEOPLE.clientPortal;               // Elizabeth Kuriakose, Anuvanshik, linked to ANU-01
export const VENDOR_LOGIN = SEED.PEOPLE.vendorPortal;               // Bidisha Sen, Prakashvahini (VEN-01)

// Purchase orders, newest first as the list shows them: the seed raises every one on the seed day, so
// the date is the same on all — the pending ones are aged by `backdateForDemo`. GST at the provisional
// 18% on every line (the rate a person types; CA-06), rounded to the paise; gross = taxable + GST.
const RAISED = SEED.SEED_DAY;
export const POS = [...SEED.ORDERS].reverse().map(o => ({ number: o.number, vendor: SEED.vendorByKey(o.vendor), project: o.project, raised: RAISED, state: o.state, taxable: o.taxable, gst: o.gst, gross: o.gross,
  section: o.section, description: o.description, quantityWhole: o.quantityWhole, uom: o.uom, unitRate: o.unitRate, retentionBp: o.retentionBp, born: o.born, waitingDays: o.waitingDays ?? null,
  ...(o.excessBp !== undefined ? { deviation: 1, excessBp: o.excessBp, agreedRate: o.agreedRate } : {}) }));
export const poOf = (n) => { const o = POS.find(x => x.number === n); if (!o) throw new Error(`no order ${n}`); return o; };
export const RC_OVER = poOf('PO-RC-OVER-01');
export const RATE_CONTRACT = SEED.RATE_CONTRACT;

// The order the demo raises from ANU-01's BOQ — MEP lines 2.1, 2.2 and 2.3 to Prakashvahini — is the next
// number the series gives (PO-0019; an explicit number does not move the counter). A BOQ-born line copies
// the COST rate, never the client rate, and a line without one is refused (`from-boq.ts`); the rates are
// checked against the vendor's agreed rates, and Prakashvahini's rate contract covers none of these three.
export const DEMO_PO = SEED.NEXT_PO_NUMBER;
export const BOQ_ALL = SEED.BOQS[OPEN];
export const DEMO_LINES = ['2.1', '2.2', '2.3'];
export const PO_DEMO_LINES = BOQ_ALL.filter(l => DEMO_LINES.includes(l.no)).map((l, i) => ({ no: i + 1, desc: l.description, trade: l.section, boq: l.no, qty: l.qty, uom: l.uom, rate: l.costRate, contracted: null, amount: l.costAmount }));
export const PO_DEMO_TAXABLE = add(...PO_DEMO_LINES.map(l => l.amount));
export const PO_DEMO_GST = String((BigInt(PO_DEMO_TAXABLE) * 1800n + 5000n) / 10000n);
export const PO_DEMO_GROSS = add(PO_DEMO_TAXABLE, PO_DEMO_GST);
export const PO_DEMO = { number: DEMO_PO, vendor: V.Prakashvahini, project: OPEN, raised: RAISED, state: 'pending_approval', taxable: PO_DEMO_TAXABLE, gst: PO_DEMO_GST, gross: PO_DEMO_GROSS, born: 'BOQ', lines: PO_DEMO_LINES };
// what the pages called PO41 — the order the Buying section opens is the demo's
export const PO41_LINES = PO_DEMO_LINES;
export const PO41_TAXABLE = PO_DEMO_TAXABLE;

// The default chain the product seeds on a new tenant: one stage, held by finance (Farhan Qadri).
export const CHAIN = SEED.CHAIN;
export const ORDER_STEPS = [{ name: 'Pending Approval', by: SEED.PEOPLE.finance.name, when: 'waiting', state: 'now' }];

// ANU-01's BOQ: 24 lines across the eight trade packages, quantities in micros; a missing cost rate is
// null and stays null (PO-15) — five of the twenty-four here.
export const BOQ = BOQ_ALL.map(l => ({ sec: l.section, no: l.no, desc: l.description, qty: l.qty, uom: l.uom, rate: l.rate, cost: l.costRate ?? null, amount: l.amount, costAmount: l.costAmount }));
export const BOQ_VALUE = OPEN_PROJECT.boqValue;
export const BOQ_COST = OPEN_PROJECT.marginStatus === 'complete' ? OPEN_PROJECT.costBudget : null;   // partial: five lines unpriced
export const BOQ_COST_PARTIAL = OPEN_PROJECT.costBudget;
export const BOQS = SEED.BOQS;

// The vendor portal, as Bidisha Sen at Prakashvahini sees it: her orders (the money step's MEP order,
// accepted; the demo's, awaiting her answer; the seed's) and the bills she sent.
const mine = (key) => POS.filter(o => o.vendor.key === key && o.state === 'approved');
export const VP_ORDERS = [
  { number: PO_DEMO.number, raised: RAISED, state: 'approved', taxable: PO_DEMO.taxable, gst: PO_DEMO.gst, gross: PO_DEMO.gross, acceptance: null, lines: 3 },
  ...mine('prakashvahini').map(o => ({ number: o.number, raised: o.raised, state: o.state, taxable: o.taxable, gst: o.gst, gross: o.gross, acceptance: o.state === 'approved' ? 'accepted' : null, lines: 1 })),
];
export const VP_BILLS = SEED.BILLS.filter(b => b.vendor === 'prakashvahini').map(b => ({ billNumber: b.billNumber, order: b.order, amount: b.claimed, taxable: b.taxable, gst: b.gst, covering: b.narrative, state: b.paidOn ? 'paid' : b.state, submitted: b.submittedOn, dueOn: b.dueOn, paidOn: b.paidOn }));

// The client portal, as Elizabeth Kuriakose at Anuvanshik sees ANU-01: the agreement's stages, the
// variations, the documents. The seed's design-build agreement lists the four stages; none is achieved yet.
export const MILESTONES = SEED.DESIGN_BUILD[OPEN].stages.map((s, i) => ({ ...s, status: i === 0 ? 'in_progress' : 'not_started', on: null }));
export const CO_OF = (code) => SEED.CHANGE_ORDERS[code];
export const VARIATIONS = SEED.CHANGE_ORDERS[OPEN].map(co => ({ number: co.number, title: co.title, desc: '', impact: co.costImpact, state: co.state, version: 1, by: co.signedBy, on: co.state === 'client_approved' ? RAISED : null }));
export const DOCS = SEED.DOCUMENTS.filter(d => d.project === OPEN).map(d => [d.fileName.replace(/\.(pdf|dwg)$/, ''), `${d.contentType === 'application/pdf' ? 'PDF' : 'DWG'} · ${(d.sizeBytes / 1024).toFixed(0)} KB`, RAISED, d.entityType]);

// The operator's console: the two seeded organisations, and the provisioning log a re-run of the seed
// writes (a 409 on an organisation that exists is recorded as a refusal).
export const TENANTS = SEED.TENANTS;
export const PROVISIONING = SEED.PROVISIONING;
export const AUDIT = [
  [`${RAISED} 09:42:07`, `${ME.initials.toLowerCase()} · staff`, 'approval.decided', 'purchase_order PO-0002', null],
  [`${RAISED} 09:15:52`, `${SEED.PEOPLE.proc.initials.toLowerCase()} · staff`, 'purchase_order.submitted', 'purchase_order PO-0002', null],
  [`${RAISED} 09:02:30`, `${SEED.PEOPLE.proc.initials.toLowerCase()} · staff`, 'purchase_order.created', 'purchase_order PO-0002', null],
  [`${RAISED} 08:48:11`, 'ops · platform', 'settings.modules.updated', `tenant ${TENANT.slug}`, 'ops'],
];

// seed.mjs — the sample data, derived from the product's own demo seed.
//
// Every name, person, vendor, client, project and value the design prints comes from
// `scripts/seed-demo.mjs` (commit c6ef045) and `scripts/demo-principals.mjs`, for the tenant the demo
// signs in to: Bhitarang Interiors Private Limited. The seed cannot be imported — it runs on import,
// against a live stack — so its pure parts are copied here verbatim: `mulberry32`, `streamFor`, the
// identifier generators, `orderShape`, the trades, the vendors, the clients, the projects and the
// money fixtures. Everything else is what the product COMPUTES from them, by the product's own rules,
// each cited where it is applied: an order line's GST (`packages/money` mulRate, rounded to the paise);
// `committedByProject` = Σ gross over every non-cancelled order; `approvedCommitmentsByProject` = the
// approved ones; the BOQ cost budget and margin at risk (`services/projects/src/domain/margin.ts`);
// project health at 85% (`project-financials.ts`); retention at 5% of an order's gross; TDS on a paid
// bill from the provisional catalogue (`services/finance/src/domain/statutory-catalogue.ts`); a tax
// invoice's GST heads to the paise and its total to the rupee under Sec 170.
//
// Dates: the seed counts from the day it runs. The design fixes that day as SEED_DAY, a Monday, and
// every relative date the seed writes is resolved against it here.
//
// The build's sample gate reads the seed file's text and refuses any project code, project name,
// client, vendor or person the design uses that the seed does not spell the same way.

export const SEED_COMMIT = 'c6ef045';
export const SEED_DAY = '2026-09-14';
const SLUG = 'bhitarang-interiors';

// ---------------------------------------------------------------- copied from the seed --
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function streamFor(key) {
  let hash = 2166136261;
  for (const character of `${key}`) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  const next = mulberry32(hash ^ 20260905);
  return {
    pick(list) { const chosen = list[Math.floor(next() * list.length)]; if (chosen === undefined) throw new Error('cannot pick from an empty list'); return chosen; },
    between: (low, high) => low + Math.floor(next() * (high - low + 1)),
    chance: (probability) => next() < probability,
  };
}
function nameHash(text) {
  let hash = 2166136261;
  for (const character of text) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
const BASE36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const lettersOf = (name, count) => name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, count).padEnd(count, 'X');
function syntheticPan(name, holder) {
  const hash = nameHash(`pan:${name}`);
  const digits = String(1000 + (hash % 9000));
  const letter = String.fromCharCode(65 + ((hash >>> 16) % 26));
  return `${lettersOf(name, 3)}${holder}${lettersOf(name, 1)}${digits}${letter}`;
}
function gstinCheckCharacter(first14) {
  let sum = 0;
  for (let index = 0; index < 14; index += 1) {
    const product = BASE36.indexOf(first14[index] ?? '0') * (index % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return BASE36[(36 - (sum % 36)) % 36] ?? '0';
}
function syntheticGstin(pan, state) { const first14 = `${state}${pan}1Z`; return `${first14}${gstinCheckCharacter(first14)}`; }
function syntheticTan(name, city) { const hash = nameHash(`tan:${name}`); return `${city}${lettersOf(name, 1)}0${String(1000 + (hash % 9000))}${String.fromCharCode(65 + ((hash >>> 16) % 26))}`; }
const syntheticPhone = (key) => `+91 00000 0${String(nameHash(`phone:${key}`) % 10_000).padStart(4, '0')}`;

const CLIENTS = {
  nilgiri: { legalName: 'Nilgiri Crest Bank Limited', state: '29' },
  sankhyamani: { legalName: 'Sankhyamani Analytics Private Limited', state: '29' },
  krayashala: { legalName: 'Krayashala Stores Private Limited', state: '29' },
  anuvanshik: { legalName: 'Anuvanshik Life Sciences Private Limited', state: '36' },
};
const PROJECT_SPECS = [
  { code: 'ANU-01', client: 'anuvanshik', name: 'R&D laboratory interiors, Genome Valley, Hyderabad', rupees: 6_40_00_000, site: '36', stage: 'in_progress' },
  { code: 'ANU-02', client: 'anuvanshik', name: 'Quality-control laboratory refit, Electronic City', rupees: 2_95_00_000, site: '29', stage: 'handed_over' },
  { code: 'KRA-01', client: 'krayashala', name: 'Flagship store fit-out, Brigade Road', rupees: 48_00_000, site: '29', stage: 'in_progress' },
  { code: 'NCB-01', client: 'nilgiri', name: 'Regional office and banking hall, Koramangala', rupees: 8_60_00_000, site: '29', stage: 'won' },
  { code: 'NCB-02', client: 'nilgiri', name: 'Back-office refit, Mysuru — enabling works before the contract is agreed', rupees: null, site: '29', stage: 'in_progress' },
  { code: 'SAN-01', client: 'sankhyamani', name: 'Workplace refresh, two floors, Outer Ring Road', rupees: 1_80_00_000, site: '29', stage: 'in_progress' },
];
function orderShape(code, contractRupees, howMany) {
  if (contractRupees <= 0) return [];
  const sharePct = code.startsWith('KRA') ? 108 : code.startsWith('SAN') ? 88 : 15 + ((code.charCodeAt(0) * 7) % 46);
  const totalPaise = Math.floor((contractRupees * sharePct) / 100) * 100;
  const perOrder = Math.floor(totalPaise / howMany);
  return Array.from({ length: howMany }, (_, index) => {
    const quantityWhole = 10 + index * 5;
    const target = index === howMany - 1 ? totalPaise - perOrder * (howMany - 1) : perOrder;
    return { quantityWhole, unitRate: Math.floor(target / quantityWhole) };
  });
}
export const TRADES = [
  ['Civil', ['Blockwork 100mm', 'Screed to falls', 'Core cutting for services']],
  ['MEP', ['LT panel and distribution', 'Cable tray, GI 300mm', 'DB wiring, 2.5 sqmm']],
  ['HVAC', ['VRF indoor unit, 4.5 TR', 'Insulated duct, GI 24g', 'Grille and diffuser set']],
  ['Joinery', ['Reception desk, solid surface', 'Storage wall, laminate', 'Meeting table, 3600mm']],
  ['Flooring', ['Vitrified tile 600x600', 'Carpet tile, loop pile', 'Vinyl plank, 5mm']],
  ['Ceilings', ['Mineral fibre tile, 600x600', 'Gypsum bulkhead', 'Baffle ceiling, aluminium']],
  ['Glazing', ['Frameless glass partition, 12mm', 'Manifestation film', 'Glass door with patch']],
  ['Furniture', ['Workstation, 1200mm', 'Task chair', 'Soft seating, 2-seater']],
];
const GST_BP = 1800; // WORKS_CONTRACT_GST_BP — the provisional works-contract rate a person types on a line
const VENDOR_SPECS = [
  { key: 'prakashvahini', name: 'Prakashvahini Electrical Contracts Private Limited', trade: 'MEP', holder: 'C', state: '29', pan: true, tds: { section: '194C', payeeClass: null } },
  { key: 'kaveri', name: 'Kaveri Nirmaan Contracts', trade: 'Civil', holder: 'F', state: '29', pan: true, tds: { section: '194C', payeeClass: null } },
  { key: 'himanil', name: 'Himanil Air Systems Private Limited', trade: 'HVAC', holder: 'C', state: '29', pan: true, tds: { section: '194C', payeeClass: null } },
  { key: 'sagwan', name: 'Sagwan Joinery Works', trade: 'Joinery', holder: 'P', state: '29', pan: true, tds: { section: '194C', payeeClass: null } },
  { key: 'bhumitala', name: 'Bhumitala Floor Finishes', trade: 'Flooring', holder: 'F', state: '29', pan: true, tds: { section: '194C', payeeClass: null } },
  { key: 'chhatrika', name: 'Chhatrika Ceilings', trade: 'Ceilings', holder: 'P', state: '29', pan: true, tds: { section: '194C', payeeClass: null } },
  { key: 'kanchbharati', name: 'Kanchbharati Glazing Private Limited', trade: 'Glazing', holder: 'C', state: '27', pan: true, tds: { section: '194C', payeeClass: null } },
  { key: 'aasandika', name: 'Aasandika Furniture Works', trade: 'Furniture', holder: 'F', state: '27', pan: true, tds: { section: '194C', payeeClass: null } },
  { key: 'pathvahak', name: 'Pathvahak Roadlines', trade: 'Transport', holder: 'P', state: '29', pan: true, tds: { section: '194C', payeeClass: null, declared: true } },
  { key: 'sthambhika', name: 'Sthambhika Structural Consultants LLP', trade: 'Consultancy', holder: 'F', state: '29', pan: true, tds: { section: '194J', payeeClass: 'technical' } },
  { key: 'lepankar', name: 'Lepankar Paint Works', trade: 'Painting', holder: 'P', state: '29', pan: false, tds: { section: '194C', payeeClass: null } },
  { key: 'machaan', name: 'Machaan Scaffolding Hire', trade: 'Plant hire', holder: 'F', state: '29', pan: true, tds: { section: '194I', payeeClass: 'plant_machinery' } },
];
const CONSTITUTION_OF = { C: 'company', F: 'firm', P: 'individual' };
const COMPANY = { holder: 'C', state: '29', address: 'Koramangala, Bengaluru, Karnataka 560034', bankName: 'HDFC Bank', bankBranch: 'Koramangala', tanCity: 'BLR' };
const LOCATIONS = [['Gurugram', 'Cyber Hub'], ['Bengaluru', 'Outer Ring Road'], ['Mumbai', 'Bandra Kurla Complex'], ['Hyderabad', 'HITEC City'], ['Pune', 'Kharadi'], ['Chennai', 'Guindy'], ['Noida', 'Sector 62'], ['Ahmedabad', 'GIFT City']];
const LEAD_PROSPECTS = ['Sahakosh Insurance Limited', 'Upabhogika Stores Private Limited', 'Vranaropani Hospitals Private Limited'];
const MONEY_SPEC = {
  orders: [
    { number: 'PO-ANU-MEP-01', vendor: 'prakashvahini', project: 'ANU-01', description: 'MEP — LT panel, cable tray and DB wiring, laboratory floors', hsnSac: '995461', quantityWhole: 1, unitRate: '187435000', gstRateBp: GST_BP, retentionBp: 500 },
    { number: 'PO-ANU-PNT-01', vendor: 'lepankar', project: 'ANU-01', description: 'Painting — acrylic emulsion, two coats, laboratory corridors', hsnSac: '', quantityWhole: 1, unitRate: '38690000', gstRateBp: GST_BP, retentionBp: 500, release: true },
    { number: 'PO-ANU-TRN-01', vendor: 'pathvahak', project: 'ANU-01', description: 'Transport — site deliveries of board, tile and cement, per trip', hsnSac: '996511', quantityWhole: 12, unitRate: '485000', gstRateBp: 0 },
    { number: 'PO-ANU-STR-01', vendor: 'sthambhika', project: 'ANU-01', description: 'Structural review of mezzanine and equipment loads, laboratory floors', hsnSac: '', quantityWhole: 1, unitRate: '48650000', gstRateBp: GST_BP },
    { number: 'PO-ANU-SCF-01', vendor: 'machaan', project: 'ANU-01', description: 'Scaffolding hire — access towers, per week', hsnSac: '', quantityWhole: 8, unitRate: '3147500', gstRateBp: GST_BP },
  ],
  bills: [
    { order: 'PO-ANU-MEP-01', billNumber: 'PEC-RA-01', taxable: '64827500', gst: '11668950', narrative: 'Running bill 1 — LT panel and cable tray, level 1', pay: 'last_month' },
    { order: 'PO-ANU-SCF-01', billNumber: 'MSH-44', taxable: '6295000', gst: '1133100', narrative: 'Scaffolding hire, weeks 1 to 4', pay: 'last_month' },
    { order: 'PO-ANU-PNT-01', billNumber: 'LPW-17', taxable: '14286000', gst: '2571480', narrative: 'Emulsion to corridors, level 1', pay: 'this_month' },
    { order: 'PO-ANU-TRN-01', billNumber: 'PR-231', taxable: '4627500', gst: '0', narrative: 'Nine trips of board, tile and cement to site', pay: 'this_month' },
    { order: 'PO-ANU-STR-01', billNumber: 'SSC/RV/07', taxable: '18565000', gst: '3341700', narrative: 'Load review, mezzanine — first stage', pay: 'this_month' },
    { order: 'PO-ANU-MEP-01', billNumber: 'PEC-RA-02', taxable: '51243000', gst: '9223740', narrative: 'Running bill 2 — DB wiring, level 2', due: 'this_week' },
    { order: 'PO-ANU-PNT-01', billNumber: 'LPW-21', taxable: '9874000', gst: '1777320', narrative: 'Emulsion to corridors, level 2', due: 'next_week' },
    { order: 'PO-ANU-SCF-01', billNumber: 'MSH-51', taxable: '6421000', gst: '1155780', narrative: 'Scaffolding hire, weeks 5 to 8', due: 'overdue' },
    { order: 'PO-ANU-STR-01', billNumber: 'SSC/RV/09', taxable: '12438000', gst: '2238840', narrative: 'Load review, equipment plinths — second stage' },
  ],
  invoices: [
    { project: 'ANU-02', description: 'Final bill on handover', taxable: '1124860000', invoiced: -63, expected: -33, certified: -66, received: 'all', receivedOn: -30 },
    { project: 'ANU-01', description: 'Running bill 1 — civil works, ceilings and partitions, laboratory floors', taxable: '486250000', invoiced: -46, expected: -16, certified: -49, received: 'all', receivedOn: -18 },
    { project: 'SAN-01', description: 'Running bill 1 — workstations and ceilings, level 1', taxable: '384672000', invoiced: -21, expected: -5, certified: null },
    { project: 'ANU-01', description: 'Running bill 2 — MEP first fix and laboratory joinery', taxable: '627438000', invoiced: -9, expected: 6, certified: -12, received: '248631500', receivedOn: -2 },
  ],
};

// ---------------------------------------------------------------- dates, as the seed counts them --
function addDays(date, days) { const at = new Date(`${date}T00:00:00Z`); at.setUTCDate(at.getUTCDate() + days); return at.toISOString().slice(0, 10); }
export const dayFrom = (offsetDays) => addDays(SEED_DAY, offsetDays);
const monthStart = (date) => `${date.slice(0, 8)}01`;
function financialYearStart(date) { const year = Number(date.slice(0, 4)); return `${String(Number(date.slice(5, 7)) >= 4 ? year : year - 1)}-04-01`; }
function mondayOf(date) { const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); return addDays(date, weekday === 0 ? -6 : 1 - weekday); }
const laterOf = (a, b) => (a > b ? a : b);
const paidOnFor = (when) => when === 'last_month' ? addDays(monthStart(SEED_DAY), -20) : laterOf(dayFrom(-3), monthStart(SEED_DAY));
function dueOnFor(due) {
  if (due === 'overdue') return dayFrom(-4);
  if (due === 'this_week') return laterOf(SEED_DAY, addDays(mondayOf(SEED_DAY), 4));
  return addDays(mondayOf(SEED_DAY), 9);
}
export const FY = `${financialYearStart(SEED_DAY).slice(0, 4)}-${String(Number(financialYearStart(SEED_DAY).slice(0, 4)) + 1).slice(2)}`; // YYYY-YY, the default series format
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const longDate = (iso) => { const d = new Date(`${iso}T00:00:00Z`); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
export const shortDate = (iso) => { const d = new Date(`${iso}T00:00:00Z`); return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`; };
export const dayDate = (iso) => { const d = new Date(`${iso}T00:00:00Z`); return `${DAYS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`; };
export const dueWord = (iso) => iso === SEED_DAY ? 'Today' : iso === dayFrom(1) ? 'Tomorrow' : iso === dayFrom(-1) ? 'Yesterday' : dayDate(iso);
export const daysAgo = (iso) => Math.round((new Date(`${SEED_DAY}T00:00:00Z`) - new Date(`${iso}T00:00:00Z`)) / 86400000);

// ---------------------------------------------------------------- the product's arithmetic --
// packages/money: mulRate(amount, bp, roundToPaise) — halves away from zero, to the paise.
const roundHalfAway = (num, den) => { const neg = num < 0n; const n = neg ? -num : num; const q = n / den; const r = n % den; const v = r * 2n >= den ? q + 1n : q; return neg ? -v : v; };
const mulBp = (amount, bpRate) => roundHalfAway(amount * BigInt(bpRate), 10000n);
const roundToRupee = (paise) => roundHalfAway(paise, 100n) * 100n; // Sec 170 on an invoice total
const W = (v) => v.toString();

// ---------------------------------------------------------------- tenant, people, vendors --
const TENANT_NAME = 'Bhitarang Interiors Private Limited';
const tenantPan = syntheticPan(TENANT_NAME, COMPANY.holder);
export const TENANT = { slug: SLUG, legalName: TENANT_NAME, short: 'Bhitarang Interiors', pan: tenantPan, gstin: syntheticGstin(tenantPan, COMPANY.state), tan: syntheticTan(TENANT_NAME, COMPANY.tanCity), address: COMPANY.address, city: 'Bengaluru', state: COMPANY.state, bank: `${COMPANY.bankName}, ${COMPANY.bankBranch}`, origin: 'app.bhitarang-interiors.example' };
export const SECOND_TENANT = { slug: 'samarachana-fitouts', legalName: 'Samarachana Fitouts LLP', short: 'Samarachana Fitouts', city: 'Pune', state: '27', origin: 'app.samarachana-fitouts.example' };
// scripts/demo-principals.mjs — the three staff logins, the two portal logins and the four vendor desks
export const PEOPLE = {
  admin: { name: 'Shalini Kamath', first: 'Shalini', initials: 'SK', role: 'Admin', roleKey: 'admin', email: 'shalini.kamath@bhitarang-interiors.example' },
  finance: { name: 'Farhan Qadri', first: 'Farhan', initials: 'FQ', role: 'Finance', roleKey: 'finance', email: 'farhan.qadri@bhitarang-interiors.example' },
  proc: { name: 'Manjit Bains', first: 'Manjit', initials: 'MB', role: 'Procurement', roleKey: 'proc', email: 'manjit.bains@bhitarang-interiors.example' },
  vendorPortal: { name: 'Bidisha Sen', first: 'Bidisha', vendor: 'prakashvahini', email: 'bidisha.sen@prakashvahini-electrical.example' },
  clientPortal: { name: 'Elizabeth Kuriakose', first: 'Elizabeth', client: 'anuvanshik', project: 'ANU-01', email: 'elizabeth.kuriakose@anuvanshik-lifesciences.example' },
  desks: [
    { name: 'Venkatesh Bhat', vendor: 'lepankar' }, { name: 'Rajbir Dhillon', vendor: 'pathvahak' },
    { name: 'Aparna Iyengar', vendor: 'sthambhika' }, { name: 'Kishore Naidu', vendor: 'machaan' },
  ],
  operator: { name: 'Platform operations', email: 'ops@construct-o-genie.example' },
};
export const STAFF = [PEOPLE.admin, PEOPLE.finance, PEOPLE.proc];
const shortName = (name) => name.replace(/ (Private Limited|Limited|LLP|Works|Contracts|Hire|Roadlines)$/, '').replace(/ (Private Limited|Limited|LLP)$/, '');
export const VENDORS = VENDOR_SPECS.map((v, i) => {
  const pan = v.pan ? syntheticPan(v.name, v.holder) : null;
  return { ...v, code: `VEN-${String(i + 1).padStart(2, '0')}`, short: shortName(v.name), constitution: CONSTITUTION_OF[v.holder], pan, gstin: pan ? syntheticGstin(pan, v.state) : null,
    desk: PEOPLE.desks.find((d) => d.vendor === v.key)?.name ?? (v.key === PEOPLE.vendorPortal.vendor ? PEOPLE.vendorPortal.name : null) };
});
export const vendorByKey = (key) => { const v = VENDORS.find((x) => x.key === key); if (!v) throw new Error(`no vendor ${key}`); return v; };
export const CLIENT_LIST = Object.entries(CLIENTS).map(([key, c]) => ({ key, legalName: c.legalName, short: shortName(c.legalName), state: c.state, pan: syntheticPan(c.legalName, 'C'), gstin: syntheticGstin(syntheticPan(c.legalName, 'C'), c.state) }));
export const clientOf = (key) => CLIENT_LIST.find((c) => c.key === key);

// ---------------------------------------------------------------- 4. the BOQ per project --
// services/projects: a line's amount and cost are rate × quantity, rounded once to the paise.
export const BOQS = {};
for (const project of PROJECT_SPECS) {
  const boqStream = streamFor(`${SLUG}:boq:${project.code}`);
  const lean = project.code === 'KRA-01' || project.code === 'SAN-01';
  const lines = []; let itemNo = 1;
  for (const [section, items] of TRADES) for (const description of items) {
    const rate = boqStream.between(40, 9000) * 100;
    const line = { section, itemNo: itemNo++, description, uom: section === 'Furniture' ? 'nos' : 'sqm',
      quantityWhole: lean ? boqStream.between(1, 4) : boqStream.between(8, 900),
      quantityMillionths: boqStream.pick([0, 0, 0, 0, 500_000, 250_000, 750_000]), rate: String(rate) };
    if (lean || boqStream.chance(0.75)) line.costRate = String(Math.round(rate * 0.72));
    lines.push(line);
  }
  for (const l of lines) {
    l.qty = W(BigInt(l.quantityWhole) * 1000000n + BigInt(l.quantityMillionths));
    l.amount = W(roundHalfAway(BigInt(l.qty) * BigInt(l.rate), 1000000n));
    l.costAmount = l.costRate === undefined ? null : W(roundHalfAway(BigInt(l.qty) * BigInt(l.costRate), 1000000n));
    l.no = `${TRADES.findIndex(([s]) => s === l.section) + 1}.${TRADES.find(([s]) => s === l.section)[1].indexOf(l.description) + 1}`;
  }
  BOQS[project.code] = lines;
}
const boqValue = (code) => W(BOQS[code].reduce((a, l) => a + BigInt(l.amount), 0n));
const costBudget = (code) => { const priced = BOQS[code].filter((l) => l.costAmount !== null); return { budget: W(priced.reduce((a, l) => a + BigInt(l.costAmount), 0n)), pricedLines: priced.length, unpricedLines: BOQS[code].length - priced.length }; };

// ---------------------------------------------------------------- 5. the orders --
const tradeVendors = VENDORS.filter((v) => TRADES.some(([s]) => s === v.trade));
const tradesOffered = TRADES.filter(([s]) => tradeVendors.some((v) => v.trade === s));
const orders = [];
for (const [projectIndex, project] of PROJECT_SPECS.entries()) {
  const poStream = streamFor(`${SLUG}:po:${project.code}`);
  const howMany = 2 + (projectIndex % 3);
  const shape = orderShape(project.code, project.rupees ?? 0, howMany);
  for (let index = 0; index < howMany; index += 1) {
    const [section, items] = poStream.pick(tradesOffered);
    const ofTrade = tradeVendors.filter((v) => v.trade === section);
    const vendor = ofTrade[(projectIndex + index) % Math.max(ofTrade.length, 1)];
    const line = shape[index] ?? { quantityWhole: poStream.between(5, 400), unitRate: poStream.between(60, 12000) * 100 };
    const description = `${section} — ${poStream.pick(items)}`;
    const taxable = BigInt(line.quantityWhole) * BigInt(line.unitRate);
    const gst = mulBp(taxable, GST_BP);
    orders.push({ number: `PO-${String(orders.length + 1).padStart(4, '0')}`, project: project.code, vendor: vendor.key, section, description, hsnSac: '995461',
      quantityWhole: line.quantityWhole, uom: section === 'Furniture' ? 'nos' : 'sqm', unitRate: String(line.unitRate), gstRateBp: GST_BP, taxable: W(taxable), gst: W(gst), gross: W(taxable + gst), retentionBp: null, born: 'seed' });
  }
}
// proc submits every third order, finance approves every third of those: by global index, 0 draft, 1 approved, 2 awaiting
for (const [index, o] of orders.entries()) o.state = index % 3 === 0 ? 'draft' : index % 3 === 1 ? 'approved' : 'pending_approval';
// `backdateForDemo`: the orders awaiting approval are aged 9, 6, 3, 1, 0 days in number order, cycling
const AGES = [9, 6, 3, 1, 0];
for (const [i, o] of orders.filter((x) => x.state === 'pending_approval').entries()) o.waitingDays = AGES[i % AGES.length];
// the rate contract's overrun order: no project, left in draft, 11.25% above the agreed rate
export const RATE_CONTRACT = { number: 'RC-MEP-01', vendor: 'prakashvahini', title: 'Electrical first fix, annual rates', status: 'active', paymentTerms: '45 days from invoice',
  items: [{ tradeCode: 'MEP', description: 'Conduit, 25mm, concealed', uom: 'm', contractRate: '987600', validFrom: financialYearStart(SEED_DAY), validTo: addDays(financialYearStart(addDays(financialYearStart(SEED_DAY), 400)), -1) }] };
const rcOver = { number: 'PO-RC-OVER-01', project: null, vendor: 'prakashvahini', section: 'MEP', description: 'Conduit, 25mm, concealed — urgent supply', hsnSac: '853810', quantityWhole: 240, uom: 'm', unitRate: '1098700', gstRateBp: GST_BP, state: 'draft', retentionBp: null, born: 'rate-contract', agreedRate: '987600' };
rcOver.taxable = W(240n * 1098700n); rcOver.gst = W(mulBp(BigInt(rcOver.taxable), GST_BP)); rcOver.gross = W(BigInt(rcOver.taxable) + BigInt(rcOver.gst));
rcOver.excessBp = Number(((BigInt(rcOver.unitRate) - BigInt(rcOver.agreedRate)) * 10000n) / BigInt(rcOver.agreedRate)); // excessBasisPoints, floored
// the money step's five, raised, submitted and approved like any other
const moneyOrders = MONEY_SPEC.orders.map((o) => {
  const taxable = BigInt(o.quantityWhole) * BigInt(o.unitRate);
  const gst = o.gstRateBp === 0 ? 0n : mulBp(taxable, o.gstRateBp);
  const v = vendorByKey(o.vendor);
  return { ...o, section: v.trade, uom: o.quantityWhole > 1 ? (o.vendor === 'pathvahak' ? 'trip' : 'week') : 'job', taxable: W(taxable), gst: W(gst), gross: W(taxable + gst), state: 'approved', retentionBp: o.retentionBp ?? null, born: 'money' };
});
export const ORDERS = [...orders, rcOver, ...moneyOrders];
export const orderByNumber = (n) => { const o = ORDERS.find((x) => x.number === n); if (!o) throw new Error(`no order ${n}`); return o; };
export const NEXT_PO_NUMBER = `PO-${String(orders.length + 1).padStart(4, '0')}`; // the series has issued 18; an explicit number does not move it

// ---------------------------------------------------------------- what the product computes per project --
const sumGross = (list) => W(list.reduce((a, o) => a + BigInt(o.gross), 0n));
const DEFAULT_AT_RISK_PCT = 85;
export const PROJECTS = PROJECT_SPECS.map((p, i) => {
  const mine = ORDERS.filter((o) => o.project === p.code && o.state !== 'cancelled');
  const approved = mine.filter((o) => o.state === 'approved');
  const contract = p.rupees === null ? null : W(BigInt(p.rupees) * 100n);
  const committed = sumGross(mine);
  const committedApproved = sumGross(approved);
  // projectHealth: no contract → no-budget; committed > contract → over-budget; committed > 85% of contract (to the paise) → at-risk
  const atRiskLine = contract === null ? null : W(roundHalfAway(BigInt(contract) * BigInt(DEFAULT_AT_RISK_PCT), 100n));
  const health = contract === null ? 'no-budget' : BigInt(committed) > BigInt(contract) ? 'over-budget' : BigInt(committed) > BigInt(atRiskLine) ? 'at-risk' : 'on-track';
  const budget = costBudget(p.code);
  const atRisk = BigInt(committedApproved) > BigInt(budget.budget) ? W(BigInt(committedApproved) - BigInt(budget.budget)) : '0';
  const client = clientOf(p.client);
  return { code: p.code, name: p.name, client: client.legalName, clientKey: p.client, clientShort: client.short, site: p.site, state: p.stage, index: i,
    contract, committed, committedApproved, orders: mine.length, ordersApproved: approved.length, health,
    sharePct: contract === null ? null : Number((BigInt(committed) * 10000n) / BigInt(contract)) / 100,
    boqValue: boqValue(p.code), boqLines: BOQS[p.code].length, costBudget: budget.budget, pricedLines: budget.pricedLines, unpricedLines: budget.unpricedLines,
    marginStatus: budget.unpricedLines > 0 ? 'partial' : 'complete', atRisk };
});
export const projectByCode = (c) => { const p = PROJECTS.find((x) => x.code === c); if (!p) throw new Error(`no project ${c}`); return p; };
export const UNATTACHED = { committed: sumGross(ORDERS.filter((o) => o.project === null)), orderCount: ORDERS.filter((o) => o.project === null).length };
export const TOTAL_COMMITTED = W(BigInt(sumGross(PROJECTS.map((p) => ({ gross: p.committed })))) + BigInt(UNATTACHED.committed));
export const BY_TRADE = TRADES.map(([s]) => [s, sumGross(ORDERS.filter((o) => o.section === s))]).filter(([, v]) => v !== '0');
export const NO_TRADE = W(BigInt(TOTAL_COMMITTED) - BY_TRADE.reduce((a, [, v]) => a + BigInt(v), 0n));
export const MARGIN = { total: W(PROJECTS.reduce((a, p) => a + BigInt(p.atRisk), 0n)), over: PROJECTS.filter((p) => p.atRisk !== '0').sort((a, b) => (BigInt(b.atRisk) > BigInt(a.atRisk) ? 1 : -1)), partial: PROJECTS.filter((p) => p.marginStatus === 'partial'), unpricedLines: PROJECTS.reduce((a, p) => a + p.unpricedLines, 0) };
export const BLOCKED = ORDERS.filter((o) => o.state === 'pending_approval').map((o) => ({ ...o, stage: 'Pending Approval', role: 'finance', who: PEOPLE.finance }));
export const BLOCKED_TOTAL = sumGross(BLOCKED);
export const BLOCKED_OLDEST = BLOCKED.reduce((a, b) => (b.waitingDays > a.waitingDays ? b : a));
// the default chain the product seeds on a new tenant (packages/contracts authz.ts): one stage, finance
export const CHAIN = { name: 'Purchase order approval', entityType: 'purchase_order', isActive: true, stages: [{ sequence: 1, name: 'Pending Approval', approverRole: 'finance', minApprovals: 1, approvalCeilingPaise: null }] };

// ---------------------------------------------------------------- 6. change orders --
export const CHANGE_ORDERS = {};
for (const [index, project] of PROJECT_SPECS.entries()) {
  const coStream = streamFor(`${SLUG}:co:${project.code}`);
  const impacts = index === 0 ? ['-1850000', '0', '4720000'] : [String(coStream.between(2, 90) * 10000), String(coStream.between(1, 40) * 10000)];
  CHANGE_ORDERS[project.code] = impacts.map((costImpact, order) => ({
    number: `CO-${String(order + 1).padStart(2, '0')}`, project: project.code,
    title: costImpact.startsWith('-') ? 'Omission — client removed the terrace pergola' : costImpact === '0' ? 'Specification change at no commercial effect' : `Additional scope, ${coStream.pick(TRADES)[0].toLowerCase()}`,
    costImpact, state: order % 2 === 0 ? (order === 0 ? 'client_approved' : 'pending_client') : 'draft', signedBy: order === 0 ? 'Client project manager' : null, version: 1,
  }));
}

// ---------------------------------------------------------------- 7. site --
export const DAILY_REPORTS = [];
for (const project of PROJECT_SPECS.slice(0, 4)) {
  const dprStream = streamFor(`${SLUG}:dpr:${project.code}`);
  for (let day = 1; day <= 5; day += 1) {
    DAILY_REPORTS.push({ project: project.code, date: dayFrom(day - 6), by: PEOPLE.finance,
      notes: dprStream.pick(['Ceiling grid complete on level 3. Glazing team mobilised.', 'Power shutdown 0900-1300, MEP works paused.', 'Client walkthrough — two snags raised on joinery finish.', 'Flooring adhesive delivered, curing overnight.', 'Late material delivery held up the partition line.']),
      manpower: [{ floor: 'Level 3', trade: 'Carpentry', headCount: dprStream.between(4, 18) }, { floor: 'Level 4', trade: 'Electrical', headCount: dprStream.between(3, 12) }] });
  }
}
export const SITES_NO_REPORT = PROJECT_SPECS.filter((p) => !DAILY_REPORTS.some((r) => r.project === p.code) && p.stage === 'in_progress').map((p) => p.code);
export const ISSUES = [
  { project: 'ANU-01', title: 'Glazing panel on level 3 delivered cracked — replacement awaited', severity: 'blocking', open: true, by: PEOPLE.proc },
  { project: 'ANU-01', title: 'Fire sealant missing around two riser penetrations', severity: 'major', open: true, by: PEOPLE.proc },
  { project: 'ANU-01', title: 'Snag list from client walkthrough: joinery edge banding', severity: 'minor', open: false, by: PEOPLE.proc, resolution: 'Edge banding redone by the joinery vendor.', resolvedBy: PEOPLE.admin },
];

// ---------------------------------------------------------------- 8. stock --
const STOCK_NAMES = [['Cement OPC 53 grade', 'bag'], ['Gypsum board 12mm', 'sheet'], ['Vitrified tile 600x600', 'box'], ['Cable, 2.5 sqmm FRLS', 'coil'], ['Mineral fibre ceiling tile', 'box'], ['Adhesive, tile fixing', 'bag']];
export const STOCK = STOCK_NAMES.map(([name, uom], stockIndex) => {
  const s = streamFor(`${SLUG}:stock:${name}`); const low = stockIndex < 3;
  const reorderWhole = low ? 100 : s.between(20, 120);
  const rates = [s.between(180, 900) * 100, s.between(200, 1100) * 100];
  const receipts = rates.map((rate, receiptIndex) => ({ qty: low ? (receiptIndex === 0 ? 40 + stockIndex * 10 : 30) : s.between(200, 400), rate: String(rate) }));
  const issue = low ? 25 + stockIndex * 5 : s.between(10, 50);
  const transfer = low ? null : reorderWhole + s.between(5, 40);
  const received = receipts.reduce((a, r) => a + r.qty, 0);
  return { name, uom, reorderWhole, receipts, issue, transfer, onHand: received - issue, central: received - issue - (transfer ?? 0), site: transfer ?? 0, low: received - issue < reorderWhole,
    atGate: stockIndex === 0 ? { qty: 60, reference: 'Delivery note at the gate, not yet counted' } : null };
});

// ---------------------------------------------------------------- tasks, documents --
const TASK_SPECS = [['Approve the joinery order', -3, 'high'], ['Chase the revised quote for flooring', -1, 'medium'], ['Send the variation to the client for sign-off', 0, 'high'], ['Agree the change of scope on the level 2 ceiling', 0, 'medium'], ['Site visit — check the reception desk setting-out', 1, 'medium'], ['Book the recce for the new lead', 4, 'low']];
export const TASKS = TASK_SPECS.map(([title, offset, priority], index) => ({ title, project: PROJECT_SPECS[index % PROJECT_SPECS.length].code, owner: STAFF[index % STAFF.length], due: dayFrom(offset), priority, overdue: offset < 0, done: false }));
const DOC_SPECS = [['agreement', 'Agreement, signed by both parties.pdf', 'application/pdf'], ['agreement', 'Commercial proposal, rev C.pdf', 'application/pdf'], ['drawing', 'GFC drawing set A-101 to A-118.pdf', 'application/pdf'], ['drawing', 'Reflected ceiling plan, level 2.dwg', 'image/vnd.dwg'], ['selection', 'Material selections, joinery laminates.pdf', 'application/pdf'], ['site_report', 'Daily report, week 36.pdf', 'application/pdf']];
export const DOCUMENTS = [];
for (const [index, project] of PROJECT_SPECS.entries()) {
  for (const [entityType, fileName, contentType] of DOC_SPECS.slice(0, index === 0 ? DOC_SPECS.length : 3 + (index % 3))) {
    const sentence = `${SLUG}:${project.code}:${fileName}`;
    DOCUMENTS.push({ project: project.code, entityType, fileName, contentType, sizeBytes: 40_000 + sentence.length * 1_000, by: PEOPLE.admin });
  }
}

// ---------------------------------------------------------------- 9. leads --
const ownClients = [...new Set(PROJECT_SPECS.map((p) => CLIENTS[p.client].legalName))];
const prospectPool = [...LEAD_PROSPECTS, ...ownClients];
const STAGES = ['lead', 'qualified', 'proposal_shared', 'negotiation', 'won', 'rejected'];
export const LEADS = [];
for (let index = 0; index < 9; index += 1) {
  const s = streamFor(`${SLUG}:lead:${index}`);
  const [city, district] = s.pick(LOCATIONS);
  const lead = { clientName: prospectPool[index % prospectPool.length], contactName: s.pick(['Meenakshi Pillai', 'Arvind Choudhary', 'Sabiha Ansari', 'Nitin Wagh']), stage: STAGES[index % STAGES.length],
    estimatedValue: String(s.between(40, 900) * 100000), probabilityPct: s.between(5, 85), projectType: s.pick(['Office fitout', 'Retail rollout', 'Workplace refresh']), source: s.pick(['Architect referral', 'Repeat client', 'Tender portal']), city, district, owner: PEOPLE.admin };
  lead.contact = { name: s.pick(['Lalit Bhandari', 'Rukhsana Mir', 'Gayatri Nair']), designation: s.pick(['Facilities manager', 'Project architect', 'Procurement head']), phone: syntheticPhone(`lead:${SLUG}:${String(index)}`) };
  lead.activity = { kind: s.pick(['call', 'meeting', 'site_visit']), summary: s.pick(['Walked the floor plate with the architect', 'Discussed phasing around their move-in date', 'Shared indicative rates for joinery']), occurredOn: dayFrom(-s.between(3, 30)) };
  if (index % 3 !== 0) lead.next = { on: dayFrom(s.between(1, 18)), kind: index % 3 === 1 ? 'site_visit' : 'call' };
  if (lead.stage === 'rejected') lead.lostReason = s.pick(['Lost on price. The incumbent contractor held the rate.', 'Client deferred the fitout to the next financial year.', 'Awarded to a bidder with an existing framework agreement.']);
  LEADS.push(lead);
}

// ---------------------------------------------------------------- 10. design-build --
export const DESIGN_BUILD = {};
for (const project of PROJECT_SPECS) {
  const s = streamFor(`${SLUG}:designbuild:${project.code}`);
  const brief = { engagementType: 'Design and build', scopeSummary: 'Full fitout across two floors, handed over in phases so the client keeps trading.', budgetMin: String(s.between(180, 260) * 1000000), budgetMax: String(s.between(300, 420) * 1000000), targetStart: dayFrom(16), targetCompletion: dayFrom(197), approvalAuthority: s.pick(['Head of workplace', 'Facilities director']) };
  const agreement = { contractValue: String(s.between(260, 380) * 1000000), notes: 'Rates held for ninety days from the date of issue.' };
  const stages = [{ name: 'On signing', trigger: 'Agreement signed by both parties', shareBp: 2000 }, { name: 'GFC drawings issued', trigger: 'Drawings released for construction', shareBp: 3000 }, { name: 'Substantial completion', trigger: 'Site handed back to the client', shareBp: 3500 }, { name: 'Snag closure', trigger: 'Snag list signed off', shareBp: 1500 }];
  const selections = [['Workstation, 1500mm, linear', 'Open plan', 42800], ['Reception desk, solid surface', 'Reception', 386500], ['Task chair, mesh back', 'Open plan', 18750]].map(([itemName, room, rupees]) => ({ itemName, room, category: 'Loose furniture', unitPrice: String(rupees * 100), quantity: s.between(4, 60), leadTimeWeeks: s.between(2, 14), decisionDeadline: dayFrom(30) }));
  DESIGN_BUILD[project.code] = { brief, agreement, stages, selections };
}

// ---------------------------------------------------------------- the money --
// Bills: the vendor sends them from the portal; finance acknowledges the split and a due date, and pays
// some. `backdateForDemo` dates a paid bill's submission 12 days before its payment; an unpaid one 6 days ago.
export const BILLS = MONEY_SPEC.bills.map((b, i) => {
  const order = orderByNumber(b.order);
  const vendor = vendorByKey(order.vendor);
  const paidOn = b.pay === undefined ? null : paidOnFor(b.pay);
  const acknowledged = paidOn !== null || b.due !== undefined;
  const dueOn = paidOn ?? (b.due === undefined ? null : dueOnFor(b.due));
  return { ...b, project: order.project, vendor: vendor.key, vendorName: vendor.name, vendorShort: vendor.short, claimed: W(BigInt(b.taxable) + BigInt(b.gst)), state: acknowledged ? 'acknowledged' : 'submitted', paidOn, dueOn,
    overdue: paidOn === null && dueOn !== null && dueOn < SEED_DAY, submittedOn: paidOn !== null ? addDays(paidOn, -12) : dayFrom(-6), sentBy: vendor.desk ?? vendor.name, seq: i };
});
const weekEnd = addDays(mondayOf(SEED_DAY), 6);
const nextWeekEnd = addDays(weekEnd, 7);
const unpaid = BILLS.filter((b) => b.state === 'acknowledged' && b.paidOn === null);
const sumOf = (list, key) => W(list.reduce((a, b) => a + BigInt(b[key]), 0n));
// payablesSummary: overdue is due before today; this week runs today to Sunday; next week the Monday to Sunday after
export const PAYABLES = {
  overdue: unpaid.filter((b) => b.dueOn < SEED_DAY), thisWeek: unpaid.filter((b) => b.dueOn >= SEED_DAY && b.dueOn <= weekEnd), nextWeek: unpaid.filter((b) => b.dueOn > weekEnd && b.dueOn <= nextWeekEnd), later: unpaid.filter((b) => b.dueOn > nextWeekEnd),
  toAcknowledge: BILLS.filter((b) => b.state === 'submitted'), weekEnd, nextWeekEnd,
};
for (const k of ['overdue', 'thisWeek', 'nextWeek', 'later', 'toAcknowledge']) PAYABLES[`${k}Total`] = sumOf(PAYABLES[k], 'claimed');
PAYABLES.total = sumOf(unpaid, 'claimed');

// TDS on a paid bill, from the provisional catalogue (CA-05..07, every row provisional): the base is the
// taxable amount; 194C deducts above ₹30,000 on a single payment, 194I above ₹50,000 in a month, 194J once the
// year's aggregate passes ₹50,000; a 194C(6) transporter with a declaration on file is not deducted; a payee
// without a valid PAN is deducted at 20% (206AA). Retention is the order's rate on the bill's gross.
const RATES = { '194C:company': 200, '194C:firm': 200, '194C:individual': 100, '194I:plant_machinery': 200, '194J:technical': 200, noValidPan: 2000 };
const THRESHOLDS = { '194C:single': 30_000_00n, '194C:annual': 1_00_000_00n, '194I:monthly': 50_000_00n, '194J:annual': 50_000_00n };
const yearSoFar = {};
export const PAYMENTS = [];
for (const bill of BILLS.filter((b) => b.paidOn !== null).sort((a, b) => a.seq - b.seq)) {
  const order = orderByNumber(bill.order); const vendor = vendorByKey(order.vendor);
  const taxable = BigInt(bill.taxable); const gross = BigInt(bill.claimed);
  const section = vendor.tds.section;
  const key = section === '194C' ? `194C:${vendor.constitution}` : `${section}:${vendor.tds.payeeClass}`;
  const so = yearSoFar[vendor.key] ?? 0n;
  let deduct, reason;
  if (vendor.tds.declared) { deduct = false; reason = 'transporter_declaration'; }
  else if (section === '194C') { deduct = taxable > THRESHOLDS['194C:single'] || so + taxable > THRESHOLDS['194C:annual']; reason = deduct ? (vendor.pan ? 'deducted' : 'higher_rate_no_valid_pan') : 'below_threshold'; }
  else if (section === '194I') { deduct = taxable > THRESHOLDS['194I:monthly']; reason = deduct ? 'deducted' : 'below_threshold'; }
  else { deduct = so + taxable > THRESHOLDS['194J:annual']; reason = deduct ? 'deducted' : 'below_threshold'; }
  const rateBp = !deduct ? null : vendor.pan ? RATES[key] : RATES.noValidPan;
  const tds = deduct ? mulBp(taxable, rateBp) : 0n;
  const retention = order.retentionBp === null ? 0n : mulBp(gross, order.retentionBp);
  yearSoFar[vendor.key] = so + taxable;
  PAYMENTS.push({ number: `PV/${FY}/${String(PAYMENTS.length + 1).padStart(4, '0')}`, kind: 'bill', bill: bill.billNumber, order: order.number, project: order.project, vendor: vendor.key, vendorName: vendor.name, vendorShort: vendor.short, pan: vendor.pan, on: bill.paidOn, reference: `NEFT ${bill.billNumber}`,
    gross: W(gross), taxable: W(taxable), gst: bill.gst, section, payeeClass: section === '194C' ? vendor.constitution : vendor.tds.payeeClass, rateBp, tds: W(tds), reason, retention: W(retention), net: W(gross - tds - retention), provisional: true });
}
// Retention: held per order at the order's rate on its gross; what was withheld is what each paid bill kept
// back; the painter's is released in full on the seed day, as a voucher in the same series.
export const RETENTION = MONEY_SPEC.orders.filter((o) => o.retentionBp !== undefined).map((spec) => {
  const order = orderByNumber(spec.number); const vendor = vendorByKey(order.vendor);
  const held = W(mulBp(BigInt(order.gross), spec.retentionBp));
  const withheld = sumOf(PAYMENTS.filter((p) => p.order === spec.number), 'retention');
  const released = spec.release ? withheld : '0';
  return { order: spec.number, project: order.project, vendor: vendor.key, vendorName: vendor.name, vendorShort: vendor.short, rateBp: spec.retentionBp, holding: held, withheld, released, heldNow: W(BigInt(withheld) - BigInt(released)), bills: PAYMENTS.filter((p) => p.order === spec.number).length, releasedOn: spec.release ? SEED_DAY : null };
});
for (const r of RETENTION.filter((x) => x.released !== '0')) {
  PAYMENTS.push({ number: `PV/${FY}/${String(PAYMENTS.length + 1).padStart(4, '0')}`, kind: 'release', bill: null, order: r.order, project: r.project, vendor: r.vendor, vendorName: r.vendorName, vendorShort: r.vendorShort, pan: vendorByKey(r.vendor).pan, on: r.releasedOn, reference: `NEFT RET ${r.order}`,
    gross: r.released, taxable: r.released, gst: '0', section: null, payeeClass: null, rateBp: null, tds: '0', reason: 'release', retention: '0', net: r.released, provisional: false });
}
export const HELD_NOW = sumOf(RETENTION, 'heldNow');
// Tax invoices: GST at the provisional 18%, IGST when the site is in another state, else CGST and SGST in
// halves, each head to the paise; the total to the rupee under Sec 170 with the difference on a round-off line.
export const INVOICES = MONEY_SPEC.invoices.map((inv, i) => {
  const project = projectByCode(inv.project); const client = clientOf(project.clientKey);
  const taxable = BigInt(inv.taxable); const inter = project.site !== TENANT.state;
  const igst = inter ? mulBp(taxable, GST_BP) : 0n; const cgst = inter ? 0n : mulBp(taxable, GST_BP / 2); const sgst = cgst;
  const exact = taxable + igst + cgst + sgst; const total = roundToRupee(exact);
  const received = inv.received === undefined ? 0n : inv.received === 'all' ? total : BigInt(inv.received);
  const expectedOn = dayFrom(inv.expected);
  return { number: `INV/${FY}/${String(i + 1).padStart(4, '0')}`, project: inv.project, client: client.legalName, clientShort: client.short, clientGstin: client.gstin, description: inv.description, invoiceDate: dayFrom(inv.invoiced), expectedOn, certifiedOn: inv.certified === null ? null : dayFrom(inv.certified),
    placeOfSupply: project.site, supply: inter ? 'inter' : 'intra', taxable: W(taxable), igst: W(igst), cgst: W(cgst), sgst: W(sgst), exact: W(exact), total: W(total), roundOff: W(total - exact), received: W(received), receivedOn: received === 0n ? null : dayFrom(inv.receivedOn ?? 0), balance: W(total - received),
    overdue: total - received > 0n && expectedOn < SEED_DAY, provisional: true };
});
const open = INVOICES.filter((i) => BigInt(i.balance) > 0n);
export const RECEIVABLES = { invoiced: sumOf(INVOICES, 'total'), received: sumOf(INVOICES, 'received'), due: sumOf(open, 'balance'), overdue: sumOf(open.filter((i) => i.overdue), 'balance'), current: sumOf(open.filter((i) => !i.overdue), 'balance'), open };

// ---------------------------------------------------------------- the operator's view --
export const TENANTS = [
  { ...TENANT, created: '2026-06-02', plan: 'Standard', modules: '11 of 11', series: 'provisional', connector: 'never', api: `${SEED_DAY} 09:02` },
  { ...SECOND_TENANT, created: '2026-06-02', plan: 'Standard', modules: '11 of 11', series: 'provisional', connector: 'never', api: `${SEED_DAY} 09:06` },
];
// the seed re-run: creating an organisation that exists answers 409, which the console records as a refusal
export const PROVISIONING = [
  [`${SEED_DAY} 09:06:12`, SECOND_TENANT.slug, 'refused', 'a tenant with this slug already exists'],
  [`${SEED_DAY} 09:01:48`, TENANT.slug, 'refused', 'a tenant with this slug already exists'],
  ['2026-06-02 10:14:35', SECOND_TENANT.slug, 'created', ''],
  ['2026-06-02 10:11:02', TENANT.slug, 'created', ''],
];

// ---------------------------------------------------------------- the names the sample gate checks --
export const SAMPLE_NAMES = {
  seed: [TENANT.legalName, SECOND_TENANT.legalName, ...PROJECT_SPECS.flatMap((p) => [p.code, p.name]), ...Object.values(CLIENTS).map((c) => c.legalName), ...VENDOR_SPECS.map((v) => v.name), ...LEAD_PROSPECTS, ...STOCK_NAMES.map(([n]) => n), ...TASK_SPECS.map(([t]) => t), ...MONEY_SPEC.orders.map((o) => o.number), ...MONEY_SPEC.bills.map((b) => b.billNumber)],
  principals: [...STAFF.map((p) => p.name), PEOPLE.vendorPortal.name, PEOPLE.clientPortal.name, ...PEOPLE.desks.map((d) => d.name), PEOPLE.operator.name],
};

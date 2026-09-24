#!/usr/bin/env node
// Realistic synthetic data for demos and screenshots — THROUGH THE PRODUCT.
//
// ---------------------------------------------------------------------------
// EVERY NAME HERE IS INVENTED AND EVERY NUMBER IS MADE UP
// ---------------------------------------------------------------------------
//
// Nothing in this file comes from `_private/`, which holds a live customer
// database — real bank accounts, IFSC codes, GSTINs and PANs. Not a name, not
// an identifier, not an amount. Every company name below was searched for on
// the web before it was used; what a search turned up close to one is listed
// in the run report for the owner to veto (HUMAN(DEMO-NAMES)). The people are
// in `demo-principals.mjs`, the one place they are written down.
//
// The legacy database is dummy data too, so nothing migrates. What a demo needs
// is not that data — it is data of the right SHAPE: amounts that span lakh and
// crore so the Indian grouping is exercised, trade packages a site engineer
// would recognise, and at least one figure of each awkward kind.
//
// ---------------------------------------------------------------------------
// THE IDENTIFIERS — GENERATED HERE, AND WHAT THAT DOES AND DOES NOT SHOW
// ---------------------------------------------------------------------------
//
// Every GSTIN, PAN, TAN, CIN, IFSC and phone number is produced by a function
// below from an invented name, so each can be regenerated and none was copied
// from anywhere:
//
//   PAN    three letters of the name, the holder type the fourth character
//          carries (C company, F firm or LLP, P individual), the initial, four
//          digits and a letter from a hash of the name. The income-tax
//          department does not publish its check character, so a PAN here is
//          valid in format only.
//   GSTIN  the two-digit state code, that PAN, entity number 1, `Z`, and the
//          check character by GSTN's mod-36 scheme (`gstinCheckCharacter`), so
//          a validator that recomputes it passes.
//   TAN    the city's three letters, the initial, `0`, four digits and a
//          letter from the hash. Format only.
//   CIN    `U`, NIC 43300 (building completion and finishing), the state, the
//          year, `PTC` and six digits from the hash. The LLP has none.
//   IFSC   a real bank's four letters, the mandatory `0`, and a branch code
//          beginning `ZZ` — a pattern, not a branch. No account number is
//          seeded, because nothing takes one.
//   Phone  `+91 00000 0NNNN`. An Indian subscriber number never begins with 0,
//          so none of these can ring anybody.
//
// Format-valid is all a generated PAN, GSTIN or TAN can be shown to be. The
// registries are not public, so a coincidence with a real registration cannot
// be ruled out; the phone numbers are the only identifiers impossible by
// construction.
//
// Every address ends in `.example`, a reserved top-level domain (RFC 2606),
// until the owner names a demo domain (HUMAN(DEMO-DOMAIN)).
//
// ---------------------------------------------------------------------------
// THE MONEY — AT PROVISIONAL STATUTORY VALUES, AND MARKED SO
// ---------------------------------------------------------------------------
//
// The money path is built on provisional values (ADR-0014, addendum), so the
// demo runs it: orders at 18%, bills acknowledged and paid with TDS deducted
// and retention withheld, one release, the challan and 26Q those payments make,
// and tax invoices with receipts. No rate or threshold is written here. Each
// tenant loads the provisional statutory values through Settings › Tax, and
// every deduction, head and total is then the server's, computed from rows
// marked provisional — which is why each voucher and invoice this produces
// reads "Draft: provisional rates", and why none of it could be produced by an
// API without `STATUTORY_OUTPUTS=draft` (`PROVISIONAL_OUTPUT_REFUSED`).
//
// What the seed states is what a vendor's invoice or a bank statement would:
// a claim and its taxable value and GST, a due date, a payment date and a
// reference. The one rate typed here is an order line's GST, because an order
// line takes its rate as an input from a person (`WORKS_CONTRACT_GST_BP`).
//
// Still not created, because it is not built: part-payments, credit notes,
// Form 16A, the 26Q FVU file, interest under s.201(1A), and a cash balance
// (HUMAN(ARCH-CASH)).
//
// ---------------------------------------------------------------------------
// DETERMINISTIC AND IDEMPOTENT
// ---------------------------------------------------------------------------
//
// Every value is either a literal or drawn from a seeded PRNG with a fixed
// seed, so two runs produce identical content and a screenshot stays stable.
// Dates are the exception, on purpose: every one is counted from the day the
// seed runs, on India's calendar, so "due this week" and "waiting nine days"
// stay true whenever it is run.
// Re-running against a database that already has this data adds nothing: each
// step checks first, and the API refuses a duplicate anyway.
//
// Row IDs are uuids the server generates, so they differ between fresh
// databases. That is correct — an id is not content.
//
// Usage:  node scripts/seed-demo.mjs [--logins-out <path>]
//         (after `pnpm migrate` and with the API up)

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import pg from 'pg';
import { DEMO_TENANTS, PLATFORM_OPERATOR } from './demo-principals.mjs';

/**
 * What this script knows about an API response, which is deliberately little:
 * it reads ids and codes to decide what already exists, and writes the rest.
 *
 * @typedef {{ slug: string, legalName?: string, financeEmail?: string,
 *             procEmail?: string, vendorPortalEmail?: string,
 *             clientPortalEmail?: string, adminName?: string,
 *             financeName?: string, procName?: string }
 *           & { [field: string]: any }} Tenant
 * @typedef {{ id?: string, code?: string, name?: string, slug?: string }
 *           & { [field: string]: any }} ApiRow
 * @typedef {{ items?: ApiRow[] } & { [field: string]: any } | null} ApiList
 */

const url = process.env['MIGRATION_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!url) {
  console.error('MIGRATION_DATABASE_URL is not set. Refusing to guess.');
  process.exit(1);
}

const apiUrl = process.env['API_URL'] ?? 'http://localhost:4000';
const platformEmail = process.env['SEED_PLATFORM_EMAIL'] ?? PLATFORM_OPERATOR.email;

// `--logins-out <path>` writes DEMO-LOGINS.md — the ONLY place the demo
// addresses are printed. Nothing below prints an address to the terminal:
// a terminal is a transcript, and a transcript is not where logins live.
const loginsOut = (() => {
  const flag = process.argv.indexOf('--logins-out');
  if (flag === -1) return null;
  const path = process.argv[flag + 1];
  if (path === undefined || path.startsWith('--')) {
    console.error('--logins-out needs a path.');
    process.exit(1);
  }
  return path;
})();

// ---------------------------------------------------------------------------
// A deterministic PRNG
// ---------------------------------------------------------------------------
//
// mulberry32, seeded once. `Math.random()` would make every run different,
// which defeats the point: a demo that looks different each time cannot be
// screenshotted, reviewed, or compared against yesterday's.

/**
 * @param {number} seed
 * @returns {() => number}
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * **One stream per section, keyed by name — never one shared stream.**
 *
 * A single generator consumed across the whole script is deterministic only if
 * every call happens every time. It does not: a re-run skips whatever already
 * exists, the skipped section stops drawing, and every later section reads
 * different numbers from a stream that has moved on. The first version of this
 * file had exactly that bug, and the symptom was a second run producing
 * thirteen vendors where the first produced eighteen.
 *
 * Keying the stream by section name makes each one independent, so skipping any
 * of them changes nothing anywhere else.
 */
/**
 * @param {string} key
 */
function streamFor(key) {
  let hash = 2166136261;
  for (const character of `${key}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const next = mulberry32(hash ^ 20260905);
  return {
    /**
     * @template T
     * @param {readonly T[]} list
     * @returns {T}
     */
    pick(list) {
      const chosen = list[Math.floor(next() * list.length)];
      // The index is always in range for a non-empty list, so this is a
      // programming error rather than a condition to handle.
      if (chosen === undefined) throw new Error('cannot pick from an empty list');
      return chosen;
    },
    /**
     * @param {number} low
     * @param {number} high
     * @returns {number}
     */
    between: (low, high) => low + Math.floor(next() * (high - low + 1)),
    /**
     * @param {number} probability
     * @returns {boolean}
     */
    chance: (probability) => next() < probability,
  };
}

// ---------------------------------------------------------------------------
// The fixtures
// ---------------------------------------------------------------------------

// The people are written down once, in `demo-principals.mjs`, which the
// browser suite reads too; this is the shape the rest of this script wants.
const TENANTS = DEMO_TENANTS.map((t) => ({
  slug: t.slug,
  legalName: t.legalName,
  appOrigin: t.appOrigin,
  adminEmail: t.admin.email,
  adminName: t.admin.name,
  financeEmail: t.finance.email,
  financeName: t.finance.name,
  procEmail: t.proc.email,
  procName: t.proc.name,
  vendorPortalEmail: t.vendorPortal.email,
  clientPortalEmail: t.clientPortal.email,
  vendorPortalName: t.vendorPortal.name,
  clientPortalName: t.clientPortal.name,
  vendorDesks: t.vendorDesks,
}));

// Where leads come from. Real business districts, invented everything else —
// a demo set in a city nobody recognises reads as fake in a way that distracts
// from what is being demonstrated.
/** @type {[string, string][]} */
const LOCATIONS = [
  ['Gurugram', 'Cyber Hub'],
  ['Bengaluru', 'Outer Ring Road'],
  ['Mumbai', 'Bandra Kurla Complex'],
  ['Hyderabad', 'HITEC City'],
  ['Pune', 'Kharadi'],
  ['Chennai', 'Guindy'],
  ['Noida', 'Sector 62'],
  ['Ahmedabad', 'GIFT City'],
];

// ---------------------------------------------------------------------------
// Dates — counted from the day the seed runs, on India's calendar
// ---------------------------------------------------------------------------

/** Today in India, as an ISO date: the Bills screen's week and the challan's month are India's. */
const SEED_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

/**
 * @param {string} date
 * @param {number} days
 * @returns {string}
 */
function addDays(date, days) {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** @type {(offsetDays: number) => string} */
const dayFrom = (offsetDays) => addDays(SEED_DAY, offsetDays);

/** @type {(date: string) => string} */
const monthStart = (date) => `${date.slice(0, 8)}01`;

/**
 * The 1st of April that opened the financial year `date` falls in.
 *
 * @param {string} date
 */
function financialYearStart(date) {
  const year = Number(date.slice(0, 4));
  return `${String(Number(date.slice(5, 7)) >= 4 ? year : year - 1)}-04-01`;
}

/**
 * The Monday of `date`'s week. The Bills screen's week runs Monday to Sunday.
 *
 * @param {string} date
 */
function mondayOf(date) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

/** @type {(a: string, b: string) => string} */
const laterOf = (a, b) => (a > b ? a : b);

// ---------------------------------------------------------------------------
// The clients and their projects
// ---------------------------------------------------------------------------

/**
 * Plausible fictional corporates: a bank, two technology companies, a retailer
 * and two pharmaceutical research houses. `state` is the GST state code their
 * registration begins with.
 *
 * @type {Record<string, { legalName: string, state: string }>}
 */
const CLIENTS = {
  nilgiri: { legalName: 'Nilgiri Crest Bank Limited', state: '29' },
  sankhyamani: { legalName: 'Sankhyamani Analytics Private Limited', state: '29' },
  krayashala: { legalName: 'Krayashala Stores Private Limited', state: '29' },
  anuvanshik: { legalName: 'Anuvanshik Life Sciences Private Limited', state: '36' },
  sukshmajivika: { legalName: 'Sukshmajivika Research Laboratories Private Limited', state: '27' },
  lipiyantra: { legalName: 'Lipiyantra Technologies Private Limited', state: '27' },
};

/**
 * Each tenant's projects, from ₹48 lakh to ₹8.6 crore, so the Indian grouping
 * has to render 48,00,000 and 8,60,00,000 and both must read correctly.
 *
 * The shape the design demonstrates, and nothing left to luck: `KRA-01` runs
 * past its contract and its BOQ cost budget, `SAN-01` sits at 88% of its
 * contract, `NCB-01` is won and not started, `NCB-02` is on site with no
 * contract value yet (`rupees: null`, which every screen that divides by a
 * contract has to survive), and `ANU-02` is handed over. `site` is the GST
 * state code of where the work is — the place of supply on its invoices — so
 * the Hyderabad laboratory, billed from Karnataka, is billed across states.
 * The first project by code is the one the client portal login is linked to.
 *
 * @typedef {{ code: string, client: string, name: string, rupees: number | null,
 *             site: string, stage: 'won' | 'in_progress' | 'handed_over' }} DemoProject
 * @type {Record<string, DemoProject[]>}
 */
const PROJECTS = {
  'bhitarang-interiors': [
    { code: 'ANU-01', client: 'anuvanshik', name: 'R&D laboratory interiors, Genome Valley, Hyderabad', rupees: 6_40_00_000, site: '36', stage: 'in_progress' },
    { code: 'ANU-02', client: 'anuvanshik', name: 'Quality-control laboratory refit, Electronic City', rupees: 2_95_00_000, site: '29', stage: 'handed_over' },
    { code: 'KRA-01', client: 'krayashala', name: 'Flagship store fit-out, Brigade Road', rupees: 48_00_000, site: '29', stage: 'in_progress' },
    { code: 'NCB-01', client: 'nilgiri', name: 'Regional office and banking hall, Koramangala', rupees: 8_60_00_000, site: '29', stage: 'won' },
    { code: 'NCB-02', client: 'nilgiri', name: 'Back-office refit, Mysuru — enabling works before the contract is agreed', rupees: null, site: '29', stage: 'in_progress' },
    { code: 'SAN-01', client: 'sankhyamani', name: 'Workplace refresh, two floors, Outer Ring Road', rupees: 1_80_00_000, site: '29', stage: 'in_progress' },
  ],
  'samarachana-fitouts': [
    { code: 'SUK-01', client: 'sukshmajivika', name: 'Analytical laboratory and cleanroom interiors, Hinjawadi', rupees: 5_25_00_000, site: '27', stage: 'in_progress' },
    { code: 'SUK-02', client: 'sukshmajivika', name: 'Corporate office, Baner', rupees: 1_20_00_000, site: '27', stage: 'handed_over' },
    { code: 'LIP-01', client: 'lipiyantra', name: 'Development centre, three floors, Kharadi', rupees: 7_80_00_000, site: '27', stage: 'in_progress' },
    { code: 'LIP-02', client: 'lipiyantra', name: 'Training centre refit, Magarpatta', rupees: 64_00_000, site: '27', stage: 'won' },
  ],
};

/** @type {(slug: string, code: string) => DemoProject | undefined} */
const projectSpecFor = (slug, code) => (PROJECTS[slug] ?? []).find((p) => p.code === code);

/**
 * How much of a project's contract its orders add up to, as the design
 * demonstrates it: one project past its contract, one at the watch line, the
 * rest comfortably under. Returns one line per order — a quantity and a unit
 * rate in paise whose product is the intended share of the contract, split
 * evenly across the orders. A project with no contract value gets nothing
 * fixed and falls back to the stream.
 *
 * `KRA-01` (the smallest contract) goes 8% past it; `SAN-01` sits at 88%,
 * inside the 85% band; everything else lands between 15% and 60%.
 *
 * @param {string} code
 * @param {number} contractRupees
 * @param {number} howMany
 * @returns {{ quantityWhole: number, unitRate: number }[]}
 */
function orderShape(code, contractRupees, howMany) {
  if (contractRupees <= 0) return [];
  const sharePct = code.startsWith('KRA') ? 108 : code.startsWith('SAN') ? 88 : 15 + ((code.charCodeAt(0) * 7) % 46);
  const totalPaise = Math.floor((contractRupees * sharePct) / 100) * 100;
  const perOrder = Math.floor(totalPaise / howMany);
  return Array.from({ length: howMany }, (_, index) => {
    const quantityWhole = 10 + index * 5;
    // The last order absorbs the rounding so the total lands where intended.
    const target = index === howMany - 1 ? totalPaise - perOrder * (howMany - 1) : perOrder;
    return { quantityWhole, unitRate: Math.floor(target / quantityWhole) };
  });
}

// The trade packages a commercial fit-out is actually broken into.
/** @type {[string, string[]][]} */
const TRADES = [
  ['Civil', ['Blockwork 100mm', 'Screed to falls', 'Core cutting for services']],
  ['MEP', ['LT panel and distribution', 'Cable tray, GI 300mm', 'DB wiring, 2.5 sqmm']],
  ['HVAC', ['VRF indoor unit, 4.5 TR', 'Insulated duct, GI 24g', 'Grille and diffuser set']],
  ['Joinery', ['Reception desk, solid surface', 'Storage wall, laminate', 'Meeting table, 3600mm']],
  ['Flooring', ['Vitrified tile 600x600', 'Carpet tile, loop pile', 'Vinyl plank, 5mm']],
  ['Ceilings', ['Mineral fibre tile, 600x600', 'Gypsum bulkhead', 'Baffle ceiling, aluminium']],
  ['Glazing', ['Frameless glass partition, 12mm', 'Manifestation film', 'Glass door with patch']],
  ['Furniture', ['Workstation, 1200mm', 'Task chair', 'Soft seating, 2-seater']],
];

/**
 * The GST rate a person types on an order line: 18%, the rate relayed from the
 * CA call for works contracts and loaded as a provisional value
 * (`docs/statutory/QUESTIONS-FOR-CA.md`, provisional values row 4, CA-06). An
 * order line takes its rate as an input, which is the only reason a rate is
 * written in this file; the GST on a tax invoice is the server's, read from the
 * provisional row.
 */
const WORKS_CONTRACT_GST_BP = 1800;

// ---------------------------------------------------------------------------
// The vendors
// ---------------------------------------------------------------------------

/**
 * Indian trade suppliers, one trade each, and what a payment to each is
 * deducted under. Searched for before use (HUMAN(DEMO-NAMES)).
 *
 * `holder` is the PAN's fourth character. `pan: false` is the painter with no
 * PAN on record, deducted at the higher rate. `tds` is the profile recorded on
 * the vendor's own route; `declared` marks the transporter holding a 194C(6)
 * declaration, dated the day its financial year opened. The services trades —
 * transport, consultancy, painting, plant hire — are in no trade package, so
 * works orders never go to them; the money step raises their orders itself.
 *
 * @typedef {{ key: string, name: string, trade: string, holder: 'C' | 'F' | 'P',
 *             state: string, pan: boolean,
 *             tds: { section: '194C' | '194I' | '194J',
 *                    payeeClass: 'plant_machinery' | 'technical' | null,
 *                    declared?: boolean } }} DemoVendor
 * @type {DemoVendor[]}
 */
const VENDORS = [
  { key: 'prakashvahini', name: 'Prakashvahini Electrical Contracts Private Limited', trade: 'MEP', holder: 'C', state: '29', pan: true, tds: { section: '194C', payeeClass: null } },
  { key: 'kaveri', name: 'Kaveri Nirmaan Contracts', trade: 'Civil', holder: 'F', state: '29', pan: true, tds: { section: '194C', payeeClass: null } },
  { key: 'sahyadrikuta', name: 'Sahyadrikuta Buildcon LLP', trade: 'Civil', holder: 'F', state: '27', pan: true, tds: { section: '194C', payeeClass: null } },
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

/**
 * What each vendor is in law, recorded on its TDS profile (the CA's answer to
 * CA-07), and the same as its synthetic PAN's fourth character, so no demo
 * vendor shows a mismatch.
 *
 * @type {Record<'C' | 'F' | 'P', 'company' | 'firm' | 'individual'>}
 */
const CONSTITUTION_OF = { C: 'company', F: 'firm', P: 'individual' };

/**
 * Who each tenant buys from, in code order: the first gets `VEN-01`, and is the
 * vendor the vendor portal login represents. Suppliers serve more than one
 * contractor, so some appear under both — as separate records, one per tenant.
 *
 * @type {Record<string, string[]>}
 */
const VENDORS_FOR = {
  'bhitarang-interiors': ['prakashvahini', 'kaveri', 'himanil', 'sagwan', 'bhumitala', 'chhatrika', 'kanchbharati', 'aasandika', 'pathvahak', 'sthambhika', 'lepankar', 'machaan'],
  'samarachana-fitouts': ['sahyadrikuta', 'kaveri', 'himanil', 'kanchbharati', 'aasandika', 'sthambhika', 'lepankar'],
};

/** @type {(index: number) => string} */
const vendorCode = (index) => `VEN-${String(index + 1).padStart(2, '0')}`;

/**
 * @param {string} key
 * @returns {DemoVendor}
 */
function vendorSpec(key) {
  const spec = VENDORS.find((v) => v.key === key);
  if (spec === undefined) throw new Error(`no demo vendor named ${key}`);
  return spec;
}

// ---------------------------------------------------------------------------
// The organisations' own registration
// ---------------------------------------------------------------------------

/**
 * @type {Record<string, { holder: 'C' | 'F', state: string, cinState: string | null,
 *                         incorporated: string | null, tanCity: string, address: string,
 *                         bankCode: string, bankName: string, bankBranch: string,
 *                         buyerTurnoverOver10Crore: boolean }>}
 */
const COMPANY = {
  'bhitarang-interiors': {
    holder: 'C',
    state: '29',
    cinState: 'KA',
    incorporated: '2014',
    tanCity: 'BLR',
    address: 'Koramangala, Bengaluru, Karnataka 560034',
    bankCode: 'HDFC',
    bankName: 'HDFC Bank',
    bankBranch: 'Koramangala',
    buyerTurnoverOver10Crore: true,
  },
  'samarachana-fitouts': {
    holder: 'F',
    state: '27',
    cinState: null,
    incorporated: null,
    tanCity: 'PNE',
    address: 'Baner, Pune, Maharashtra 411045',
    bankCode: 'UTIB',
    bankName: 'Axis Bank',
    bankBranch: 'Baner',
    buyerTurnoverOver10Crore: false,
  },
};

// ---------------------------------------------------------------------------
// The identifier generators (see the header for what they do and do not show)
// ---------------------------------------------------------------------------

const BASE36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * A number from a text, the same on every run — FNV-1a, as `streamFor` uses.
 *
 * @param {string} text
 */
function nameHash(text) {
  let hash = 2166136261;
  for (const character of text) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** @type {(name: string, count: number) => string} */
const lettersOf = (name, count) => name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, count).padEnd(count, 'X');

/**
 * @param {string} name
 * @param {'C' | 'F' | 'P'} holder
 */
function syntheticPan(name, holder) {
  const hash = nameHash(`pan:${name}`);
  const digits = String(1000 + (hash % 9000));
  const letter = String.fromCharCode(65 + ((hash >>> 16) % 26));
  return `${lettersOf(name, 3)}${holder}${lettersOf(name, 1)}${digits}${letter}`;
}

/**
 * GSTN's check character. Over the first fourteen characters, weights 1 and 2
 * alternate from the left; each product is folded base 36 (quotient plus
 * remainder) and summed; the check is what brings the sum to a multiple of 36.
 * Checked, while this was written, against a sample GSTIN from the public
 * e-invoice documentation.
 *
 * @param {string} first14
 */
function gstinCheckCharacter(first14) {
  let sum = 0;
  for (let index = 0; index < 14; index += 1) {
    const product = BASE36.indexOf(first14[index] ?? '0') * (index % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return BASE36[(36 - (sum % 36)) % 36] ?? '0';
}

/**
 * @param {string} pan
 * @param {string} state
 */
function syntheticGstin(pan, state) {
  const first14 = `${state}${pan}1Z`;
  return `${first14}${gstinCheckCharacter(first14)}`;
}

/**
 * @param {string} name
 * @param {string} city
 */
function syntheticTan(name, city) {
  const hash = nameHash(`tan:${name}`);
  return `${city}${lettersOf(name, 1)}0${String(1000 + (hash % 9000))}${String.fromCharCode(65 + ((hash >>> 16) % 26))}`;
}

/**
 * @param {string} name
 * @param {string} state
 * @param {string} year
 */
function syntheticCin(name, state, year) {
  return `U43300${state}${year}PTC${String(nameHash(`cin:${name}`) % 1_000_000).padStart(6, '0')}`;
}

/** @type {(bankCode: string, key: string) => string} */
const syntheticIfsc = (bankCode, key) => `${bankCode}0ZZ${String(nameHash(`ifsc:${key}`) % 10_000).padStart(4, '0')}`;

/** @type {(key: string) => string} */
const syntheticPhone = (key) => `+91 00000 0${String(nameHash(`phone:${key}`) % 10_000).padStart(4, '0')}`;

/**
 * Companies a lead comes from: three prospects, searched for before use, and
 * the tenant's own clients coming back for more.
 */
const LEAD_PROSPECTS = [
  'Sahakosh Insurance Limited',
  'Upabhogika Stores Private Limited',
  'Vranaropani Hospitals Private Limited',
];

/**
 * When a lead is expected to close: three days to six weeks after the day the
 * seed runs, from the seed's own stream, so a fresh seed and a re-seed date
 * the same lead the same way and some closes fall inside the seed's month.
 *
 * @param {string} slug
 * @param {number} index
 * @returns {string}
 */
function expectedCloseFor(slug, index) {
  return dayFrom(streamFor(`${slug}:close:${String(index)}`).between(3, 45));
}

/**
 * @param {string} slug
 * @param {number} index
 * @returns {string}
 */
function leadProspect(slug, index) {
  const own = [...new Set((PROJECTS[slug] ?? []).map((p) => CLIENTS[p.client]?.legalName ?? ''))].filter((n) => n !== '');
  const pool = [...LEAD_PROSPECTS, ...own];
  return pool[index % pool.length] ?? 'Sahakosh Insurance Limited';
}

// ---------------------------------------------------------------------------
// The money
// ---------------------------------------------------------------------------

/**
 * What each tenant's money screens show. Amounts are paise, and none is round:
 * a round figure is also a plausible counter or quantity, and the browser
 * suite's raw-paise guard cannot tell the two apart (see the rate contract
 * below). Orders are listed before their bills, bills in the order they are
 * paid, and invoices in date order, so voucher and invoice numbers run with
 * the dates.
 *
 * A bill's `pay` says when it is paid; an unpaid bill's `due` says which
 * bucket its due date falls in; a bill with neither waits to be acknowledged.
 * The transport order carries no GST: which GST a goods transport agency's
 * bill carries is not modelled, and a demo that guessed would teach the guess.
 *
 * @typedef {{ number: string, vendor: string, project: string, description: string,
 *             hsnSac: string, quantityWhole: number, unitRate: string, gstRateBp: number,
 *             retentionBp?: number, release?: boolean }} MoneyOrder
 * @typedef {{ order: string, billNumber: string, taxable: string, gst: string,
 *             narrative: string, pay?: 'last_month' | 'this_month',
 *             due?: 'overdue' | 'this_week' | 'next_week' }} MoneyBill
 * @typedef {{ project: string, description: string, taxable: string, invoiced: number,
 *             expected: number, certified: number | null, received?: string,
 *             receivedOn?: number }} MoneyInvoice
 * @type {Record<string, { orders: MoneyOrder[], bills: MoneyBill[], invoices: MoneyInvoice[] }>}
 */
const MONEY = {
  'bhitarang-interiors': {
    orders: [
      { number: 'PO-ANU-MEP-01', vendor: 'prakashvahini', project: 'ANU-01', description: 'MEP — LT panel, cable tray and DB wiring, laboratory floors', hsnSac: '995461', quantityWhole: 1, unitRate: '187435000', gstRateBp: WORKS_CONTRACT_GST_BP, retentionBp: 500 },
      { number: 'PO-ANU-PNT-01', vendor: 'lepankar', project: 'ANU-01', description: 'Painting — acrylic emulsion, two coats, laboratory corridors', hsnSac: '', quantityWhole: 1, unitRate: '38690000', gstRateBp: WORKS_CONTRACT_GST_BP, retentionBp: 500, release: true },
      { number: 'PO-ANU-TRN-01', vendor: 'pathvahak', project: 'ANU-01', description: 'Transport — site deliveries of board, tile and cement, per trip', hsnSac: '996511', quantityWhole: 12, unitRate: '485000', gstRateBp: 0 },
      { number: 'PO-ANU-STR-01', vendor: 'sthambhika', project: 'ANU-01', description: 'Structural review of mezzanine and equipment loads, laboratory floors', hsnSac: '', quantityWhole: 1, unitRate: '48650000', gstRateBp: WORKS_CONTRACT_GST_BP },
      { number: 'PO-ANU-SCF-01', vendor: 'machaan', project: 'ANU-01', description: 'Scaffolding hire — access towers, per week', hsnSac: '', quantityWhole: 8, unitRate: '3147500', gstRateBp: WORKS_CONTRACT_GST_BP },
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
  },
  'samarachana-fitouts': {
    orders: [
      { number: 'PO-SUK-CIV-01', vendor: 'sahyadrikuta', project: 'SUK-01', description: 'Civil — blockwork, screed and core cutting, cleanroom block', hsnSac: '995461', quantityWhole: 1, unitRate: '146287500', gstRateBp: WORKS_CONTRACT_GST_BP, retentionBp: 500 },
      { number: 'PO-SUK-STR-01', vendor: 'sthambhika', project: 'SUK-01', description: 'Structural check of cleanroom ceiling loads', hsnSac: '', quantityWhole: 1, unitRate: '26430000', gstRateBp: WORKS_CONTRACT_GST_BP },
      { number: 'PO-SUK-PNT-01', vendor: 'lepankar', project: 'SUK-01', description: 'Painting — epoxy coat, cleanroom walls', hsnSac: '', quantityWhole: 1, unitRate: '21864000', gstRateBp: WORKS_CONTRACT_GST_BP },
    ],
    bills: [
      { order: 'PO-SUK-STR-01', billNumber: 'SSC/RV/12', taxable: '13215000', gst: '2378700', narrative: 'Ceiling load check, cleanroom block', pay: 'last_month' },
      { order: 'PO-SUK-CIV-01', billNumber: 'SBL-RA-01', taxable: '43786000', gst: '7881480', narrative: 'Running bill 1 — blockwork, ground floor', pay: 'this_month' },
      { order: 'PO-SUK-CIV-01', billNumber: 'SBL-RA-02', taxable: '39512500', gst: '7112250', narrative: 'Running bill 2 — screed and core cutting', due: 'this_week' },
      { order: 'PO-SUK-PNT-01', billNumber: 'LPW-33', taxable: '8742000', gst: '1573560', narrative: 'Epoxy coat, cleanroom walls, first half', due: 'next_week' },
    ],
    invoices: [
      { project: 'LIP-01', description: 'Running bill 1 — development centre, level 1', taxable: '963740000', invoiced: -38, expected: -8, certified: -41, received: 'all', receivedOn: -10 },
      { project: 'SUK-01', description: 'Running bill 1 — civil works and cleanroom partitions', taxable: '741825000', invoiced: -15, expected: 10, certified: -18, received: '296450000', receivedOn: -4 },
    ],
  },
};

/**
 * When a bill is paid: near the 11th of last month, or three days ago but
 * never before this month began — so each month's challan has lines.
 *
 * @param {'last_month' | 'this_month'} when
 */
function paidOnFor(when) {
  return when === 'last_month' ? addDays(monthStart(SEED_DAY), -20) : laterOf(dayFrom(-3), monthStart(SEED_DAY));
}

/**
 * An unpaid bill's due date, in the bucket the Bills screen is meant to show it
 * in: four days gone, by Friday of this week (today, once Friday has passed),
 * or Wednesday of next week.
 *
 * @param {'overdue' | 'this_week' | 'next_week'} due
 */
function dueOnFor(due) {
  if (due === 'overdue') return dayFrom(-4);
  if (due === 'this_week') return laterOf(SEED_DAY, addDays(mondayOf(SEED_DAY), 4));
  return addDays(mondayOf(SEED_DAY), 9);
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

/**
 * @param {string} credential
 * @param {string} method
 * @param {string} path
 * @param {unknown} [body]
 * @returns {Promise<any>}  The parsed body, or a `__error` marker `failed()` reads.
 */
async function call(credential, method, path, body) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${credential}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }).catch((error) => {
    console.error(`\nCould not reach ${apiUrl}. Start the API first.\n${String(error)}`);
    process.exit(1);
  });

  if (response.status === 204) return null;
  const text = await response.text();
  // A 404 from the router itself is plain text, not JSON. Parsing defensively
  // rather than optimistically: a seed that dies on an unexpected body shape
  // tells you less than one that reports the status.
  let parsed = null;
  try {
    parsed = text === '' ? null : JSON.parse(text);
  } catch {
    parsed = { message: text.slice(0, 200) };
  }
  if (response.status >= 400) {
    return { __error: response.status, ...(parsed ?? {}) };
  }
  return parsed;
}

/** @type {(credential: string, path: string) => Promise<any>} */
const get = (credential, path) => call(credential, 'GET', path);

/**
 * Every row of a paged list, following the cursor. The existence checks below
 * compare against the WHOLE list — a first page of fifty is not the list, and
 * a tenant with more projects than that re-created none of its own and seeded
 * nothing against them.
 *
 * @param {string} credential
 * @param {string} path
 * @returns {Promise<ApiList>}
 */
async function all(credential, path) {
  /** @type {ApiRow[]} */
  const items = [];
  /** @type {string | null} */
  let cursor = null;
  for (;;) {
    const sep = path.includes('?') ? '&' : '?';
    const suffix = cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`;
    /** @type {ApiList} */
    const page = await get(credential, `${path}${sep}limit=200${suffix}`);
    if (page === null || failed(page)) return page;
    items.push(...(page.items ?? []));
    cursor = page['nextCursor'] ?? null;
    if (cursor === null) return { ...page, items };
  }
}
/** @type {(credential: string, path: string, body?: unknown) => Promise<any>} */
const post = (credential, path, body) => call(credential, 'POST', path, body);
/** @type {(credential: string, path: string, body?: unknown) => Promise<any>} */
const put = (credential, path, body) => call(credential, 'PUT', path, body);
/** @type {(credential: string, path: string, body?: unknown) => Promise<any>} */
const patch = (credential, path, body) => call(credential, 'PATCH', path, body);

/**
 * @param {unknown} result
 * @returns {boolean}
 */
function failed(result) {
  return result !== null && typeof result === 'object' && '__error' in result;
}

/**
 * A transporter's 194C(6) declaration for this financial year, with its
 * evidence (the CA's answer to CA-07). The evidence is a document registered in
 * the vault against the vendor — a placeholder object, like every seeded
 * document, whose checksum is of its name rather than of a real file.
 * Idempotent: a year already on record is left alone, and its evidence is
 * registered once.
 *
 * @param {string} admin
 * @param {ApiRow} vendor
 * @param {DemoVendor} spec
 * @returns {Promise<void>}
 */
async function seedTransporterDeclaration(admin, vendor, spec) {
  const start = financialYearStart(SEED_DAY);
  const year = Number(start.slice(0, 4));
  const financialYear = `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
  const path = `/api/v1/purchase-orders/vendors/${vendor.id}/transporter-declarations`;
  const current = await get(admin, path);
  if (failed(current)) {
    console.error(`  could not read the declarations of ${spec.name}:`, current);
    process.exit(1);
  }
  if ((current.items ?? []).some((/** @type {{ financialYear: string }} */ d) => d.financialYear === financialYear)) {
    return;
  }

  const fileName = `194C6-declaration-${spec.key}-${financialYear}.pdf`;
  let evidence = (current.evidence ?? []).find((/** @type {{ fileName: string }} */ d) => d.fileName === fileName);
  if (evidence === undefined) {
    evidence = await post(admin, '/api/v1/workflow/documents', {
      entityType: 'vendor',
      entityId: vendor.id,
      fileName,
      contentType: 'application/pdf',
      sizeBytes: 48_213,
      checksum: createHash('sha256').update(fileName).digest('hex'),
    });
    if (failed(evidence)) {
      console.error(`  could not register the declaration evidence of ${spec.name}:`, evidence);
      process.exit(1);
    }
  }
  const recorded = await post(admin, path, {
    financialYear,
    declaredOn: start,
    goodsCarriageConfirmed: true,
    evidenceDocumentId: evidence.id,
  });
  if (failed(recorded)) {
    console.error(`  could not record the 194C(6) declaration of ${spec.name}:`, recorded);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// The one thing that is not an HTTP call
// ---------------------------------------------------------------------------
//
// Staff accounts. There is no route that creates a principal: an invitation is
// minted over HTTP but accepting one is not built, so a demo cannot produce the
// second and third people it needs to show an approval chain working — one
// person raising and another approving is the whole point of a chain.
//
// Written as SQL here, said out loud rather than hidden, and narrow: three
// principals per tenant with roles from the seeded catalog and nothing else.

/**
 * @param {import('pg').Client} client
 * @param {Tenant} tenant
 */
async function seedStaff(client, tenant) {
  const { rows } = await client.query(
    `SELECT id FROM tenancy.tenants WHERE slug = $1`,
    [tenant.slug],
  );
  const tenantId = rows[0]?.id;
  if (tenantId === undefined) return null;

  await client.query('BEGIN');
  try {
    await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    // The administrator was minted by the provisioner, which takes no name;
    // naming is what the hero and the approvals queue read (0083), so it is
    // given here. Idempotent: the same name every run.
    await client.query(
      `UPDATE identity.principals SET display_name = $2
        WHERE tenant_id = $1 AND external_id = $3 AND display_name IS DISTINCT FROM $2`,
      [tenantId, tenant.adminName, tenant['adminEmail']],
    );
    for (const [email, name, roles] of [
      [tenant.financeEmail, tenant.financeName, '{finance}'],
      [tenant.procEmail, tenant.procName, '{proc}'],
    ]) {
      const existing = await client.query(
        `SELECT id FROM identity.principals WHERE external_id = $1`,
        [email],
      );
      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE identity.principals SET display_name = $2
            WHERE tenant_id = $1 AND external_id = $3 AND display_name IS DISTINCT FROM $2`,
          [tenantId, name, email],
        );
        continue;
      }
      const created = await client.query(
        `INSERT INTO identity.principals (tenant_id, id, kind, external_id, email, roles, display_name)
         VALUES ($1, gen_random_uuid(), 'staff', $2, $2, $3::text[], $4)
         RETURNING id`,
        [tenantId, email, roles, name],
      );
      await client.query('SELECT identity.register_principal($1, $2)', [
        email,
        created.rows[0].id,
      ]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  return tenantId;
}

/**
 * Ages — the ONE step that does not go through the product.
 *
 * Every row above was written through the API a moment ago, so every
 * timestamp says "just now". A demo needs an approval that has waited nine
 * days beside one that arrived this morning, and notifications from three
 * different days; ages accrue only as real days pass (DATA-07). No public
 * route may set a timestamp — a client that can backdate its own approval
 * request can hide how long it sat — so this is direct SQL, superuser, seed
 * only, and it touches nothing but the clock columns.
 *
 * Deterministic and relative: the k-th order awaiting approval (by number)
 * is aged AGES[k] days before the moment the seed ran, and the request
 * notifications that submission produced move with it, so the queue and the
 * notifications screen tell the same story. (A submission writes no history
 * or audit row — only a decision does — so there is nothing else to move.)
 * Re-running refreshes the ages against the new seed time, which is the
 * point: "the oldest since 9 days ago" stays true tomorrow.
 *
 * @param {import('pg').Client} client
 * @param {string} tenantId
 */
async function backdateForDemo(client, tenantId) {
  const AGES = [9, 6, 3, 1, 0];
  const { rows: waiting } = await client.query(
    `SELECT id FROM procurement.purchase_orders
      WHERE tenant_id = $1 AND state = 'pending_approval'
      ORDER BY number`,
    [tenantId],
  );
  let aged = 0;
  for (const [index, row] of waiting.entries()) {
    const days = AGES[index % AGES.length] ?? 0;
    // Spread across the day as well, so two orders aged the same number of
    // days still order stably and read as different moments.
    const at = `now() - make_interval(days => ${String(days)}, hours => ${String(9 + (index % 7))})`;
    await client.query(
      `UPDATE procurement.purchase_orders SET updated_at = ${at} WHERE tenant_id = $1 AND id = $2`,
      [tenantId, row.id],
    );
    await client.query(
      `UPDATE workflow.notifications SET created_at = ${at}
        WHERE tenant_id = $1 AND entity_id = $2 AND kind = 'approval_requested'`,
      [tenantId, row.id],
    );
    aged += 1;
  }
  if (aged > 0) console.log(`  ages: ${aged} approvals aged between ${AGES[0]} days and today`);

  // The bills, the same way. A bill paid on the 11th was not sent a moment ago:
  // a paid bill is dated as sent twelve days before its payment and
  // acknowledged eight days before; an unpaid one as sent six days ago, and
  // acknowledged three days ago when it has been. Clock columns only — the
  // dates a person gave (due, paid) are the product's and are left alone.
  const bills = await client.query(
    `UPDATE procurement.vendor_bills
        SET submitted_at = CASE
              WHEN paid_on IS NOT NULL
                THEN ((paid_on + time '10:30') AT TIME ZONE 'Asia/Kolkata') - interval '12 days'
              ELSE now() - interval '6 days' END,
            acknowledged_at = CASE
              WHEN acknowledged_at IS NULL THEN NULL
              WHEN paid_on IS NOT NULL
                THEN ((paid_on + time '15:00') AT TIME ZONE 'Asia/Kolkata') - interval '8 days'
              ELSE now() - interval '3 days' END
      WHERE tenant_id = $1`,
    [tenantId],
  );
  if ((bills.rowCount ?? 0) > 0) console.log(`  ages: ${String(bills.rowCount)} bills dated before their payment`);

  // A variation with the client was not sent a moment ago either: the pending
  // ones are dated as sent four days ago, the second one a day later, so
  // "oldest N days" on Today reads as a wait and not as this morning. A clock
  // column; the decision dates are the product's and are left alone.
  const { rows: pending } = await client.query(
    `SELECT id FROM projects.change_orders WHERE tenant_id = $1 AND state = 'pending_client' ORDER BY number`,
    [tenantId],
  );
  for (const [index, row] of pending.entries()) {
    await client.query(
      `UPDATE projects.change_orders SET submitted_at = now() - make_interval(days => ${String(4 - (index % 3))}, hours => ${String(10 + (index % 5))})
        WHERE tenant_id = $1 AND id = $2`,
      [tenantId, row.id],
    );
  }
  if (pending.length > 0) console.log(`  ages: ${String(pending.length)} variations dated as sent days ago`);
}

/**
 * DEMO-LOGINS.md — generated, never hand-edited.
 *
 * Written only when `--logins-out` is given, to a path OUTSIDE every repo
 * (the workspace root is not a repository, which is what keeps this file
 * uncommittable). It is the one place the demo addresses are printed, and it
 * carries no password because there is none: development sign-in is the
 * address alone, behind `assertNotProduction`.
 *
 * @param {Date} at
 * @returns {string}
 */
function demoLoginsMarkdown(at) {
  /** @param {import('./demo-principals.mjs').Person} p @param {string} app */
  const row = (p, app) =>
    `| ${p.name} | \`${p.email}\` | ${p.roles.length === 0 ? 'no role — scoped by link' : p.roles.join(', ')} | ${app} |`;
  /** @param {import('./demo-principals.mjs').Person} p */
  const seesLine = (p) => `- **${p.name}** — sees: ${p.sees}\n  Refused: ${p.refused}`;
  const lines = [
    '# Demo logins — Construct-O-Genie',
    '',
    `Generated by \`scripts/seed-demo.mjs --logins-out\` on ${at.toISOString()}. Regenerate rather than edit.`,
    '',
    '**There are no passwords.** Development sign-in is email-only: the stack runs with',
    '`AUTH_PROVIDER=local`, the bearer token IS the address, and',
    '`assertNotProduction` (`services/identity/src/adapters/local.ts`) throws at boot if that',
    'provider is ever configured with `NODE_ENV=production`. Every address ends in `.example`,',
    'a reserved domain that cannot resolve, until a demo domain is chosen. Every person and every',
    'company is invented; the identifiers are generated (see the header of `scripts/seed-demo.mjs`).',
    '',
    '## The stack',
    '',
    '| Service | Port | Notes |',
    '|---|---|---|',
    '| web (staff app) | http://localhost:3000 | sign in with a staff address below |',
    '| admin console | http://localhost:3001 | sign in as the platform operator |',
    '| vendor portal | http://localhost:3002 | sign in with a vendor address |',
    '| client portal | http://localhost:3003 | sign in with a client address |',
    '| api | http://localhost:4000 | `/healthz` |',
    '| postgres | 5432 (pgbouncer 6432) | `POSTGRES_DB=cog_e2e` for a throwaway database |',
    '| minio | 9000 / 9001 | stands in for S3 |',
    '',
    'Start: `docker compose up -d --build` in `construct-o-genie/`, then',
    '`docker compose --profile seed run --rm seed`. Never `docker compose down -v`.',
    '',
    '## Platform operator (admin console)',
    '',
    '| Who | Address | Role | App |',
    '|---|---|---|---|',
    row(PLATFORM_OPERATOR, 'admin :3001'),
    '',
    seesLine(PLATFORM_OPERATOR),
    '',
  ];
  for (const t of DEMO_TENANTS) {
    lines.push(
      `## ${t.legalName} (\`${t.slug}\`)`,
      '',
      '| Who | Address | Role | App |',
      '|---|---|---|---|',
      row(t.admin, 'web :3000'),
      row(t.finance, 'web :3000'),
      row(t.proc, 'web :3000'),
      row(t.vendorPortal, 'vendor portal :3002'),
      row(t.clientPortal, 'client portal :3003'),
      ...t.vendorDesks.map((desk) => row(desk, 'vendor portal :3002')),
      '',
      seesLine(t.admin),
      seesLine(t.finance),
      seesLine(t.proc),
      seesLine(t.vendorPortal),
      seesLine(t.clientPortal),
      ...t.vendorDesks.map((desk) => seesLine(desk)),
      '',
    );
  }
  lines.push(
    '## Two tenants, one database',
    '',
    `${DEMO_TENANTS.map((t) => t.legalName).join(' and ')} share one Postgres and are isolated by`,
    'row-level security on every tenant table (a restrictive + permissive policy pair reading',
    '`app.tenant_id`, set only by `withTenant`). Sign in as one and you cannot see the other —',
    "another tenant's record answers not-found, never forbidden, so an id cannot be confirmed to exist.",
    '',
    '## What the demo data shows',
    '',
    '- Projects: KRA-01 and SAN-01 carry approved orders past their BOQ cost budget (Today › Margin',
    '  at risk); KRA-01 is 8% past its contract and SAN-01 sits at 88%, inside the 85–90% watch line;',
    '  NCB-01 is won and not started, NCB-02 is on site with no contract value yet, ANU-02 is handed',
    '  over. Samarachana has SUK-02 handed over and LIP-02 won. Contracts run from ₹48 lakh to ₹8.6 crore.',
    '- Approvals: orders waiting at three ages, the oldest nine days, plus one refusal by',
    '  separation of duties when the requester tries to approve.',
    '- Buying: one order line above its rate contract; three stock items below reorder level; one',
    '  delivery waiting at the gate to be checked in.',
    '- Site: daily reports with head counts, and site issues on the first site — two open, one resolved.',
    '- Notifications across three days, each naming the person who acted.',
    '- Tasks with owners and dates — two overdue, two due today.',
    '- Money, at provisional statutory values, marked "Draft: provisional rates" on every voucher and',
    '  invoice (Bhitarang; Samarachana has a smaller set):',
    '  - Bills: one past its due date, one due this week, one next week, one waiting to be acknowledged.',
    '  - Payments last month and this month: 194C with a PAN, 194C with no PAN at the higher rate, a',
    '    transporter paid in full on a 194C(6) declaration, 194J technical fees, 194I plant hire.',
    '  - Retention withheld on two orders, and released on one of them as its own voucher.',
    "  - Tax deducted: each month's challan and the quarter's 26Q, from those payments.",
    '  - Client billing: one invoice across states (IGST), one certified and part-paid with the rest',
    '    due next week, one past its expected date, and two paid in full.',
    "- Portals: the vendor logins see their own bills and payments, each deduction marked Provisional;",
    "  the client logins see their project's invoices, what was paid and what is due.",
    '- None of the money could be produced without `STATUTORY_OUTPUTS=draft`: every value behind it is',
    '  provisional, and the server refuses a statutory output computed from one (`PROVISIONAL_OUTPUT_REFUSED`).',
    '',
    '## Regenerate',
    '',
    'From `construct-o-genie/`, with the stack up, the seed writes this file through a bind mount of it',
    '(create the file once if it does not exist; Git Bash needs `MSYS_NO_PATHCONV=1` in front):',
    '',
    '```',
    'docker compose --profile seed run --rm -v "<workspace>/DEMO-LOGINS.md:/out/DEMO-LOGINS.md" \\',
    '  seed node scripts/seed-demo.mjs --logins-out /out/DEMO-LOGINS.md',
    '```',
    '',
    'Idempotent: re-running adds nothing and refreshes the relative dates (approval ages,',
    'notification days) against the new seed time.',
    '',
  );
  return lines.join('\n');
}

// The portal logins, per tenant: the vendor login, the client login, and a
// vendor desk for each supplier whose bills the demo shows.
//
// **No SQL. Every step is a route a customer uses.** This comment used to say
// the opposite — "SQL, and unavoidably so", because nothing redeemed an invite
// and no route granted a portal login its subject. Both are now built, and both
// halves of this function go through them: invite, redeem, grant.
//
// The link is what scopes the portal. `identity.principal_links` maps a
// principal to ONE vendor or ONE project, and the portal reads the subject from
// the link and never from the request — `VendorPortalView.js:22-27` takes the
// vendor id from the client, which makes the scoping an input rather than a
// control.
/**
 * The two portal logins — THROUGH THE INVITE PATH, not around it.
 *
 * This used to insert into `identity.principals` directly and call
 * `register_principal` itself. It worked, and it meant the one route a real
 * customer uses to create a login was exercised only by its own tests. A seed
 * that bypasses the product is a seed that cannot tell you the product works.
 *
 * So: mint an invitation as the administrator, redeem it as the invitee, and
 * let the server decide what kind of principal that makes. The kind is read
 * from the stored invitation row, which is the property worth exercising —
 * whoever redeems a link does not get to say what they are becoming.
 *
 * **Still deterministic.** The invite token is 32 random bytes, and that is
 * fine for the same reason the row ids are: a token is not content, it is never
 * stored in the clear, and nothing downstream reads it. What two runs must
 * agree on is the email, the kind, the empty role list and the linked subject,
 * and all four are literals or a `LIMIT 1` over a deterministic ordering.
 *
 * **Still idempotent**, by the same existence check as before.
 *
 * **And it now runs AFTER vendors and projects exist**, which is a fix rather
 * than a move. It used to be called before either was seeded, so on a genuinely
 * fresh database the subject lookup found nothing, both logins were skipped,
 * and they appeared only on a second run. Everything downstream that needs a
 * portal login therefore worked on a re-seeded database and not on a new one.
 */
/**
 * @param {import('pg').Client} client
 * @param {Tenant} tenant
 * @param {string} tenantId
 * @param {string} admin
 */
async function seedPortalLogins(client, tenant, tenantId, admin) {
  // The FIRST vendor and the FIRST project of THIS TENANT, by code —
  // deterministic, so the portal user sees the same subject on every run.
  //
  // **`WHERE tenant_id` explicitly, and that is not belt-and-braces.** This
  // script connects as the database superuser, and a superuser BYPASSES row
  // level security entirely — `FORCE` binds the table owner, not a superuser.
  // So `set_config('app.tenant_id', …)` is set here and does nothing, and
  // `ORDER BY code LIMIT 1` returned the globally first row rather than this
  // tenant's.
  //
  // It was wrong before this and silently: the previous version inserted the
  // resulting id straight into `identity.principal_links`, so the SECOND demo
  // tenant's client login was linked to the FIRST tenant's project — a
  // cross-tenant dangling reference that nothing complained about, in the one
  // table whose whole job is deciding what a client may see.
  //
  // Routing the seed through the product is what surfaced it:
  //
  //   could not grant the client its project:
  //   { __error: 404, code: 'NOT_FOUND', message: 'no such project' }
  //
  // The route checks the project exists in the caller's tenant, and refused.
  let vendor;
  let project;
  await client.query('BEGIN');
  try {
    await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    vendor = (
      await client.query(
        `SELECT id, name FROM procurement.vendors WHERE tenant_id = $1 ORDER BY code LIMIT 1`,
        [tenantId],
      )
    ).rows[0];
    project = (
      await client.query(
        `SELECT id, name FROM projects.projects WHERE tenant_id = $1 ORDER BY code LIMIT 1`,
        [tenantId],
      )
    ).rows[0];
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  // A vendor desk is linked to the vendor it names, found by the code the
  // vendors step gave that vendor — tenant-scoped, for the reason above.
  /** @type {[string, string, string, { id: string, name: string } | undefined][]} */
  const deskSubjects = [];
  for (const desk of tenant['vendorDesks'] ?? []) {
    const index = (VENDORS_FOR[tenant.slug] ?? []).indexOf(desk.vendorKey);
    const found =
      index < 0
        ? undefined
        : (
            await client.query(
              `SELECT id, name FROM procurement.vendors WHERE tenant_id = $1 AND code = $2`,
              [tenantId, vendorCode(index)],
            )
          ).rows[0];
    deskSubjects.push(['vendor', desk.email, desk.name, found]);
  }

  const subjects = [
    ['vendor', tenant.vendorPortalEmail, tenant['vendorPortalName'], vendor],
    ['client', tenant.clientPortalEmail, tenant['clientPortalName'], project],
    ...deskSubjects,
  ];

  for (const [kind, email, displayName, subject] of subjects) {
    if (subject === undefined) {
      console.error(`  no ${kind} to link the portal login for ${displayName} to — seed order is wrong`);
      process.exit(1);
    }

    // Tenant-scoped for the same reason: a superuser sees every tenant's rows.
    const existing = await client.query(
      `SELECT id FROM identity.principals WHERE tenant_id = $1 AND external_id = $2`,
      [tenantId, email],
    );
    if (existing.rows.length > 0) continue;

    // 1. The administrator invites them, saying what kind of login this is.
    //    No roles: the API refuses a role on a vendor or client invitation, and
    //    migration 0080 refuses it again in the table.
    const invited = await post(admin, '/api/v1/identity/invites', { email, kind, displayName });
    if (failed(invited)) {
      console.error(`  could not invite the ${kind} portal login:`, invited);
      process.exit(1);
    }

    // 2. They redeem it. The token is shown exactly once, here, and the URL is
    //    the tenant's own — `mintInvite` refuses to fall back to a default
    //    domain, which is the legacy's hardcoded `lwa-iota.vercel.app`.
    const token = new URL(invited.url).searchParams.get('invite');
    const accepted = await post(email, '/invite/v1/accept', { token });
    if (failed(accepted)) {
      console.error(`  could not redeem the ${kind} invitation:`, accepted);
      process.exit(1);
    }
    if (accepted.kind !== kind) {
      // The property the invite path exists for. If this ever trips, the kind
      // came from somewhere other than the stored row.
      console.error(`  redeemed a ${kind} invitation as ${accepted.kind}`);
      process.exit(1);
    }

    // 3. Scope it. A principal with no link sees NOTHING, which is the correct
    //    landing state for a portal login and why the invitation carries no
    //    subject: what a client may see is granted afterwards, on the screen
    //    that already does that.
    const created = await client.query(
      `SELECT id FROM identity.principals WHERE tenant_id = $1 AND external_id = $2`,
      [tenantId, email],
    );
    const principalId = created.rows[0]?.id;

    // **Both kinds go through the product now.** Until Settings › Vendor access
    // existed, the vendor half of this could not: nothing in the product wrote
    // a `subject_kind = 'vendor'` link, so the seed issued the INSERT itself
    // and said so in a comment. That comment was the evidence the gap existed —
    // an invitation could mint a vendor LOGIN, and then onboarding continued at
    // a database console.
    //
    // Routing the seed through the routes is not tidiness. The last time this
    // was done for the client half it immediately surfaced a real bug: the
    // direct INSERT had been storing a cross-tenant project id in silence, and
    // the route refused it with `404 no such project`. A seed that writes
    // around the product cannot find what the product would refuse.
    const path =
      kind === 'client'
        ? `/api/v1/settings/client-accounts/${principalId}/projects`
        : `/api/v1/settings/vendor-accounts/${principalId}/vendors`;
    const body = kind === 'client' ? { projectId: subject.id } : { vendorId: subject.id };

    const linked = await post(admin, path, body);
    if (failed(linked)) {
      console.error(`  could not grant the ${kind} login its subject:`, linked);
      process.exit(1);
    }
  }
}

// ---------------------------------------------------------------------------
// The seed
// ---------------------------------------------------------------------------


/**
 * Switch the optional modules on for the demo tenants.
 *
 * **This is a tenant CHOOSING them, not a default.** A new organisation gets
 * all eleven off (migration 0065) and every one of their routes answers 404
 * until somebody switches them on. The demo turns them on because the demo is
 * meant to show the whole product — and because a browser suite that
 * renders every screen against a tenant with every module off is a suite that
 * proves the gate works and nothing else.
 *
 * Idempotent: setting a module on that is already on writes the same boolean.
 */
/**
 * @param {string} admin
 */
async function enableOptionalModules(admin) {
  const listed = await get(admin, '/api/v1/settings/modules');
  if (failed(listed)) {
    console.error('  could not read the module list:', listed);
    process.exit(1);
  }
  let on = 0;
  for (const module of listed.items) {
    const result = await put(admin, `/api/v1/settings/modules/${module.key}`, {
      enabled: true,
    });
    if (failed(result)) {
      console.error(`  could not switch on ${module.key}:`, result);
      process.exit(1);
    }
    on += 1;
  }
  console.log(`  modules      ${String(on)} switched on`);
}

/**
 * The money path, end to end, through its routes — at provisional values.
 *
 * Orders for the payments the demo has to show — a works order to the portal
 * vendor, and service orders to a painter with no PAN, a transporter holding a
 * 194C(6) declaration, a structural consultant and a scaffolding hire firm.
 * Retention recorded against two of them BEFORE any bill is paid, because it is
 * withheld at payment. Each bill sent by its vendor's own portal login, the way
 * a vendor sends one; acknowledged by finance with its taxable value, GST and
 * due date; paid last month or this month, so each month's challan and the
 * quarter's 26Q have lines; one order's retention released; and tax invoices
 * raised to clients, with what they have paid.
 *
 * Every deduction, withholding, net, voucher number, GST head and invoice
 * number is the server's. The seed says only what a vendor's invoice or a bank
 * statement would.
 *
 * Idempotent piece by piece — keyed on order number, bill number and invoice
 * description — so a re-run finds each and takes it only as far as it has not
 * gone.
 *
 * @param {Tenant} tenant
 * @param {Map<string, ApiRow>} vendorRows
 * @param {ApiRow[]} projects
 */
async function seedMoney(tenant, vendorRows, projects) {
  const plan = MONEY[tenant.slug];
  if (plan === undefined) return;
  const admin = tenant['adminEmail'];
  const finance = tenant.financeEmail ?? '';
  const proc = tenant.procEmail ?? '';
  const projectByCode = new Map(projects.map((p) => [p.code, p]));
  /**
   * @param {string} what
   * @param {unknown} result
   * @returns {never}
   */
  function stop(what, result) {
    console.error(`  money: ${what}:`, result);
    process.exit(1);
  }

  // Who sends each vendor's bills: the vendor portal login for the first
  // vendor, a vendor desk for the others (`demo-principals.mjs`).
  /** @type {Map<string, string>} */
  const billerFor = new Map([[VENDORS_FOR[tenant.slug]?.[0] ?? '', tenant.vendorPortalEmail ?? '']]);
  for (const desk of tenant['vendorDesks'] ?? []) billerFor.set(desk.vendorKey, desk.email);

  // 1. The orders, raised, submitted and approved like any other.
  /** @type {ApiList} */
  const haveOrders = await all(admin, '/api/v1/purchase-orders');
  /** @type {Map<string, ApiRow>} */
  const orderByNumber = new Map();
  for (const spec of plan.orders) {
    const found = (haveOrders?.items ?? []).find((o) => o['number'] === spec.number);
    if (found !== undefined) {
      orderByNumber.set(spec.number, found);
      continue;
    }
    const vendor = vendorRows.get(spec.vendor);
    const project = projectByCode.get(spec.project);
    if (vendor === undefined || project === undefined) stop(`${spec.number} names a vendor or project this tenant lacks`, spec);
    const order = await post(admin, '/api/v1/purchase-orders', {
      number: spec.number,
      vendorId: vendor.id,
      projectId: project.id,
      lines: [
        {
          description: spec.description,
          hsnSac: spec.hsnSac,
          quantityWhole: spec.quantityWhole,
          quantityMillionths: 0,
          unitRate: spec.unitRate,
          gstRate: spec.gstRateBp,
        },
      ],
    });
    if (failed(order)) stop(`could not raise ${spec.number}`, order);
    const submitted = await post(proc, `/api/v1/purchase-orders/${order.id}/submit`, {
      expectedVersion: order.version ?? 1,
    });
    if (!failed(submitted)) await post(finance, `/api/v1/purchase-orders/${order.id}/approve`, {});
    orderByNumber.set(spec.number, order);
  }

  // 2. Retention on the orders that hold it, before a single bill is paid.
  /** @type {ApiList} */
  const heldBefore = await all(finance, '/api/v1/money/retention');
  for (const spec of plan.orders) {
    if (spec.retentionBp === undefined) continue;
    const order = orderByNumber.get(spec.number);
    if ((heldBefore?.items ?? []).some((p) => p['purchaseOrderId'] === order?.id)) continue;
    const held = await post(finance, '/api/v1/purchase-orders/retention', {
      purchaseOrderId: order?.id,
      retentionRateBp: spec.retentionBp,
    });
    if (failed(held)) stop(`could not record retention on ${spec.number}`, held);
  }

  // 3. The bills: sent by the vendor, acknowledged, paid.
  let paid = 0;
  let due = 0;
  let waiting = 0;
  for (const spec of plan.bills) {
    const orderSpec = plan.orders.find((o) => o.number === spec.order);
    const order = orderByNumber.get(spec.order);
    const biller = orderSpec === undefined ? undefined : billerFor.get(orderSpec.vendor);
    if (order === undefined || biller === undefined) stop(`${spec.billNumber} has no order or no login to send it`, spec);

    /** @type {ApiList} */
    const sent = await all(biller, '/api/v1/portal/vendor/bills');
    /** @type {ApiRow | undefined} */
    let bill = (sent?.items ?? []).find((b) => b['billNumber'] === spec.billNumber);
    if (bill === undefined) {
      const submitted = await post(biller, '/api/v1/portal/vendor/bills', {
        purchaseOrderId: order.id,
        billNumber: spec.billNumber,
        // The vendor's own total: its taxable value and the GST it charged.
        amountClaimed: String(BigInt(spec.taxable) + BigInt(spec.gst)),
        narrative: spec.narrative,
      });
      if (failed(submitted)) stop(`${spec.billNumber} was not accepted from the vendor`, submitted);
      bill = { id: submitted.id, state: 'submitted', paidOn: null };
    }

    const paidOn = spec.pay === undefined ? null : paidOnFor(spec.pay);
    if (bill['state'] === 'submitted' && (paidOn !== null || spec.due !== undefined)) {
      const acknowledged = await post(finance, `/api/v1/purchase-orders/bills/${bill.id}/acknowledge`, {
        taxableAmount: spec.taxable,
        gstAmount: spec.gst,
        dueOn: paidOn ?? dueOnFor(spec.due ?? 'next_week'),
      });
      if (failed(acknowledged)) stop(`${spec.billNumber} was not acknowledged`, acknowledged);
    }
    if (paidOn !== null && (bill['paidOn'] ?? null) === null) {
      const payment = await post(finance, `/api/v1/money/bills/${bill.id}/pay`, {
        paidOn,
        reference: `NEFT ${spec.billNumber}`,
      });
      if (failed(payment)) stop(`${spec.billNumber} was not paid`, payment);
    }
    if (paidOn !== null) paid += 1;
    else if (spec.due !== undefined) due += 1;
    else waiting += 1;
  }

  // 4. Retention released where the demo shows a release — everything withheld
  //    on that order, as its own voucher.
  /** @type {ApiList} */
  const heldAfter = await all(finance, '/api/v1/money/retention');
  let released = 0;
  for (const spec of plan.orders) {
    if (spec.release !== true) continue;
    const order = orderByNumber.get(spec.number);
    const position = (heldAfter?.items ?? []).find((p) => p['purchaseOrderId'] === order?.id);
    if (position === undefined || position['stage'] !== 'held') continue;
    const done = await post(finance, `/api/v1/money/retention/${position.id}/release`, {
      releasedOn: SEED_DAY,
      reference: `NEFT RET ${spec.number}`,
    });
    if (failed(done)) stop(`retention on ${spec.number} was not released`, done);
    released += 1;
  }

  // 5. Tax invoices to clients, and what the clients have paid. The client's
  //    GSTIN is generated like every other; the place of supply is the site.
  /** @type {ApiList} */
  const invoices = await all(finance, '/api/v1/money/client-invoices');
  let raised = 0;
  for (const spec of plan.invoices) {
    const project = projectByCode.get(spec.project);
    const projectSpec = projectSpecFor(tenant.slug, spec.project);
    const clientSpec = projectSpec === undefined ? undefined : CLIENTS[projectSpec.client];
    if (project === undefined || projectSpec === undefined || clientSpec === undefined) {
      stop(`an invoice names ${spec.project}, which this tenant lacks`, spec);
    }
    /** @type {ApiRow | undefined} */
    let invoice = (invoices?.items ?? []).find(
      (i) => i['projectCode'] === spec.project && i['description'] === spec.description,
    );
    if (invoice === undefined) {
      invoice = await post(finance, '/api/v1/money/client-invoices', {
        projectId: project.id,
        invoiceDate: dayFrom(spec.invoiced),
        expectedOn: dayFrom(spec.expected),
        certifiedOn: spec.certified === null ? null : dayFrom(spec.certified),
        description: spec.description,
        taxableAmount: spec.taxable,
        placeOfSupply: projectSpec.site,
        clientGstin: syntheticGstin(syntheticPan(clientSpec.legalName, 'C'), clientSpec.state),
      });
      if (failed(invoice)) stop(`the invoice "${spec.description}" was not raised`, invoice);
      raised += 1;
    }
    if (spec.received !== undefined && invoice?.['received'] === '0') {
      const receipt = await post(finance, `/api/v1/money/client-invoices/${invoice.id}/receipts`, {
        receivedOn: dayFrom(spec.receivedOn ?? 0),
        // "all" is whatever the server says is still due — never a figure
        // worked out here.
        amount: spec.received === 'all' ? invoice['balance'] : spec.received,
        reference: `RTGS ${spec.project}`,
      });
      if (failed(receipt)) stop(`the receipt against "${spec.description}" was not recorded`, receipt);
    }
  }

  console.log(
    `  money: ${String(plan.orders.length)} orders; bills ${String(paid)} paid, ${String(due)} due, ` +
      `${String(waiting)} to acknowledge; ${String(released)} retention released; ${String(raised)} invoices raised`,
  );
}

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  await client.query(
    `INSERT INTO tenancy.platform_principals (external_id, email)
     VALUES ($1, $1) ON CONFLICT (external_id) DO UPDATE SET email = EXCLUDED.email`,
    [platformEmail],
  );

  for (const tenant of TENANTS) {
    // 1. The organisation, through the product. A 409 means it already exists,
    //    which on a re-run is the normal case rather than a failure.
    const provisioned = await post(platformEmail, '/platform/v1/tenants', {
      slug: tenant.slug,
      legalName: tenant.legalName,
      appOrigin: tenant.appOrigin,
      adminEmail: tenant.adminEmail,
      adminExternalId: tenant.adminEmail,
    });
    if (failed(provisioned) && provisioned.__error !== 409) {
      console.error(`provisioning ${tenant.slug} failed:`, provisioned);
      process.exit(1);
    }
    console.log(`\n${tenant.legalName}`);

    const tenantId = await seedStaff(client, tenant);

    // A DEMO CHOICE, NOT A PRODUCT DEFAULT. All eleven design-build modules
    // ship OFF (migration 0065) and a new tenant sees none of them. This turns
    // every one on for the two demo tenants, including the three the port
    // review called thin — commercial agreement, delivery milestones and
    // warranty, each of which carries a mechanism nothing yet reads. Seeing
    // them here is not evidence that a real tenant should have them; that
    // question is open and is the client's to answer.
    await enableOptionalModules(tenant.adminEmail);

    const admin = tenant.adminEmail;
    const finance = tenant.financeEmail;
    const proc = tenant.procEmail;

    // 1b. The organisation's own registration, its answers on Settings › Tax,
    //     and the provisional statutory values, in that order: a tax invoice
    //     carries the GSTIN, a challan and a 26Q carry the TAN, and every rate
    //     and threshold is read from the values loaded here. All three are
    //     idempotent — the same profile, the same answers, and a load that adds
    //     only what is missing and never writes a value as verified.
    const company = COMPANY[tenant.slug];
    if (company === undefined) throw new Error(`no company profile for ${tenant.slug}`);
    const ownPan = syntheticPan(tenant.legalName, company.holder);
    const profile = await put(admin, '/api/v1/settings/company', {
      gstin: syntheticGstin(ownPan, company.state),
      pan: ownPan,
      cin:
        company.cinState === null || company.incorporated === null
          ? ''
          : syntheticCin(tenant.legalName, company.cinState, company.incorporated),
      tan: syntheticTan(tenant.legalName, company.tanCity),
      address: company.address,
      phone: syntheticPhone(`company:${tenant.slug}`),
      email: `accounts@${tenant.slug}.example`,
      website: `https://${tenant.slug}.example`,
      bankName: company.bankName,
      bankBranch: company.bankBranch,
      bankIfsc: syntheticIfsc(company.bankCode, tenant.slug),
    });
    const answered = failed(profile)
      ? profile
      : await put(admin, '/api/v1/settings/tax-setup', {
          worksContractBundling: true,
          transporterPanDeclared: true,
          buyerTurnoverOver10Crore: company.buyerTurnoverOver10Crore,
        });
    const loaded = failed(answered) ? answered : await post(admin, '/api/v1/settings/tax/statutory-values');
    if (failed(loaded)) {
      console.error('  could not record the company, its tax answers or the provisional values:', loaded);
      process.exit(1);
    }
    console.log('  company profile, tax answers, provisional statutory values');

    // 2. Vendors — the suppliers this tenant buys from, each with the
    //    identifiers its registration would carry (generated; see the header)
    //    and the TDS profile a payment to it is deducted under.
    /** @type {ApiList} */
    const existingVendors = await all(admin, '/api/v1/purchase-orders/vendors');
    // The first authenticated read per tenant is a health check, and it must be
    // fatal.
    //
    // A 409 above is accepted as "already provisioned, carry on", which is the
    // idempotency path and is right on a re-run. It is also what comes back
    // when the SLUG is taken but the tenant behind it is not reachable — the
    // audit row for a provisioning attempt outlives the tenant, deliberately.
    // In that state every create below fails one at a time and the run ends by
    // printing a report full of zeros under a heading that reads like success.
    //
    // A seed that reports nothing wrong while creating nothing is worse than
    // one that stops, so this stops.
    if (failed(existingVendors)) {
      console.error(
        `\n${tenant.slug}: provisioned, but the first read as ${admin} failed:`,
        existingVendors,
      );
      console.error('The slug may be held by an earlier attempt whose tenant no longer exists.');
      process.exit(1);
    }
    const vendorByCode = new Map((existingVendors?.items ?? []).map((v) => [v.code, v]));
    /** @type {Map<string, ApiRow>} */
    const vendorRows = new Map();
    for (const [index, key] of (VENDORS_FOR[tenant.slug] ?? []).entries()) {
      const spec = vendorSpec(key);
      const code = vendorCode(index);
      /** @type {ApiRow | undefined} */
      let row = vendorByCode.get(code);
      if (row === undefined) {
        const pan = spec.pan ? syntheticPan(spec.name, spec.holder) : null;
        row = await post(admin, '/api/v1/purchase-orders/vendors', {
          name: spec.name,
          code,
          ...(pan === null ? {} : { pan, gstin: syntheticGstin(pan, spec.state) }),
          email: `accounts@${spec.key}.example`,
          phone: syntheticPhone(`vendor:${spec.key}`),
        });
        if (failed(row)) {
          console.error(`  could not register ${spec.name}:`, row);
          process.exit(1);
        }
      }
      if (row === undefined) continue;
      vendorRows.set(key, row);
      // The profile has its own route, so editing a vendor never clears it, and
      // writing the same profile again changes nothing. The transporter's
      // 194C(6) declaration is a record of its own, with its evidence, dated the
      // day its financial year opened.
      const profiled = await put(admin, `/api/v1/purchase-orders/vendors/${row.id}/tds-profile`, {
        tdsSection: spec.tds.section,
        tdsPayeeClass: spec.tds.payeeClass,
        panInoperative: false,
        constitution: CONSTITUTION_OF[spec.holder],
      });
      if (failed(profiled)) {
        console.error(`  could not record the TDS profile of ${spec.name}:`, profiled);
        process.exit(1);
      }
      if (spec.tds.declared === true) await seedTransporterDeclaration(admin, row, spec);
    }
    const vendorIds = [...vendorRows.values()].map((v) => v.id);
    console.log(`  vendors: ${vendorIds.length}, each with a TDS profile`);

    // 2a. The trade catalogue.
    //
    // Seeded because a trade code is now VALIDATED — `services/host` resolves
    // every `tradeCode` on a rate contract or an order line against this table
    // and refuses one that names nothing. Before that check existed the
    // catalogue could ship empty and every code was silently accepted; it
    // cannot now, and a seed that produced a rate contract without seeding the
    // trade it names would refuse its own data.
    //
    // The codes are the `TRADES` section names, which is what the BOQ lines are
    // already grouped by, so the catalogue describes the demo rather than
    // duplicating it.
    //
    // **`defaultMarginBp` is deliberately absent, not zero.** A default margin
    // is a commercial figure this business has to decide, and the column is
    // nullable precisely so "nobody has said" is representable. Seeding a
    // margin would put a number the client never chose in front of them on a
    // settings screen, where it would read as their policy.
    /** @type {ApiList} */
    const haveTrades = await get(admin, '/api/v1/settings/trade-packages');
    const haveTradeCodes = new Set((haveTrades?.items ?? []).map((t) => t.code));
    let tradesAdded = 0;
    for (const [index, [section]] of TRADES.entries()) {
      const code = section.toUpperCase();
      if (haveTradeCodes.has(code)) continue;
      const made = await post(admin, '/api/v1/settings/trade-packages', {
        code,
        name: section,
        description: `${section} works packaged as one trade.`,
        sortOrder: index,
      });
      if (!failed(made)) tradesAdded += 1;
    }
    console.log(`  trade packages: ${haveTradeCodes.size + tradesAdded}`);

    // 3. Projects — this tenant's, each for a client, one with no contract
    //    value yet. BOQs across real trade packages follow.
    /** @type {ApiList} */
    const existingProjects = await all(admin, '/api/v1/projects');
    const haveCodes = new Map((existingProjects?.items ?? []).map((p) => [p.code, p]));
    const projects = [];
    for (const spec of PROJECTS[tenant.slug] ?? []) {
      const found = haveCodes.get(spec.code);
      if (found !== undefined) {
        projects.push(found);
        continue;
      }
      const created = await post(admin, '/api/v1/projects', {
        code: spec.code,
        name: spec.name,
        clientName: CLIENTS[spec.client]?.legalName ?? spec.client,
        originalValue: spec.rupees === null ? null : String(spec.rupees * 100),
      });
      if (!failed(created)) projects.push(created);
    }
    console.log(`  projects: ${projects.length}`);

    // 3b. Each project's stage, through the state route — the design's tabs
    //     and "N in progress" read the real column. One project per tenant is
    //     won and not started, one is handed over, the rest are on site;
    //     `KRA-01` (past its contract) and `SAN-01` (at the watch line) are
    //     both on site, because that is where an overrun is a live problem.
    //     Walked one legal move at a time, so the route's own rule is what
    //     gets a project there; idempotent because a project already at or
    //     past its target offers no move on the path.
    let moved = 0;
    for (const project of projects) {
      const target = projectSpecFor(tenant.slug, project.code)?.stage ?? 'in_progress';
      const path = ['won', 'in_progress', 'handed_over'];
      /** @type {ApiRow | null} */
      let current = await get(admin, `/api/v1/projects/${project.id}`);
      for (const step of path.slice(0, path.indexOf(target) + 1)) {
        if (current === null || !(current['moves'] ?? []).includes(step)) continue;
        const next = await post(admin, `/api/v1/projects/${project.id}/state`, { state: step });
        if (failed(next)) break;
        current = next;
        moved += 1;
      }
    }
    if (moved > 0) console.log(`  project stages: ${moved} moves`);

    // 4. A BOQ per project, across trade packages.
    for (const project of projects) {
      const boq = await get(admin, `/api/v1/projects/${project.id}/boq`);
      if ((boq?.items ?? []).length > 0) continue;

      const boqStream = streamFor(`${tenant.slug}:boq:${project.code}`);
      // KRA-01 and SAN-01 carry a small, fully priced BOQ, so the orders
      // approved against them run past its cost budget: the two projects Today
      // names under margin at risk. Every other BOQ keeps unpriced lines.
      const lean = project.code === 'KRA-01' || project.code === 'SAN-01';
      const lines = [];
      let itemNo = 1;
      for (const [section, items] of TRADES) {
        for (const description of items) {
          const rate = boqStream.between(40, 9000) * 100;
          lines.push({
            section,
            itemNo: itemNo++,
            description,
            uom: section === 'Furniture' ? 'nos' : 'sqm',
            quantityWhole: lean ? boqStream.between(1, 4) : boqStream.between(8, 900),
            // Mostly whole, a few halves and quarters — the shape a measured
            // BOQ has, and what the design's "340 sqm" reads as; six random
            // decimals read as noise, not a measurement.
            quantityMillionths: boqStream.pick([0, 0, 0, 0, 500_000, 250_000, 750_000]),
            rate: String(rate),
            // A cost rate on most lines and NOT on some. The absent ones are
            // the point: PO-15 is unanswered, so a missing cost rate stays
            // missing, and a screen has to render that rather than invent 78%
            // of the selling rate the way the legacy does.
            ...(lean || boqStream.chance(0.75) ? { costRate: String(Math.round(rate * 0.72)) } : {}),
          });
        }
      }
      await post(admin, `/api/v1/projects/${project.id}/boq`, { lines });
    }
    console.log(`  BOQs across ${TRADES.length} trade packages`);

    // 5. Purchase orders, in every state the machine has.
    //
    //    Every line at `WORKS_CONTRACT_GST_BP`, the provisional rate a person
    //    would type, and each order to a vendor of the trade it buys.
    // Existence check FIRST. Without one a re-run doubles the order book, which
    // is the failure the idempotency requirement is about.
    const existingOrders = await get(admin, '/api/v1/purchase-orders');
    const orders = [];
    if ((existingOrders?.items ?? []).length === 0) {
      // A glazing order never goes to the painter: the vendors with a trade
      // package, and the trades one of them can take.
      const tradeVendors = (VENDORS_FOR[tenant.slug] ?? [])
        .map((key) => vendorSpec(key))
        .filter((v) => TRADES.some(([section]) => section === v.trade));
      const tradesOffered = TRADES.filter(([section]) => tradeVendors.some((v) => v.trade === section));
      for (const [projectIndex, project] of projects.entries()) {
        const poStream = streamFor(`${tenant.slug}:po:${project.code}`);
        const howMany = 2 + (projectIndex % 3);
        // **The shape the design demonstrates, produced by the seed.** Every
        // order is sized against its project's contract so the "ordered
        // against contract" chart is not a lottery: most projects sit well
        // under their contract, ONE is at the watch line and ONE is past its
        // contract — the amber and the diamond on Today, from a fresh seed,
        // without anyone editing data by hand. The figures are computed from
        // the contract value, never copied from the design.
        const contractRupees = projectSpecFor(tenant.slug, project.code)?.rupees ?? 0;
        const shape = orderShape(project.code, contractRupees, howMany);
        for (let index = 0; index < howMany; index += 1) {
          const [section, items] = poStream.pick(tradesOffered);
          const ofTrade = tradeVendors.filter((v) => v.trade === section);
          const vendorKey = ofTrade[(projectIndex + index) % Math.max(ofTrade.length, 1)]?.key ?? '';
          const line = shape[index] ?? { quantityWhole: poStream.between(5, 400), unitRate: poStream.between(60, 12000) * 100 };
          const created = await post(admin, '/api/v1/purchase-orders', {
            vendorId: vendorRows.get(vendorKey)?.id,
            projectId: project.id,
            lines: [
              {
                description: `${section} — ${poStream.pick(items)}`,
                hsnSac: '995461',
                // the trade the line belongs to — the catalogue's code, seeded above from the same `TRADES`
                // sections — so Spend by trade package reads trades, not "Unassigned" (design delta, part 04)
                tradeCode: section.toUpperCase(),
                quantityWhole: line.quantityWhole,
                quantityMillionths: 0,
                unitRate: String(line.unitRate),
                gstRate: WORKS_CONTRACT_GST_BP,
              },
            ],
          });
          if (!failed(created)) orders.push(created);
        }
      }
    }

    // Move some of them along. `proc` raises, `finance` approves — one person
    // doing both is refused, which is the control working rather than a
    // limitation of the seed.
    let approved = 0;
    let pending = 0;
    for (const [index, order] of orders.entries()) {
      if (index % 3 === 0) continue; // left as draft
      const submitted = await post(proc, `/api/v1/purchase-orders/${order.id}/submit`, {
        expectedVersion: order.version ?? 1,
      });
      if (failed(submitted)) continue;
      pending += 1;
      if (index % 3 !== 1) continue; // left awaiting approval
      const decision = await post(finance, `/api/v1/purchase-orders/${order.id}/approve`, {});
      if (!failed(decision)) {
        approved += 1;
        pending -= 1;
      }
    }
    console.log(
      orders.length === 0
        ? `  purchase orders: already there — left alone`
        : `  purchase orders: ${orders.length} (${approved} approved, ${pending} awaiting, ` +
            `${orders.length - approved - pending} draft)`,
    );

    // 6. Change orders — including the awkward amounts.
    //
    //    ONE NEGATIVE (an omission: work taken out of scope) and ONE ZERO (a
    //    variation with no commercial effect, which is a real thing — a
    //    specification change at the same rate). Both exist so the formatter
    //    and every screen that renders a delta are exercised on them.
    for (const [index, project] of projects.entries()) {
      const existing = await get(admin, `/api/v1/projects/${project.id}/change-orders`);
      if ((existing?.items ?? []).length > 0) continue;

      const coStream = streamFor(`${tenant.slug}:co:${project.code}`);
      const impacts =
        index === 0
          ? ['-1850000', '0', '4720000']
          : [
              String(coStream.between(2, 90) * 10000),
              String(coStream.between(1, 40) * 10000),
            ];

      for (const [order, costImpact] of impacts.entries()) {
        const co = await post(admin, `/api/v1/projects/${project.id}/change-orders`, {
          projectId: project.id,
          number: `CO-${String(order + 1).padStart(2, '0')}`,
          title:
            costImpact.startsWith('-')
              ? 'Omission — client removed the terrace pergola'
              : costImpact === '0'
                ? 'Specification change at no commercial effect'
                : `Additional scope, ${coStream.pick(TRADES)[0].toLowerCase()}`,
          costImpact,
        });
        if (failed(co)) continue;
        // Some get submitted and decided; some stay in draft, because a demo
        // where everything is settled shows nothing about the workflow.
        if (order % 2 === 0) {
          const sent = await post(
            admin,
            `/api/v1/projects/${project.id}/change-orders/${co.id}/submit`,
            { expectedVersion: co.version ?? 1 },
          );
          if (!failed(sent) && order === 0) {
            await post(
              admin,
              `/api/v1/projects/${project.id}/change-orders/${co.id}/decide`,
              {
                decision: 'approve',
                signedBy: 'Client project manager',
                expectedVersion: (sent.version ?? 2),
              },
            );
          }
        }
      }
    }
    console.log('  change orders, including one omission and one at nil effect');

    // 6b. Delivery milestones on every project on site, dated around the day
    //     the seed runs — the design's "Milestones this week" and a project's
    //     Overview read them (20 September 2026). Three per site: one due
    //     this week (Friday of the seed's week), one in the fortnight's
    //     lookahead, and one already past its date; on the FIRST site the
    //     past one is marked delayed with a reason, which is what the panel
    //     is for. Idempotent: a project that already has a milestone is left
    //     alone, so a re-seed never doubles them.
    const onSite = [];
    for (const project of projects) {
      const state = await get(admin, `/api/v1/projects/${project.id}`);
      if (!failed(state) && state?.state === 'in_progress') onSite.push(project);
    }
    let milestonesAdded = 0;
    for (const [index, project] of onSite.entries()) {
      const have = await get(admin, `/api/v1/design-build/milestones/projects/${project.id}`);
      if (failed(have) || (have?.items ?? []).length > 0) continue;
      const friday = addDays(mondayOf(SEED_DAY), 4);
      const plan = [
        { name: 'Ceiling grid complete', trade: 'Ceilings', plannedStart: dayFrom(-12), plannedFinish: friday },
        { name: 'Flooring laid', trade: 'Flooring', plannedStart: dayFrom(3), plannedFinish: dayFrom(18) },
        { name: 'Glazing installed', trade: 'Glazing', plannedStart: dayFrom(-20), plannedFinish: addDays(mondayOf(SEED_DAY), -3) },
      ];
      for (const [order, m] of plan.entries()) {
        const created = await post(admin, `/api/v1/design-build/milestones/projects/${project.id}`, m);
        if (failed(created)) continue;
        milestonesAdded += 1;
        // the past one is delayed, with its reason, on the first site only
        if (order === 2 && index === 0) {
          await post(admin, `/api/v1/design-build/milestones/${created.id}/progress`, {
            status: 'delayed',
            actualStart: dayFrom(-20),
            delayReason: 'Panels arrived cracked; the replacement is due next week.',
            recoveryPlan: 'Fit the replacement the day it lands and run the glazing team over the weekend.',
          });
        } else if (order === 2) {
          await post(admin, `/api/v1/design-build/milestones/${created.id}/progress`, {
            status: 'complete',
            actualStart: dayFrom(-20),
            actualFinish: addDays(mondayOf(SEED_DAY), -3),
          });
        } else if (order === 0) {
          await post(admin, `/api/v1/design-build/milestones/${created.id}/progress`, { status: 'in_progress', actualStart: dayFrom(-12) });
        }
      }
    }
    if (milestonesAdded > 0) console.log(`  milestones: ${milestonesAdded} across ${onSite.length} sites, one delayed with a reason`);

    // 7. Site reports, the five days before the seed ran — once.
    /** @type {ApiList} */
    const haveReports = await get(admin, '/api/v1/siteops/daily-reports?limit=1');
    for (const project of (haveReports?.['count'] ?? 0) === 0 ? projects.slice(0, 4) : []) {
      const dprStream = streamFor(`${tenant.slug}:dpr:${project.code}`);
      for (let day = 1; day <= 5; day += 1) {
        await post(finance, '/api/v1/siteops/daily-reports', {
          projectId: project.id,
          reportDate: dayFrom(day - 6),
          notes: dprStream.pick([
            'Ceiling grid complete on level 3. Glazing team mobilised.',
            'Power shutdown 0900-1300, MEP works paused.',
            'Client walkthrough — two snags raised on joinery finish.',
            'Flooring adhesive delivered, curing overnight.',
            'Late material delivery held up the partition line.',
          ]),
          manpower: [
            { floor: 'Level 3', trade: 'Carpentry', headCount: dprStream.between(4, 18) },
            { floor: 'Level 4', trade: 'Electrical', headCount: dprStream.between(3, 12) },
          ],
        });
      }
    }
    console.log('  daily site reports');

    // Site issues on the first site: two open (one stopping work), one
    // resolved, so the Site screen's count is a fact and the tab has rows.
    const issueSite = projects[0];
    if (issueSite?.id !== undefined) {
      /** @type {ApiList} */
      const haveIssues = await get(admin, `/api/v1/siteops/issues?projectId=${issueSite.id}&status=all&limit=1`);
      if ((haveIssues?.['count'] ?? 0) === 0) {
        for (const [title, severity] of [
          ['Glazing panel on level 3 delivered cracked — replacement awaited', 'blocking'],
          ['Fire sealant missing around two riser penetrations', 'major'],
          ['Snag list from client walkthrough: joinery edge banding', 'minor'],
        ]) {
          const raised = await post(proc, '/api/v1/siteops/issues', {
            projectId: issueSite.id,
            title,
            severity,
          });
          if (severity === 'minor' && !failed(raised) && raised?.id !== undefined) {
            await post(admin, `/api/v1/siteops/issues/${raised.id}/resolve`, {
              resolution: 'Edge banding redone by the joinery vendor.',
            });
          }
        }
        console.log('  site issues: 2 open, 1 resolved');
      }
    }

    // 8. Inventory — items, priced receipts, issues and a transfer.
    const stockNames = [
      ['Cement OPC 53 grade', 'bag'],
      ['Gypsum board 12mm', 'sheet'],
      ['Vitrified tile 600x600', 'box'],
      ['Cable, 2.5 sqmm FRLS', 'coil'],
      ['Mineral fibre ceiling tile', 'box'],
      ['Adhesive, tile fixing', 'bag'],
    ];
    /** @type {ApiList} */
    const existingStock = await all(admin, '/api/v1/purchase-orders/stock/items');
    const haveStock = new Set((existingStock?.items ?? []).map((s) => s.name));
    for (const [stockIndex, [name, uom]] of stockNames.entries()) {
      if (haveStock.has(name)) continue;
      const stockStream = streamFor(`${tenant.slug}:stock:${name}`);
      // The first three items are LOW on purpose — the design's Stock screen
      // leads with "3 items below their reorder level", and a random seed
      // produced one only by luck. Each receives 70-90, issues 25-35 and holds
      // 45-55 against a level of 100: a storekeeper's reorder decision, from a
      // fresh seed. Every other item is transferred to site ABOVE its level,
      // so a site-store balance is not below reorder by accident.
      const low = stockIndex < 3;
      const reorderWhole = low ? 100 : stockStream.between(20, 120);
      const item = await post(admin, '/api/v1/purchase-orders/stock/items', {
        name,
        uom,
        category: 'Materials',
        reorderWhole,
      });
      if (failed(item)) continue;

      // Two receipts at DIFFERENT prices, so the weighted average is visibly
      // an average rather than the last price paid.
      for (const [receiptIndex, rate] of [stockStream.between(180, 900) * 100, stockStream.between(200, 1100) * 100].entries()) {
        await post(admin, '/api/v1/purchase-orders/stock/receipts', {
          stockItemId: item.id,
          warehouse: 'Central store',
          quantityWhole: low ? (receiptIndex === 0 ? 40 + stockIndex * 10 : 30) : stockStream.between(200, 400),
          quantityMillionths: 0,
          unitRatePaise: String(rate),
        });
      }
      await post(admin, '/api/v1/purchase-orders/stock/issues', {
        stockItemId: item.id,
        warehouse: 'Central store',
        quantityWhole: low ? 25 + stockIndex * 5 : stockStream.between(10, 50),
        quantityMillionths: 0,
        reference: 'Issued to site',
      });
      if (!low) {
        await post(admin, '/api/v1/purchase-orders/stock/transfers', {
          stockItemId: item.id,
          fromWarehouse: 'Central store',
          toWarehouse: 'Site store',
          // above the level, so the site store is stocked, not short
          quantityWhole: reorderWhole + stockStream.between(5, 40),
          quantityMillionths: 0,
        });
      }
    }
    console.log('  stock items with blended receipts, issues and a transfer — three below their reorder level');

    // One delivery at the gate, so "Received but not checked in" has
    // something to count and the check-in panel something to act on.
    /** @type {ApiList} */
    const atGate = await get(admin, '/api/v1/purchase-orders/stock/receipts/awaiting?limit=1');
    /** @type {ApiList} */
    const firstItems = await get(admin, '/api/v1/purchase-orders/stock/items?limit=1');
    const firstItem = firstItems?.items?.[0];
    if ((atGate?.['count'] ?? 0) === 0 && firstItem?.id !== undefined) {
      await post(admin, '/api/v1/purchase-orders/stock/receipts', {
        stockItemId: firstItem.id,
        warehouse: 'Central store',
        quantityWhole: 60,
        quantityMillionths: 0,
        reference: 'Delivery note at the gate, not yet counted',
        checkedIn: false,
      });
      console.log('  stock: one receipt left at the gate');
    }

    // 8b. Tasks — with owners and dates, so "Your day" and Tasks › Overdue
    //     show something from a fresh seed. Two overdue, two due today, one
    //     tomorrow, one later in the week. The dates are computed from the
    //     day the seed runs, so the shape holds whenever it is run.
    /** @type {ApiList} */
    const existingTasks = await get(admin, '/api/v1/workflow/tasks');
    if ((existingTasks?.items ?? []).length === 0 && projects.length > 0) {
      /** @type {ApiList} */
      const staff = await all(admin, '/api/v1/settings/people');
      const owners = (staff?.items ?? []).map((p) => p.id);
      /** @type {[string, number, string][]} */
      const TASKS = [
        ['Approve the joinery order', -3, 'high'],
        ['Chase the revised quote for flooring', -1, 'medium'],
        ['Send the variation to the client for sign-off', 0, 'high'],
        ['Agree the change of scope on the level 2 ceiling', 0, 'medium'],
        ['Site visit — check the reception desk setting-out', 1, 'medium'],
        ['Book the recce for the new lead', 4, 'low'],
      ];
      let made = 0;
      for (const [index, [title, offset, priority]] of TASKS.entries()) {
        const project = projects[index % projects.length];
        const owner = owners[index % Math.max(owners.length, 1)];
        if (project === undefined || owner === undefined) continue;
        const created = await post(admin, '/api/v1/workflow/tasks', {
          title,
          entityType: 'project',
          entityId: project.id,
          entityName: project.code,
          projectId: project.id,
          assignedTo: owner,
          dueDate: dayFrom(offset),
          priority,
        });
        if (!failed(created)) made += 1;
      }
      console.log(`  tasks: ${made} with owners and dates (2 overdue, 2 today)`);
    }

    // 8c. The document vault — metadata only, the way the API takes it (no
    //     byte path exists: VAULT-01). A handful of registrations per project
    //     so the vault's folders carry counts and latest dates from a fresh
    //     seed. The checksum is sha256 of a synthetic sentence, the size is
    //     derived from the same sentence; nothing here is a real file.
    /** @type {ApiList} */
    const existingDocs = await get(admin, '/api/v1/workflow/documents');
    if ((existingDocs?.items ?? []).length === 0 && projects.length > 0) {
      /** @type {[string, string, string][]} */
      const DOCS = [
        ['agreement', 'Agreement, signed by both parties.pdf', 'application/pdf'],
        ['agreement', 'Commercial proposal, rev C.pdf', 'application/pdf'],
        ['drawing', 'GFC drawing set A-101 to A-118.pdf', 'application/pdf'],
        ['drawing', 'Reflected ceiling plan, level 2.dwg', 'image/vnd.dwg'],
        ['selection', 'Material selections, joinery laminates.pdf', 'application/pdf'],
        ['site_report', 'Daily report, week 36.pdf', 'application/pdf'],
      ];
      let registered = 0;
      for (const [index, project] of projects.entries()) {
        // every project gets the agreement and the drawing set; the rest thin out
        const share = DOCS.slice(0, index === 0 ? DOCS.length : 3 + (index % 3));
        for (const [entityType, fileName, contentType] of share) {
          const sentence = `${tenant.slug}:${project.code}:${fileName}`;
          const checksum = createHash('sha256').update(sentence).digest('hex');
          const created = await post(admin, '/api/v1/workflow/documents', {
            entityType,
            entityId: project.id,
            fileName,
            contentType,
            sizeBytes: 40_000 + sentence.length * 1_000,
            checksum,
          });
          if (!failed(created)) registered += 1;
        }
      }
      console.log(`  documents: ${registered} registered across ${projects.length} projects`);
    }

    // 9. Leads, with the depth that makes a pipeline worth looking at.
    const existingLeads = await get(admin, '/api/v1/projects/leads');
    if ((existingLeads?.items ?? []).length === 0) {
      const stages = ['lead', 'qualified', 'proposal_shared', 'negotiation', 'won', 'rejected'];
      for (let index = 0; index < 9; index += 1) {
        const leadStream = streamFor(`${tenant.slug}:lead:${index}`);
        const [city] = leadStream.pick(LOCATIONS);
        const stage = stages[index % stages.length];
        const lead = await post(admin, '/api/v1/projects/leads', {
          clientName: leadProspect(tenant.slug, index),
          contactName: leadStream.pick(['Meenakshi Pillai', 'Arvind Choudhary', 'Sabiha Ansari', 'Nitin Wagh']),
          stage,
          estimatedValue: String(leadStream.between(40, 900) * 100000),
          probabilityPct: leadStream.between(5, 85),
          projectType: leadStream.pick(['Office fitout', 'Retail rollout', 'Workplace refresh']),
          source: leadStream.pick(['Architect referral', 'Repeat client', 'Tender portal']),
          city,
          // an expected close on every open lead, from the seed's own stream
          // (20 September 2026): three days to six weeks out, so some fall this month
          ...(['won', 'unqualified', 'rejected'].includes(stage ?? '') ? {} : { expectedClose: expectedCloseFor(tenant.slug, index) }),
        });
        if (failed(lead)) continue;

        await post(admin, `/api/v1/projects/leads/${lead.id}/contacts`, {
          name: leadStream.pick(['Lalit Bhandari', 'Rukhsana Mir', 'Gayatri Nair']),
          designation: leadStream.pick(['Facilities manager', 'Project architect', 'Procurement head']),
          phone: syntheticPhone(`lead:${tenant.slug}:${String(index)}`),
          isPrimary: true,
        });
        await post(admin, `/api/v1/projects/leads/${lead.id}/activities`, {
          kind: leadStream.pick(['call', 'meeting', 'site_visit']),
          summary: leadStream.pick([
            'Walked the floor plate with the architect',
            'Discussed phasing around their move-in date',
            'Shared indicative rates for joinery',
          ]),
          occurredOn: dayFrom(-leadStream.between(3, 30)),
          ...(index % 3 === 0
            ? {}
            : {
                nextFollowupOn: dayFrom(leadStream.between(1, 18)),
                nextFollowupKind: index % 3 === 1 ? 'site_visit' : 'call',
              }),
        });
        if (stage === 'rejected') {
          await post(admin, `/api/v1/projects/leads/${lead.id}/lost`, {
            stage: 'rejected',
            reason: leadStream.pick([
              'Lost on price. The incumbent contractor held the rate.',
              'Client deferred the fitout to the next financial year.',
              'Awarded to a bidder with an existing framework agreement.',
            ]),
            expectedVersion: lead.version ?? 1,
          });
        }
      }
    }
    console.log('  leads with contacts, a timeline and reasons for the losses');

    // 9a. Leads seeded before an expected close existed carry one from here,
    //     the same stream by the lead's place in the list, so a re-seed on an
    //     older database shows the same pipeline as a fresh one. A decided lead
    //     is left alone; so is one somebody has already dated.
    const openLeads = await get(admin, '/api/v1/projects/leads');
    let closesDated = 0;
    for (const [index, lead] of (openLeads?.items ?? []).entries()) {
      if (['won', 'unqualified', 'rejected'].includes(lead.stage) || lead.expectedClose !== null) continue;
      const dated = await patch(admin, `/api/v1/projects/leads/${lead.id}`, {
        clientName: lead.clientName,
        contactName: lead.contactName,
        phone: lead.phone,
        email: lead.email,
        stage: lead.stage,
        estimatedValue: lead.estimatedValue,
        probabilityPct: lead.probabilityPct,
        projectType: lead.projectType,
        source: lead.source,
        city: lead.city,
        consultant: lead.consultant,
        ...(lead.ownerId === null ? {} : { ownerId: lead.ownerId }),
        expectedClose: expectedCloseFor(tenant.slug, index),
        notes: lead.notes,
        expectedVersion: lead.version,
      });
      if (!failed(dated)) closesDated += 1;
    }
    if (closesDated > 0) console.log(`  leads: ${closesDated} given an expected close`);

    // 9c. The two portal logins, now that there is a vendor and a project to
    // link them to. Through the invite path — see the function's own note.
    if (tenantId !== null) await seedPortalLogins(client, tenant, tenantId, admin);

    // 9b. A rate contract, and one purchase order that breaks it.
    //
    // The rate-contracts screen renders money, so without this the raw-paise
    // guard and the editable-field guard both pass on it while checking
    // nothing — the same vacuity that hid a defect on eleven design-build
    // screens last milestone, one screen further on.
    //
    // It also has to produce a DEVIATION, because an empty exceptions table
    // proves the query runs and nothing else. Fixed figures, no stream, so the
    // deviation is the same on every run.
    //
    // **THE FIGURES ARE DELIBERATELY NOT ROUND.** The first version used
    // `9000` and `10000` paise — ₹90.00 and ₹100.00 — and the browser suite
    // went red on a screen that has nothing to do with rate contracts:
    //
    //   apps/web/app/(shell)/settings/number-series/page.tsx printed the raw
    //   paise string 10000
    //
    // `10000` is a plausible paise amount AND a plausible document counter, so
    // the raw-paise guard could not tell which it was looking at. The guard was
    // right to fire; the fixture was wrong to be ambiguous. A seeded money value
    // has to be a number nothing else on any screen would print by coincidence.
    const haveContracts = await get(admin, '/api/v1/purchase-orders/rate-contracts');
    if ((haveContracts?.items ?? []).length === 0 && vendorIds.length > 0) {
      const contracted = await post(admin, '/api/v1/purchase-orders/rate-contracts', {
        vendorId: vendorIds[0],
        number: 'RC-MEP-01',
        title: 'Electrical first fix, annual rates',
        status: 'active',
        paymentTerms: '45 days from invoice',
        items: [
          {
            // `MEP`, not `ELEC`. The trade catalogue seeded above is keyed by
            // the `TRADES` section names and there is no `ELEC` among them —
            // and since the composition root now REFUSES an unknown trade code,
            // the old value would have failed this very insert rather than
            // being stored and quietly matching nothing. Which is the point of
            // the check.
            tradeCode: 'MEP',
            description: 'Conduit, 25mm, concealed',
            uom: 'm',
            contractRate: '987600',
            // this financial year's rates
            validFrom: financialYearStart(SEED_DAY),
            validTo: addDays(financialYearStart(addDays(financialYearStart(SEED_DAY), 400)), -1),
          },
        ],
      });

      if (!failed(contracted)) {
        // Priced ABOVE the contract, on purpose, and naming the trade so the
        // check has a key. Nothing attaches the contract to this line — the
        // server resolves it inside the write, which is the whole design.
        await post(admin, '/api/v1/purchase-orders', {
          vendorId: vendorIds[0],
          number: 'PO-RC-OVER-01',
          lines: [
            {
              description: 'Conduit, 25mm, concealed — urgent supply',
              hsnSac: '853810',
              quantityWhole: 240,
              quantityMillionths: 0,
              unitRate: '1098700',
              tradeCode: 'MEP',
              gstRate: WORKS_CONTRACT_GST_BP,
            },
          ],
        });
        console.log('  rate contracts: 1 active, 1 order line above it');
      }
    }

    // 9d. The money path, at provisional values — after the portal logins,
    //     because every bill is sent by one.
    await seedMoney(tenant, vendorRows, projects);

    // 10. Design-build: a brief with a budget, an agreement with a value and a
    //     stage schedule, and priced selections — on EVERY project.
    //
    //     This is not decoration. `e2e/screens.spec.ts` asserts that no seeded
    //     paise figure appears verbatim in rendered text, and it can only
    //     assert that about figures the seed actually produced. Until this
    //     existed, eleven design-build screens rendered money that nothing
    //     checked: the brief's budget, the contract value, its stage amounts
    //     and a selection price. A suite green over surfaces it never inspects
    //     is defect 6, and it is the failure this project has had twice.
    //
    //     Every project, not the first one, because the browser suite resolves
    //     `[projectId]` from whichever project the API lists first. Seeding one
    //     and hoping it is that one is how the guard goes quietly vacuous again.
    for (const project of projects) {
      const dbStream = streamFor(`${tenant.slug}:designbuild:${project.code}`);

      const briefs = await get(admin, `/api/v1/design-build/brief/projects/${project.id}`);
      if (!failed(briefs) && (briefs?.items ?? []).length === 0) {
        await put(admin, `/api/v1/design-build/brief/projects/${project.id}`, {
          engagementType: 'Design and build',
          scopeSummary:
            'Full fitout across two floors, handed over in phases so the client keeps trading.',
          budgetMinPaise: String(dbStream.between(180, 260) * 1000000),
          budgetMaxPaise: String(dbStream.between(300, 420) * 1000000),
          targetStartDate: dayFrom(16),
          targetCompletionDate: dayFrom(197),
          approvalAuthority: dbStream.pick(['Head of workplace', 'Facilities director']),
        });
      }

      const existing = await get(admin, `/api/v1/design-build/agreement/projects/${project.id}`);
      if (!failed(existing) && (existing?.agreement ?? null) === null) {
        await put(admin, `/api/v1/design-build/agreement/projects/${project.id}`, {
          engagementType: 'Design and build',
          contractValuePaise: String(dbStream.between(260, 380) * 1000000),
          notes: 'Rates held for ninety days from the date of issue.',
        });
        // A contract value with no schedule renders one figure; the screen has
        // a table of them, and the stage amounts are computed server-side from
        // the shares. The shares total 10000 bp because the route refuses any
        // other total.
        await put(admin, `/api/v1/design-build/agreement/projects/${project.id}/stages`, {
          stages: [
            { name: 'On signing', trigger: 'Agreement signed by both parties', shareBp: 2000 },
            { name: 'GFC drawings issued', trigger: 'Drawings released for construction', shareBp: 3000 },
            { name: 'Substantial completion', trigger: 'Site handed back to the client', shareBp: 3500 },
            { name: 'Snag closure', trigger: 'Snag list signed off', shareBp: 1500 },
          ],
        });
      }

      /** @type {ApiList} */
      const selections = await get(admin, `/api/v1/design-build/selections/projects/${project.id}`);
      if (!failed(selections) && (selections?.items ?? []).length === 0) {
        for (const [itemName, room, rupees] of /** @type {[string, string, number][]} */ ([
          ['Workstation, 1500mm, linear', 'Open plan', 42800],
          ['Reception desk, solid surface', 'Reception', 386500],
          ['Task chair, mesh back', 'Open plan', 18750],
        ])) {
          await post(admin, `/api/v1/design-build/selections/projects/${project.id}`, {
            itemName,
            roomLabel: room,
            category: 'Loose furniture',
            unitPricePaise: String(rupees * 100),
            quantity: dbStream.between(4, 60),
            leadTimeWeeks: dbStream.between(2, 14),
            decisionDeadline: dayFrom(30),
          });
        }
      }
    }
    console.log('  briefs with budgets, agreements with stage schedules, priced selections');

    if (tenantId !== null) await backdateForDemo(client, tenantId);
  }

  if (loginsOut !== null) {
    writeFileSync(loginsOut, demoLoginsMarkdown(new Date()), 'utf8');
    console.log(`\nDone. Logins written to ${loginsOut}.`);
  } else {
    console.log(
      '\nDone. Pass --logins-out <path> to write DEMO-LOGINS.md; nothing here prints a login.',
    );
  }
  console.log(
    'Every tax figure above is the server\'s, computed from provisional statutory values and\n' +
      'marked so. Without STATUTORY_OUTPUTS=draft none of it could have been produced.',
  );
} finally {
  await client.end();
}

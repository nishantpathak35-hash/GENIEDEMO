import type { BasisPoints, Paise } from '@cog/contracts';
import { bp, paise } from '@cog/money';

/**
 * Every statutory value this system computes with — all of them provisional.
 *
 * **Nothing here is verified, and nothing here can be.** The owner decided on
 * 2026-09-15 (ADR-0014, addendum) to build the money path now, on provisional
 * values, and to have a chartered accountant's name, membership number, firm
 * and date promote them before go-live. A TDS deduction, a challan, 26Q
 * content, a Tally voucher or a tax invoice computed from a provisional row is
 * refused (`go-live-gate.ts`) unless the process was told to produce drafts
 * (`STATUTORY_OUTPUTS=draft`), and a draft says *Provisional*.
 *
 * Each value names its source and the question in
 * `docs/statutory/QUESTIONS-FOR-CA.md` that would settle it. There are two
 * sources and they are kept apart on purpose:
 *
 * - `CA_CALL` — answers the owner relayed from a call with the CA.
 * - `STATUTE_TEXT` — our reading of the provision cited, used because the CA
 *   has not answered. Reading a statute is not a CA verifying one.
 *
 * **These are not rows.** A tenant's rows are written from this list by
 * `loadProvisionalCatalogue`, always as `provisional` with `verified_by` and
 * `verified_on` empty. A person promotes a row in the database with the CA's
 * details; nothing in this file, and no HTTP route, can.
 */

export const CA_CALL = 'relayed by the owner from a CA call; CA details to follow';
export const STATUTE_TEXT = 'statute text';

/** The CA call (CA-05): the rate table is effective from 1 April 2026. */
export const CATALOGUE_EFFECTIVE_FROM = '2026-04-01';

/** The CA call (CA-05): the sections in scope. */
export const TDS_SECTIONS = ['194C', '194I', '194J', '194Q'] as const;
export type TdsSection = (typeof TDS_SECTIONS)[number];

/**
 * What a threshold means, because the four sections do not share one shape:
 *
 * - `single_payment` — nothing is deducted up to this, in one payment;
 * - `annual_aggregate` — nothing is deducted while the year's total stays within this;
 * - `monthly` — nothing is deducted up to this, for a month or part of one;
 * - `annual_excess` — only the part of the year's total above this is deducted on.
 */
export const THRESHOLD_KINDS = ['single_payment', 'annual_aggregate', 'monthly', 'annual_excess'] as const;
export type ThresholdKind = (typeof THRESHOLD_KINDS)[number];

/**
 * Which payee classes a section's rate is split by. 194C's class follows the
 * vendor's recorded constitution (`payeeClassFromConstitution`, the CA's answer
 * to CA-07); 194I's and 194J's are recorded on the vendor,
 * because nothing about a payee's identity says whether it rents out a crane
 * or an office.
 */
export const PAYEE_CLASSES: Readonly<Record<TdsSection, readonly string[]>> = Object.freeze({
  '194C': ['individual_huf', 'other'],
  '194I': ['plant_machinery', 'land_building'],
  '194J': ['technical', 'professional'],
  '194Q': [],
});

export const RATE_KEYS = Object.freeze({
  '194C': 'tds_194c',
  '194I': 'tds_194i',
  '194J': 'tds_194j',
  '194Q': 'tds_194q',
  noValidPan: 'tds_206aa',
  noValidPan194Q: 'tds_206aa_194q',
  gstWorksContract: 'gst_works_contract',
} as const);

export interface CatalogueRate {
  readonly key: string;
  readonly payeeClass: string | null;
  readonly rate: BasisPoints;
  readonly statute: string;
  readonly source: string;
  readonly questionRef: string;
}

export interface CatalogueThreshold {
  readonly section: TdsSection;
  readonly kind: ThresholdKind;
  readonly amount: Paise;
  readonly statute: string;
  readonly source: string;
  readonly questionRef: string;
}

export const PROVISIONAL_RATES: readonly CatalogueRate[] = Object.freeze([
  {
    key: RATE_KEYS['194C'],
    payeeClass: 'individual_huf',
    rate: bp(100),
    statute: 'Income-tax Act 1961, s.194C(1)(i)',
    source: STATUTE_TEXT,
    questionRef: 'CA-12',
  },
  {
    key: RATE_KEYS['194C'],
    payeeClass: 'other',
    rate: bp(200),
    statute: 'Income-tax Act 1961, s.194C(1)(ii)',
    source: STATUTE_TEXT,
    questionRef: 'CA-12',
  },
  {
    key: RATE_KEYS['194I'],
    payeeClass: 'plant_machinery',
    rate: bp(200),
    statute: 'Income-tax Act 1961, s.194-I(a)',
    source: STATUTE_TEXT,
    questionRef: 'CA-13',
  },
  {
    key: RATE_KEYS['194I'],
    payeeClass: 'land_building',
    rate: bp(1000),
    statute: 'Income-tax Act 1961, s.194-I(b)',
    source: STATUTE_TEXT,
    questionRef: 'CA-13',
  },
  {
    key: RATE_KEYS['194J'],
    payeeClass: 'technical',
    rate: bp(200),
    statute: 'Income-tax Act 1961, s.194J(1)(a)',
    source: STATUTE_TEXT,
    questionRef: 'CA-14',
  },
  {
    key: RATE_KEYS['194J'],
    payeeClass: 'professional',
    rate: bp(1000),
    statute: 'Income-tax Act 1961, s.194J(1)(b)',
    source: STATUTE_TEXT,
    questionRef: 'CA-14',
  },
  {
    key: RATE_KEYS['194Q'],
    payeeClass: null,
    rate: bp(10),
    statute: 'Income-tax Act 1961, s.194Q(1)',
    source: STATUTE_TEXT,
    questionRef: 'CA-15',
  },
  {
    // "20% in both cases" — no PAN, or an invalid one. The call gave it for
    // 194C's two payee classes; 194I and 194J take the same 20%, s.206AA(1)'s
    // own figure, being above both sections' rates. Not 194Q: below.
    key: RATE_KEYS.noValidPan,
    payeeClass: null,
    rate: bp(2000),
    statute: 'Income-tax Act 1961, s.206AA(1)',
    source: CA_CALL,
    questionRef: 'CA-07, CA-10',
  },
  {
    // Under 194Q the proviso to s.206AA(1) reads 5% where the section reads
    // 20% — statute text, not the call (CA-10).
    key: RATE_KEYS.noValidPan194Q,
    payeeClass: null,
    rate: bp(500),
    statute: 'Income-tax Act 1961, s.206AA(1), proviso (tax deductible under s.194Q)',
    source: STATUTE_TEXT,
    questionRef: 'CA-10',
  },
  {
    key: RATE_KEYS.gstWorksContract,
    payeeClass: null,
    rate: bp(1800),
    statute:
      'Notification No. 11/2017–Central Tax (Rate), S. No. 3(ii), as amended; for IGST, No. 8/2017–Integrated Tax (Rate)',
    source: CA_CALL,
    questionRef: 'CA-06, CA-16',
  },
]);

export const PROVISIONAL_THRESHOLDS: readonly CatalogueThreshold[] = Object.freeze([
  {
    section: '194C',
    kind: 'single_payment',
    amount: paise(30_000_00n),
    statute: 'Income-tax Act 1961, s.194C(5)',
    source: STATUTE_TEXT,
    questionRef: 'CA-12',
  },
  {
    section: '194C',
    kind: 'annual_aggregate',
    amount: paise(1_00_000_00n),
    statute: 'Income-tax Act 1961, s.194C(5), proviso',
    source: STATUTE_TEXT,
    questionRef: 'CA-12',
  },
  {
    section: '194I',
    kind: 'monthly',
    amount: paise(50_000_00n),
    statute: 'Income-tax Act 1961, s.194-I, proviso, as amended by the Finance Act 2025 (from 1 April 2025)',
    source: STATUTE_TEXT,
    questionRef: 'CA-13',
  },
  {
    section: '194J',
    kind: 'annual_aggregate',
    amount: paise(50_000_00n),
    statute: 'Income-tax Act 1961, s.194J(1), proviso, as amended by the Finance Act 2025 (from 1 April 2025)',
    source: STATUTE_TEXT,
    questionRef: 'CA-14',
  },
  {
    section: '194Q',
    kind: 'annual_excess',
    amount: paise(50_00_000_00n),
    statute: 'Income-tax Act 1961, s.194Q(1)',
    source: STATUTE_TEXT,
    questionRef: 'CA-15',
  },
]);

/**
 * The 194C payee class, from the vendor's recorded constitution.
 *
 * The CA's answer to CA-07 (CA answers document, reviewed by the CA; CA details
 * to follow; provisional): "Vendor classification will drive whether the
 * Section 194C rate is 1% or 2%." Section 194C(1) charges 1% when the payee is
 * an individual or a Hindu undivided family and 2% otherwise, so an individual
 * or an HUF is `individual_huf`, and a firm, a company or anything else is
 * `other`. The PAN's fourth character only cross-checks the constitution, on
 * the vendor; it decides nothing here.
 */
export function payeeClassFromConstitution(constitution: string): 'individual_huf' | 'other' {
  return constitution === 'individual' || constitution === 'huf' ? 'individual_huf' : 'other';
}

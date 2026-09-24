/**
 * The words the product prints — one vocabulary, read everywhere.
 *
 * Two layers. `WORDS` is the label map (`docs/design/13-decisions.html`,
 * "Words"): the shipped label on the left of that table is gone and the word
 * on the right is what every screen says — *Ordered so far*, not *Committed
 * spend*; *Waiting for approval*, not `pending_approval`. `TERM_PAIRS` is the
 * firm's own choice, Settings › Terminology (`11-settings.html`): four pairs,
 * one word each, per tenant — the priced list of work is a BOQ or an
 * Estimate, a change to the contract a Variation or a Change order, what
 * site files each day a Daily report or a Site diary, who you buy from a
 * Vendor or a Supplier. `termsFor` turns the tenant's choice into the
 * derived labels a screen needs (the plural, the verb phrase, the menu item),
 * so a page never builds a word by string arithmetic of its own.
 *
 * In a plain module with no directive, like `vocabulary.ts`, for the same
 * reason: a server component reads these as values.
 */

import { TERM_OPTIONS, type TermKey, type Terminology } from '@cog/contracts';

export type { TermKey, Terminology };

/** The label map: the design's word for each thing the product names. */
export const WORDS = {
  orderedSoFar: 'Ordered so far',
  contract: 'Contract',
  beforeGst: 'Before GST',
  total: 'Total',
  waitingForApproval: 'Waiting for approval',
  watchClosely: 'Watch closely',
  overContract: 'Over contract',
  addContractValue: 'Add contract value',
  declined: 'Declined',
  sent: 'Sent',
  received: 'Received',
  sentBack: 'Sent back',
  waitingForClient: 'Waiting for client',
  signedOff: 'Signed off',
  declinedByClient: 'Declined by client',
  agreedRates: 'Agreed rates',
  agreedRate: 'Agreed rate',
  aboveAgreedRate: 'Above agreed rate',
  withinAgreedRates: 'Within agreed rates',
  noAgreedRate: 'No agreed rate',
  raBill: 'RA bill',
  approvalSteps: 'Approval steps',
  copyDetails: 'Copy details for support',
} as const;

/** One pair the firm chooses a word from. */
export interface TermPair {
  readonly key: TermKey;
  /** What the pair names, in the customer's words. */
  readonly what: string;
  readonly options: readonly [string, string];
  /** Why the two words exist. */
  readonly note: string;
}

/** The pairs, their two words the contract's (`TERM_OPTIONS`) — one authority, compiled against everywhere. */
export const TERM_PAIRS: readonly TermPair[] = [
  {
    key: 'boq',
    what: 'The priced list of work',
    options: TERM_OPTIONS.boq,
    note: 'Bill of quantities is what Indian contractors and PWD-trained engineers say; Estimate is what a design-led firm says to a client.',
  },
  {
    key: 'variation',
    what: 'A change to the contract',
    options: TERM_OPTIONS.variation,
    note: 'Variation is the Indian and British word; Change order is the American one some clients bring.',
  },
  {
    key: 'dailyReport',
    what: 'What site files each day',
    options: TERM_OPTIONS.dailyReport,
    note: 'Both are said on Indian sites; the diary is the older word.',
  },
  {
    key: 'vendor',
    what: 'Who you buy from',
    options: TERM_OPTIONS.vendor,
    note: 'Vendor is what the tax forms say; Supplier is what a site engineer says.',
  },
];

/** The first option of each pair: what a firm that never chose reads. */
export const DEFAULT_TERMINOLOGY: Terminology = {
  boq: TERM_OPTIONS.boq[0],
  variation: TERM_OPTIONS.variation[0],
  dailyReport: TERM_OPTIONS.dailyReport[0],
  vendor: TERM_OPTIONS.vendor[0],
};

/**
 * The labels a screen derives from the firm's words. The `…Lower` forms are
 * for mid-sentence; `all…` are list titles. What a document prints at its
 * head is bound into a render as data by the worker (`withTerminology`).
 */
export interface Terms {
  readonly boq: string;
  readonly boqLower: string;
  readonly boqLine: string;
  readonly boqLines: string;
  readonly boqLinesLower: string;
  readonly newBoqLine: string;
  readonly boqRate: string;
  readonly variation: string;
  readonly variationLower: string;
  readonly variations: string;
  readonly variationsLower: string;
  readonly allVariations: string;
  readonly newVariation: string;
  readonly unsignedVariations: string;
  readonly dailyReport: string;
  readonly dailyReportLower: string;
  readonly dailyReports: string;
  readonly dailyReportsLower: string;
  readonly allDailyReports: string;
  readonly fileTodaysReport: string;
  readonly vendor: string;
  readonly vendorLower: string;
  readonly vendors: string;
  readonly vendorsLower: string;
  readonly allVendors: string;
  readonly newVendor: string;
  readonly vendorPortal: string;
  readonly vendorAccess: string;
}

const lower = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);
const plural = (s: string): string => (s.endsWith('y') ? `${s.slice(0, -1)}ies` : `${s}s`);

/** Every derived label, from the firm's choice. */
export function termsFor(choice: Partial<Terminology> | null | undefined): Terms {
  const t: Terminology = { ...DEFAULT_TERMINOLOGY };
  // only a word the pair owns is taken — anything else reads as the default, never as a stray label
  for (const pair of TERM_PAIRS) {
    const word = choice?.[pair.key];
    if (word !== undefined && (pair.options as readonly string[]).includes(word)) (t as Record<TermKey, string>)[pair.key] = word;
  }
  const variationLower = lower(t.variation);
  const vendorLower = lower(t.vendor);
  const reportLower = lower(t.dailyReport);
  return {
    boq: t.boq,
    boqLower: lower(t.boq),
    boqLine: `${t.boq} line`,
    boqLines: `${t.boq} lines`,
    boqLinesLower: `${lower(t.boq)} lines`,
    newBoqLine: `New ${t.boq} line`,
    boqRate: `${t.boq} rate`,
    variation: t.variation,
    variationLower,
    variations: plural(t.variation),
    variationsLower: plural(variationLower),
    allVariations: `All ${plural(variationLower)}`,
    newVariation: `New ${variationLower}`,
    unsignedVariations: `Unsigned ${plural(variationLower)}`,
    dailyReport: t.dailyReport,
    dailyReportLower: reportLower,
    dailyReports: plural(t.dailyReport),
    dailyReportsLower: plural(reportLower),
    allDailyReports: `All ${plural(reportLower)}`,
    fileTodaysReport: `File today’s ${reportLower.replace(/^daily /, '')}`,
    vendor: t.vendor,
    vendorLower,
    vendors: plural(t.vendor),
    vendorsLower: plural(vendorLower),
    allVendors: `All ${plural(vendorLower)}`,
    newVendor: `New ${vendorLower}`,
    vendorPortal: `${t.vendor} portal`,
    vendorAccess: `${t.vendor} access`,
  };
}

/**
 * The firm's word for a canonical label — the navigation's entries, the
 * quick-create items, a settings card — so the trees stay constants and one
 * map, here, is what turns *Vendors* into *Suppliers*. A label the map does
 * not know is returned as it is.
 */
export function relabel(label: string, terms: Terms): string {
  const map: Readonly<Record<string, string>> = {
    BOQ: terms.boq,
    'BOQ line': terms.boqLine,
    'BOQ lines': terms.boqLines,
    'New BOQ line': terms.newBoqLine,
    'BOQ rate': terms.boqRate,
    Variation: terms.variation,
    Variations: terms.variations,
    'All variations': terms.allVariations,
    'New variation': terms.newVariation,
    'Unsigned variations': terms.unsignedVariations,
    'Daily report': terms.dailyReport,
    'Daily reports': terms.dailyReports,
    'All daily reports': terms.allDailyReports,
    'File today’s report': terms.fileTodaysReport,
    Vendor: terms.vendor,
    Vendors: terms.vendors,
    'All vendors': terms.allVendors,
    'New vendor': terms.newVendor,
    'Vendor portal': terms.vendorPortal,
    'Vendor access': terms.vendorAccess,
  };
  return map[label] ?? label;
}

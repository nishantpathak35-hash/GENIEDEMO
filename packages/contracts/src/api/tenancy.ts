import { z } from 'zod';

/**
 * Optional modules — whether a feature is switched on for a tenant at all.
 *
 * **Not the role model.** `MODULES` in `authz.ts` answers "which screens may
 * this role reach"; this answers "does this organisation use the feature".
 * A role granted a module that the tenant has switched off still gets a 404,
 * because there is nothing there.
 */
export const moduleState = z.object({
  key: z.string(),
  title: z.string(),
  summary: z.string(),
  enabled: z.boolean(),
  /** Null until somebody touches it — a module nobody ever considered. */
  changedAt: z.string().nullable(),
});
export type ModuleState = z.infer<typeof moduleState>;

export const moduleListResponse = z.object({ items: z.array(moduleState) });
export type ModuleListResponse = z.infer<typeof moduleListResponse>;

/**
 * One boolean, and nothing else.
 *
 * No "delete data" flag, no "and remove it from every role". Switching a module
 * off is a visibility change and must stay reversible: a tenant who turns
 * warranty off for a quarter and back on gets their claims back.
 */
export const setModuleInput = z.object({ enabled: z.boolean() });
export type SetModuleInput = z.infer<typeof setModuleInput>;

export const setModuleResponse = z.object({ key: z.string(), enabled: z.boolean() });
export type SetModuleResponse = z.infer<typeof setModuleResponse>;

/**
 * The organisation's own registered details.
 *
 * **A GSTIN and a PAN here are IDENTITY, not a statutory calculation.** They
 * are who the organisation is registered as, the way a legal name is — not a
 * rate, a threshold or an effective date, so nothing in `packages/money` or
 * the CA question list bears on them. Same format checks as a vendor's,
 * deliberately: one definition of what a GSTIN looks like.
 *
 * Every tax field is nullable and nothing supplies a placeholder. An absent
 * GSTIN prints nothing; a placeholder prints a plausible wrong number onto a
 * document somebody files. That is `tdsChallan281.js:54` and it is the
 * failure this refuses to repeat.
 */
export const companyProfile = z.object({
  gstin: z.string().nullable(),
  pan: z.string().nullable(),
  cin: z.string().nullable(),
  /** Tax deduction account number. A challan and 26Q are refused without one; it is never defaulted. */
  tan: z.string().nullable(),
  address: z.string(),
  phone: z.string(),
  email: z.string(),
  website: z.string(),
  bankName: z.string(),
  bankBranch: z.string(),
  bankIfsc: z.string().nullable(),
  documentFooter: z.string(),
  updatedAt: z.string().nullable(),
});
export type CompanyProfile = z.infer<typeof companyProfile>;

/** Blank means not supplied, and clears the value. Absent and blank are one. */
const blankOr = (pattern: RegExp, message: string) =>
  z
    .string()
    .refine((v) => v === '' || pattern.test(v.toUpperCase()), message)
    .optional();

export const saveCompanyProfileInput = z.object({
  gstin: blankOr(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/, 'not a valid GSTIN'),
  pan: blankOr(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'not a valid PAN'),
  cin: blankOr(/^[A-Z][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/, 'not a valid CIN'),
  tan: blankOr(/^[A-Z]{4}[0-9]{5}[A-Z]$/, 'not a valid TAN'),
  address: z.string().max(1000).optional(),
  phone: z.string().max(32).optional(),
  email: z.string().max(320).optional(),
  website: z.string().max(200).optional(),
  bankName: z.string().max(200).optional(),
  bankBranch: z.string().max(200).optional(),
  bankIfsc: blankOr(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'not a valid IFSC'),
  documentFooter: z.string().max(2000).optional(),
});
export type SaveCompanyProfileInput = z.infer<typeof saveCompanyProfileInput>;

/**
 * The defaults this organisation works to.
 *
 * `crmStaleDays` is nullable and NULL means nobody has said. A staleness rule
 * nobody chose quietly starts marking a live pipeline as neglected.
 */
export const operationalDefaults = z.object({
  poTerms: z.string(),
  crmStaleDays: z.number().int().nullable(),
  updatedAt: z.string().nullable(),
});
export type OperationalDefaults = z.infer<typeof operationalDefaults>;

export const saveOperationalDefaultsInput = z.object({
  poTerms: z.string().max(500),
  crmStaleDays: z.number().int().min(1).max(365).nullable(),
});
export type SaveOperationalDefaultsInput = z.infer<typeof saveOperationalDefaultsInput>;

/**
 * Settings › Tax — the two questions about the business, and whether the
 * review has been read. FLAGS, never figures: no rate, threshold or date is
 * stored or derived here (migration 0084), and completing the review records
 * a fact about the checklist, it opens nothing — the money path opens on
 * rules a named CA verified.
 */
export const taxSetup = z.object({
  /** Materials and labour under one contract — a works contract. `null` until answered. */
  worksContractBundling: z.boolean().nullable(),
  /** Pays transporters who have given a PAN declaration. `null` until answered. */
  transporterPanDeclared: z.boolean().nullable(),
  /**
   * Turnover above ten crore rupees in the previous financial year — whether
   * s.194Q applies to this organisation as a buyer (CA-15). `null` until answered.
   */
  buyerTurnoverOver10Crore: z.boolean().nullable(),
  answeredAt: z.string().nullable(),
  /** Who answered, by the name a colleague would use; the address when none was given. */
  answeredBy: z.string().nullable(),
  reviewCompletedAt: z.string().nullable(),
  reviewCompletedBy: z.string().nullable(),
});
export type TaxSetup = z.infer<typeof taxSetup>;

export const saveTaxSetupInput = z.object({
  worksContractBundling: z.boolean(),
  transporterPanDeclared: z.boolean(),
  buyerTurnoverOver10Crore: z.boolean().optional(),
});
export type SaveTaxSetupInput = z.infer<typeof saveTaxSetupInput>;

/**
 * Terminology — the words this firm uses (Settings › Terminology): four
 * pairs, one word each, per tenant. The priced list of work is a BOQ or an
 * Estimate; a change to the contract a Variation or a Change order; what site
 * files each day a Daily report or a Site diary; who you buy from a Vendor or
 * a Supplier.
 *
 * **The pairs and their two words are closed here**, because the chosen word
 * reaches every label and column, the generated navigation and a document's
 * heading: a free-text word there would be a different feature. The first
 * word of each pair is what a firm that never chose gets. `packages/design-
 * system`'s `words.ts` derives every label a screen needs from the choice, so
 * no page builds a word by string arithmetic of its own.
 */
export const TERM_OPTIONS = {
  boq: ['BOQ', 'Estimate'],
  variation: ['Variation', 'Change order'],
  dailyReport: ['Daily report', 'Site diary'],
  vendor: ['Vendor', 'Supplier'],
} as const;
export type TermKey = keyof typeof TERM_OPTIONS;
export const TERM_KEYS = Object.keys(TERM_OPTIONS) as readonly TermKey[];

export const terminology = z.object({
  boq: z.enum(TERM_OPTIONS.boq),
  variation: z.enum(TERM_OPTIONS.variation),
  dailyReport: z.enum(TERM_OPTIONS.dailyReport),
  vendor: z.enum(TERM_OPTIONS.vendor),
});
export type Terminology = z.infer<typeof terminology>;

export const terminologyResponse = terminology.extend({
  /** Null until somebody chose — every word is then the pair's first. */
  changedAt: z.string().nullable(),
});
export type TerminologyResponse = z.infer<typeof terminologyResponse>;

/** The pairs to change; a pair left out keeps its word. */
export const saveTerminologyInput = terminology.partial();
export type SaveTerminologyInput = z.infer<typeof saveTerminologyInput>;

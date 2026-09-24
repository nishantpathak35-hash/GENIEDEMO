import type { BasisPoints, Paise } from '@cog/contracts';
import { ZERO, add, bp, compare, mulRate, roundTdsDeductionToPaise, roundToPaise, sub } from '@cog/money';
import type { ProvenancedRow } from './go-live-gate.js';
import { RateLookupError, financialYearOf, rateOn, type RateRow } from './rate-table.js';
import {
  PAYEE_CLASSES,
  RATE_KEYS,
  TDS_SECTIONS,
  payeeClassFromConstitution,
  type TdsSection,
  type ThresholdKind,
} from './statutory-catalogue.js';
import { thresholdOutcome } from './tds.js';

/**
 * TDS on a vendor payment — which rule applies, on what base, at what rate.
 *
 * Every value it uses is a row passed in: the tenant's rates and thresholds,
 * provisional until a CA promotes them (ADR-0014, addendum). What this file
 * decides is which rows apply, and it names every one it relied on in
 * `rowsUsed`, so the go-live gate can refuse the output and a
 * payment made before the CA brief can be found and re-checked after it.
 *
 * The readings here are provisional too, and each has a question:
 *   - the base is the value excluding GST shown separately (CA-08);
 *   - no PAN, or an inoperative one, is the s.206AA rate: 20%, and 5% under
 *     194Q by its proviso (CA-07, CA-10);
 *   - a 194C payee's class follows the vendor's recorded constitution, and a
 *     194C payment to a vendor with a valid PAN and no constitution recorded is
 *     refused (the CA's answer to CA-07);
 *   - a transporter's 194C(6) declaration on record for the payment's financial
 *     year — the goods-carriage condition confirmed, dated on or before the
 *     payment, under the PAN the vendor still has, a valid one — means nothing
 *     is deducted (the CA's answer to CA-07);
 *   - crossing an annual threshold brings the year's undeducted payments to the
 *     same vendor into the base (CA-12, CA-14);
 *   - 194I tests each bill against the monthly threshold (CA-13);
 *   - 194Q deducts only on the year's purchases above the threshold, and only
 *     for a buyer who has said it is covered (CA-15);
 *   - a deduction keeps its computed amount to the paise, and s.288B rounds
 *     the challan instead (CA-03, CA-04 — the CA answers document).
 */

export class PaymentRuleMissing extends Error {
  override readonly name = 'PaymentRuleMissing';
}

export interface ThresholdRow {
  readonly section: string;
  readonly kind: ThresholdKind;
  readonly amount: Paise;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly status: string;
  readonly questionRef?: string | undefined;
}

export interface PaymentRules {
  readonly rates: readonly RateRow[];
  readonly thresholds: readonly ThresholdRow[];
}

/** A transporter's 194C(6) declaration, as the payment rule reads it (CA-07). */
export interface TransporterDeclarationFact {
  readonly financialYear: string;
  readonly declaredOn: string;
  readonly pan: string;
  readonly goodsCarriageConfirmed: boolean;
}

export interface PayeeFacts {
  readonly pan: string | null;
  readonly panInoperative: boolean;
  readonly tdsSection: string | null;
  readonly tdsPayeeClass: string | null;
  /** What the vendor is in law, as recorded: individual, huf, firm, company or other. */
  readonly constitution: string | null;
  readonly transporterDeclarations: readonly TransporterDeclarationFact[];
}

/** This vendor, this section, earlier in the same financial year. */
export interface YearSoFar {
  /** Taxable value already paid. */
  readonly taxable: Paise;
  /** The part of it no tax has been deducted on. */
  readonly undeducted: Paise;
}

export interface PaymentTdsInput {
  readonly paidOn: string;
  /** The bill's value excluding GST (CA-08). */
  readonly taxable: Paise;
  readonly payee: PayeeFacts;
  readonly yearSoFar: YearSoFar;
  /** The tenant's answer: turnover above ten crore last year (CA-15). `null` is unanswered. */
  readonly buyerCoveredBy194Q: boolean | null;
}

export const TDS_REASONS = [
  'deducted',
  'higher_rate_no_valid_pan',
  'below_threshold',
  'transporter_declaration',
  'no_section',
  'buyer_not_covered',
] as const;
export type TdsReason = (typeof TDS_REASONS)[number];

export interface PaymentTds {
  readonly section: TdsSection | null;
  readonly payeeClass: string | null;
  readonly rate: BasisPoints | null;
  readonly base: Paise;
  readonly tds: Paise;
  readonly reason: TdsReason;
  readonly rowsUsed: readonly ProvenancedRow[];
}

const LOAD_THEM = 'Load the provisional statutory values in Settings › Tax before paying under this section.';

export function tdsForPayment(input: PaymentTdsInput, rules: PaymentRules): PaymentTds {
  const { payee, paidOn } = input;
  const section = TDS_SECTIONS.find((s) => s === payee.tdsSection);
  if (section === undefined) {
    return { section: null, payeeClass: null, rate: null, base: ZERO, tds: ZERO, reason: 'no_section', rowsUsed: [] };
  }

  const payeeClass = classOf(section, payee);

  if (section === '194Q' && input.buyerCoveredBy194Q !== true) {
    const excess = thresholdFor(rules.thresholds, '194Q', 'annual_excess', paidOn);
    return {
      section,
      payeeClass,
      rate: null,
      base: ZERO,
      tds: ZERO,
      reason: 'buyer_not_covered',
      rowsUsed: [thresholdProvenance(excess)],
    };
  }

  const validPan = payee.pan !== null && !payee.panInoperative;
  if (section === '194C' && validPan && payeeClass === null) {
    throw new PaymentRuleMissing(
      'A contractor under 194C has to say what it is in law — individual, HUF, firm, company or other — set it on the vendor.',
    );
  }
  const applicable = validPan
    ? rateFor(rules.rates, RATE_KEYS[section], paidOn, payeeClass ?? undefined)
    : rateFor(rules.rates, section === '194Q' ? RATE_KEYS.noValidPan194Q : RATE_KEYS.noValidPan, paidOn, undefined);

  const declaration = payee.transporterDeclarations.find((d) => d.financialYear === financialYearOf(paidOn));
  if (
    section === '194C' &&
    validPan &&
    declaration !== undefined &&
    declaration.goodsCarriageConfirmed &&
    declaration.declaredOn <= paidOn &&
    declaration.pan === payee.pan
  ) {
    // Nothing deducted — and the rate row it waived is still named, so the
    // payment is refused without drafts like any other 194C payment.
    return {
      section,
      payeeClass,
      rate: null,
      base: ZERO,
      tds: ZERO,
      reason: 'transporter_declaration',
      rowsUsed: [rateProvenance(applicable)],
    };
  }

  const test = thresholdTest(section, input, rules);
  const rowsUsed = [...test.rows.map(thresholdProvenance), rateProvenance(applicable)];
  if (!test.deduct) {
    return { section, payeeClass, rate: null, base: ZERO, tds: ZERO, reason: 'below_threshold', rowsUsed };
  }
  return {
    section,
    payeeClass,
    rate: applicable.rate,
    base: test.base,
    tds: mulRate(test.base, applicable.rate, roundTdsDeductionToPaise),
    reason: validPan ? 'deducted' : 'higher_rate_no_valid_pan',
    rowsUsed,
  };
}

export interface Settlement {
  readonly retention: Paise;
  readonly net: Paise;
}

/**
 * What is withheld and what leaves the bank.
 *
 * Retention is withheld on the bill's gross at the rate held against its order
 * (our convention, CA-20), and it does not reduce the TDS base.
 */
export function settle(gross: Paise, tds: Paise, retentionRateBp: number | null): Settlement {
  const retention = retentionRateBp === null ? ZERO : mulRate(gross, bp(retentionRateBp), roundToPaise);
  const net = sub(sub(gross, tds), retention);
  if (compare(net, ZERO) < 0) {
    throw new PaymentRuleMissing('The tax and retention on this bill come to more than the bill itself.');
  }
  return { retention, net };
}

function classOf(section: TdsSection, payee: PayeeFacts): string | null {
  if (section === '194C') return payee.constitution === null ? null : payeeClassFromConstitution(payee.constitution);
  if (section === '194Q') return null;
  const allowed = PAYEE_CLASSES[section];
  if (payee.tdsPayeeClass === null || !allowed.includes(payee.tdsPayeeClass)) {
    throw new PaymentRuleMissing(
      section === '194I'
        ? 'Rent under 194I has to say whether it is for plant or for a building — set it on the vendor.'
        : 'Fees under 194J have to say whether they are technical or professional — set it on the vendor.',
    );
  }
  return payee.tdsPayeeClass;
}

function thresholdTest(
  section: TdsSection,
  input: PaymentTdsInput,
  rules: PaymentRules,
): { readonly deduct: boolean; readonly base: Paise; readonly rows: readonly ThresholdRow[] } {
  const { paidOn, taxable, yearSoFar } = input;
  const yearAfter = add(yearSoFar.taxable, taxable);
  const undeducted = compare(yearSoFar.undeducted, ZERO) > 0 ? yearSoFar.undeducted : ZERO;

  switch (section) {
    case '194C': {
      const single = thresholdFor(rules.thresholds, '194C', 'single_payment', paidOn);
      const annual = thresholdFor(rules.thresholds, '194C', 'annual_aggregate', paidOn);
      const outcome = thresholdOutcome(
        taxable,
        { singlePayment: single.amount, annualAggregate: annual.amount },
        { aggregateSoFar: yearSoFar.taxable },
      );
      const crossesYear = compare(yearAfter, annual.amount) > 0;
      return { deduct: outcome.deduct, base: crossesYear ? add(taxable, undeducted) : taxable, rows: [single, annual] };
    }
    case '194J': {
      const annual = thresholdFor(rules.thresholds, '194J', 'annual_aggregate', paidOn);
      return { deduct: compare(yearAfter, annual.amount) > 0, base: add(taxable, undeducted), rows: [annual] };
    }
    case '194I': {
      const monthly = thresholdFor(rules.thresholds, '194I', 'monthly', paidOn);
      return { deduct: compare(taxable, monthly.amount) > 0, base: taxable, rows: [monthly] };
    }
    case '194Q': {
      const excess = thresholdFor(rules.thresholds, '194Q', 'annual_excess', paidOn);
      if (compare(yearAfter, excess.amount) <= 0) return { deduct: false, base: ZERO, rows: [excess] };
      const above = sub(yearAfter, excess.amount);
      return { deduct: true, base: compare(above, taxable) < 0 ? above : taxable, rows: [excess] };
    }
  }
}

function rateFor(rates: readonly RateRow[], key: string, on: string, payeeClass: string | undefined): RateRow {
  try {
    return rateOn(rates, key, on, payeeClass);
  } catch (error) {
    if (error instanceof RateLookupError) throw new PaymentRuleMissing(`${error.message}. ${LOAD_THEM}`);
    throw error;
  }
}

function thresholdFor(
  rows: readonly ThresholdRow[],
  section: TdsSection,
  kind: ThresholdKind,
  on: string,
): ThresholdRow {
  const matches = rows.filter(
    (r) =>
      r.section === section &&
      r.kind === kind &&
      r.effectiveFrom <= on &&
      (r.effectiveTo === null || on < r.effectiveTo),
  );
  const only = matches[0];
  if (only === undefined) {
    throw new PaymentRuleMissing(`no ${section} ${kind.replace(/_/g, ' ')} threshold in force on ${on}. ${LOAD_THEM}`);
  }
  if (matches.length > 1) {
    throw new PaymentRuleMissing(`overlapping ${section} ${kind.replace(/_/g, ' ')} thresholds on ${on}`);
  }
  return only;
}

function rateProvenance(row: RateRow): ProvenancedRow {
  return {
    key: row.payeeClass === undefined ? row.key : `${row.key}/${row.payeeClass}`,
    status: row.status,
    questionRef: row.questionRef,
  };
}

function thresholdProvenance(row: ThresholdRow): ProvenancedRow {
  return { key: `${row.section}/${row.kind}`, status: row.status, questionRef: row.questionRef };
}

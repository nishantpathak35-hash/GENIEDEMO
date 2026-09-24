import { describe, expect, it } from 'vitest';
import { paise, toRupeeString } from '@cog/money';
import type { RateRow } from '../src/domain/rate-table.js';
import {
  CATALOGUE_EFFECTIVE_FROM,
  PROVISIONAL_RATES,
  PROVISIONAL_THRESHOLDS,
} from '../src/domain/statutory-catalogue.js';
import {
  PaymentRuleMissing,
  settle,
  tdsForPayment,
  type PayeeFacts,
  type PaymentRules,
  type YearSoFar,
} from '../src/domain/payment-tds.js';

/**
 * The expectations here come from the provisional catalogue's documented
 * values — 1% and 2% under 194C, ₹30,000 and ₹1,00,000, 20% without a PAN and
 * so on — never from running the code. They are provisional exactly as those
 * values are, and a CA's answer that changes one changes the test with it.
 */

const RULES: PaymentRules = {
  rates: PROVISIONAL_RATES.map(
    (r): RateRow => ({
      key: r.key,
      ...(r.payeeClass === null ? {} : { payeeClass: r.payeeClass }),
      rate: r.rate,
      effectiveFrom: CATALOGUE_EFFECTIVE_FROM,
      effectiveTo: null,
      status: 'provisional',
      questionRef: r.questionRef,
    }),
  ),
  thresholds: PROVISIONAL_THRESHOLDS.map((t) => ({
    section: t.section,
    kind: t.kind,
    amount: t.amount,
    effectiveFrom: CATALOGUE_EFFECTIVE_FROM,
    effectiveTo: null,
    status: 'provisional',
    questionRef: t.questionRef,
  })),
};

const PAID_ON = '2026-09-15';
const NOTHING_YET: YearSoFar = { taxable: paise(0n), undeducted: paise(0n) };
const DECLARED = { financialYear: '2026-27', declaredOn: '2026-04-10', pan: 'AAACB1234F', goodsCarriageConfirmed: true };

function payee(overrides: Partial<PayeeFacts>): PayeeFacts {
  return {
    pan: 'AAACB1234F',
    panInoperative: false,
    tdsSection: '194C',
    tdsPayeeClass: null,
    constitution: 'company',
    transporterDeclarations: [],
    ...overrides,
  };
}

function pay(taxable: bigint, facts: Partial<PayeeFacts>, yearSoFar: YearSoFar = NOTHING_YET, covered: boolean | null = null) {
  return tdsForPayment(
    { paidOn: PAID_ON, taxable: paise(taxable), payee: payee(facts), yearSoFar, buyerCoveredBy194Q: covered },
    RULES,
  );
}

describe('194C', () => {
  it('deducts 2% from a company over the single-payment threshold', () => {
    const result = pay(50_000_00n, {});
    expect(result.reason).toBe('deducted');
    expect(result.rate).toBe(200);
    expect(toRupeeString(result.tds)).toBe('1000.00');
    expect(result.rowsUsed.map((r) => r.key)).toEqual([
      '194C/single_payment',
      '194C/annual_aggregate',
      'tds_194c/other',
    ]);
    expect(result.rowsUsed.every((r) => r.status === 'provisional')).toBe(true);
  });

  it('deducts 1% from an individual, from the recorded constitution', () => {
    const result = pay(40_000_00n, { pan: 'AAAPB1234F', constitution: 'individual' });
    expect(result.payeeClass).toBe('individual_huf');
    expect(toRupeeString(result.tds)).toBe('400.00');
  });

  it('takes the class from the constitution, not from the PAN (CA-07)', () => {
    // A PAN whose fourth character reads as a company, on a vendor recorded as
    // an HUF: the record decides, and the vendor screen shows the mismatch.
    const result = pay(40_000_00n, { pan: 'AAACB1234F', constitution: 'huf' });
    expect(result.payeeClass).toBe('individual_huf');
    expect(toRupeeString(result.tds)).toBe('400.00');
  });

  it('refuses a 194C payment to a vendor whose constitution is not recorded', () => {
    expect(() => pay(50_000_00n, { constitution: null })).toThrow(PaymentRuleMissing);
  });

  it('deducts nothing below both thresholds', () => {
    const result = pay(25_000_00n, {}, { taxable: paise(60_000_00n), undeducted: paise(60_000_00n) });
    expect(result.reason).toBe('below_threshold');
    expect(toRupeeString(result.tds)).toBe('0.00');
  });

  it('brings the year so far into the base when the annual threshold is crossed', () => {
    const result = pay(25_000_00n, {}, { taxable: paise(80_000_00n), undeducted: paise(80_000_00n) });
    expect(toRupeeString(result.base)).toBe('105000.00');
    expect(toRupeeString(result.tds)).toBe('2100.00');
  });

  it('keeps each deduction to the paise — s.288B rounds the challan, not the deduction (CA-03)', () => {
    // 2% of ₹31,234 is ₹624.68, and that is what is deducted.
    expect(toRupeeString(pay(31_234_00n, {}).tds)).toBe('624.68');
    // 2% of ₹31,234.57 is ₹624.6914: kept to the paise.
    expect(toRupeeString(pay(31_234_57n, {}).tds)).toBe('624.69');
    // 1% of ₹30,000.50 is ₹300.005: half a paisa rounds away from zero (CA-01).
    expect(toRupeeString(pay(30_000_50n, { pan: 'AAAPB1234F', constitution: 'individual' }).tds)).toBe('300.01');
  });

  it('deducts nothing from a transporter with a declaration this year, before the payment', () => {
    const result = pay(50_000_00n, { transporterDeclarations: [DECLARED] });
    expect(result.reason).toBe('transporter_declaration');
    expect(toRupeeString(result.tds)).toBe('0.00');
    expect(result.rowsUsed.map((r) => r.key)).toEqual(['tds_194c/other']);
  });

  it('ignores a declaration dated after the payment, for another year, or under another PAN', () => {
    expect(pay(50_000_00n, { transporterDeclarations: [{ ...DECLARED, declaredOn: '2026-09-20' }] }).reason).toBe(
      'deducted',
    );
    expect(
      pay(50_000_00n, { transporterDeclarations: [{ ...DECLARED, financialYear: '2025-26', declaredOn: '2026-03-31' }] })
        .reason,
    ).toBe('deducted');
    expect(pay(50_000_00n, { transporterDeclarations: [{ ...DECLARED, pan: 'AAACZ9999Z' }] }).reason).toBe('deducted');
  });
});

describe('no valid PAN', () => {
  it('deducts 20% when there is no PAN', () => {
    const result = pay(50_000_00n, { pan: null });
    expect(result.reason).toBe('higher_rate_no_valid_pan');
    expect(toRupeeString(result.tds)).toBe('10000.00');
    expect(result.rowsUsed.map((r) => r.key)).toContain('tds_206aa');
  });

  it('deducts 20% when the PAN is inoperative', () => {
    expect(toRupeeString(pay(50_000_00n, { panInoperative: true }).tds)).toBe('10000.00');
  });

  it('deducts 5% under 194Q without a PAN — the proviso to s.206AA(1) (CA-10)', () => {
    // The year's purchases pass ₹50,00,000 by ₹2,00,000; 5% of that is ₹10,000.
    const result = pay(
      3_00_000_00n,
      { tdsSection: '194Q', pan: null },
      { taxable: paise(49_00_000_00n), undeducted: paise(0n) },
      true,
    );
    expect(result.reason).toBe('higher_rate_no_valid_pan');
    expect(result.rate).toBe(500);
    expect(toRupeeString(result.tds)).toBe('10000.00');
    expect(result.rowsUsed.map((r) => r.key)).toContain('tds_206aa_194q');
  });
});

describe('194J', () => {
  it('deducts 10% for professional services once the year passes ₹50,000', () => {
    const result = pay(60_000_00n, { tdsSection: '194J', tdsPayeeClass: 'professional' });
    expect(toRupeeString(result.tds)).toBe('6000.00');
  });

  it('deducts nothing on technical services still under ₹50,000 for the year', () => {
    expect(pay(40_000_00n, { tdsSection: '194J', tdsPayeeClass: 'technical' }).reason).toBe('below_threshold');
  });

  it('catches up the year when it crosses, at 2% for technical services', () => {
    const result = pay(
      20_000_00n,
      { tdsSection: '194J', tdsPayeeClass: 'technical' },
      { taxable: paise(40_000_00n), undeducted: paise(40_000_00n) },
    );
    expect(toRupeeString(result.tds)).toBe('1200.00');
  });

  it('refuses a payment whose vendor does not say which kind of fee', () => {
    expect(() => pay(60_000_00n, { tdsSection: '194J', tdsPayeeClass: null })).toThrow(PaymentRuleMissing);
  });
});

describe('194I', () => {
  it('deducts 2% on plant hire above ₹50,000 for the month', () => {
    expect(toRupeeString(pay(60_000_00n, { tdsSection: '194I', tdsPayeeClass: 'plant_machinery' }).tds)).toBe('1200.00');
  });

  it('deducts nothing on a building rent of ₹45,000 for the month', () => {
    expect(pay(45_000_00n, { tdsSection: '194I', tdsPayeeClass: 'land_building' }).reason).toBe('below_threshold');
  });
});

describe('194Q', () => {
  it('deducts 0.1% only on the part of the year above ₹50,00,000', () => {
    const result = pay(3_00_000_00n, { tdsSection: '194Q' }, { taxable: paise(49_00_000_00n), undeducted: paise(0n) }, true);
    expect(toRupeeString(result.base)).toBe('200000.00');
    expect(toRupeeString(result.tds)).toBe('200.00');
  });

  it('deducts on the whole payment once the year is already above', () => {
    const result = pay(1_00_000_00n, { tdsSection: '194Q' }, { taxable: paise(60_00_000_00n), undeducted: paise(0n) }, true);
    expect(toRupeeString(result.tds)).toBe('100.00');
  });

  it('deducts nothing for a buyer who has not said it is covered', () => {
    expect(pay(3_00_000_00n, { tdsSection: '194Q' }, NOTHING_YET, null).reason).toBe('buyer_not_covered');
    expect(pay(3_00_000_00n, { tdsSection: '194Q' }, NOTHING_YET, false).reason).toBe('buyer_not_covered');
  });
});

describe('without a section or without rules', () => {
  it('deducts nothing from a vendor with no section, and relies on no row', () => {
    const result = pay(50_000_00n, { tdsSection: null });
    expect(result.reason).toBe('no_section');
    expect(result.rowsUsed).toEqual([]);
  });

  it('refuses rather than defaulting when the statutory values are not loaded', () => {
    expect(() =>
      tdsForPayment(
        { paidOn: PAID_ON, taxable: paise(50_000_00n), payee: payee({}), yearSoFar: NOTHING_YET, buyerCoveredBy194Q: null },
        { rates: [], thresholds: [] },
      ),
    ).toThrow(PaymentRuleMissing);
  });
});

describe('settling a bill', () => {
  it('withholds retention on the gross and pays the rest', () => {
    const { retention, net } = settle(paise(59_000_00n), paise(1_000_00n), 500);
    expect(toRupeeString(retention)).toBe('2950.00');
    expect(toRupeeString(net)).toBe('55050.00');
  });

  it('withholds nothing when no retention is held against the order', () => {
    expect(toRupeeString(settle(paise(59_000_00n), paise(1_000_00n), null).net)).toBe('58000.00');
  });
});

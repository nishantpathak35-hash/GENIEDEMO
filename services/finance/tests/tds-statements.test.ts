import { describe, expect, it } from 'vitest';
import { paise, toRupeeString } from '@cog/money';
import {
  StatementPeriodInvalid,
  challanAmount,
  challanDueOn,
  form26QDueOn,
  monthBounds,
  natureOfPaymentCode,
  nextPeriod,
  nextQuarter,
  parseQuarter,
  previousPeriod,
  previousQuarter,
  quarterBounds,
  quarterKey,
  quarterOf,
  remarkCode,
} from '../src/domain/tds-statements.js';

/**
 * The expectations are the provisional readings written into CA-19 — Rules
 * 30(2) and 31A, the challan's codes, the 26Q remark codes — never the output of
 * this file run once and copied back. They move when the CA's answer moves them.
 */

describe('the challan', () => {
  it('is due by the 7th of the next month, and March by 30 April', () => {
    expect(challanDueOn('2026-09')).toBe('2026-10-07');
    expect(challanDueOn('2026-12')).toBe('2027-01-07');
    expect(challanDueOn('2027-03')).toBe('2027-04-30');
  });

  it('carries the nature-of-payment code for the section and class', () => {
    expect(natureOfPaymentCode('194C', 'other')).toBe('94C');
    expect(natureOfPaymentCode('194C', null)).toBe('94C');
    expect(natureOfPaymentCode('194I', 'plant_machinery')).toBe('4IA');
    expect(natureOfPaymentCode('194I', 'land_building')).toBe('4IB');
    expect(natureOfPaymentCode('194J', 'technical')).toBe('4JA');
    expect(natureOfPaymentCode('194J', 'professional')).toBe('4JB');
    expect(natureOfPaymentCode('194Q', null)).toBe('94Q');
    expect(natureOfPaymentCode('194J', null)).toBeNull();
  });

  it('drops the paise, then rounds to the nearest ten rupees, five up — s.288B (CA-04)', () => {
    expect(toRupeeString(challanAmount(paise(1_004_60n)))).toBe('1000.00');
    expect(toRupeeString(challanAmount(paise(1_004_99n)))).toBe('1000.00');
    expect(toRupeeString(challanAmount(paise(1_005_00n)))).toBe('1010.00');
    expect(toRupeeString(challanAmount(paise(14_229_99n)))).toBe('14230.00');
  });

  it('covers a calendar month, and steps across a year', () => {
    expect(monthBounds('2026-12')).toEqual({ from: '2026-12-01', to: '2027-01-01' });
    expect(previousPeriod('2027-01')).toBe('2026-12');
    expect(nextPeriod('2026-12')).toBe('2027-01');
    expect(() => challanDueOn('2026-13')).toThrow(StatementPeriodInvalid);
  });
});

describe('26Q', () => {
  it('reads the quarter of the financial year a date falls in', () => {
    expect(quarterOf('2026-04-01')).toEqual({ financialYear: '2026-27', quarter: 1 });
    expect(quarterOf('2026-09-15')).toEqual({ financialYear: '2026-27', quarter: 2 });
    expect(quarterOf('2026-12-31')).toEqual({ financialYear: '2026-27', quarter: 3 });
    expect(quarterOf('2027-02-01')).toEqual({ financialYear: '2026-27', quarter: 4 });
  });

  it('bounds each quarter, the last one in the next calendar year', () => {
    expect(quarterBounds({ financialYear: '2026-27', quarter: 3 })).toEqual({ from: '2026-10-01', to: '2027-01-01' });
    expect(quarterBounds({ financialYear: '2026-27', quarter: 4 })).toEqual({ from: '2027-01-01', to: '2027-04-01' });
  });

  it('is due 31 July, 31 October, 31 January and 31 May', () => {
    expect(form26QDueOn({ financialYear: '2026-27', quarter: 1 })).toBe('2026-07-31');
    expect(form26QDueOn({ financialYear: '2026-27', quarter: 2 })).toBe('2026-10-31');
    expect(form26QDueOn({ financialYear: '2026-27', quarter: 3 })).toBe('2027-01-31');
    expect(form26QDueOn({ financialYear: '2026-27', quarter: 4 })).toBe('2027-05-31');
  });

  it('names a quarter one way and reads it back, refusing a year that is not one', () => {
    expect(quarterKey(parseQuarter('2026-27-Q2'))).toBe('2026-27-Q2');
    expect(() => parseQuarter('2026-28-Q2')).toThrow(StatementPeriodInvalid);
    expect(quarterKey(previousQuarter(parseQuarter('2026-27-Q1')))).toBe('2025-26-Q4');
    expect(quarterKey(nextQuarter(parseQuarter('2026-27-Q4')))).toBe('2027-28-Q1');
  });

  it('marks the higher no-PAN rate C, a transporter T and below the threshold Y', () => {
    expect(remarkCode('higher_rate_no_valid_pan')).toBe('C');
    expect(remarkCode('transporter_declaration')).toBe('T');
    expect(remarkCode('below_threshold')).toBe('Y');
    expect(remarkCode('deducted')).toBeNull();
  });
});

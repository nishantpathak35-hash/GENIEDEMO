import type { Paise } from '@cog/contracts';
import { roundChallanSec288B } from '@cog/money';
import { financialYearOf } from './rate-table.js';

/**
 * The particulars of a TDS challan and a 26Q statement.
 *
 * **Every one of them is provisional, and they share one question, CA-19**:
 * the due dates (Rules 30(2) and 31A), the minor head, the nature-of-payment
 * codes, the remark codes and the no-PAN marker are our reading of the forms
 * and rules, not a CA's. Each lives in one function here, so an answer that
 * changes one is one function body and its test.
 *
 * Interest under s.201(1A) on a late deposit is not computed anywhere.
 */

export class StatementPeriodInvalid extends Error {
  override readonly name = 'StatementPeriodInvalid';
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const QUARTER = /^(\d{4})-(\d{2})-Q([1-4])$/;

/** Minor head 200: TDS payable by the deductor (CA-19). */
export const MINOR_HEAD_TDS_BY_DEDUCTOR = '200';

/** What a 26Q line carries for a deductee with no PAN (CA-19). */
export const PAN_NOT_AVAILABLE = 'PANNOTAVBL';

function parseMonth(period: string): { readonly year: number; readonly month: number } {
  const match = MONTH.exec(period);
  if (match === null) throw new StatementPeriodInvalid(`not a month, as YYYY-MM: ${JSON.stringify(period)}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

function monthString(year: number, month: number): string {
  return `${String(year)}-${String(month).padStart(2, '0')}`;
}

/** The month's first day, and the next month's — from inclusive, to exclusive. */
export function monthBounds(period: string): { readonly from: string; readonly to: string } {
  const { year, month } = parseMonth(period);
  return { from: `${period}-01`, to: `${nextPeriod(monthString(year, month))}-01` };
}

export function previousPeriod(period: string): string {
  const { year, month } = parseMonth(period);
  return month === 1 ? monthString(year - 1, 12) : monthString(year, month - 1);
}

export function nextPeriod(period: string): string {
  const { year, month } = parseMonth(period);
  return month === 12 ? monthString(year + 1, 1) : monthString(year, month + 1);
}

/** Rule 30(2), provisional (CA-19): by the 7th of the next month; March's by 30 April. */
export function challanDueOn(period: string): string {
  const { year, month } = parseMonth(period);
  if (month === 3) return `${String(year)}-04-30`;
  return `${nextPeriod(period)}-07`;
}

/**
 * The challan's nature-of-payment code for a section and payee class
 * (CA-19): 94C; 4IA plant and 4IB building; 4JA technical and 4JB
 * professional; 94Q. `null` when the class a code depends on is not recorded.
 */
export function natureOfPaymentCode(section: string, payeeClass: string | null): string | null {
  switch (section) {
    case '194C':
      return '94C';
    case '194I':
      return payeeClass === 'plant_machinery' ? '4IA' : payeeClass === 'land_building' ? '4IB' : null;
    case '194J':
      return payeeClass === 'technical' ? '4JA' : payeeClass === 'professional' ? '4JB' : null;
    case '194Q':
      return '94Q';
    default:
      return null;
  }
}

/**
 * A challan line's amount: its deductions' exact total with the paise dropped,
 * then rounded to the nearest ten rupees, five up — s.288B as the CA's answer to
 * CA-04 applies it, provisional. Rounded per line, per nature-of-payment code,
 * until CA-21 says whether it is each line or the challan's total.
 */
export function challanAmount(total: Paise): Paise {
  return roundChallanSec288B(total, 1n);
}

export interface Quarter {
  readonly financialYear: string;
  readonly quarter: 1 | 2 | 3 | 4;
}

function startYearOf(financialYear: string): number {
  return Number(financialYear.slice(0, 4));
}

function financialYearStarting(year: number): string {
  return `${String(year)}-${String((year + 1) % 100).padStart(2, '0')}`;
}

/** The quarter of the financial year a date falls in: April to June is the first. */
export function quarterOf(date: string): Quarter {
  const financialYear = financialYearOf(date);
  const month = Number(date.slice(5, 7));
  const quarter = month >= 4 && month <= 6 ? 1 : month >= 7 && month <= 9 ? 2 : month >= 10 ? 3 : 4;
  return { financialYear, quarter };
}

/** `2026-27-Q2`. */
export function quarterKey(q: Quarter): string {
  return `${q.financialYear}-Q${String(q.quarter)}`;
}

export function parseQuarter(value: string): Quarter {
  const match = QUARTER.exec(value);
  if (match === null) throw new StatementPeriodInvalid(`not a quarter, as 2026-27-Q2: ${JSON.stringify(value)}`);
  const start = Number(match[1]);
  const financialYear = financialYearStarting(start);
  if (financialYear !== `${match[1]}-${match[2]}`) {
    throw new StatementPeriodInvalid(`not a financial year: ${match[1]}-${match[2]}`);
  }
  return { financialYear, quarter: Number(match[3]) as Quarter['quarter'] };
}

/** From inclusive, to exclusive. */
export function quarterBounds(q: Quarter): { readonly from: string; readonly to: string } {
  const start = startYearOf(q.financialYear);
  switch (q.quarter) {
    case 1:
      return { from: `${String(start)}-04-01`, to: `${String(start)}-07-01` };
    case 2:
      return { from: `${String(start)}-07-01`, to: `${String(start)}-10-01` };
    case 3:
      return { from: `${String(start)}-10-01`, to: `${String(start + 1)}-01-01` };
    case 4:
      return { from: `${String(start + 1)}-01-01`, to: `${String(start + 1)}-04-01` };
  }
}

export function previousQuarter(q: Quarter): Quarter {
  if (q.quarter > 1) return { financialYear: q.financialYear, quarter: (q.quarter - 1) as Quarter['quarter'] };
  return { financialYear: financialYearStarting(startYearOf(q.financialYear) - 1), quarter: 4 };
}

export function nextQuarter(q: Quarter): Quarter {
  if (q.quarter < 4) return { financialYear: q.financialYear, quarter: (q.quarter + 1) as Quarter['quarter'] };
  return { financialYear: financialYearStarting(startYearOf(q.financialYear) + 1), quarter: 1 };
}

/** Rule 31A, provisional (CA-19): 31 July, 31 October, 31 January, 31 May. */
export function form26QDueOn(q: Quarter): string {
  const start = startYearOf(q.financialYear);
  switch (q.quarter) {
    case 1:
      return `${String(start)}-07-31`;
    case 2:
      return `${String(start)}-10-31`;
    case 3:
      return `${String(start + 1)}-01-31`;
    case 4:
      return `${String(start + 1)}-05-31`;
  }
}

/**
 * The 26Q remark for a payment (CA-19): `C` when the higher rate applied for
 * want of a valid PAN, `T` a transporter's declaration, `Y` below the
 * threshold. A deduction at the section's own rate carries none.
 */
export function remarkCode(reason: string): 'C' | 'T' | 'Y' | null {
  switch (reason) {
    case 'higher_rate_no_valid_pan':
      return 'C';
    case 'transporter_declaration':
      return 'T';
    case 'below_threshold':
      return 'Y';
    default:
      return null;
  }
}

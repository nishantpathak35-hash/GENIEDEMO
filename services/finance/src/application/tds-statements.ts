import type { Paise } from '@cog/contracts';
import { ZERO, add, fromWire, sum, toWire } from '@cog/money';
import { assertStatutoryOutputAllowed, type Environment, type ProvenancedRow } from '../domain/go-live-gate.js';
import {
  MINOR_HEAD_TDS_BY_DEDUCTOR,
  PAN_NOT_AVAILABLE,
  challanAmount,
  challanDueOn,
  form26QDueOn,
  monthBounds,
  natureOfPaymentCode,
  nextPeriod,
  nextQuarter,
  previousPeriod,
  previousQuarter,
  quarterBounds,
  quarterKey,
  remarkCode,
  type Quarter,
} from '../domain/tds-statements.js';
import type { TxLike } from './tax-rates.js';

/**
 * The challan for a month and the 26Q content for a quarter, from the payments.
 *
 * **Neither is produced without a TAN, and none is ever invented** — the legacy
 * `tdsChallan281.js:54` wrote a fabricated TAN into 26Q content. Without one the
 * answer is `absent`, naming what is missing.
 *
 * **Both are statutory outputs (ADR-0014, addendum).** Each is gated on the
 * CURRENT status of every rate and threshold the period's payments relied on:
 * one provisional row refuses it unless the process produces drafts
 * (`STATUTORY_OUTPUTS=draft`), and then it is produced and marked provisional —
 * the screen says *Draft: provisional rates*.
 * Current, because the CA brief promotes rows after payments were made, and a
 * challan drawn up after that promotion rests on verified rows.
 */

export interface Deductor {
  readonly tan: string | null;
  readonly name: string;
}

export interface StatementAbsent {
  readonly status: 'absent';
  readonly why: string;
  readonly missing: readonly string[];
}

function noTan(): StatementAbsent {
  return {
    status: 'absent',
    why: 'A challan and a 26Q name the deductor by TAN, and none is recorded. Nothing is produced without one, and none is invented.',
    missing: ["the organisation's TAN — Settings › Company"],
  };
}

/** The keys every payment in the window relied on, read from the payments themselves. */
async function keysUsed(tx: TxLike, where: string, from: string, to: string): Promise<readonly string[]> {
  const rows = await tx.query<{ key: string }>(
    `SELECT DISTINCT element->>'key' AS key
       FROM finance.vendor_payments, jsonb_array_elements(rows_used) AS element
      WHERE ${where} AND paid_on >= $1::date AND paid_on < $2::date
      ORDER BY 1`,
    [from, to],
  );
  return rows.map((r) => r.key);
}

/**
 * Each key's status as it stands now. A key is verified only when every row
 * under it is; a key with no row at all is provisional — a missing rule is not a
 * verified one.
 */
async function currentProvenance(tx: TxLike, keys: readonly string[]): Promise<readonly ProvenancedRow[]> {
  if (keys.length === 0) return [];
  const rows = await tx.query<{ key: string; status: string; question_ref: string | null }>(
    `SELECT CASE WHEN payee_class IS NULL THEN key ELSE key || '/' || payee_class END AS key,
            status, question_ref
       FROM finance.tax_rates
     UNION ALL
     SELECT section || '/' || kind AS key, status, question_ref
       FROM finance.tds_thresholds`,
  );
  const byKey = new Map<string, { status: string; questionRef: string | null }>();
  for (const row of rows) {
    const seen = byKey.get(row.key);
    if (seen === undefined || row.status !== 'verified') {
      byKey.set(row.key, { status: row.status, questionRef: row.question_ref });
    }
  }
  return keys.map((key) => {
    const found = byKey.get(key);
    return { key, status: found?.status ?? 'provisional', questionRef: found?.questionRef ?? null };
  });
}

export interface ChallanLine {
  readonly section: string;
  readonly natureCode: string | null;
  readonly payments: number;
  /** Paise dropped, then the nearest ₹10 under s.288B (CA-04, CA-21) — in paise. */
  readonly amount: string;
}

export interface ChallanNavigation {
  readonly period: string;
  readonly previous: string;
  readonly next: string;
}

export type ChallanResponse =
  | (ChallanNavigation & {
      readonly status: 'present';
      readonly dueOn: string;
      readonly tan: string;
      readonly deductor: string;
      readonly minorHead: string;
      readonly lines: readonly ChallanLine[];
      readonly total: string;
      readonly provisional: boolean;
    })
  | (ChallanNavigation & StatementAbsent);

/** The month's tax deducted, one line per nature-of-payment code. */
export async function challanFor(
  tx: TxLike,
  period: string,
  deductor: Deductor,
  environment: Environment,
): Promise<ChallanResponse> {
  const navigation = { period, previous: previousPeriod(period), next: nextPeriod(period) };
  const { from, to } = monthBounds(period);
  const dueOn = challanDueOn(period);
  if (deductor.tan === null) return { ...navigation, ...noTan() };

  const where = 'tds_amount > 0';
  const grouped = await tx.query<{ section: string; payee_class: string | null; payments: number; total: string }>(
    `SELECT tds_section AS section, tds_payee_class AS payee_class,
            count(*)::int AS payments, SUM(tds_amount)::text AS total
       FROM finance.vendor_payments
      WHERE ${where} AND paid_on >= $1::date AND paid_on < $2::date
      GROUP BY tds_section, tds_payee_class
      ORDER BY tds_section, tds_payee_class NULLS FIRST`,
    [from, to],
  );
  const { provisional } = assertStatutoryOutputAllowed(
    'challan',
    await currentProvenance(tx, await keysUsed(tx, where, from, to)),
    environment,
  );

  // One line per code: 194C's two payee classes share 94C.
  const byCode = new Map<string, { section: string; natureCode: string | null; payments: number; total: Paise }>();
  for (const row of grouped) {
    const natureCode = natureOfPaymentCode(row.section, row.payee_class);
    const code = `${row.section}/${natureCode ?? ''}`;
    const seen = byCode.get(code);
    byCode.set(code, {
      section: row.section,
      natureCode,
      payments: (seen?.payments ?? 0) + row.payments,
      total: add(seen?.total ?? ZERO, fromWire(row.total)),
    });
  }
  const lines: ChallanLine[] = [...byCode.values()].map((line) => ({
    section: line.section,
    natureCode: line.natureCode,
    payments: line.payments,
    amount: toWire(challanAmount(line.total)),
  }));

  return {
    ...navigation,
    status: 'present',
    dueOn,
    tan: deductor.tan,
    deductor: deductor.name,
    minorHead: MINOR_HEAD_TDS_BY_DEDUCTOR,
    lines,
    total: toWire(lines.length === 0 ? ZERO : sum(lines.map((l) => fromWire(l.amount)))),
    provisional,
  };
}

export interface Form26QRow {
  readonly paymentNumber: string;
  readonly deducteeName: string;
  readonly pan: string;
  readonly section: string;
  readonly natureCode: string | null;
  readonly paidOn: string;
  /** The value excluding GST the deduction was tested on. */
  readonly amountPaid: string;
  readonly tdsRateBp: number | null;
  readonly tdsAmount: string;
  readonly remark: 'C' | 'T' | 'Y' | null;
}

export interface QuarterNavigation {
  readonly quarter: string;
  readonly previous: string;
  readonly next: string;
}

export type Form26QResponse =
  | (QuarterNavigation & {
      readonly status: 'present';
      readonly from: string;
      readonly to: string;
      readonly dueOn: string;
      readonly tan: string;
      readonly deductor: string;
      readonly rows: readonly Form26QRow[];
      readonly totalPaid: string;
      readonly totalTds: string;
      readonly provisional: boolean;
    })
  | (QuarterNavigation & StatementAbsent);

/**
 * The quarter's deductee lines for 26Q: every bill payment under a section,
 * including those with nothing deducted, which carry their remark. A buyer
 * not covered by 194Q deducted under nothing, and is not reported.
 *
 * One document for one quarter, not a paged list: a statement is filed whole.
 */
export async function form26QFor(
  tx: TxLike,
  quarter: Quarter,
  deductor: Deductor,
  environment: Environment,
): Promise<Form26QResponse> {
  const navigation = {
    quarter: quarterKey(quarter),
    previous: quarterKey(previousQuarter(quarter)),
    next: quarterKey(nextQuarter(quarter)),
  };
  if (deductor.tan === null) return { ...navigation, ...noTan() };

  const { from, to } = quarterBounds(quarter);
  const where = `kind = 'bill' AND tds_section IS NOT NULL AND tds_reason <> 'buyer_not_covered'`;
  const rows = await tx.query<{
    number: string;
    payee_name: string;
    payee_pan: string | null;
    tds_section: string;
    tds_payee_class: string | null;
    paid_on: string;
    taxable_amount: string;
    tds_rate_bp: number | null;
    tds_amount: string;
    tds_reason: string;
  }>(
    `SELECT number, payee_name, payee_pan, tds_section, tds_payee_class, paid_on::text AS paid_on,
            taxable_amount::text AS taxable_amount, tds_rate_bp, tds_amount::text AS tds_amount, tds_reason
       FROM finance.vendor_payments
      WHERE ${where} AND paid_on >= $1::date AND paid_on < $2::date
      ORDER BY paid_on, number`,
    [from, to],
  );
  const { provisional } = assertStatutoryOutputAllowed(
    'form_26q',
    await currentProvenance(tx, await keysUsed(tx, where, from, to)),
    environment,
  );

  const lines: Form26QRow[] = rows.map((r) => ({
    paymentNumber: r.number,
    deducteeName: r.payee_name,
    pan: r.payee_pan ?? PAN_NOT_AVAILABLE,
    section: r.tds_section,
    natureCode: natureOfPaymentCode(r.tds_section, r.tds_payee_class),
    paidOn: r.paid_on,
    amountPaid: r.taxable_amount,
    tdsRateBp: r.tds_rate_bp,
    tdsAmount: r.tds_amount,
    remark: remarkCode(r.tds_reason),
  }));

  return {
    ...navigation,
    status: 'present',
    from,
    to,
    dueOn: form26QDueOn(quarter),
    tan: deductor.tan,
    deductor: deductor.name,
    rows: lines,
    totalPaid: toWire(lines.length === 0 ? ZERO : sum(lines.map((l) => fromWire(l.amountPaid)))),
    totalTds: toWire(lines.length === 0 ? ZERO : sum(lines.map((l) => fromWire(l.tdsAmount)))),
    provisional,
  };
}

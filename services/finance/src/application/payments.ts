import { randomUUID } from 'node:crypto';
import type { Paise, TenantContext } from '@cog/contracts';
import { ZERO, bp, compare, fromWire, negate, toRupeeString } from '@cog/money';
import { finishPage, keyset, type PageQuery } from '@cog/service-kit';
import { assertStatutoryOutputAllowed, type Environment } from '../domain/go-live-gate.js';
import {
  settle,
  tdsForPayment,
  type PayeeFacts,
  type PaymentRules,
  type PaymentTds,
  type ThresholdRow,
  type YearSoFar,
} from '../domain/payment-tds.js';
import { financialYearOf, type RateRow } from '../domain/rate-table.js';
import type { ThresholdKind } from '../domain/statutory-catalogue.js';
import { buildVoucherXml, type LedgerEntry } from '../domain/tally-xml.js';
import type { TxLike } from './tax-rates.js';

/**
 * Paying a vendor's bill (§5): TDS at the provisional rates, retention withheld,
 * a payment voucher numbered with no gaps, and a Tally voucher staged.
 *
 * Split in two on purpose. `prepareBillPayment` reads and computes, and passes
 * the go-live gate, **writing nothing** — every refusal a payment can meet
 * happens there, before a voucher number is taken. `recordBillPayment` writes.
 * The host calls them in that order and wraps the writes in one savepoint.
 */

export interface VendorPayment {
  readonly id: string;
  readonly number: string;
  readonly kind: 'bill' | 'retention_release';
  readonly billId: string | null;
  readonly billNumber: string | null;
  readonly purchaseOrderId: string;
  readonly vendorId: string;
  readonly payeeName: string;
  readonly payeePan: string | null;
  readonly paidOn: string;
  readonly reference: string;
  readonly grossAmount: string;
  readonly taxableAmount: string;
  readonly gstAmount: string;
  readonly tdsSection: string | null;
  readonly tdsPayeeClass: string | null;
  readonly tdsRateBp: number | null;
  readonly tdsBase: string;
  readonly tdsAmount: string;
  readonly tdsReason: string;
  readonly retentionWithheld: string;
  readonly netPaid: string;
  readonly provisional: boolean;
  readonly createdAt: string;
}

type PaymentRow = {
  id: string;
  number: string;
  kind: string;
  bill_id: string | null;
  bill_number: string | null;
  purchase_order_id: string;
  vendor_id: string;
  payee_name: string;
  payee_pan: string | null;
  paid_on: string;
  reference: string;
  gross_amount: string;
  taxable_amount: string;
  gst_amount: string;
  tds_section: string | null;
  tds_payee_class: string | null;
  tds_rate_bp: number | null;
  tds_base: string;
  tds_amount: string;
  tds_reason: string;
  retention_withheld: string;
  net_paid: string;
  provisional: boolean;
  created_at: string;
};

const COLUMNS = `id, number, kind, bill_id, bill_number, purchase_order_id, vendor_id, payee_name, payee_pan,
       paid_on::text AS paid_on, reference,
       gross_amount::text AS gross_amount, taxable_amount::text AS taxable_amount,
       gst_amount::text AS gst_amount, tds_section, tds_payee_class, tds_rate_bp,
       tds_base::text AS tds_base, tds_amount::text AS tds_amount, tds_reason,
       retention_withheld::text AS retention_withheld, net_paid::text AS net_paid,
       provisional, created_at::text AS created_at`;

function toPayment(r: PaymentRow): VendorPayment {
  return {
    id: r.id,
    number: r.number,
    kind: r.kind === 'retention_release' ? 'retention_release' : 'bill',
    billId: r.bill_id,
    billNumber: r.bill_number,
    purchaseOrderId: r.purchase_order_id,
    vendorId: r.vendor_id,
    payeeName: r.payee_name,
    payeePan: r.payee_pan,
    paidOn: r.paid_on,
    reference: r.reference,
    grossAmount: r.gross_amount,
    taxableAmount: r.taxable_amount,
    gstAmount: r.gst_amount,
    tdsSection: r.tds_section,
    tdsPayeeClass: r.tds_payee_class,
    tdsRateBp: r.tds_rate_bp,
    tdsBase: r.tds_base,
    tdsAmount: r.tds_amount,
    tdsReason: r.tds_reason,
    retentionWithheld: r.retention_withheld,
    netPaid: r.net_paid,
    provisional: r.provisional,
    createdAt: r.created_at,
  };
}

/** The tenant's rates and thresholds, as the rules read them. Provenance travels with every row. */
export async function loadPaymentRules(tx: TxLike): Promise<PaymentRules> {
  const rates = await tx.query<{
    key: string;
    payee_class: string | null;
    rate_bp: number;
    effective_from: string;
    effective_to: string | null;
    status: string;
    statute: string | null;
    question_ref: string | null;
  }>(
    `SELECT key, payee_class, rate_bp, effective_from::text AS effective_from,
            effective_to::text AS effective_to, status, statute, question_ref
       FROM finance.tax_rates`,
  );
  const thresholds = await tx.query<{
    section: string;
    kind: string;
    amount: string;
    effective_from: string;
    effective_to: string | null;
    status: string;
    question_ref: string | null;
  }>(
    `SELECT section, kind, amount::text AS amount, effective_from::text AS effective_from,
            effective_to::text AS effective_to, status, question_ref
       FROM finance.tds_thresholds`,
  );
  return {
    rates: rates.map(
      (r): RateRow => ({
        key: r.key,
        ...(r.payee_class === null ? {} : { payeeClass: r.payee_class }),
        rate: bp(r.rate_bp),
        effectiveFrom: r.effective_from,
        effectiveTo: r.effective_to,
        status: r.status === 'verified' ? 'verified' : 'provisional',
        ...(r.statute === null ? {} : { statute: r.statute }),
        ...(r.question_ref === null ? {} : { questionRef: r.question_ref }),
      }),
    ),
    thresholds: thresholds.map(
      (t): ThresholdRow => ({
        section: t.section,
        kind: t.kind as ThresholdKind,
        amount: fromWire(t.amount),
        effectiveFrom: t.effective_from,
        effectiveTo: t.effective_to,
        status: t.status,
        ...(t.question_ref === null ? {} : { questionRef: t.question_ref }),
      }),
    ),
  };
}

/**
 * This vendor, under this section, earlier in the payment's financial year.
 *
 * `undeducted` is the taxable value paid that no tax has been deducted on yet:
 * every payment's taxable value, less every base tax was deducted on — so a
 * catch-up, whose base already carried earlier payments, is not caught up
 * twice. A transporter's declared payments are not owed catch-up, and are
 * left out of it.
 */
async function yearSoFar(tx: TxLike, vendorId: string, section: string, paidOn: string): Promise<YearSoFar> {
  const startYear = financialYearOf(paidOn).slice(0, 4);
  const from = `${startYear}-04-01`;
  const to = `${String(Number(startYear) + 1)}-04-01`;
  const [row] = await tx.query<{ taxable: string; undeducted: string }>(
    `SELECT COALESCE(SUM(taxable_amount), 0)::text AS taxable,
            (COALESCE(SUM(taxable_amount) FILTER (WHERE tds_reason <> 'transporter_declaration'), 0)
               - COALESCE(SUM(tds_base), 0))::text AS undeducted
       FROM finance.vendor_payments
      WHERE vendor_id = $1 AND kind = 'bill' AND tds_section = $2
        AND paid_on >= $3::date AND paid_on < $4::date`,
    [vendorId, section, from, to],
  );
  return { taxable: fromWire(row?.taxable ?? '0'), undeducted: fromWire(row?.undeducted ?? '0') };
}

export interface BillPaymentFacts {
  readonly bill: {
    readonly id: string;
    readonly billNumber: string;
    readonly purchaseOrderId: string;
    readonly vendorId: string;
    readonly amountClaimed: string;
    readonly taxableAmount: string;
    readonly gstAmount: string;
  };
  readonly payee: PayeeFacts & { readonly name: string };
  readonly retentionRateBp: number | null;
  readonly paidOn: string;
  readonly buyerCoveredBy194Q: boolean | null;
}

export interface PaymentPreparation {
  readonly gross: Paise;
  readonly taxable: Paise;
  readonly gst: Paise;
  readonly tds: PaymentTds;
  readonly retention: Paise;
  readonly net: Paise;
  readonly provisional: boolean;
}

/**
 * Work out a bill's payment and pass it through the go-live gate — writing
 * nothing. Unless this process produces drafts (`STATUTORY_OUTPUTS=draft`), a
 * deduction or a Tally voucher that would rely on a provisional row is refused
 * here, by name.
 */
export async function prepareBillPayment(
  tx: TxLike,
  facts: BillPaymentFacts,
  environment: Environment,
): Promise<PaymentPreparation> {
  const gross = fromWire(facts.bill.amountClaimed);
  const taxable = fromWire(facts.bill.taxableAmount);
  const gst = fromWire(facts.bill.gstAmount);
  const rules = await loadPaymentRules(tx);
  const section = facts.payee.tdsSection;
  const soFar =
    section === null ? { taxable: ZERO, undeducted: ZERO } : await yearSoFar(tx, facts.bill.vendorId, section, facts.paidOn);

  const tds = tdsForPayment(
    {
      paidOn: facts.paidOn,
      taxable,
      payee: facts.payee,
      yearSoFar: soFar,
      buyerCoveredBy194Q: facts.buyerCoveredBy194Q,
    },
    rules,
  );
  const deduction = assertStatutoryOutputAllowed('tds_deduction', tds.rowsUsed, environment);
  assertStatutoryOutputAllowed('tally_voucher', tds.rowsUsed, environment);

  const { retention, net } = settle(gross, tds.tds, facts.retentionRateBp);
  return { gross, taxable, gst, tds, retention, net, provisional: deduction.provisional };
}

/**
 * Record a prepared payment, and stage its Tally voucher when no provisional row
 * is behind it. The caller supplies the number, taken in this transaction.
 */
export async function recordBillPayment(
  tx: TxLike,
  ctx: TenantContext,
  facts: BillPaymentFacts,
  prepared: PaymentPreparation,
  input: { readonly number: string; readonly reference: string; readonly tallyCompany: string },
): Promise<VendorPayment> {
  const id = randomUUID();
  await tx.query(
    `INSERT INTO finance.vendor_payments
       (tenant_id, id, number, kind, bill_id, bill_number, purchase_order_id, vendor_id,
        payee_name, payee_pan, paid_on, reference, gross_amount, taxable_amount, gst_amount,
        tds_section, tds_payee_class, tds_rate_bp, tds_base, tds_amount, tds_reason,
        retention_withheld, net_paid, provisional, rows_used, created_by)
     VALUES ($1, $2, $3, 'bill', $4, $5, $6, $7, $8, $9, $10::date, $11, $12, $13, $14,
             $15, $16, $17, $18, $19, $20, $21, $22, $23, $24::jsonb, $25)`,
    [
      ctx.tenantId,
      id,
      input.number,
      facts.bill.id,
      facts.bill.billNumber,
      facts.bill.purchaseOrderId,
      facts.bill.vendorId,
      facts.payee.name,
      facts.payee.pan,
      facts.paidOn,
      input.reference,
      prepared.gross,
      prepared.taxable,
      prepared.gst,
      prepared.tds.section,
      prepared.tds.payeeClass,
      prepared.tds.rate,
      prepared.tds.base,
      prepared.tds.tds,
      prepared.tds.reason,
      prepared.retention,
      prepared.net,
      prepared.provisional,
      JSON.stringify(
        prepared.tds.rowsUsed.map((r) => ({ key: r.key, status: r.status, questionRef: r.questionRef ?? null })),
      ),
      ctx.principal.id,
    ],
  );

  // A voucher computed from a provisional row is never handed to a Tally
  // connector, draft or not (ADR-0014, addendums): the payment is recorded and
  // shown as a draft, and what reaches the books rests on verified rows only.
  if (!prepared.provisional) {
    await stagePaymentVoucher(tx, ctx, {
      id,
      number: input.number,
      paidOn: facts.paidOn,
      payeeName: facts.payee.name,
      narration: `Bill ${facts.bill.billNumber}`,
      company: input.tallyCompany,
      gross: prepared.gross,
      net: prepared.net,
      tds: prepared.tds.tds,
      section: prepared.tds.section,
      retention: prepared.retention,
    });
  }

  return getVendorPayment(tx, id);
}

/**
 * The payment as a double entry for Tally: the vendor debited with what the
 * bill settles; the bank, TDS payable and retention payable credited with
 * where it went.
 *
 * The ledger names are fixed until a tenant maps its own — Tally ledgers are
 * the company's configuration, and nothing records that mapping yet. Only a
 * payment that rests on no provisional row comes here.
 */
async function stagePaymentVoucher(
  tx: TxLike,
  ctx: TenantContext,
  v: {
    readonly id: string;
    readonly number: string;
    readonly paidOn: string;
    readonly payeeName: string;
    readonly narration: string;
    readonly company: string;
    readonly gross: Paise;
    readonly net: Paise;
    readonly tds: Paise;
    readonly section: string | null;
    readonly retention: Paise;
  },
): Promise<void> {
  const entries: LedgerEntry[] = [
    { ledgerName: v.payeeName, amountRupees: toRupeeString(v.gross) },
    { ledgerName: 'Bank', amountRupees: toRupeeString(negate(v.net)) },
  ];
  if (compare(v.tds, ZERO) > 0) {
    entries.push({ ledgerName: `TDS payable — ${v.section ?? ''}`, amountRupees: toRupeeString(negate(v.tds)) });
  }
  if (compare(v.retention, ZERO) > 0) {
    entries.push({ ledgerName: 'Retention payable', amountRupees: toRupeeString(negate(v.retention)) });
  }

  const remoteId = `payment:${v.id}`;
  const xml = buildVoucherXml({
    remoteId,
    voucherType: 'Payment',
    voucherNumber: v.number,
    date: v.paidOn,
    company: v.company,
    partyLedger: v.payeeName,
    narration: v.narration,
    entries,
  });
  await tx.query(
    `INSERT INTO finance.tally_vouchers (tenant_id, id, kind, xml, remote_id)
     VALUES ($1, $2, 'payment', $3, $4)
     ON CONFLICT (tenant_id, remote_id) DO NOTHING`,
    [ctx.tenantId, randomUUID(), xml, remoteId],
  );
}

export async function getVendorPayment(tx: TxLike, id: string): Promise<VendorPayment> {
  const rows = await tx.query<PaymentRow>(`SELECT ${COLUMNS} FROM finance.vendor_payments WHERE id = $1`, [id]);
  const row = rows[0];
  if (row === undefined) throw new Error(`the payment ${id} was not recorded`);
  return toPayment(row);
}

export interface VendorPaymentPage {
  readonly items: readonly VendorPayment[];
  readonly nextCursor: string | null;
  readonly prevCursor: string | null;
  readonly count: number;
}

/** Payments, newest first. `vendorIds` narrows to the vendors a portal login is linked to. */
export async function listVendorPayments(
  tx: TxLike,
  page: PageQuery,
  filter: { readonly vendorIds?: readonly string[] | undefined } = {},
): Promise<VendorPaymentPage> {
  const params: unknown[] = [filter.vendorIds === undefined ? null : [...filter.vendorIds]];
  const where = `($1::uuid[] IS NULL OR vendor_id = ANY($1::uuid[]))`;
  const k = keyset(page, 'paid_on', 'id', 'date', true, 2);
  const rows = await tx.query<PaymentRow>(
    `SELECT ${COLUMNS} FROM finance.vendor_payments
      WHERE ${where} AND ${k.where}
      ORDER BY ${k.orderBy}
      LIMIT $${2 + k.params.length}`,
    [...params, ...k.params, page.limit + 1],
  );
  const [counted] = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM finance.vendor_payments WHERE ${where}`,
    params,
  );
  const paged = finishPage(rows, page, (r) => ({ key: r.paid_on, id: r.id }));
  return {
    items: paged.items.map(toPayment),
    nextCursor: paged.nextCursor,
    prevCursor: paged.prevCursor,
    count: counted?.n ?? 0,
  };
}

export interface PaymentsSummary {
  /** `YYYY-MM`, the month of `today`. */
  readonly month: string;
  readonly paidThisMonth: {
    readonly count: number;
    readonly gross: string;
    readonly tds: string;
    readonly retention: string;
    readonly net: string;
  };
  /** Retention withheld from bills and not yet released. */
  readonly retentionHeld: string;
  readonly provisionalCount: number;
}

/** Totals over every payment — never over a page. */
export async function paymentsSummary(tx: TxLike, today: string): Promise<PaymentsSummary> {
  const month = `paid_on >= date_trunc('month', $1::date)::date
                 AND paid_on < (date_trunc('month', $1::date) + interval '1 month')::date`;
  const [row] = await tx.query<{
    month: string;
    n: number;
    gross: string;
    tds: string;
    retention: string;
    net: string;
    held: string;
    provisional_n: number;
  }>(
    `SELECT to_char($1::date, 'YYYY-MM') AS month,
            count(*) FILTER (WHERE ${month})::int AS n,
            COALESCE(SUM(gross_amount) FILTER (WHERE ${month}), 0)::text AS gross,
            COALESCE(SUM(tds_amount) FILTER (WHERE ${month}), 0)::text AS tds,
            COALESCE(SUM(retention_withheld) FILTER (WHERE ${month}), 0)::text AS retention,
            COALESCE(SUM(net_paid) FILTER (WHERE ${month}), 0)::text AS net,
            (COALESCE(SUM(retention_withheld) FILTER (WHERE kind = 'bill'), 0)
               - COALESCE(SUM(gross_amount) FILTER (WHERE kind = 'retention_release'), 0))::text AS held,
            count(*) FILTER (WHERE provisional)::int AS provisional_n
       FROM finance.vendor_payments`,
    [today],
  );
  return {
    month: row?.month ?? today.slice(0, 7),
    paidThisMonth: {
      count: row?.n ?? 0,
      gross: row?.gross ?? '0',
      tds: row?.tds ?? '0',
      retention: row?.retention ?? '0',
      net: row?.net ?? '0',
    },
    retentionHeld: row?.held ?? '0',
    provisionalCount: row?.provisional_n ?? 0,
  };
}

// ------------------------------------------------------------- retention ----

export class RetentionReleaseRefused extends Error {
  override readonly name = 'RetentionReleaseRefused';
}

export interface RetentionTotals {
  /** Withheld from this order's bill payments. */
  readonly withheld: string;
  /** Paid out in retention releases. */
  readonly released: string;
  /** Withheld and not yet released. */
  readonly held: string;
  readonly hasHeld: boolean;
}

/**
 * Retention per order, from the payments themselves.
 *
 * The holding in procurement says the rate and whether it is released; what was
 * actually withheld is what each bill payment kept back, and what was released
 * is what each release paid out. Neither is a column somebody edits.
 */
export async function retentionByOrder(
  tx: TxLike,
  purchaseOrderIds: readonly string[],
): Promise<ReadonlyMap<string, RetentionTotals>> {
  if (purchaseOrderIds.length === 0) return new Map();
  const rows = await tx.query<{
    purchase_order_id: string;
    withheld: string;
    released: string;
    held: string;
    has_held: boolean;
  }>(
    `SELECT purchase_order_id, withheld::text AS withheld, released::text AS released,
            (withheld - released)::text AS held, (withheld - released) > 0 AS has_held
       FROM (
         SELECT purchase_order_id,
                COALESCE(SUM(retention_withheld) FILTER (WHERE kind = 'bill'), 0) AS withheld,
                COALESCE(SUM(gross_amount) FILTER (WHERE kind = 'retention_release'), 0) AS released
           FROM finance.vendor_payments
          WHERE purchase_order_id = ANY($1::uuid[])
          GROUP BY purchase_order_id
       ) totals`,
    [[...purchaseOrderIds]],
  );
  return new Map(
    rows.map((r) => [
      r.purchase_order_id,
      { withheld: r.withheld, released: r.released, held: r.held, hasHeld: r.has_held },
    ]),
  );
}

/** Retention held and released across every order. */
export async function retentionTotals(tx: TxLike): Promise<{ readonly held: string; readonly released: string }> {
  const [row] = await tx.query<{ held: string; released: string }>(
    `SELECT (COALESCE(SUM(retention_withheld) FILTER (WHERE kind = 'bill'), 0)
               - COALESCE(SUM(gross_amount) FILTER (WHERE kind = 'retention_release'), 0))::text AS held,
            COALESCE(SUM(gross_amount) FILTER (WHERE kind = 'retention_release'), 0)::text AS released
       FROM finance.vendor_payments`,
  );
  return { held: row?.held ?? '0', released: row?.released ?? '0' };
}

/**
 * What a release of this order's retention would pay: everything withheld and
 * not yet released. Refused, writing nothing, when that is nothing.
 *
 * A release deducts no tax — our convention, CA-20 — so no rate stands behind
 * it and the go-live gate has no row to refuse on. That reading is a question
 * for the CA, not a row a CA can promote, and it is named as such in the report.
 */
export async function prepareRetentionRelease(
  tx: TxLike,
  purchaseOrderId: string,
): Promise<{ readonly amount: Paise }> {
  const totals = (await retentionByOrder(tx, [purchaseOrderId])).get(purchaseOrderId);
  const amount = fromWire(totals?.held ?? '0');
  if (compare(amount, ZERO) <= 0) {
    throw new RetentionReleaseRefused(
      'Nothing is withheld against this order to release — retention is withheld when its bills are paid.',
    );
  }
  return { amount };
}

/**
 * Record a release as a payment voucher, and stage its Tally voucher unless the
 * retention was withheld by a payment resting on a provisional row. The caller
 * supplies the number.
 */
export async function recordRetentionRelease(
  tx: TxLike,
  ctx: TenantContext,
  input: {
    readonly number: string;
    readonly purchaseOrderId: string;
    readonly vendorId: string;
    readonly payeeName: string;
    readonly payeePan: string | null;
    readonly releasedOn: string;
    readonly reference: string;
    readonly amount: Paise;
    readonly tallyCompany: string;
  },
): Promise<VendorPayment> {
  const id = randomUUID();
  await tx.query(
    `INSERT INTO finance.vendor_payments
       (tenant_id, id, number, kind, bill_id, bill_number, purchase_order_id, vendor_id,
        payee_name, payee_pan, paid_on, reference, gross_amount, taxable_amount, gst_amount,
        tds_section, tds_payee_class, tds_rate_bp, tds_base, tds_amount, tds_reason,
        retention_withheld, net_paid, provisional, rows_used, created_by)
     VALUES ($1, $2, $3, 'retention_release', NULL, NULL, $4, $5, $6, $7, $8::date, $9,
             $10, 0, 0, NULL, NULL, NULL, 0, 0, 'retention_release', 0, $10, false, '[]'::jsonb, $11)`,
    [
      ctx.tenantId,
      id,
      input.number,
      input.purchaseOrderId,
      input.vendorId,
      input.payeeName,
      input.payeePan,
      input.releasedOn,
      input.reference,
      input.amount,
      ctx.principal.id,
    ],
  );

  // The retention was withheld by the order's bill payments. If any of them
  // rested on a provisional row, its voucher never reached Tally, so the
  // retention payable this would debit is not in the books — and this voucher
  // stays out of them too.
  const [withheld] = await tx.query<{ provisional: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM finance.vendor_payments
        WHERE purchase_order_id = $1 AND kind = 'bill' AND retention_withheld > 0 AND provisional
     ) AS provisional`,
    [input.purchaseOrderId],
  );
  if (withheld?.provisional === true) return getVendorPayment(tx, id);

  const remoteId = `payment:${id}`;
  const xml = buildVoucherXml({
    remoteId,
    voucherType: 'Payment',
    voucherNumber: input.number,
    date: input.releasedOn,
    company: input.tallyCompany,
    partyLedger: input.payeeName,
    narration: 'Retention released',
    entries: [
      { ledgerName: 'Retention payable', amountRupees: toRupeeString(input.amount) },
      { ledgerName: 'Bank', amountRupees: toRupeeString(negate(input.amount)) },
    ],
  });
  await tx.query(
    `INSERT INTO finance.tally_vouchers (tenant_id, id, kind, xml, remote_id)
     VALUES ($1, $2, 'payment', $3, $4)
     ON CONFLICT (tenant_id, remote_id) DO NOTHING`,
    [ctx.tenantId, randomUUID(), xml, remoteId],
  );

  return getVendorPayment(tx, id);
}

import { listTransporterDeclarations } from './transporter-declarations.js';
import type { TenantContext } from '@cog/contracts';
import { add, compare, fromWire } from '@cog/money';
import { finishPage, keyset, type PageQuery } from '@cog/service-kit';
import type { TxLike } from './approval-subject.js';
import { weekBounds } from '../domain/payables.js';

/**
 * Bills as the office sees them — the payables side of DATA-02 (§5).
 *
 * A vendor's bill is a claim until somebody acknowledges it: records the
 * invoice's taxable value and GST, and when it is due. From then until it is
 * paid it is a payable, and "due this week" is read from `due_on` and nothing
 * else.
 *
 * **Every figure here is GROSS** — what the vendor claimed. Nothing is netted
 * of TDS or retention: those are decided when the bill is paid, by finance, on
 * provisional rules, and a payable shown net of a provisional deduction would
 * be a statutory figure wearing a payables label.
 */

export class BillNotFound extends Error {
  override readonly name = 'BillNotFound';
}

export class BillRefused extends Error {
  override readonly name = 'BillRefused';
}

export const BILL_VIEWS = ['due', 'to_acknowledge', 'paid', 'returned', 'all'] as const;
export type BillView = (typeof BILL_VIEWS)[number];

export interface StaffBill {
  readonly id: string;
  readonly purchaseOrderId: string;
  readonly orderNumber: string;
  readonly projectId: string | null;
  readonly vendorId: string;
  readonly vendorName: string;
  readonly billNumber: string;
  readonly amountClaimed: string;
  readonly taxableAmount: string | null;
  readonly gstAmount: string | null;
  readonly periodFrom: string | null;
  readonly periodTo: string | null;
  readonly narrative: string;
  readonly state: 'submitted' | 'acknowledged' | 'returned';
  readonly submittedAt: string;
  readonly dueOn: string | null;
  readonly acknowledgedAt: string | null;
  readonly paidOn: string | null;
  readonly paymentId: string | null;
}

type BillRow = {
  id: string;
  purchase_order_id: string;
  order_number: string;
  project_id: string | null;
  vendor_id: string;
  vendor_name: string;
  bill_number: string;
  amount_claimed: string;
  taxable_amount: string | null;
  gst_amount: string | null;
  period_from: string | null;
  period_to: string | null;
  narrative: string;
  state: string;
  submitted_at: string;
  due_on: string | null;
  acknowledged_at: string | null;
  paid_on: string | null;
  payment_id: string | null;
};

const BILL_SELECT = `SELECT b.id, b.purchase_order_id, o.number AS order_number, o.project_id,
         b.vendor_id, v.name AS vendor_name, b.bill_number,
         b.amount_claimed::text AS amount_claimed,
         b.taxable_amount::text AS taxable_amount,
         b.gst_amount::text AS gst_amount,
         b.period_from::text AS period_from, b.period_to::text AS period_to,
         b.narrative, b.state, b.submitted_at::text AS submitted_at,
         b.due_on::text AS due_on, b.acknowledged_at::text AS acknowledged_at,
         b.paid_on::text AS paid_on, b.payment_id
    FROM procurement.vendor_bills b
    JOIN procurement.purchase_orders o ON o.tenant_id = b.tenant_id AND o.id = b.purchase_order_id
    JOIN procurement.vendors v ON v.tenant_id = b.tenant_id AND v.id = b.vendor_id`;

const VIEW_WHERE: Readonly<Record<BillView, string>> = Object.freeze({
  due: `b.state = 'acknowledged' AND b.paid_on IS NULL`,
  to_acknowledge: `b.state = 'submitted'`,
  paid: `b.paid_on IS NOT NULL`,
  returned: `b.state = 'returned'`,
  all: 'TRUE',
});

function toStaffBill(r: BillRow): StaffBill {
  return {
    id: r.id,
    purchaseOrderId: r.purchase_order_id,
    orderNumber: r.order_number,
    projectId: r.project_id,
    vendorId: r.vendor_id,
    vendorName: r.vendor_name,
    billNumber: r.bill_number,
    amountClaimed: r.amount_claimed,
    taxableAmount: r.taxable_amount,
    gstAmount: r.gst_amount,
    periodFrom: r.period_from,
    periodTo: r.period_to,
    narrative: r.narrative,
    state: r.state as StaffBill['state'],
    submittedAt: r.submitted_at,
    dueOn: r.due_on,
    acknowledgedAt: r.acknowledged_at,
    paidOn: r.paid_on,
    paymentId: r.payment_id,
  };
}

export interface StaffBillPage {
  readonly items: readonly StaffBill[];
  readonly nextCursor: string | null;
  readonly prevCursor: string | null;
  readonly count: number;
}

/**
 * One page of bills in a view. Payables due are ordered soonest first — the
 * order somebody pays them in; every other view, newest submission first.
 */
export interface BillFilters {
  /** The project's twin: bills against this project's orders. */
  readonly projectId?: string | undefined;
  readonly vendorId?: string | undefined;
  /** ILIKE over the bill number or the vendor's name — the list's search box. */
  readonly q?: string | undefined;
}

export async function listStaffBills(tx: TxLike, page: PageQuery, view: BillView, filters: BillFilters = {}): Promise<StaffBillPage> {
  const byDue = view === 'due';
  const params: unknown[] = [filters.projectId ?? null, filters.vendorId ?? null, filters.q === undefined || filters.q === '' ? null : `%${filters.q}%`];
  const where = `${VIEW_WHERE[view]}
               AND ($1::uuid IS NULL OR o.project_id = $1)
               AND ($2::uuid IS NULL OR b.vendor_id = $2)
               AND ($3::text IS NULL OR b.bill_number ILIKE $3 OR v.name ILIKE $3)`;
  const k = byDue
    ? keyset(page, 'b.due_on', 'b.id', 'date', false, params.length + 1)
    : keyset(page, 'b.submitted_at', 'b.id', 'timestamptz', true, params.length + 1);
  const rows = await tx.query<BillRow>(
    `${BILL_SELECT}
      WHERE ${where} AND ${k.where}
      ORDER BY ${k.orderBy}
      LIMIT $${params.length + k.params.length + 1}`,
    [...params, ...k.params, page.limit + 1],
  );
  const [counted] = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM procurement.vendor_bills b
       JOIN procurement.purchase_orders o ON o.tenant_id = b.tenant_id AND o.id = b.purchase_order_id
       JOIN procurement.vendors v ON v.tenant_id = b.tenant_id AND v.id = b.vendor_id
      WHERE ${where}`,
    params,
  );
  const paged = finishPage(rows, page, (r) => ({
    key: byDue ? (r.due_on ?? '') : r.submitted_at,
    id: r.id,
  }));
  return {
    items: paged.items.map(toStaffBill),
    nextCursor: paged.nextCursor,
    prevCursor: paged.prevCursor,
    count: counted?.n ?? 0,
  };
}

export async function getStaffBill(tx: TxLike, billId: string): Promise<StaffBill> {
  const rows = await tx.query<BillRow>(`${BILL_SELECT} WHERE b.id = $1`, [billId]);
  const row = rows[0];
  if (row === undefined) throw new BillNotFound(`no such bill: ${billId}`);
  return toStaffBill(row);
}

export interface PayablesBucket {
  readonly count: number;
  /** Gross, paise, as the wire string. */
  readonly total: string;
}

export interface UpcomingPayable {
  readonly id: string;
  readonly vendorName: string;
  readonly billNumber: string;
  readonly dueOn: string;
  readonly overdue: boolean;
  readonly amountClaimed: string;
}

export interface PayablesSummary {
  readonly today: string;
  readonly weekEnds: string;
  readonly nextWeekEnds: string;
  readonly overdue: PayablesBucket;
  readonly dueThisWeek: PayablesBucket;
  readonly dueNextWeek: PayablesBucket;
  readonly dueLater: PayablesBucket;
  readonly toAcknowledge: PayablesBucket;
  /** The dated list: every unpaid payable due by the end of next week, soonest first. At most 20. */
  readonly upcoming: readonly UpcomingPayable[];
}

/** How many to list by date. The buckets above count every one; this is what fits a screen. */
export const UPCOMING_LIMIT = 20;

/**
 * What is owed, by when — over every bill, never over a page of them.
 *
 * Overdue is due before today. This week runs from today to Sunday; next week
 * is the Monday to Sunday after it (`weekBounds`, on India's calendar).
 * `projectId` narrows to the bills on that project's orders, for a project's
 * Overview; absent, the whole tenant.
 */
export async function payablesSummary(
  tx: TxLike,
  today: string,
  filter: { readonly projectId?: string | undefined } = {},
): Promise<PayablesSummary> {
  const { weekEnds, nextWeekEnds } = weekBounds(today);
  const project = filter.projectId ?? null;
  const [due] = await tx.query<{
    overdue_n: number;
    overdue_total: string;
    this_n: number;
    this_total: string;
    next_n: number;
    next_total: string;
    later_n: number;
    later_total: string;
  }>(
    `SELECT
       count(*) FILTER (WHERE due_on < $1::date)::int AS overdue_n,
       COALESCE(SUM(amount_claimed) FILTER (WHERE due_on < $1::date), 0)::text AS overdue_total,
       count(*) FILTER (WHERE due_on BETWEEN $1::date AND $2::date)::int AS this_n,
       COALESCE(SUM(amount_claimed) FILTER (WHERE due_on BETWEEN $1::date AND $2::date), 0)::text AS this_total,
       count(*) FILTER (WHERE due_on > $2::date AND due_on <= $3::date)::int AS next_n,
       COALESCE(SUM(amount_claimed) FILTER (WHERE due_on > $2::date AND due_on <= $3::date), 0)::text AS next_total,
       count(*) FILTER (WHERE due_on > $3::date)::int AS later_n,
       COALESCE(SUM(amount_claimed) FILTER (WHERE due_on > $3::date), 0)::text AS later_total
      FROM procurement.vendor_bills b
      JOIN procurement.purchase_orders o ON o.tenant_id = b.tenant_id AND o.id = b.purchase_order_id
     WHERE b.state = 'acknowledged' AND b.paid_on IS NULL
       AND ($4::uuid IS NULL OR o.project_id = $4::uuid)`,
    [today, weekEnds, nextWeekEnds, project],
  );
  const [waiting] = await tx.query<{ n: number; total: string }>(
    `SELECT count(*)::int AS n, COALESCE(SUM(b.amount_claimed), 0)::text AS total
       FROM procurement.vendor_bills b
       JOIN procurement.purchase_orders o ON o.tenant_id = b.tenant_id AND o.id = b.purchase_order_id
      WHERE b.state = 'submitted'
        AND ($1::uuid IS NULL OR o.project_id = $1::uuid)`,
    [project],
  );
  const upcoming = await tx.query<{
    id: string;
    vendor_name: string;
    bill_number: string;
    due_on: string;
    overdue: boolean;
    amount_claimed: string;
  }>(
    `SELECT b.id, v.name AS vendor_name, b.bill_number, b.due_on::text AS due_on,
            (b.due_on < $2::date) AS overdue,
            b.amount_claimed::text AS amount_claimed
       FROM procurement.vendor_bills b
       JOIN procurement.vendors v ON v.tenant_id = b.tenant_id AND v.id = b.vendor_id
       JOIN procurement.purchase_orders o ON o.tenant_id = b.tenant_id AND o.id = b.purchase_order_id
      WHERE b.state = 'acknowledged' AND b.paid_on IS NULL AND b.due_on <= $1::date
        AND ($3::uuid IS NULL OR o.project_id = $3::uuid)
      ORDER BY b.due_on, b.id
      LIMIT ${String(UPCOMING_LIMIT)}`,
    [nextWeekEnds, today, project],
  );

  return {
    today,
    weekEnds,
    nextWeekEnds,
    overdue: { count: due?.overdue_n ?? 0, total: due?.overdue_total ?? '0' },
    dueThisWeek: { count: due?.this_n ?? 0, total: due?.this_total ?? '0' },
    dueNextWeek: { count: due?.next_n ?? 0, total: due?.next_total ?? '0' },
    dueLater: { count: due?.later_n ?? 0, total: due?.later_total ?? '0' },
    toAcknowledge: { count: waiting?.n ?? 0, total: waiting?.total ?? '0' },
    upcoming: upcoming.map((r) => ({
      id: r.id,
      vendorName: r.vendor_name,
      billNumber: r.bill_number,
      dueOn: r.due_on,
      overdue: r.overdue,
      amountClaimed: r.amount_claimed,
    })),
  };
}

/**
 * Acknowledge a submitted bill: its taxable value, its GST and when it is due.
 *
 * The split must add up to exactly what the vendor claimed — the claim is what
 * the vendor invoiced, and a split that does not reconcile to it is a different
 * invoice. Amounts arrive as wire strings and are parsed here, because the host
 * cannot handle a monetary value even to convert one.
 */
export async function acknowledgeBill(
  tx: TxLike,
  ctx: TenantContext,
  billId: string,
  input: { readonly taxableAmountWire: string; readonly gstAmountWire: string; readonly dueOn: string },
): Promise<StaffBill> {
  const taxable = fromWire(input.taxableAmountWire);
  const gst = fromWire(input.gstAmountWire);

  const current = await getStaffBill(tx, billId);
  if (current.state !== 'submitted') {
    throw new BillRefused('This bill is not waiting to be acknowledged.');
  }
  if (compare(add(taxable, gst), fromWire(current.amountClaimed)) !== 0) {
    throw new BillRefused('The taxable value and the GST must add up to exactly what the vendor claimed.');
  }

  const updated = await tx.query<{ id: string }>(
    `UPDATE procurement.vendor_bills
        SET state = 'acknowledged', taxable_amount = $2, gst_amount = $3, due_on = $4::date,
            acknowledged_by = $5, acknowledged_at = now(), version = version + 1
      WHERE id = $1 AND state = 'submitted'
      RETURNING id`,
    [billId, taxable, gst, input.dueOn, ctx.principal.id],
  );
  if (updated.length === 0) throw new BillRefused('This bill was acknowledged by someone else first.');
  return getStaffBill(tx, billId);
}

export interface PayeeProfile {
  readonly name: string;
  readonly pan: string | null;
  readonly tdsSection: string | null;
  readonly tdsPayeeClass: string | null;
  readonly panInoperative: boolean;
  /** What the vendor is in law, as recorded; under 194C it decides the rate (CA-07). */
  readonly constitution: string | null;
  /** Its 194C(6) declarations, one a financial year (CA-07). */
  readonly transporterDeclarations: readonly {
    readonly financialYear: string;
    readonly declaredOn: string;
    readonly pan: string;
    readonly goodsCarriageConfirmed: boolean;
  }[];
}

export interface BillForPayment {
  readonly bill: StaffBill;
  readonly payee: PayeeProfile;
  /** The retention rate held against the bill's order, or `null` when none is recorded. */
  readonly retentionRateBp: number | null;
}

/**
 * Everything finance needs to pay a bill, and nothing it may not see.
 *
 * Refuses a bill that is not acknowledged — a claim has no split and no due
 * date — and one already paid.
 */
export async function billForPayment(tx: TxLike, billId: string): Promise<BillForPayment> {
  const bill = await getStaffBill(tx, billId);
  if (bill.paidOn !== null) throw new BillRefused('This bill has already been paid.');
  if (bill.state !== 'acknowledged') {
    throw new BillRefused('Acknowledge this bill — its taxable value, GST and due date — before paying it.');
  }
  return { bill, payee: await payeeProfile(tx, bill.vendorId), retentionRateBp: await retentionRate(tx, bill.purchaseOrderId) };
}

export async function payeeProfile(tx: TxLike, vendorId: string): Promise<PayeeProfile> {
  const rows = await tx.query<{
    name: string;
    pan: string | null;
    tds_section: string | null;
    tds_payee_class: string | null;
    pan_inoperative: boolean;
    constitution: string | null;
  }>(
    `SELECT name, pan, tds_section, tds_payee_class, pan_inoperative, constitution
       FROM procurement.vendors WHERE id = $1`,
    [vendorId],
  );
  const row = rows[0];
  if (row === undefined) throw new BillNotFound(`no such vendor: ${vendorId}`);
  const declarations = await listTransporterDeclarations(tx, vendorId);
  return {
    name: row.name,
    pan: row.pan,
    tdsSection: row.tds_section,
    tdsPayeeClass: row.tds_payee_class,
    panInoperative: row.pan_inoperative,
    constitution: row.constitution,
    transporterDeclarations: declarations.map((d) => ({
      financialYear: d.financialYear,
      declaredOn: d.declaredOn,
      pan: d.pan,
      goodsCarriageConfirmed: d.goodsCarriageConfirmed,
    })),
  };
}

async function retentionRate(tx: TxLike, purchaseOrderId: string): Promise<number | null> {
  const rows = await tx.query<{ retention_rate_bp: number }>(
    // A released holding withholds nothing more from the order's later bills.
    `SELECT retention_rate_bp FROM procurement.retention_holdings
      WHERE purchase_order_id = $1 AND stage = 'held'`,
    [purchaseOrderId],
  );
  return rows[0]?.retention_rate_bp ?? null;
}

/**
 * Record that a bill was paid, in the transaction finance recorded the payment
 * in. Refused if somebody paid it first — the payment that lost the race rolls
 * back with this refusal, number and all.
 */
export async function markBillPaid(
  tx: TxLike,
  billId: string,
  paymentId: string,
  paidOn: string,
): Promise<void> {
  const updated = await tx.query<{ id: string }>(
    `UPDATE procurement.vendor_bills
        SET paid_on = $2::date, payment_id = $3, version = version + 1
      WHERE id = $1 AND state = 'acknowledged' AND paid_on IS NULL
      RETURNING id`,
    [billId, paidOn, paymentId],
  );
  if (updated.length === 0) throw new BillRefused('This bill was paid by someone else first.');
}

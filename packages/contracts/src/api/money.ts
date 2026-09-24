import { z } from 'zod';
import { pageOf } from '../pagination.js';
import { paiseWire } from '../money.js';

/**
 * Money — bills as payables (DATA-02, §5).
 *
 * A vendor's bill is a claim until somebody acknowledges it with its taxable
 * value, its GST and its due date. From then until it is paid it is a payable.
 * **Every figure on this surface is gross**: nothing here is netted of TDS or
 * retention, which are decided when the bill is paid, on provisional rules.
 */

/** A non-negative amount of paise. */
const nonNegativePaise = paiseWire.regex(/^(0|[1-9][0-9]*)$/, 'an amount cannot be negative');

export const staffBill = z.object({
  id: z.uuid(),
  purchaseOrderId: z.uuid(),
  orderNumber: z.string(),
  projectId: z.uuid().nullable(),
  vendorId: z.uuid(),
  vendorName: z.string(),
  billNumber: z.string(),
  /** What the vendor claimed. Gross. */
  amountClaimed: paiseWire,
  /** Recorded at acknowledgement; `null` while the bill is only a claim. */
  taxableAmount: paiseWire.nullable(),
  gstAmount: paiseWire.nullable(),
  periodFrom: z.string().nullable(),
  periodTo: z.string().nullable(),
  narrative: z.string(),
  state: z.enum(['submitted', 'acknowledged', 'returned']),
  submittedAt: z.string(),
  dueOn: z.string().nullable(),
  acknowledgedAt: z.string().nullable(),
  paidOn: z.string().nullable(),
  paymentId: z.uuid().nullable(),
});
export type StaffBill = z.infer<typeof staffBill>;

export const payablesBucket = z.object({
  count: z.number().int().nonnegative(),
  /** Gross. */
  total: paiseWire,
});
export type PayablesBucket = z.infer<typeof payablesBucket>;

/**
 * What is owed, by when — over every bill, never over a page. The week runs
 * Monday to Sunday on India's calendar; `today` is the date it was computed
 * for, so a screen never works a week out from its own clock.
 */
export const payablesSummary = z.object({
  today: z.string(),
  weekEnds: z.string(),
  nextWeekEnds: z.string(),
  overdue: payablesBucket,
  dueThisWeek: payablesBucket,
  dueNextWeek: payablesBucket,
  dueLater: payablesBucket,
  toAcknowledge: payablesBucket,
  /** The dated list: every unpaid payable due by the end of next week, soonest first. At most 20. */
  upcoming: z.array(
    z.object({
      id: z.uuid(),
      vendorName: z.string(),
      billNumber: z.string(),
      dueOn: z.string(),
      /** Due before `today`. The server's comparison, so a screen never compares dates. */
      overdue: z.boolean(),
      amountClaimed: paiseWire,
    }),
  ),
});
export type PayablesSummary = z.infer<typeof payablesSummary>;

/**
 * Money owed, in ageing buckets — receivables by how long past `expectedOn`,
 * payables by how long past `dueOn`. Each bucket carries its width on the bar
 * as a percentage of the whole owed, two decimals, truncated by the server —
 * a screen draws the bar and divides nothing.
 */
export const ageingBucket = z.object({
  count: z.number().int().nonnegative(),
  total: paiseWire,
  /** This bucket's share of `total` on the card, 0–100 with two decimals. */
  pct: z.number().min(0).max(100),
});
export type AgeingBucket = z.infer<typeof ageingBucket>;

export const ageingBuckets = z.object({
  /** Not yet past its date. */
  current: ageingBucket,
  days1to30: ageingBucket,
  days31to60: ageingBucket,
  over60: ageingBucket,
});
export type AgeingBuckets = z.infer<typeof ageingBuckets>;

/**
 * What clients still owe on tax invoices raised — current, then overdue by how
 * long — over every issued invoice with a balance, or one project's with
 * `?projectId=`. `today` is the date it was computed for. `oldest` is the
 * invoice longest past its expected date, with the server's day count.
 */
export const receivablesAgeingResponse = z.object({
  today: z.string(),
  /** Every open balance. */
  total: paiseWire,
  openCount: z.number().int().nonnegative(),
  /** The three overdue buckets together. */
  overdue: ageingBucket,
  buckets: ageingBuckets,
  oldest: z
    .object({
      number: z.string(),
      clientName: z.string(),
      projectCode: z.string(),
      balance: paiseWire,
      expectedOn: z.string(),
      daysPast: z.number().int().nonnegative(),
    })
    .nullable(),
});
export type ReceivablesAgeingResponse = z.infer<typeof receivablesAgeingResponse>;

/**
 * What the firm owes vendors on bills acknowledged and unpaid — current, then
 * overdue by how long past `dueOn` — gross, never net of TDS. `toAcknowledge`
 * is what vendors have sent that nobody has acknowledged yet, outside the
 * buckets because it carries no due date. `?projectId=` narrows to the bills
 * on that project's orders.
 */
export const payablesAgeingResponse = z.object({
  today: z.string(),
  total: paiseWire,
  openCount: z.number().int().nonnegative(),
  overdue: ageingBucket,
  buckets: ageingBuckets,
  toAcknowledge: payablesBucket,
  oldest: z
    .object({
      billNumber: z.string(),
      vendorName: z.string(),
      amountClaimed: paiseWire,
      dueOn: z.string(),
      daysPast: z.number().int().nonnegative(),
    })
    .nullable(),
});
export type PayablesAgeingResponse = z.infer<typeof payablesAgeingResponse>;

/** The window a money chart or a spend chart is drawn over: the financial year to date, or the quarter to date. */
export const moneyPeriod = z.enum(['fy', 'q']);
export type MoneyPeriod = z.infer<typeof moneyPeriod>;

/**
 * Money in and out by month — receipts recorded against tax invoices, and
 * payments recorded against bills net of TDS and retention — over the
 * financial year to date or the quarter to date, on India's calendar. It is
 * what the product records, not a bank statement: there is no cash book
 * (HUMAN(ARCH-CASH) stays open), so nothing here is a balance.
 *
 * Each month carries both figures and each figure's `index` — basis points of
 * the window's largest monthly figure, either series — because a line chart
 * draws plain numbers and is never handed money.
 */
export const moneyByMonthResponse = z.object({
  period: moneyPeriod,
  /** The window's name as a screen prints it — "FY 2026-27", "Q2 2026-27". */
  label: z.string(),
  /** First and last month of the window, `YYYY-MM`. */
  from: z.string(),
  to: z.string(),
  months: z.array(
    z.object({
      month: z.string(),
      /** "Apr", "May" … */
      label: z.string(),
      collected: paiseWire,
      paidOut: paiseWire,
      collectedIndex: z.number().int().min(0).max(10000),
      paidOutIndex: z.number().int().min(0).max(10000),
    }),
  ),
  collected: paiseWire,
  paidOut: paiseWire,
  /** Collected less paid out; negative when more went out than came in. */
  net: paiseWire,
  /** The axis: quarters of the window's largest monthly figure, each at its `index` with the rupee figure a tick prints. Empty when nothing was recorded. */
  ticks: z.array(z.object({ index: z.number().int().min(0).max(10000), wire: paiseWire })),
});
export type MoneyByMonthResponse = z.infer<typeof moneyByMonthResponse>;

export const billView = z.enum(['due', 'to_acknowledge', 'paid', 'returned', 'all']);
export type BillView = z.infer<typeof billView>;

export const billListResponse = pageOf(staffBill).extend({ summary: payablesSummary });
export type BillListResponse = z.infer<typeof billListResponse>;

/**
 * Acknowledging a bill. The split must add up to exactly what was claimed —
 * the server refuses otherwise — and the due date is required, because a
 * payable with no due date cannot be in any week.
 */
export const acknowledgeBillInput = z.object({
  taxableAmount: nonNegativePaise,
  gstAmount: nonNegativePaise,
  dueOn: z.iso.date(),
});
export type AcknowledgeBillInput = z.infer<typeof acknowledgeBillInput>;

// ------------------------------------------------------------- payments ----

export const tdsReason = z.enum([
  'deducted',
  'higher_rate_no_valid_pan',
  'below_threshold',
  'transporter_declaration',
  'no_section',
  'buyer_not_covered',
  'retention_release',
]);
export type TdsReason = z.infer<typeof tdsReason>;

/**
 * A payment to a vendor, as recorded. TDS and retention are what was deducted
 * and withheld; `provisional` says whether any value behind them is still
 * provisional (ADR-0014, addendum). Money is paise, as the wire string.
 */
export const vendorPayment = z.object({
  id: z.uuid(),
  number: z.string(),
  kind: z.enum(['bill', 'retention_release']),
  billId: z.uuid().nullable(),
  billNumber: z.string().nullable(),
  purchaseOrderId: z.uuid(),
  vendorId: z.uuid(),
  payeeName: z.string(),
  payeePan: z.string().nullable(),
  paidOn: z.string(),
  reference: z.string(),
  grossAmount: paiseWire,
  taxableAmount: paiseWire,
  gstAmount: paiseWire,
  tdsSection: z.string().nullable(),
  tdsPayeeClass: z.string().nullable(),
  tdsRateBp: z.number().int().nullable(),
  tdsBase: paiseWire,
  tdsAmount: paiseWire,
  tdsReason,
  retentionWithheld: paiseWire,
  netPaid: paiseWire,
  provisional: z.boolean(),
  createdAt: z.string(),
});
export type VendorPayment = z.infer<typeof vendorPayment>;

/** Totals over every payment, never over a page. */
export const paymentSummary = z.object({
  /** `YYYY-MM` — the month the totals below are for. */
  month: z.string(),
  paidThisMonth: z.object({
    count: z.number().int().nonnegative(),
    gross: paiseWire,
    tds: paiseWire,
    retention: paiseWire,
    net: paiseWire,
  }),
  /** Retention withheld from bills and not yet released. */
  retentionHeld: paiseWire,
  provisionalCount: z.number().int().nonnegative(),
});
export type PaymentSummary = z.infer<typeof paymentSummary>;

export const paymentListResponse = pageOf(vendorPayment).extend({ summary: paymentSummary });
export type PaymentListResponse = z.infer<typeof paymentListResponse>;

/** Paying an acknowledged bill in full. The amounts are the server's; this says when, and the bank's reference. */
export const payBillInput = z.object({
  paidOn: z.iso.date(),
  reference: z.string().max(64),
});
export type PayBillInput = z.infer<typeof payBillInput>;

/**
 * A payment as the VENDOR sees it: what was paid against which bill, what was
 * deducted under which section and at what rate, what was withheld. Every row
 * carries `provisional`, so a vendor is never shown a deduction without whether
 * its rate is settled (ADR-0014, addendum).
 */
export const vendorPortalPayment = vendorPayment.pick({
  id: true,
  number: true,
  kind: true,
  billNumber: true,
  paidOn: true,
  reference: true,
  grossAmount: true,
  tdsSection: true,
  tdsRateBp: true,
  tdsAmount: true,
  tdsReason: true,
  retentionWithheld: true,
  netPaid: true,
  provisional: true,
});
export type VendorPortalPayment = z.infer<typeof vendorPortalPayment>;

export const vendorPortalPaymentListResponse = pageOf(vendorPortalPayment);
export type VendorPortalPaymentListResponse = z.infer<typeof vendorPortalPaymentListResponse>;

// ------------------------------------------------------------ retention ----

/**
 * Retention against an order, as it stands: the rate held (procurement), and
 * from the payments (finance) what was withheld from its bills, what was
 * released and what is held now. `canRelease` is the server's: held, not yet
 * released, and more than nothing.
 */
export const retentionPosition = z.object({
  id: z.uuid(),
  purchaseOrderId: z.uuid(),
  orderNumber: z.string().nullable(),
  vendorId: z.uuid(),
  vendorName: z.string().nullable(),
  retentionRateBp: z.number().int(),
  stage: z.enum(['held', 'released']),
  withheld: paiseWire,
  released: paiseWire,
  held: paiseWire,
  canRelease: z.boolean(),
});
export type RetentionPosition = z.infer<typeof retentionPosition>;

export const retentionPositionListResponse = pageOf(retentionPosition).extend({
  summary: z.object({
    held: paiseWire,
    released: paiseWire,
    holdings: z.number().int().nonnegative(),
  }),
});
export type RetentionPositionListResponse = z.infer<typeof retentionPositionListResponse>;

/** Releasing what is held. The amount is the server's; this says when, and the bank's reference. */
export const releaseRetentionInput = z.object({
  releasedOn: z.iso.date(),
  reference: z.string().max(64),
});
export type ReleaseRetentionInput = z.infer<typeof releaseRetentionInput>;

// ---------------------------------------------------- challan and 26Q ----

/** Why a statement cannot be produced — without a TAN, say. Kept here so this module imports nothing from Today. */
const statementAbsent = z.object({
  status: z.literal('absent'),
  why: z.string(),
  missing: z.array(z.string()),
});

const challanNavigation = z.object({ period: z.string(), previous: z.string(), next: z.string() });

export const challanLine = z.object({
  section: z.string(),
  /** 94C, 4IA, 4IB, 4JA, 4JB or 94Q — provisional, CA-19. `null` when the class it depends on is not recorded. */
  natureCode: z.string().nullable(),
  payments: z.number().int().nonnegative(),
  /** Paise dropped, then the nearest ₹10 under s.288B (CA-04, CA-21) — as paise. */
  amount: paiseWire,
});
export type ChallanLine = z.infer<typeof challanLine>;

/**
 * The month's TDS challan, from the payments. `provisional` says whether any
 * rate or threshold behind it is still provisional; unless the API was told to
 * produce drafts (`STATUTORY_OUTPUTS=draft`), such a challan is refused with
 * `PROVISIONAL_OUTPUT_REFUSED`.
 */
export const tdsChallanResponse = z.discriminatedUnion('status', [
  challanNavigation.extend({
    status: z.literal('present'),
    dueOn: z.string(),
    tan: z.string(),
    deductor: z.string(),
    minorHead: z.string(),
    lines: z.array(challanLine),
    total: paiseWire,
    provisional: z.boolean(),
  }),
  challanNavigation.extend(statementAbsent.shape),
]);
export type TdsChallanResponse = z.infer<typeof tdsChallanResponse>;

const quarterNavigation = z.object({ quarter: z.string(), previous: z.string(), next: z.string() });

export const form26QRow = z.object({
  paymentNumber: z.string(),
  deducteeName: z.string(),
  /** The PAN, or PANNOTAVBL when none is held (CA-19). */
  pan: z.string(),
  section: z.string(),
  natureCode: z.string().nullable(),
  paidOn: z.string(),
  amountPaid: paiseWire,
  tdsRateBp: z.number().int().nullable(),
  tdsAmount: paiseWire,
  /** C, T or Y — provisional, CA-19. */
  remark: z.enum(['C', 'T', 'Y']).nullable(),
});
export type Form26QRow = z.infer<typeof form26QRow>;

/** The quarter's 26Q deductee lines — one document, not a paged list. */
export const form26QResponse = z.discriminatedUnion('status', [
  quarterNavigation.extend({
    status: z.literal('present'),
    from: z.string(),
    to: z.string(),
    dueOn: z.string(),
    tan: z.string(),
    deductor: z.string(),
    rows: z.array(form26QRow),
    totalPaid: paiseWire,
    totalTds: paiseWire,
    provisional: z.boolean(),
  }),
  quarterNavigation.extend(statementAbsent.shape),
]);
export type Form26QResponse = z.infer<typeof form26QResponse>;

// ------------------------------------------------------- client billing ----

const positivePaise = paiseWire.regex(/^[1-9][0-9]*$/, 'an amount must be more than nothing');

/**
 * A tax invoice to a client, with what was received and what is still due.
 * `provisional` says whether the GST rate behind it is still provisional; in
 * production such an invoice is refused. A cancelled invoice keeps its number
 * and owes nothing.
 */
export const clientInvoice = z.object({
  id: z.uuid(),
  number: z.string(),
  projectId: z.uuid(),
  projectCode: z.string(),
  clientName: z.string(),
  clientGstin: z.string().nullable(),
  invoiceDate: z.string(),
  expectedOn: z.string(),
  /** When the client certified the work billed — a certified receivable. */
  certifiedOn: z.string().nullable(),
  description: z.string(),
  supplierState: z.string(),
  placeOfSupply: z.string(),
  supplyType: z.enum(['intra_state', 'inter_state']),
  taxable: paiseWire,
  gstRateBp: z.number().int(),
  cgst: paiseWire,
  sgst: paiseWire,
  igst: paiseWire,
  /** What rounding the total to the rupee changed, its own line — negative when rounded down (CA-02). */
  roundOff: paiseWire,
  total: paiseWire,
  received: paiseWire,
  balance: paiseWire,
  provisional: z.boolean(),
  state: z.enum(['issued', 'cancelled']),
  cancelReason: z.string().nullable(),
  createdAt: z.string(),
});
export type ClientInvoice = z.infer<typeof clientInvoice>;

/** Over every issued invoice, never a page. */
export const receivablesSummary = z.object({
  invoiced: paiseWire,
  received: paiseWire,
  balance: paiseWire,
  overdue: paiseWire,
  openCount: z.number().int().nonnegative(),
  nextExpected: z
    .object({
      number: z.string(),
      expectedOn: z.string(),
      certifiedOn: z.string().nullable(),
      balance: paiseWire,
    })
    .nullable(),
});
export type ReceivablesSummary = z.infer<typeof receivablesSummary>;

export const clientInvoiceListResponse = pageOf(clientInvoice).extend({ summary: receivablesSummary });
export type ClientInvoiceListResponse = z.infer<typeof clientInvoiceListResponse>;

/**
 * Raising a tax invoice. The taxable value and where the site is are the
 * inputs; the tax, the heads and the number are the server's.
 */
export const raiseClientInvoiceInput = z.object({
  projectId: z.uuid(),
  invoiceDate: z.iso.date(),
  expectedOn: z.iso.date(),
  certifiedOn: z.iso.date().nullable(),
  description: z.string().max(500),
  taxableAmount: positivePaise,
  placeOfSupply: z.string().regex(/^[0-9]{2}$/, 'a two-digit state code, the way a GSTIN begins'),
  clientGstin: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/, 'not a valid GSTIN')
    .nullable(),
});
export type RaiseClientInvoiceInput = z.infer<typeof raiseClientInvoiceInput>;

export const recordClientReceiptInput = z.object({
  receivedOn: z.iso.date(),
  amount: positivePaise,
  reference: z.string().max(64),
});
export type RecordClientReceiptInput = z.infer<typeof recordClientReceiptInput>;

export const cancelClientInvoiceInput = z.object({
  reason: z.string().trim().min(1, 'Say why it is cancelled.').max(500),
});
export type CancelClientInvoiceInput = z.infer<typeof cancelClientInvoiceInput>;

/** An invoice as the CLIENT sees it: what was billed, received and is due — and whether its rate is provisional. */
export const clientPortalInvoice = clientInvoice.pick({
  id: true,
  number: true,
  invoiceDate: true,
  expectedOn: true,
  certifiedOn: true,
  description: true,
  taxable: true,
  cgst: true,
  sgst: true,
  igst: true,
  roundOff: true,
  total: true,
  received: true,
  balance: true,
  provisional: true,
  state: true,
});
export type ClientPortalInvoice = z.infer<typeof clientPortalInvoice>;

export const clientPortalBillingResponse = z.object({
  invoices: z.array(clientPortalInvoice),
  invoiced: paiseWire,
  received: paiseWire,
  balance: paiseWire,
});
export type ClientPortalBillingResponse = z.infer<typeof clientPortalBillingResponse>;

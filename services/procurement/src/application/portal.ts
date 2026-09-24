import { randomUUID } from 'node:crypto';
import { fromWire, toWire } from '@cog/money';
import type { TenantContext } from '@cog/contracts';
import { finishPage, keyset, type PageQuery } from '@cog/service-kit';
import type { TxLike } from './approval-subject.js';

/**
 * What a vendor may see and do about its OWN orders.
 *
 * Every function here takes a `vendorId` and filters on it. That is not
 * belt-and-braces on top of row-level security: RLS scopes to the **tenant**,
 * and a vendor and the staff who raised its order are in the same tenant. So
 * tenant isolation contributes nothing to this control, and M1/D3 is explicit
 * that intra-tenant authorisation is a **separate control**. This module is
 * that control's data half; the host route is the half that decides which
 * vendor id to pass.
 *
 * **No TDS, no retention and no payment figure is returned by anything here.**
 * The vendor portal's money views are CA-01..CA-08 and are not built. What a
 * vendor sees of an order is what was ordered from them and what it came to
 * before any deduction — `gross` is `taxable + gst` (PO-23).
 */

export interface VendorOrder {
  readonly id: string;
  readonly number: string;
  readonly state: string;
  readonly taxable: string;
  readonly gst: string;
  readonly gross: string;
  readonly createdAt: string;
  readonly acceptance: string | null;
}

export interface VendorOrderListPage {
  readonly items: readonly VendorOrder[];
  readonly nextCursor: string | null;
  readonly prevCursor: string | null;
  readonly count: number;
}

/**
 * The orders issued to a vendor login's linked vendors.
 *
 * `vendorIds` — plural, from `PrincipalScope.subjectIds` — never a single id
 * from the request: the scoping is the LINK, resolved once by the host before
 * this runs, and this filters on the whole set with one `= ANY(...)` rather
 * than a loop of single-vendor reads, which is what let each read carry its
 * own cursor and count in the first place.
 */
export async function listOrdersForVendor(
  tx: TxLike,
  vendorIds: readonly string[],
  page: PageQuery,
): Promise<VendorOrderListPage> {
  const k = keyset(page, 'o.created_at', 'o.id', 'timestamptz', true, 2);
  const rows = await tx.query<{
    id: string;
    number: string;
    state: string;
    taxable: string;
    gst: string;
    gross: string;
    created_at: string;
    acceptance: string | null;
  }>(
    `SELECT o.id, o.number, o.state,
            o.taxable::text AS taxable, o.gst::text AS gst, o.gross::text AS gross,
            o.created_at::text AS created_at,
            (SELECT a.decision
               FROM procurement.purchase_order_acceptances a
              WHERE a.purchase_order_id = o.id
              ORDER BY a.decided_at DESC
              LIMIT 1) AS acceptance
       FROM procurement.purchase_orders o
      WHERE o.vendor_id = ANY($1::uuid[])
        AND ${k.where}
      ORDER BY ${k.orderBy}
      LIMIT $${2 + k.params.length}`,
    [[...vendorIds], ...k.params, page.limit + 1],
  );
  const [counted] = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM procurement.purchase_orders WHERE vendor_id = ANY($1::uuid[])`,
    [[...vendorIds]],
  );
  const paged = finishPage(rows, page, (r) => ({ key: r.created_at, id: r.id }));
  return {
    items: paged.items.map((r) => ({
      id: r.id,
      number: r.number,
      state: r.state,
      taxable: r.taxable,
      gst: r.gst,
      gross: r.gross,
      createdAt: r.created_at,
      acceptance: r.acceptance,
    })),
    nextCursor: paged.nextCursor,
    prevCursor: paged.prevCursor,
    count: counted?.n ?? 0,
  };
}

/** The lines of one of that vendor's orders, or `null` if it is not theirs. */
export async function orderLinesForVendor(
  tx: TxLike,
  vendorId: string,
  purchaseOrderId: string,
): Promise<ReadonlyArray<Record<string, unknown>> | null> {
  // The vendor id is in the WHERE clause of the ownership check, not applied
  // afterwards in the caller. A filter applied after a read has already
  // happened is not an access control.
  const owner = await tx.query<{ id: string }>(
    `SELECT id FROM procurement.purchase_orders WHERE id = $1 AND vendor_id = $2`,
    [purchaseOrderId, vendorId],
  );
  if (owner[0] === undefined) return null;

  const rows = await tx.query<{
    line_no: number;
    description: string;
    hsn_sac: string;
    quantity_micros: string;
    unit_rate: string;
    gst_rate_bp: number;
  }>(
    `SELECT line_no, description, hsn_sac, quantity_micros::text AS quantity_micros,
            unit_rate::text AS unit_rate, gst_rate_bp
       FROM procurement.purchase_order_lines
      WHERE purchase_order_id = $1
      ORDER BY line_no`,
    [purchaseOrderId],
  );
  return rows.map((r) => ({
    lineNo: r.line_no,
    description: r.description,
    hsnSac: r.hsn_sac,
    quantityMicros: r.quantity_micros,
    unitRate: r.unit_rate,
    gstRate: r.gst_rate_bp,
  }));
}

export class VendorPortalRefused extends Error {
  override readonly name = 'VendorPortalRefused';
}

/**
 * Record a vendor's answer to an order.
 *
 * Append-only: an acceptance and a later rejection are two facts. A vendor may
 * only answer an order that was issued to them, and the ownership check is a
 * predicate on the write rather than a check before it.
 */
export async function recordAcceptance(
  tx: TxLike,
  ctx: TenantContext,
  input: {
    readonly vendorId: string;
    readonly purchaseOrderId: string;
    readonly decision: 'accepted' | 'rejected';
    readonly remarks?: string | undefined;
  },
): Promise<{ id: string; decision: string }> {
  const id = randomUUID();
  const inserted = await tx.query<{ id: string }>(
    `INSERT INTO procurement.purchase_order_acceptances
       (tenant_id, id, purchase_order_id, vendor_id, decision, remarks, decided_by)
     SELECT $1, $2, o.id, o.vendor_id, $4, $5, $6
       FROM procurement.purchase_orders o
      WHERE o.id = $3 AND o.vendor_id = $7
     RETURNING id`,
    [
      ctx.tenantId,
      id,
      input.purchaseOrderId,
      input.decision,
      input.remarks ?? '',
      ctx.principal.id,
      input.vendorId,
    ],
  );
  if (inserted[0] === undefined) {
    throw new VendorPortalRefused('that order was not issued to you');
  }
  return { id, decision: input.decision };
}

export interface VendorBill {
  readonly id: string;
  readonly purchaseOrderId: string;
  readonly billNumber: string;
  readonly amountClaimed: string;
  readonly periodFrom: string | null;
  readonly periodTo: string | null;
  readonly narrative: string;
  readonly state: string;
  readonly submittedAt: string;
  readonly dueOn: string | null;
  readonly paidOn: string | null;
}

export interface VendorBillListPage {
  readonly items: readonly VendorBill[];
  readonly nextCursor: string | null;
  readonly prevCursor: string | null;
  readonly count: number;
}

/** Bills submitted against a vendor login's linked vendors — see `listOrdersForVendor`. */
export async function listBillsForVendor(
  tx: TxLike,
  vendorIds: readonly string[],
  page: PageQuery,
): Promise<VendorBillListPage> {
  const k = keyset(page, 'submitted_at', 'id', 'timestamptz', true, 2);
  const rows = await tx.query<{
    id: string;
    purchase_order_id: string;
    bill_number: string;
    amount_claimed: string;
    period_from: string | null;
    period_to: string | null;
    narrative: string;
    state: string;
    submitted_at: string;
    due_on: string | null;
    paid_on: string | null;
  }>(
    `SELECT id, purchase_order_id, bill_number, amount_claimed::text AS amount_claimed,
            period_from::text AS period_from, period_to::text AS period_to,
            narrative, state, submitted_at::text AS submitted_at,
            due_on::text AS due_on, paid_on::text AS paid_on
       FROM procurement.vendor_bills
      WHERE vendor_id = ANY($1::uuid[])
        AND ${k.where}
      ORDER BY ${k.orderBy}
      LIMIT $${2 + k.params.length}`,
    [[...vendorIds], ...k.params, page.limit + 1],
  );
  const [counted] = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM procurement.vendor_bills WHERE vendor_id = ANY($1::uuid[])`,
    [[...vendorIds]],
  );
  const paged = finishPage(rows, page, (r) => ({ key: r.submitted_at, id: r.id }));
  return {
    items: paged.items.map((r) => ({
      id: r.id,
      purchaseOrderId: r.purchase_order_id,
      billNumber: r.bill_number,
      amountClaimed: r.amount_claimed,
      periodFrom: r.period_from,
      periodTo: r.period_to,
      narrative: r.narrative,
      state: r.state,
      submittedAt: r.submitted_at,
      dueOn: r.due_on,
      paidOn: r.paid_on,
    })),
    nextCursor: paged.nextCursor,
    prevCursor: paged.prevCursor,
    count: counted?.n ?? 0,
  };
}

/**
 * Submit a running-account bill against an order.
 *
 * **`amountClaimed` is stored exactly as submitted and nothing derives from
 * it.** No TDS is computed, nothing is netted, and there is no approved-amount
 * column for a later step to fill in — those are CA-01..CA-08. A claim is a
 * statement by the vendor about what the work is worth, and recording it
 * faithfully is the whole of what this does.
 */
export async function submitBill(
  tx: TxLike,
  ctx: TenantContext,
  input: {
    readonly vendorId: string;
    readonly purchaseOrderId: string;
    readonly billNumber: string;
    /**
     * The canonical wire string of paise.
     *
     * Parsed HERE rather than by the caller, because the caller is
     * `services/host` and the host has no `@cog/money` dependency at all — it
     * must not be able to handle a monetary value, not even to convert one.
     * `fromWire` throws on anything non-canonical rather than coercing it.
     */
    readonly amountClaimedWire: string;
    readonly periodFrom?: string | undefined;
    readonly periodTo?: string | undefined;
    readonly narrative?: string | undefined;
  },
): Promise<{ id: string; billNumber: string }> {
  const id = randomUUID();
  try {
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO procurement.vendor_bills
         (tenant_id, id, purchase_order_id, vendor_id, bill_number, amount_claimed,
          period_from, period_to, narrative, submitted_by)
       SELECT $1, $2, o.id, o.vendor_id, $4, $5, $6, $7, $8, $9
         FROM procurement.purchase_orders o
        WHERE o.id = $3 AND o.vendor_id = $10
       RETURNING id`,
      [
        ctx.tenantId,
        id,
        input.purchaseOrderId,
        input.billNumber,
        toWire(fromWire(input.amountClaimedWire)),
        input.periodFrom ?? null,
        input.periodTo ?? null,
        input.narrative ?? '',
        ctx.principal.id,
        input.vendorId,
      ],
    );
    if (inserted[0] === undefined) {
      throw new VendorPortalRefused('that order was not issued to you');
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new VendorPortalRefused(`you have already submitted bill ${input.billNumber}`);
    }
    throw error;
  }
  return { id, billNumber: input.billNumber };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

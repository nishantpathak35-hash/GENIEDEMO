import { add, bp, fromWire } from '@cog/money';
import type { FinancialWindow } from '@cog/service-kit';
import type { TxLike } from './approval-subject.js';
import { ageing, type Ageing } from '../domain/ageing.js';
import { lineTotals, type Quantity } from '../domain/purchase-order.js';

/**
 * The reads behind Today's buying panels: payables in ageing buckets, spend by
 * trade, and which orders are a project's. Whole-tenant aggregates, never a
 * page; RLS scopes the tenant and no query names `tenant_id`.
 */

export interface PayablesAgeing extends Ageing {
  readonly today: string;
  readonly toAcknowledge: { readonly count: number; readonly total: string };
  readonly oldest: {
    readonly billNumber: string;
    readonly vendorName: string;
    readonly amountClaimed: string;
    readonly dueOn: string;
    readonly daysPast: number;
  } | null;
}

/**
 * What the firm owes vendors: every bill acknowledged and unpaid, gross,
 * bucketed by how long past its due date, and the one longest past it. Bills
 * submitted and not yet acknowledged carry no due date and sit outside the
 * buckets. `projectId` narrows to the bills on that project's orders.
 */
export async function payablesAgeing(
  tx: TxLike,
  today: string,
  filter: { readonly projectId?: string | undefined } = {},
): Promise<PayablesAgeing> {
  const project = filter.projectId ?? null;
  const rows = await tx.query<{
    bill_number: string;
    vendor_name: string;
    amount_claimed: string;
    due_on: string;
    days_past: number;
  }>(
    `SELECT b.bill_number, v.name AS vendor_name, b.amount_claimed::text AS amount_claimed,
            b.due_on::text AS due_on, ($1::date - b.due_on)::int AS days_past
       FROM procurement.vendor_bills b
       JOIN procurement.vendors v ON v.tenant_id = b.tenant_id AND v.id = b.vendor_id
       JOIN procurement.purchase_orders o ON o.tenant_id = b.tenant_id AND o.id = b.purchase_order_id
      WHERE b.state = 'acknowledged' AND b.paid_on IS NULL AND b.due_on IS NOT NULL
        AND ($2::uuid IS NULL OR o.project_id = $2::uuid)
      ORDER BY days_past DESC, b.bill_number`,
    [today, project],
  );
  const [waiting] = await tx.query<{ n: number; total: string }>(
    `SELECT count(*)::int AS n, COALESCE(SUM(b.amount_claimed), 0)::text AS total
       FROM procurement.vendor_bills b
       JOIN procurement.purchase_orders o ON o.tenant_id = b.tenant_id AND o.id = b.purchase_order_id
      WHERE b.state = 'submitted'
        AND ($1::uuid IS NULL OR o.project_id = $1::uuid)`,
    [project],
  );
  const aged = ageing(rows.map((r) => ({ daysPast: r.days_past, amount: fromWire(r.amount_claimed) })));
  const first = rows[0];
  return {
    today,
    ...aged,
    toAcknowledge: { count: waiting?.n ?? 0, total: waiting?.total ?? '0' },
    oldest:
      first === undefined || first.days_past <= 0
        ? null
        : {
            billNumber: first.bill_number,
            vendorName: first.vendor_name,
            amountClaimed: first.amount_claimed,
            dueOn: first.due_on,
            daysPast: first.days_past,
          },
  };
}

/**
 * Every line of every order not cancelled and raised inside the window, with
 * its gross — quantity × rate, GST on it, each through `packages/money` as
 * `lineTotals` does when the order is written — and the trade its line names.
 * An order's date is the day it was raised, on India's calendar; no other
 * date is stored on an order.
 */
export async function tradeSpendLines(
  tx: TxLike,
  window: FinancialWindow,
  /** One project's orders only — the project's report; every order when absent. */
  projectId?: string,
): Promise<ReadonlyArray<{ readonly tradeCode: string | null; readonly gross: ReturnType<typeof fromWire> }>> {
  const rows = await tx.query<{
    trade_code: string | null;
    quantity_micros: string;
    unit_rate: string;
    gst_rate_bp: number;
  }>(
    `SELECT l.trade_code, l.quantity_micros::text AS quantity_micros,
            l.unit_rate::text AS unit_rate, l.gst_rate_bp
       FROM procurement.purchase_order_lines l
       JOIN procurement.purchase_orders o ON o.tenant_id = l.tenant_id AND o.id = l.purchase_order_id
      WHERE o.state <> 'cancelled'
        AND (o.created_at AT TIME ZONE 'Asia/Kolkata')::date >= $1::date
        AND (o.created_at AT TIME ZONE 'Asia/Kolkata')::date < $2::date
        AND ($3::uuid IS NULL OR o.project_id = $3::uuid)`,
    [window.start, window.end, projectId ?? null],
  );
  return rows.map((r) => {
    const totals = lineTotals({
      description: '',
      hsnSac: '',
      quantity: BigInt(r.quantity_micros) as Quantity,
      unitRate: fromWire(r.unit_rate),
      gstRate: bp(r.gst_rate_bp),
    });
    return { tradeCode: r.trade_code, gross: add(totals.taxable, totals.gst) };
  });
}

/** The ids of every order on one project, cancelled ones included — a payment against a cancelled order still left. */
export async function orderIdsOfProject(tx: TxLike, projectId: string): Promise<readonly string[]> {
  const rows = await tx.query<{ id: string }>(
    `SELECT id FROM procurement.purchase_orders WHERE project_id = $1 ORDER BY id`,
    [projectId],
  );
  return rows.map((r) => r.id);
}

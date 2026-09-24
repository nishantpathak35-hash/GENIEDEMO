import type { Paise } from '@cog/contracts';
import { bp, excessBasisPoints, toWire } from '@cog/money';
import type { TxLike } from './approval-subject.js';
import { lineTotals, type Quantity } from '../domain/purchase-order.js';

/**
 * An order's own lines, for the staff who raised it — the seven-column table
 * the full order page draws (`docs/design/07-buying.html`, "The full order
 * page"): item, quantity, rate, the agreed rate, the amount, and the check.
 *
 * Each line's amount is `lineTotals` from the domain — quantity × rate,
 * rounded once to paise — the same arithmetic that made the order's totals,
 * so the column adds up to the figure in the hero. `contractedUnitRate` is
 * what the write stamped on the line at the moment it was priced: the check
 * measures the line against the rate that governed it then, not against
 * whatever contract is on file today. `excessBp` is signed — above is
 * positive, below negative — and null where there was no agreed rate.
 */
export interface PurchaseOrderLineView {
  readonly lineNo: number;
  readonly description: string;
  readonly hsnSac: string;
  readonly tradeCode: string | null;
  readonly boqItemId: string | null;
  readonly quantityMicros: string;
  readonly unitRate: string;
  readonly gstRate: number;
  readonly contractedUnitRate: string | null;
  readonly amount: string;
  readonly gst: string;
  readonly excessBp: number | null;
}

/** `null` when the order does not exist — the route answers 404, not an empty list. */
export async function purchaseOrderLines(tx: TxLike, purchaseOrderId: string): Promise<readonly PurchaseOrderLineView[] | null> {
  const owner = await tx.query<{ id: string }>(`SELECT id FROM procurement.purchase_orders WHERE id = $1`, [purchaseOrderId]);
  if (owner[0] === undefined) return null;

  const rows = await tx.query<{
    line_no: number;
    description: string;
    hsn_sac: string;
    trade_code: string | null;
    boq_item_id: string | null;
    quantity_micros: string;
    unit_rate: string;
    gst_rate_bp: number;
    contracted_unit_rate: string | null;
  }>(
    `SELECT line_no, description, hsn_sac, trade_code, boq_item_id,
            quantity_micros::text AS quantity_micros,
            unit_rate::text AS unit_rate, gst_rate_bp,
            contracted_unit_rate::text AS contracted_unit_rate
       FROM procurement.purchase_order_lines
      WHERE purchase_order_id = $1
      ORDER BY line_no`,
    [purchaseOrderId],
  );
  return rows.map((r) => {
    const unitRate = BigInt(r.unit_rate) as Paise;
    const totals = lineTotals({
      description: r.description,
      hsnSac: r.hsn_sac,
      quantity: BigInt(r.quantity_micros) as Quantity,
      unitRate,
      gstRate: bp(r.gst_rate_bp),
    });
    const contracted = r.contracted_unit_rate === null ? null : (BigInt(r.contracted_unit_rate) as Paise);
    return {
      lineNo: r.line_no,
      description: r.description,
      hsnSac: r.hsn_sac,
      tradeCode: r.trade_code,
      boqItemId: r.boq_item_id,
      quantityMicros: r.quantity_micros,
      unitRate: r.unit_rate,
      gstRate: r.gst_rate_bp,
      contractedUnitRate: r.contracted_unit_rate,
      amount: toWire(totals.taxable),
      gst: toWire(totals.gst),
      // the one division, in packages/money; a contracted rate of zero has
      // no percentage above it and reads as unchecked rather than as a pass
      excessBp: contracted === null || contracted <= 0n ? null : excessBasisPoints(contracted, unitRate),
    };
  });
}

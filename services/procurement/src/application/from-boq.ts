import type { PurchaseOrderLineInputLike } from './purchase-order-writes.js';

/**
 * Turning BOQ lines into purchase-order lines.
 *
 * **This is procurement's rule, so it lives here** — `services/host` wires the
 * two services together and must not contain a conditional about what a
 * purchase-order line made from a BOQ line looks like.
 *
 * It replaces `shootPOFromBOQItem` (`boq.js:135`) and `shootPOFromBOQItems`
 * (`:199`), and the differences are the point:
 *
 * | Legacy | Here |
 * |---|---|
 * | `INSERT INTO purchase_orders (... status, approval_status ...) VALUES (..., 'Approved', 'Approved', ...)` (`:174`, `:253`) | The order is created by `createPurchaseOrder`, which writes `'draft'`. **There is no path that creates an approved order.** |
 * | `payload.poValue` becomes the order value when supplied (`:170`) | No caller supplies a figure. Totals come from the lines |
 * | `Number(item.cost_rate \|\| item.rate \|\| 0)` (`:233`) | Refused upstream if the cost is unknown — see `loadOrderableBoqLines` (BOQ-06) |
 * | `tax_pct: 18` hardcoded (`:244`) | The caller supplies the rate, as on any other order. CA-16 is open on what it should be for a works contract, and hardcoding it here would be answering that by inference |
 * | Gated by `requireAuth`, which checks `session.email` is truthy (`AuthService.ts:17-21`) | Behind the tenant middleware, and the order enters the ordinary approval chain |
 */

const QUANTITY_SCALE = 1_000_000n;

export interface OrderableLine {
  readonly id: string;
  readonly description: string;
  readonly uom: string;
  readonly quantityMicros: bigint;
  readonly costRate: bigint;
}

/**
 * One GST rate for the whole selection.
 *
 * BOQ lines do not carry a tax rate, so it cannot come from them. It is supplied
 * per request rather than per line because that is what the data supports today;
 * per-line rates become meaningful once CA-16 settles what applies to a works
 * contract, and guessing a per-line default now would be the same mistake as the
 * legacy's hardcoded 18.
 */
export function purchaseOrderLinesFromBoq(
  lines: readonly OrderableLine[],
  gstRateBp: number,
): PurchaseOrderLineInputLike[] {
  return lines.map((line) => ({
    description: line.description,
    // BOQ lines carry no HSN/SAC. Empty rather than invented: an HSN code
    // decides a tax rate, and a wrong one is a filing error.
    hsnSac: '',
    quantityWhole: Number(line.quantityMicros / QUANTITY_SCALE),
    quantityMillionths: Number(line.quantityMicros % QUANTITY_SCALE),
    // The cost rate, never the client-facing one.
    unitRate: line.costRate.toString(),
    gstRate: gstRateBp,
    boqItemId: line.id,
  }));
}

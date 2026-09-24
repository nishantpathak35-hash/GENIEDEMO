import type { BasisPoints, Paise } from '@cog/contracts';
import { ZERO, add, mulRate, roundToPaise, sum } from '@cog/money';

/**
 * The purchase order aggregate.
 *
 * **This is a replacement, not a port.** Every decision below answers a defect
 * ADR-0014 or TOPOLOGY already classifies as blocking, so there is no
 * "port verbatim first" commit to precede it — there is no correct prior
 * behaviour to preserve:
 *
 * | Legacy | Why it is not ported |
 * |---|---|
 * | `write.js:55` trusts a client-supplied `gst_amount` | Rule 3: the server computes every monetary figure |
 * | `write.js:157` trusts a client-supplied line `amount` | Same, and worse — it is the line total itself |
 * | `po_no` is a mutable primary key cascaded across five tables by loose UPDATEs with no transaction | An identity defect; TOPOLOGY lists name-keying as blocking the rebuild |
 * | `financiallyChanged` compares money with `> 0.5` | A float tolerance that exists only because money was `REAL`. With BIGINT paise the comparison is exact |
 * | Optimistic locking applies only when the client sends `expectedVersion` | The client decides whether concurrency control happens |
 *
 * The *arithmetic* — quantity × rate, a GST percentage, TDS on the subtotal
 * excluding GST — is ported faithfully and goes through `packages/money` with a
 * named rounding boundary.
 */

/** A quantity, in millionths of a unit. 12.375 sqm is 12_375_000. */
declare const quantityBrand: unique symbol;
export type Quantity = bigint & { readonly [quantityBrand]: 'Quantity' };

/** Scale factor: six decimal places. */
const QUANTITY_SCALE = 1_000_000n;

export function quantity(whole: bigint, millionths = 0n): Quantity {
  if (millionths < 0n || millionths >= QUANTITY_SCALE) {
    throw new RangeError('quantity fraction must be in [0, 1_000_000)');
  }
  return (whole * QUANTITY_SCALE + (whole < 0n ? -millionths : millionths)) as Quantity;
}

export interface PurchaseOrderLine {
  readonly description: string;
  readonly hsnSac: string;
  readonly quantity: Quantity;
  /** Price for one unit. */
  readonly unitRate: Paise;
  /** GST rate for this line. Supplied by the caller; never inferred here. */
  readonly gstRate: BasisPoints;
  /**
   * Which trade this line is buying, when the caller says.
   *
   * The key the rate-contract check matches on. Like `boqItemId` it is
   * provenance rather than arithmetic — nothing in this module reads it and it
   * takes no part in any total. `undefined` means the line names no trade, so
   * it is measured against nothing, which is an honest absence rather than a
   * pass.
   */
  readonly tradeCode?: string | undefined;
  /**
   * The BOQ line this was ordered against, when it came from one.
   *
   * Provenance, not arithmetic: nothing in this module reads it, and it takes
   * no part in any total. It is here so a line carries where it came from
   * through `applyEdit` rather than being dropped on the first edit.
   */
  readonly boqItemId?: string | undefined;
}

export interface LineTotals {
  /** quantity × unitRate, rounded to paise. */
  readonly taxable: Paise;
  /** GST on this line, at paise precision — NOT rounded to the rupee. */
  readonly gst: Paise;
}

/**
 * Line value = quantity × unit rate.
 *
 * `mulRatio` is the only multiplication of money in the system, and a quantity
 * is not a rate — so the quantity is expressed as an exact rational
 * (`quantity / 1_000_000`) and handed to it. Nothing here multiplies a bigint
 * by a number, which the type system would refuse anyway.
 *
 * Rounded to **paise**, not to the rupee. Sec 170 rounds per invoice per tax
 * head; applying it per line drifts without bound in the line count — forty
 * lines of ₹5.00 at 9% give ₹0 each against ₹18 for the invoice.
 */
export function lineTotals(line: PurchaseOrderLine): LineTotals {
  if (line.quantity < 0n) throw new RangeError('quantity must not be negative');

  const taxable = mulRateByQuantity(line.unitRate, line.quantity);
  const gst = mulRate(taxable, line.gstRate, roundToPaise);
  return { taxable, gst };
}

/** quantity × unit rate, as an exact rational, rounded once to paise. */
function mulRateByQuantity(unitRate: Paise, qty: Quantity): Paise {
  return roundToPaise(unitRate * qty, QUANTITY_SCALE);
}

export interface PurchaseOrderTotals {
  readonly taxable: Paise;
  /** Sum of per-line GST at paise precision. Rounding to the rupee per head
   *  happens at the invoice, in `services/finance`, not here. */
  readonly gst: Paise;
  readonly gross: Paise;
}

/**
 * Totals for the whole order.
 *
 * Computed from the lines, always. There is no path by which a caller supplies
 * a total — which is the entire point, and the difference between this and
 * `write.js`.
 */
export function purchaseOrderTotals(lines: readonly PurchaseOrderLine[]): PurchaseOrderTotals {
  const totals = lines.map(lineTotals);
  const taxable = sum(totals.map((t) => t.taxable));
  const gst = sum(totals.map((t) => t.gst));
  return { taxable, gst, gross: add(taxable, gst) };
}

// ----------------------------------------------------------- the aggregate --

/**
 * Approval states.
 *
 * An explicit enum, because the legacy workflow state is substring matching on
 * a free-text column — `stage.includes('reject')` — which means "Rejected",
 * "rejected by finance" and "not rejected" are indistinguishable to the engine.
 */
export const PO_STATES = ['draft', 'pending_approval', 'approved', 'cancelled'] as const;
export type PoState = (typeof PO_STATES)[number];

const TRANSITIONS: Readonly<Record<PoState, readonly PoState[]>> = Object.freeze({
  draft: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'draft', 'cancelled'],
  approved: ['cancelled'],
  cancelled: [],
});

export function canTransition(from: PoState, to: PoState): boolean {
  return TRANSITIONS[from].includes(to);
}

export class PurchaseOrderError extends Error {
  override readonly name = 'PurchaseOrderError';
}

export interface PurchaseOrder {
  /**
   * Immutable surrogate identity. **Never the PO number.**
   *
   * The legacy primary key is the human-facing `po_no`, and `write.js` renames
   * it, cascading the new value across `po_items`, `payment_requests`,
   * `system_payments`, `manual_payments` and `po_approval_history` with loose
   * UPDATEs and no transaction. A half-completed rename leaves orphans that
   * nothing can reassociate.
   */
  readonly id: string;
  /** Human-facing, tenant-scoped, and free to change without moving anything. */
  readonly number: string;
  readonly state: PoState;
  readonly vendorId: string;
  readonly lines: readonly PurchaseOrderLine[];
  /** Incremented on every write. Concurrency control is not optional. */
  readonly version: number;
}

/**
 * Whether a change resets an approved order to draft.
 *
 * Ported faithfully from `write.js:64` in intent — a change to the money or the
 * vendor invalidates an approval — but exactly, because money is now an integer.
 * The legacy `Math.abs(a - b) > 0.5` existed only because `po_value` was a
 * float; a half-rupee tolerance on an approval gate is not a rule anyone chose.
 */
export function requiresReapproval(before: PurchaseOrder, after: PurchaseOrder): boolean {
  if (before.state !== 'approved') return false;
  if (before.vendorId !== after.vendorId) return true;
  return purchaseOrderTotals(before.lines).gross !== purchaseOrderTotals(after.lines).gross;
}

export interface ApplyEditInput {
  readonly current: PurchaseOrder;
  readonly lines: readonly PurchaseOrderLine[];
  readonly vendorId: string;
  readonly number: string;
  /** Required. The legacy version is optional, so the client chooses whether
   *  concurrency control applies to its own write. */
  readonly expectedVersion: number;
}

export function applyEdit(input: ApplyEditInput): PurchaseOrder {
  const { current, expectedVersion } = input;

  if (!Number.isInteger(expectedVersion)) {
    throw new PurchaseOrderError('expectedVersion is required');
  }
  if (expectedVersion !== current.version) {
    throw new PurchaseOrderError(
      `this purchase order was modified by someone else (expected version ${expectedVersion}, found ${current.version})`,
    );
  }
  if (current.state === 'cancelled') {
    throw new PurchaseOrderError('a cancelled purchase order cannot be edited');
  }
  if (input.lines.length === 0) {
    throw new PurchaseOrderError('a purchase order must have at least one line');
  }

  const next: PurchaseOrder = {
    ...current,
    number: input.number,
    vendorId: input.vendorId,
    lines: input.lines,
    version: current.version + 1,
  };

  return requiresReapproval(current, next) ? { ...next, state: 'draft' } : next;
}

export function transition(po: PurchaseOrder, to: PoState): PurchaseOrder {
  if (!canTransition(po.state, to)) {
    throw new PurchaseOrderError(`cannot move a purchase order from ${po.state} to ${to}`);
  }
  return { ...po, state: to, version: po.version + 1 };
}

export { ZERO };

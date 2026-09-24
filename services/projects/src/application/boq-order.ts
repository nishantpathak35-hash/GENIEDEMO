import type { TxLike } from './boq-writes.js';

/**
 * Reading BOQ lines so a purchase order can be raised against them.
 *
 * **This lives in `projects` because the rule below is projects' rule**, not the
 * composition root's: what makes a BOQ line orderable, and at what rate. The
 * endpoint that creates the order is in `services/host`, because it needs both
 * this and `procurement` and no service may import another — but host only
 * wires the two together. There is no conditional about BOQ semantics there.
 */

export class BoqLineNotOrderable extends Error {
  override readonly name = 'BoqLineNotOrderable';
}

export interface OrderableBoqLine {
  readonly id: string;
  readonly description: string;
  readonly uom: string;
  readonly quantityMicros: bigint;
  /** What it costs us, per unit, in paise. Never the client-facing rate. */
  readonly costRate: bigint;
}

/**
 * Load BOQ lines that a purchase order may be raised against.
 *
 * **A line with no cost rate is refused, not defaulted.** `boq.js:233` reads
 * `Number(item.cost_rate || item.rate || 0)` — falling back to the *client-facing*
 * rate when the cost is unknown, and then to zero. So the legacy raises purchase
 * orders at the selling price, or at nothing, and neither is visible to whoever
 * approves it.
 *
 * `cost_rate` is NULL for UNKNOWN here on purpose (BOQ-02): a BOQ line whose
 * cost nobody has established has no defensible purchase-order rate, and
 * inventing one is what `BoqView.js:137`'s 78% and `boq.js:110`'s 80% both do.
 * Refusing is the only answer that does not put a fabricated number in front of
 * an approver. Recorded as **BOQ-06**.
 */
export async function loadOrderableBoqLines(
  tx: TxLike,
  projectId: string,
  itemIds: readonly string[],
): Promise<OrderableBoqLine[]> {
  if (itemIds.length === 0) throw new BoqLineNotOrderable('no BOQ lines were named');

  const rows = await tx.query<{
    id: string;
    description: string;
    uom: string;
    quantity_micros: string;
    cost_rate: string | null;
  }>(
    `SELECT id, description, uom, quantity_micros::text, cost_rate::text
       FROM projects.boq_items
      WHERE project_id = $1 AND id = ANY($2::uuid[])
      ORDER BY section, item_no`,
    [projectId, [...itemIds]],
  );

  // RLS has already removed another tenant's lines, so a short result is
  // indistinguishable from a bad id — and must stay that way.
  if (rows.length !== itemIds.length) {
    throw new BoqLineNotOrderable('some of those BOQ lines do not exist in this project');
  }

  const withoutCost = rows.filter((r) => r.cost_rate === null);
  if (withoutCost.length > 0) {
    throw new BoqLineNotOrderable(
      `these BOQ lines have no cost rate, so no purchase order rate can be derived: ${withoutCost
        .map((r) => r.description)
        .join(', ')}`,
    );
  }

  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    uom: r.uom,
    quantityMicros: BigInt(r.quantity_micros),
    costRate: BigInt(r.cost_rate as string),
  }));
}

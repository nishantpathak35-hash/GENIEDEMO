import type { Paise } from '@cog/contracts';
import { fromWire } from '@cog/money';
import type { TxLike } from './approval-subject.js';

/**
 * How much of what was ordered was ordered at an agreed rate — the Rates
 * screen's two counts and the lines that can be compared to the BOQ.
 *
 * Over order lines on orders that are not cancelled. A line with a trade code
 * and no `contracted_unit_rate` was ordered where no rate contract covered its
 * vendor, trade and date; a line with no trade code cannot be checked at all,
 * and is counted as that rather than folded into either answer.
 */
export interface RateCoverage {
  readonly orderLines: number;
  readonly withoutAgreedRate: number;
  readonly withoutTradeCode: number;
  /** Lines raised from a BOQ line AND priced under a contract — the comparable set. */
  readonly linked: ReadonlyArray<{ readonly boqItemId: string; readonly contractedUnitRate: Paise }>;
}

export async function rateCoverage(tx: TxLike): Promise<RateCoverage> {
  const [counts] = await tx.query<{ lines: number; no_agreed: number; no_trade: number }>(
    `SELECT count(*)::int AS lines,
            count(*) FILTER (WHERE l.trade_code IS NOT NULL AND l.contracted_unit_rate IS NULL)::int AS no_agreed,
            count(*) FILTER (WHERE l.trade_code IS NULL)::int AS no_trade
       FROM procurement.purchase_order_lines l
       JOIN procurement.purchase_orders p ON p.tenant_id = l.tenant_id AND p.id = l.purchase_order_id
      WHERE p.state <> 'cancelled'`,
  );
  const linked = await tx.query<{ boq_item_id: string; contracted_unit_rate: string }>(
    `SELECT l.boq_item_id, l.contracted_unit_rate::text AS contracted_unit_rate
       FROM procurement.purchase_order_lines l
       JOIN procurement.purchase_orders p ON p.tenant_id = l.tenant_id AND p.id = l.purchase_order_id
      WHERE p.state <> 'cancelled'
        AND l.boq_item_id IS NOT NULL
        AND l.contracted_unit_rate IS NOT NULL`,
  );
  return {
    orderLines: counts?.lines ?? 0,
    withoutAgreedRate: counts?.no_agreed ?? 0,
    withoutTradeCode: counts?.no_trade ?? 0,
    linked: linked.map((r) => ({ boqItemId: r.boq_item_id, contractedUnitRate: fromWire(r.contracted_unit_rate) })),
  };
}

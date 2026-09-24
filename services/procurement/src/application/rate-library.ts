import type { Paise } from '@cog/contracts';
import { excessBasisPoints } from '@cog/money';
import type { TxLike } from './approval-subject.js';

/**
 * The rate library — every agreed rate on file, each with what was last
 * ordered against it (`docs/design/07-buying.html`, Buying › Rates: "agreed
 * rate against what was last ordered and what the BOQ carries").
 *
 * An item is one row of one active contract: a vendor, a trade, a
 * description, a rate and its dates. "Last ordered" is the newest order line
 * naming the same vendor and trade on a live order — keyed by id and by the
 * trade code the contract check itself matches on, never by the item's
 * description (the legacy's `LIKE '%…%'` identity is the thing this product
 * exists to not do). Where no line has been ordered, the row says so.
 *
 * `lastOrderedBoqItemId` is a pointer for the composition root: the BOQ cost
 * rate that line was raised from lives in projects, which this service does
 * not read (M1/D5). `excessBp` — last ordered against agreed — is the one
 * division, in `packages/money`, signed: above is positive.
 */
export interface RateLibraryRow {
  readonly itemId: string;
  readonly contractId: string;
  readonly contractNumber: string;
  readonly vendorId: string;
  readonly vendorName: string;
  readonly tradeCode: string;
  readonly description: string;
  readonly uom: string;
  readonly agreedRate: string;
  readonly validFrom: string;
  readonly validTo: string;
  readonly lastOrdered: {
    readonly orderId: string;
    readonly orderNumber: string;
    readonly unitRate: string;
    readonly on: string;
    readonly boqItemId: string | null;
  } | null;
  readonly excessBp: number | null;
}

export interface RateLibraryFilters {
  readonly vendorId?: string;
  readonly tradeCode?: string;
}

export async function rateLibrary(tx: TxLike, filters: RateLibraryFilters = {}): Promise<readonly RateLibraryRow[]> {
  const rows = await tx.query<{
    item_id: string;
    contract_id: string;
    contract_number: string;
    vendor_id: string;
    vendor_name: string;
    trade_code: string;
    description: string;
    uom: string;
    contract_rate: string;
    valid_from: string;
    valid_to: string;
    order_id: string | null;
    order_number: string | null;
    unit_rate: string | null;
    ordered_on: string | null;
    boq_item_id: string | null;
  }>(
    `SELECT i.id AS item_id, c.id AS contract_id, c.number AS contract_number,
            i.vendor_id, v.name AS vendor_name, i.trade_code, i.description, i.uom,
            i.contract_rate::text AS contract_rate,
            i.valid_from::text AS valid_from, i.valid_to::text AS valid_to,
            lo.order_id, lo.order_number, lo.unit_rate, lo.ordered_on, lo.boq_item_id
       FROM procurement.rate_contract_items i
       JOIN procurement.rate_contracts c ON c.tenant_id = i.tenant_id AND c.id = i.contract_id
       JOIN procurement.vendors v ON v.tenant_id = i.tenant_id AND v.id = i.vendor_id
       LEFT JOIN LATERAL (
         SELECT p.id AS order_id, p.number AS order_number, l.unit_rate::text AS unit_rate,
                p.created_at::date::text AS ordered_on, l.boq_item_id
           FROM procurement.purchase_order_lines l
           JOIN procurement.purchase_orders p ON p.tenant_id = l.tenant_id AND p.id = l.purchase_order_id
          WHERE p.vendor_id = i.vendor_id AND l.trade_code = i.trade_code AND p.state <> 'cancelled'
          ORDER BY p.created_at DESC, l.line_no DESC
          LIMIT 1
       ) lo ON TRUE
      WHERE c.status = 'active'
        AND ($1::uuid IS NULL OR i.vendor_id = $1)
        AND ($2::text IS NULL OR i.trade_code = $2)
      ORDER BY i.trade_code, i.description, v.name`,
    [filters.vendorId ?? null, filters.tradeCode === undefined ? null : filters.tradeCode.toUpperCase()],
  );
  return rows.map((r) => {
    const agreed = BigInt(r.contract_rate) as Paise;
    const lastOrdered =
      r.order_id === null || r.order_number === null || r.unit_rate === null || r.ordered_on === null
        ? null
        : { orderId: r.order_id, orderNumber: r.order_number, unitRate: r.unit_rate, on: r.ordered_on, boqItemId: r.boq_item_id };
    return {
      itemId: r.item_id,
      contractId: r.contract_id,
      contractNumber: r.contract_number,
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      tradeCode: r.trade_code,
      description: r.description,
      uom: r.uom,
      agreedRate: r.contract_rate,
      validFrom: r.valid_from,
      validTo: r.valid_to,
      lastOrdered,
      excessBp: lastOrdered === null || agreed <= 0n ? null : excessBasisPoints(agreed, BigInt(lastOrdered.unitRate) as Paise),
    };
  });
}

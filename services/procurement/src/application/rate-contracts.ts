import { randomUUID } from 'node:crypto';
import type { Paise, TenantContext } from '@cog/contracts';
import { excessBasisPoints } from '@cog/money';
import { finishPage, keyset, type PageQuery } from '@cog/service-kit';
import type { TxLike } from './approval-subject.js';

/**
 * Vendor rate contracts — what THIS vendor charges for THIS trade, and the
 * deviation check that gives the table a point.
 *
 * The rung that was missing from a ladder that was otherwise complete: the trade
 * catalogue says what categories of work exist, the BOQ says what we quote the
 * client, a purchase order says what we actually pay, and nothing said what was
 * agreed in between. Found by the port ledger rather than by any document.
 *
 * **A replacement, not a port.** `rate-contracts.js` carries three defects that
 * make its behaviour the wrong thing to preserve:
 *
 * | Legacy | Why it is not ported |
 * |---|---|
 * | `getMatchingRateContractsForItem:273` splits the item name into words and scores `description.includes(word)`, then returns every match sorted by score | Which contract a purchase order is measured against is decided by string similarity. Matching here is an exact equality on vendor, trade and date, and returns one row or none |
 * | The same query filters on `c.status = 'Active'` and **never compares `valid_from`/`valid_to`**, which it stores and displays | An expired contract goes on matching forever. Validity is in the predicate here, and the exclusion constraint makes "the contracted rate" a function |
 * | `createRateContract:136` sets `const id = rcNumber` — the typed code IS the primary key, uppercased | Identity is a surrogate uuid; the number is a label somebody may correct |
 *
 * Every invented default is dropped rather than carried: `gst_pct 18`,
 * `min_qty 1`, `lead_days 3`, `valid_to '2026-12-31'`, `payment_terms
 * '30 Days Net'`, `category 'General'`, `uom 'Sq.Ft'`. The 18 is a statutory
 * value nobody has verified.
 */

const UNIQUE_VIOLATION = '23505';
const EXCLUSION_VIOLATION = '23P01';
const FK_VIOLATION = '23503';

export class RateContractNotFound extends Error {
  override readonly name = 'RateContractNotFound';
}

export class DuplicateContractNumber extends Error {
  override readonly name = 'DuplicateContractNumber';
}

/** Two rates for one vendor, one trade, one day. The exclusion constraint. */
export class OverlappingContractRate extends Error {
  override readonly name = 'OverlappingContractRate';
}

export class UnknownVendor extends Error {
  override readonly name = 'UnknownVendor';
}

function codeOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null
    ? (error as { code?: string }).code
    : undefined;
}

export interface RateContractItemInput {
  /** Uppercased here so `elec` and `ELEC` cannot become two rates. */
  readonly tradeCode: string;
  readonly description: string;
  readonly uom: string;
  /** PAISE, as the digit-only wire string. */
  readonly contractRate: string;
  readonly validFrom: string;
  readonly validTo: string;
}

export interface RateContractInput {
  readonly vendorId: string;
  readonly number: string;
  readonly title: string;
  readonly status?: 'draft' | 'active' | 'withdrawn' | undefined;
  readonly paymentTerms?: string | null | undefined;
  readonly notes?: string | undefined;
  readonly items: readonly RateContractItemInput[];
}

export interface RateContractItemRow {
  readonly id: string;
  readonly tradeCode: string;
  readonly description: string;
  readonly uom: string;
  readonly contractRatePaise: string;
  readonly validFrom: string;
  readonly validTo: string;
}

export interface RateContractRow {
  readonly id: string;
  readonly vendorId: string;
  readonly vendorName: string;
  readonly number: string;
  readonly title: string;
  readonly status: string;
  readonly paymentTerms: string | null;
  readonly notes: string;
  readonly items: readonly RateContractItemRow[];
}

// ------------------------------------------------------------------- reads --

export interface RateContractListFilters {
  readonly vendorId?: string;
  readonly tradeCode?: string;
  readonly status?: string;
}

export interface RateContractListPage {
  readonly items: readonly Omit<RateContractRow, 'items'>[];
  readonly nextCursor: string | null;
  readonly prevCursor: string | null;
  readonly count: number;
}

/**
 * Contracts, `number` ASC (the human-facing identifier is also the sort —
 * there is no `created_at` reason to prefer over it). `tradeCode` is not a
 * column on the contract — it is on its items — so that filter is an EXISTS,
 * not a join column: a contract can carry several trades and should appear
 * once, not once per matching item.
 */
export async function listRateContracts(
  tx: TxLike,
  page: PageQuery,
  filters: RateContractListFilters = {},
): Promise<RateContractListPage> {
  // No `WHERE tenant_id`: RLS applies it.
  const params: unknown[] = [filters.vendorId ?? null, filters.status ?? null, filters.tradeCode ?? null];
  const where = `($1::uuid IS NULL OR c.vendor_id = $1)
               AND ($2::text IS NULL OR c.status = $2)
               AND ($3::text IS NULL OR EXISTS (
                     SELECT 1 FROM procurement.rate_contract_items i
                      WHERE i.contract_id = c.id AND i.trade_code = $3
                   ))`;
  const k = keyset(page, 'c.number', 'c.id', 'text', false, params.length + 1);

  const rows = await tx.query<{
    id: string;
    vendor_id: string;
    vendor_name: string;
    number: string;
    title: string;
    status: string;
    payment_terms: string | null;
    notes: string;
  }>(
    `SELECT c.id, c.vendor_id, v.name AS vendor_name, c.number, c.title,
            c.status, c.payment_terms, c.notes
       FROM procurement.rate_contracts c
       JOIN procurement.vendors v ON v.tenant_id = c.tenant_id AND v.id = c.vendor_id
      WHERE ${where}
        AND ${k.where}
      ORDER BY ${k.orderBy}
      LIMIT $${params.length + k.params.length + 1}`,
    [...params, ...k.params, page.limit + 1],
  );
  const [counted] = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM procurement.rate_contracts c WHERE ${where}`,
    params,
  );
  const paged = finishPage(rows, page, (r) => ({ key: r.number, id: r.id }));
  return {
    items: paged.items.map((r) => ({
      id: r.id,
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      number: r.number,
      title: r.title,
      status: r.status,
      paymentTerms: r.payment_terms,
      notes: r.notes,
    })),
    nextCursor: paged.nextCursor,
    prevCursor: paged.prevCursor,
    count: counted?.n ?? 0,
  };
}

/** In-force count over every contract — the screen's stat, never one page. */
export async function activeRateContractCount(tx: TxLike): Promise<number> {
  const rows = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM procurement.rate_contracts WHERE status = 'active'`,
  );
  return rows[0]?.n ?? 0;
}

/**
 * Agreed rates ending soon: the in-force contracts whose validity runs out
 * on or before `by`, counted as CONTRACTS (a contract carries several items
 * and ends once). The vendors screen's stat and the sidebar's count — a
 * deadline with a name attached, in place of "rates agreed this quarter",
 * which nobody acted on (VALUE-MAP, Buying › Vendors).
 */
export async function rateContractsEndingBy(tx: TxLike, by: string): Promise<number> {
  const rows = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM procurement.rate_contracts c
      WHERE c.status = 'active'
        AND EXISTS (SELECT 1 FROM procurement.rate_contract_items i
                     WHERE i.tenant_id = c.tenant_id AND i.contract_id = c.id
                       AND i.valid_to >= CURRENT_DATE AND i.valid_to <= $1::date)`,
    [by],
  );
  return rows[0]?.n ?? 0;
}

export async function getRateContract(tx: TxLike, id: string): Promise<RateContractRow> {
  const rows = await tx.query<{
    id: string;
    vendor_id: string;
    vendor_name: string;
    number: string;
    title: string;
    status: string;
    payment_terms: string | null;
    notes: string;
  }>(
    `SELECT c.id, c.vendor_id, v.name AS vendor_name, c.number, c.title,
            c.status, c.payment_terms, c.notes
       FROM procurement.rate_contracts c
       JOIN procurement.vendors v ON v.tenant_id = c.tenant_id AND v.id = c.vendor_id
      WHERE c.id = $1`,
    [id],
  );
  const head = rows[0];
  if (head === undefined) throw new RateContractNotFound(id);

  const items = await tx.query<{
    id: string;
    trade_code: string;
    description: string;
    uom: string;
    contract_rate: string;
    valid_from: string;
    valid_to: string;
  }>(
    `SELECT id, trade_code, description, uom, contract_rate::text AS contract_rate,
            valid_from::text AS valid_from, valid_to::text AS valid_to
       FROM procurement.rate_contract_items
      WHERE contract_id = $1
      ORDER BY trade_code, valid_from`,
    [id],
  );

  return {
    id: head.id,
    vendorId: head.vendor_id,
    vendorName: head.vendor_name,
    number: head.number,
    title: head.title,
    status: head.status,
    paymentTerms: head.payment_terms,
    notes: head.notes,
    items: items.map((i) => ({
      id: i.id,
      tradeCode: i.trade_code,
      description: i.description,
      uom: i.uom,
      contractRatePaise: i.contract_rate,
      validFrom: i.valid_from,
      validTo: i.valid_to,
    })),
  };
}

// ------------------------------------------------------------------ writes --

export async function createRateContract(
  tx: TxLike,
  ctx: TenantContext,
  input: RateContractInput,
): Promise<{ readonly id: string }> {
  const id = randomUUID();

  try {
    await tx.query(
      `INSERT INTO procurement.rate_contracts
         (tenant_id, id, vendor_id, number, title, status, payment_terms, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        ctx.tenantId,
        id,
        input.vendorId,
        input.number.trim(),
        input.title.trim(),
        input.status ?? 'draft',
        // NULL, never '30 Days Net'.
        input.paymentTerms ?? null,
        input.notes ?? '',
        ctx.principal.id,
      ],
    );
  } catch (error) {
    if (codeOf(error) === UNIQUE_VIOLATION) throw new DuplicateContractNumber(input.number);
    if (codeOf(error) === FK_VIOLATION) throw new UnknownVendor(input.vendorId);
    throw error;
  }

  await replaceItems(tx, ctx, id, input.vendorId, input.items);
  return { id };
}

export async function updateRateContract(
  tx: TxLike,
  ctx: TenantContext,
  id: string,
  input: Omit<RateContractInput, 'vendorId'>,
): Promise<void> {
  const rows = await tx.query<{ vendor_id: string }>(
    `UPDATE procurement.rate_contracts
        SET number = $2, title = $3, status = $4, payment_terms = $5, notes = $6
      WHERE id = $1
      RETURNING vendor_id`,
    [
      id,
      input.number.trim(),
      input.title.trim(),
      input.status ?? 'draft',
      input.paymentTerms ?? null,
      input.notes ?? '',
    ],
  );
  const row = rows[0];
  if (row === undefined) throw new RateContractNotFound(id);

  await replaceItems(tx, ctx, id, row.vendor_id, input.items);
}

/**
 * Rates are replaced wholesale, which is safe here because the exclusion
 * constraint is checked at statement end: deleting and re-inserting a period
 * cannot transiently collide with itself.
 */
async function replaceItems(
  tx: TxLike,
  ctx: TenantContext,
  contractId: string,
  vendorId: string,
  items: readonly RateContractItemInput[],
): Promise<void> {
  await tx.query(`DELETE FROM procurement.rate_contract_items WHERE contract_id = $1`, [
    contractId,
  ]);

  for (const item of items) {
    try {
      await tx.query(
        `INSERT INTO procurement.rate_contract_items
           (tenant_id, id, contract_id, vendor_id, trade_code, description, uom,
            contract_rate, valid_from, valid_to)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          ctx.tenantId,
          randomUUID(),
          contractId,
          vendorId,
          // Uppercased HERE, not asked of the caller. `projects.trade_packages`
          // uppercases its codes the same way, and a lowercase code on this side
          // would simply never match — a deviation check that silently finds
          // nothing looks exactly like a feature nobody uses.
          item.tradeCode.trim().toUpperCase(),
          item.description.trim(),
          item.uom.trim(),
          item.contractRate,
          item.validFrom,
          item.validTo,
        ],
      );
    } catch (error) {
      if (codeOf(error) === EXCLUSION_VIOLATION) {
        throw new OverlappingContractRate(
          `${item.tradeCode.toUpperCase()} already has a contracted rate for this vendor ` +
            `covering ${item.validFrom} to ${item.validTo}`,
        );
      }
      throw error;
    }
  }
}

export async function deleteRateContract(tx: TxLike, id: string): Promise<void> {
  const rows = await tx.query<{ id: string }>(
    `DELETE FROM procurement.rate_contracts WHERE id = $1 RETURNING id`,
    [id],
  );
  if (rows[0] === undefined) throw new RateContractNotFound(id);
}

// -------------------------------------------------------- the deviation check --

export interface ResolvedRate {
  readonly itemId: string;
  readonly contractRatePaise: string;
}

/**
 * The contracted rate for one vendor, one trade, on one day — or nothing.
 *
 * **One row or none, never a list.** The exclusion constraint on
 * `rate_contract_items` is what makes that true rather than hopeful: at most one
 * row can cover a given vendor, trade and date, so there is no `ORDER BY` here
 * deciding what a purchase order gets measured against.
 *
 * Only `active` contracts count. A `draft` is a negotiation and a `withdrawn`
 * one is history; measuring a live purchase order against either would report a
 * deviation from a price nobody is owed.
 *
 * **Reads no other service.** `trade_code` is a soft reference to
 * `projects.trade_packages.code`, and this query never resolves it — it compares
 * two strings in one schema. That is what keeps the boundary intact while the
 * check still works.
 */
export async function resolveContractedRate(
  tx: TxLike,
  vendorId: string,
  tradeCode: string,
  onDate: string,
): Promise<ResolvedRate | null> {
  const rows = await tx.query<{ id: string; contract_rate: string }>(
    `SELECT i.id, i.contract_rate::text AS contract_rate
       FROM procurement.rate_contract_items i
       JOIN procurement.rate_contracts c
         ON c.tenant_id = i.tenant_id AND c.id = i.contract_id
      WHERE i.vendor_id = $1
        AND i.trade_code = $2
        AND c.status = 'active'
        AND $3::date BETWEEN i.valid_from AND i.valid_to`,
    [vendorId, tradeCode.toUpperCase(), onDate],
  );

  const row = rows[0];
  return row === undefined
    ? null
    : { itemId: row.id, contractRatePaise: row.contract_rate };
}

export interface RateDeviation {
  readonly purchaseOrderId: string;
  readonly purchaseOrderNumber: string;
  readonly vendorName: string;
  readonly lineNo: number;
  readonly description: string;
  readonly tradeCode: string;
  readonly contractedUnitRatePaise: string;
  readonly actualUnitRatePaise: string;
  /** Positive means priced ABOVE contract. Basis points. */
  readonly excessBp: number;
}

export interface RateDeviationFilters {
  readonly vendorId?: string;
  readonly tradeCode?: string;
  /** One order's lines — the approvals pane's "Rates" row. */
  readonly purchaseOrderId?: string;
}

export interface RateDeviationListPage {
  readonly items: readonly RateDeviation[];
  readonly nextCursor: string | null;
  readonly prevCursor: string | null;
  readonly count: number;
}

/**
 * Every purchase-order line priced above its contracted rate.
 *
 * The reason the tables exist. A rate contract nobody compares against is a
 * filing cabinet; this is the query that makes it a control.
 *
 * Lines with no `contracted_unit_rate` are absent from this list rather than
 * reported as compliant — there was nothing to compare, which is a different
 * statement from "the price was fine".
 *
 * This is a computed join, not a table with its own `created_at` — it pages
 * on the ORDER's `created_at`, tiebroken by the LINE's own id (the line has
 * one; the order does not distinguish its lines from each other otherwise).
 */
export async function listRateDeviations(
  tx: TxLike,
  page: PageQuery,
  filters: RateDeviationFilters = {},
): Promise<RateDeviationListPage> {
  const params: unknown[] = [filters.vendorId ?? null, filters.tradeCode ?? null, filters.purchaseOrderId ?? null];
  const where = `($1::uuid IS NULL OR p.vendor_id = $1)
               AND ($2::text IS NULL OR l.trade_code = $2)
               AND ($3::uuid IS NULL OR l.purchase_order_id = $3)
               AND l.contracted_unit_rate IS NOT NULL
               AND l.unit_rate > l.contracted_unit_rate`;
  const k = keyset(page, 'p.created_at', 'l.id', 'timestamptz', true, params.length + 1);

  const rows = await tx.query<{
    purchase_order_id: string;
    number: string;
    vendor_name: string;
    line_no: number;
    description: string;
    trade_code: string;
    contracted_unit_rate: string;
    unit_rate: string;
    created_at: string;
    line_id: string;
  }>(
    `SELECT l.purchase_order_id, p.number, v.name AS vendor_name, l.line_no,
            l.description, l.trade_code,
            l.contracted_unit_rate::text AS contracted_unit_rate,
            l.unit_rate::text AS unit_rate,
            p.created_at::text AS created_at, l.id AS line_id
       FROM procurement.purchase_order_lines l
       JOIN procurement.purchase_orders p
         ON p.tenant_id = l.tenant_id AND p.id = l.purchase_order_id
       JOIN procurement.vendors v ON v.tenant_id = p.tenant_id AND v.id = p.vendor_id
      WHERE ${where}
        AND ${k.where}
      ORDER BY ${k.orderBy}
      LIMIT $${params.length + k.params.length + 1}`,
    [...params, ...k.params, page.limit + 1],
  );
  const [counted] = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM procurement.purchase_order_lines l
       JOIN procurement.purchase_orders p
         ON p.tenant_id = l.tenant_id AND p.id = l.purchase_order_id
      WHERE ${where}`,
    params,
  );
  const paged = finishPage(rows, page, (r) => ({ key: r.created_at, id: r.line_id }));
  return {
    items: paged.items.map((r) => ({
      purchaseOrderId: r.purchase_order_id,
      purchaseOrderNumber: r.number,
      vendorName: r.vendor_name,
      lineNo: r.line_no,
      description: r.description,
      tradeCode: r.trade_code,
      contractedUnitRatePaise: r.contracted_unit_rate,
      actualUnitRatePaise: r.unit_rate,
      // The one division, in `packages/money`, exact and truncated toward zero.
      excessBp: excessBasisPoints(
        BigInt(r.contracted_unit_rate) as Paise,
        BigInt(r.unit_rate) as Paise,
      ),
    })),
    nextCursor: paged.nextCursor,
    prevCursor: paged.prevCursor,
    count: counted?.n ?? 0,
  };
}

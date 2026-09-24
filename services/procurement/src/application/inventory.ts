import { randomUUID } from 'node:crypto';
import { roundToPaise } from '@cog/money';
import type { TenantContext } from '@cog/contracts';
import { finishPage, keyset, type PageQuery } from '@cog/service-kit';
import type { TxLike } from './approval-subject.js';

/**
 * Stock.
 *
 * **A replacement, and the shape of the data is the replacement.** The legacy
 * holds stock as `inventory_items.quantity_on_hand REAL`, read-modify-written by
 * `recordGRN` (`inventory.js:70`) and `issueMaterial` (`:126`). Here it is the
 * sum of an append-only ledger, and the balance is never stored.
 *
 * | Legacy | Why it is not ported |
 * |---|---|
 * | `createTransfer` (`inventory.js:143`) inserts an `inventory_transfers` row and **never touches `inventory_items`** — stock does not move (INV-01) | A transfer here is two ledger rows sharing a `transfer_id`, written in one transaction. Moving stock out without moving it in is unrepresentable |
 * | `const newQty = Number(existing.quantity_on_hand \|\| 0) + qty` then write back (`:69-73`) | Two concurrent issues both read 100 and both write 90. Here every movement is an INSERT and the balance is a SUM, so nothing is overwritten |
 * | `quantity_on_hand REAL` (`migrations.js:436`) | Integer millionths. `InventoryView.js:79` computes `quantity * unitPrice` for valuation, which puts a float on the money path |
 * | `id = 'STN-' + Math.floor(400 + Math.random() * 500)` (`:153`) against a `TEXT PRIMARY KEY` | A 500-value space: a collision is more likely than not after ~26 transfers, and the insert then throws. Ids are uuids |
 * | `listTransfers(filters)` accepts filters and applies none (`:180`) | Every read is scoped by RLS, and the project filter is applied where one is given |
 * | Any authenticated user may issue stock (`:95`) | Behind the tenant middleware. A role gate is PO-13, like everywhere else |
 *
 * **Valuation — INV-03, answered provisionally in migration 0051.**
 *
 * It was absent through M5 for a stated reason: `InventoryView.js:79` sums
 * `quantity * unitPrice` in the browser against a `unit_price` column every GRN
 * overwrites, which is neither a cost basis nor a moving average, just the last
 * price paid. The repaired legacy tree answers the question with code rather
 * than a claim — `app/lib/api/inventory.js:61` recomputes a moving weighted
 * average on every receipt — and that answer is adopted here, provisionally,
 * because a costing method is an accounting policy rather than a code detail.
 *
 * Three properties hold, and each is one the legacy loses:
 *
 *   1. **The ledger adds up exactly.** Value moves with the movement, in whole
 *      paise, and what stock is worth is the SUM. No average is stored, so no
 *      rounded quotient is ever multiplied back out.
 *   2. **An issue does not change the average.** It removes value in the same
 *      proportion as quantity, which is what "weighted average" means and what
 *      `inventory.js:297` does by leaving `unit_price` alone.
 *   3. **Unknown is not zero.** A movement recorded before valuation existed has
 *      `value_paise IS NULL`, and a balance containing one reports that it
 *      cannot be valued rather than reporting a smaller number.
 */

const FK_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';
const QUANTITY_SCALE = 1_000_000n;

export class StockItemNotFound extends Error {
  override readonly name = 'StockItemNotFound';
}

export class DuplicateStockItem extends Error {
  override readonly name = 'DuplicateStockItem';
}

/** Refused when a movement would take a warehouse below zero. */
export class InsufficientStock extends Error {
  override readonly name = 'InsufficientStock';
}

export class InvalidMovement extends Error {
  override readonly name = 'InvalidMovement';
}

export interface StockItemInput {
  readonly name: string;
  readonly category?: string | undefined;
  readonly uom: string;
  readonly reorderWhole?: number | undefined;
}

export interface StockBalance {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly uom: string;
  readonly warehouse: string;
  readonly quantityMicros: string;
  readonly reorderLevel: string;
  readonly belowReorder: boolean;
  /**
   * What this balance is worth, in paise, as a wire string.
   *
   * **`null` means unvaluable, and that is not the same as zero.** A balance
   * whose ledger contains a movement recorded before valuation existed cannot
   * be valued at all, and saying "0" would put a wrong number on a screen
   * rather than an absent one. The repaired legacy makes the same call in the
   * same situation — `inventory.js:336` refuses to receive a transfer with no
   * dispatch snapshot rather than guessing at its cost.
   */
  readonly valuePaise: string | null;
}

export interface MovementInput {
  readonly stockItemId: string;
  readonly warehouse: string;
  readonly quantityWhole: number;
  readonly quantityMillionths: number;
  readonly reference?: string | undefined;
  /** Receipt only: `false` leaves it at the gate until `checkInReceipt`. Absent is counted. */
  readonly checkedIn?: boolean | undefined;
  /**
   * Price per unit, in paise. Meaningful on a RECEIPT only — an issue is valued
   * at what the stock already cost, never at a price the caller supplies.
   *
   * Optional, and its absence is honest: a receipt with no price recorded makes
   * the balance unvaluable rather than free. `write.js:55` in the legacy trusts
   * a client-supplied monetary figure; here the only figure accepted is the one
   * on the receipt, and it is applied by the server.
   */
  readonly unitRatePaise?: string | undefined;
}

export interface TransferInput {
  readonly stockItemId: string;
  readonly fromWarehouse: string;
  readonly toWarehouse: string;
  readonly quantityWhole: number;
  readonly quantityMillionths: number;
  readonly reference?: string | undefined;
}

function micros(whole: number, millionths: number): bigint {
  return BigInt(whole) * QUANTITY_SCALE + BigInt(millionths);
}

export async function createStockItem(
  tx: TxLike,
  ctx: TenantContext,
  input: StockItemInput,
): Promise<{ id: string }> {
  const id = randomUUID();
  try {
    await tx.query(
      `INSERT INTO procurement.stock_items (tenant_id, id, name, category, uom, reorder_level)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        ctx.tenantId,
        id,
        input.name,
        input.category ?? 'General',
        input.uom,
        micros(input.reorderWhole ?? 0, 0),
      ],
    );
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === UNIQUE_VIOLATION) {
      throw new DuplicateStockItem(`a stock item named ${input.name} already exists`);
    }
    throw error;
  }
  return { id };
}

/**
 * Balances, per item per warehouse.
 *
 * `SUM` over the ledger. A warehouse a material has never been in does not
 * appear, which is correct — a zero balance and no history are different facts,
 * and the legacy cannot tell them apart because it stores one number per item
 * with the warehouse as an attribute of the item rather than of the movement.
 */
export interface StockItemRow {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly uom: string;
  readonly reorderLevel: string;
}

/**
 * The item DEFINITIONS, whether or not anything has ever moved.
 *
 * `listStock` groups over the movement ledger with an inner join, which is
 * right for a balance and wrong for a picker: an item defined a moment ago has
 * no movements, so it is absent from the balances — and therefore could not be
 * chosen for the receipt that would give it one. The first receipt was
 * unreachable from the screen.
 *
 * Separate rather than a LEFT JOIN on the balance query, because a left join
 * would emit a balance row with no warehouse and a null quantity, and "an item
 * that exists" is a different statement from "stock that is somewhere".
 */
export interface StockItemFilters {
  readonly q?: string;
}

export interface StockItemListPage {
  readonly items: readonly StockItemRow[];
  readonly nextCursor: string | null;
  readonly prevCursor: string | null;
  readonly count: number;
}

export async function listStockItems(
  tx: TxLike,
  page: PageQuery,
  filters: StockItemFilters = {},
): Promise<StockItemListPage> {
  const params: unknown[] = [filters.q === undefined || filters.q === '' ? null : `%${filters.q}%`];
  const where = `($1::text IS NULL OR name ILIKE $1)`;
  const k = keyset(page, 'name', 'id', 'text', false, params.length + 1);
  const rows = await tx.query<{
    id: string;
    name: string;
    category: string;
    uom: string;
    reorder_level: string;
  }>(
    `SELECT id, name, category, uom, reorder_level::text AS reorder_level
       FROM procurement.stock_items
      WHERE ${where}
        AND ${k.where}
      ORDER BY ${k.orderBy}
      LIMIT $${params.length + k.params.length + 1}`,
    [...params, ...k.params, page.limit + 1],
  );
  const [counted] = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM procurement.stock_items WHERE ${where}`,
    params,
  );
  const paged = finishPage(rows, page, (r) => ({ key: r.name, id: r.id }));
  return {
    items: paged.items.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      uom: r.uom,
      reorderLevel: r.reorder_level,
    })),
    nextCursor: paged.nextCursor,
    prevCursor: paged.prevCursor,
    count: counted?.n ?? 0,
  };
}

export interface StockFilters {
  readonly warehouse?: string;
  readonly q?: string;
  readonly belowReorder?: boolean;
}

export interface StockListPage {
  readonly items: readonly StockBalance[];
  readonly nextCursor: string | null;
  readonly prevCursor: string | null;
  readonly count: number;
}

export interface StockListSummary {
  /** Receipts recorded at the gate and not yet counted into a store. */
  readonly awaitingCheckIn: number;
  readonly balances: number;
  readonly belowReorder: number;
  readonly warehouses: readonly string[];
}

/**
 * Balances, per item per warehouse, keyed by `(item name, warehouse)` — one
 * text expression, `E'\x1f'`-joined, so the two-column order is a single
 * sortable key the cursor can carry. Item names are unique per tenant, so
 * that key is already unique per row; the balance's item id rides along as
 * the tiebreak the keyset machinery requires, not because it is needed to
 * break a tie here.
 */
export async function listStock(
  tx: TxLike,
  page: PageQuery,
  filters: StockFilters = {},
): Promise<StockListPage> {
  const params: unknown[] = [
    filters.warehouse ?? null,
    filters.q === undefined || filters.q === '' ? null : `%${filters.q}%`,
  ];
  let where = `($1::text IS NULL OR balances.warehouse = $1)
             AND ($2::text IS NULL OR balances.name ILIKE $2)`;
  if (filters.belowReorder === true) where += ` AND balances.quantity_micros < balances.reorder_level`;
  const k = keyset(page, 'balances.sort_key', 'balances.id', 'text', false, params.length + 1);

  // `bool_and(value_paise IS NOT NULL)` rather than `SUM` alone: summing over
  // a NULL silently skips it, so a balance with one unpriced receipt would
  // report the value of the rest and look complete. The flag makes the gap
  // visible and `valuePaise` becomes null. Kept as native bigint inside the
  // CTE (not cast to text) so `belowReorder=true` compares exact integers;
  // the outer SELECT casts to text once, for the wire.
  const rows = await tx.query<{
    id: string;
    name: string;
    category: string;
    uom: string;
    warehouse: string;
    quantity_micros: string;
    value_paise: string | null;
    fully_valued: boolean;
    reorder_level: string;
    awaiting_micros: string;
    level_pct: number | null;
    sort_key: string;
  }>(
    `WITH balances AS (
       SELECT i.id, i.name, i.category, i.uom, m.warehouse,
              COALESCE(SUM(m.quantity_micros) FILTER (WHERE m.checked_in_at IS NOT NULL), 0) AS quantity_micros,
              SUM(m.value_paise) FILTER (WHERE m.checked_in_at IS NOT NULL) AS value_paise,
              COALESCE(bool_and(m.value_paise IS NOT NULL) FILTER (WHERE m.checked_in_at IS NOT NULL), true)
                AS fully_valued,
              COALESCE(SUM(m.quantity_micros) FILTER (WHERE m.checked_in_at IS NULL), 0) AS awaiting_micros,
              i.reorder_level AS reorder_level,
              (i.name || E'\\x1f' || m.warehouse) AS sort_key
         FROM procurement.stock_items i
         JOIN procurement.stock_movements m ON m.stock_item_id = i.id
        GROUP BY i.id, i.name, i.category, i.uom, m.warehouse, i.reorder_level
     )
     SELECT balances.id, balances.name, balances.category, balances.uom, balances.warehouse,
            balances.quantity_micros::text AS quantity_micros,
            balances.value_paise::text     AS value_paise,
            balances.fully_valued,
            balances.reorder_level::text   AS reorder_level,
            balances.awaiting_micros::text AS awaiting_micros,
            CASE WHEN balances.reorder_level > 0
                 THEN LEAST(floor(balances.quantity_micros::numeric * 100 / balances.reorder_level), 999)::int
            END AS level_pct,
            balances.sort_key
       FROM balances
      WHERE ${where}
        AND ${k.where}
      ORDER BY ${k.orderBy}
      LIMIT $${params.length + k.params.length + 1}`,
    [...params, ...k.params, page.limit + 1],
  );
  const [counted] = await tx.query<{ n: number }>(
    `WITH balances AS (
       SELECT i.id, i.name, m.warehouse,
              COALESCE(SUM(m.quantity_micros) FILTER (WHERE m.checked_in_at IS NOT NULL), 0) AS quantity_micros,
              i.reorder_level AS reorder_level
         FROM procurement.stock_items i
         JOIN procurement.stock_movements m ON m.stock_item_id = i.id
        GROUP BY i.id, i.name, m.warehouse, i.reorder_level
     )
     SELECT count(*)::int AS n FROM balances WHERE ${where}`,
    params,
  );
  const paged = finishPage(rows, page, (r) => ({ key: r.sort_key, id: r.id }));
  return {
    items: paged.items.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      uom: r.uom,
      warehouse: r.warehouse,
      quantityMicros: r.quantity_micros,
      reorderLevel: r.reorder_level,
      belowReorder: BigInt(r.quantity_micros) < BigInt(r.reorder_level),
      levelPct: r.level_pct,
      awaitingCheckInMicros: r.awaiting_micros,
      valuePaise: r.fully_valued ? (r.value_paise ?? '0') : null,
    })),
    nextCursor: paged.nextCursor,
    prevCursor: paged.prevCursor,
    count: counted?.n ?? 0,
  };
}

/** The stock screen's stat row and site picker, over every balance, never one page. */
export async function stockSummary(tx: TxLike): Promise<StockListSummary> {
  const [row] = await tx.query<{
    balances: number;
    below_reorder: number;
    warehouses: string[];
    awaiting_check_in: number;
  }>(
    `WITH balances AS (
       SELECT m.warehouse,
              COALESCE(SUM(m.quantity_micros) FILTER (WHERE m.checked_in_at IS NOT NULL), 0) AS quantity_micros,
              i.reorder_level AS reorder_level
         FROM procurement.stock_items i
         JOIN procurement.stock_movements m ON m.stock_item_id = i.id
        GROUP BY i.id, m.warehouse, i.reorder_level
     )
     SELECT count(*)::int AS balances,
            count(*) FILTER (WHERE quantity_micros < reorder_level)::int AS below_reorder,
            COALESCE(array_agg(DISTINCT warehouse ORDER BY warehouse), ARRAY[]::text[]) AS warehouses,
            (SELECT count(*)::int FROM procurement.stock_movements
              WHERE kind = 'receipt' AND checked_in_at IS NULL) AS awaiting_check_in
       FROM balances`,
  );
  return {
    balances: row?.balances ?? 0,
    belowReorder: row?.below_reorder ?? 0,
    awaitingCheckIn: row?.awaiting_check_in ?? 0,
    warehouses: row?.warehouses ?? [],
  };
}

/** Balance for one item in one warehouse. Read inside the caller's transaction. */
async function balanceOf(
  tx: TxLike,
  stockItemId: string,
  warehouse: string,
): Promise<bigint> {
  const rows = await tx.query<{ balance: string }>(
    `SELECT COALESCE(SUM(quantity_micros), 0)::text AS balance
       FROM procurement.stock_movements
      WHERE stock_item_id = $1 AND warehouse = $2 AND checked_in_at IS NOT NULL`,
    [stockItemId, warehouse],
  );
  return BigInt(rows[0]?.balance ?? '0');
}

/**
 * What one item is worth in one warehouse, and whether that figure is complete.
 *
 * `fullyValued` is false when ANY movement in the ledger carries no value.
 * `SUM` skips a NULL silently, so without the flag a balance holding one
 * unpriced receipt would report the value of everything else and look right.
 */
async function valueOf(
  tx: TxLike,
  stockItemId: string,
  warehouse: string,
): Promise<{ value: bigint; fullyValued: boolean }> {
  const rows = await tx.query<{ value: string | null; fully_valued: boolean | null }>(
    `SELECT COALESCE(SUM(value_paise), 0)::text AS value,
            bool_and(value_paise IS NOT NULL)   AS fully_valued
       FROM procurement.stock_movements
      WHERE stock_item_id = $1 AND warehouse = $2 AND checked_in_at IS NOT NULL`,
    [stockItemId, warehouse],
  );
  return {
    value: BigInt(rows[0]?.value ?? '0'),
    // `bool_and` over no rows is NULL. An empty warehouse is vacuously valued —
    // it holds nothing, and nothing is worth nothing.
    fullyValued: rows[0]?.fully_valued ?? true,
  };
}

/**
 * The value that leaves when `qty` leaves, at the weighted average.
 *
 * **This is the whole of "weighted average" as an operation.** Value leaves in
 * the same proportion as quantity, so the average is unchanged by the movement
 * — exactly what `inventory.js:297` achieves by updating the quantity and
 * leaving `unit_price` alone.
 *
 * The division happens HERE and nowhere else: value and quantity are exact
 * integers, `value x qty / balance` is formed exactly, and `roundToPaise`
 * rounds the quotient once. No unit cost is computed, stored, or multiplied
 * back out — the rounding error of a stored average is the one thing a moving
 * average must not accumulate.
 *
 * Returns null when the balance cannot be valued, and the caller records a
 * movement with no value rather than inventing one.
 */
function valueLeaving(
  balanceValue: bigint,
  balanceQty: bigint,
  qty: bigint,
  fullyValued: boolean,
): bigint | null {
  if (!fullyValued) return null;
  if (balanceQty <= 0n) return 0n;
  // Taking everything takes exactly what is there. Special-cased so a whole
  // issue can never leave a rounding remainder behind, which would be a
  // warehouse holding zero units and a few paise.
  if (qty >= balanceQty) return balanceValue;
  return roundToPaise(balanceValue * qty, balanceQty) as bigint;
}

async function assertItem(tx: TxLike, id: string): Promise<void> {
  const rows = await tx.query<{ id: string }>(
    `SELECT id FROM procurement.stock_items WHERE id = $1`,
    [id],
  );
  if (rows[0] === undefined) throw new StockItemNotFound(`no such stock item: ${id}`);
}

/**
 * Take the item's row lock before reading a balance that is about to be spent.
 *
 * **Without this, two concurrent issues can spend the same stock.** Every
 * request runs in a plain `BEGIN`, which is READ COMMITTED, and the balance is
 * a `SUM` over an append-only ledger — so two transactions both read 100, both
 * insert -60, and both commit. The ledger then says -20 and no single statement
 * was ever wrong.
 *
 * The repaired legacy fixes the same defect differently, and the difference is
 * forced by the schema rather than chosen: it keeps a stored balance, so it can
 * write `UPDATE ... WHERE quantity_on_hand >= ?` (`inventory.js:297`) and let
 * the row lock and the predicate be the same statement. We store no balance —
 * INV-01 is that a stored running balance cannot say how it got there and
 * cannot make a transfer balance — so the row that serialises us is the ITEM,
 * locked before the sum is read.
 *
 * `FOR UPDATE` in READ COMMITTED blocks the second transaction until the first
 * commits and then re-reads, which is exactly the ordering required. Locking
 * the item rather than the warehouse is deliberately coarse: an item is the
 * unit somebody moves, contention on one is rare, and a lock per (item,
 * warehouse) would need a row per pair that nothing else wants to exist.
 *
 * Note it is NOT taken on a receipt. Receipts only add, so two concurrent ones
 * cannot produce a state neither would allow alone.
 */
async function lockItem(tx: TxLike, id: string): Promise<void> {
  const rows = await tx.query<{ id: string }>(
    `SELECT id FROM procurement.stock_items WHERE id = $1 FOR UPDATE`,
    [id],
  );
  if (rows[0] === undefined) throw new StockItemNotFound(`no such stock item: ${id}`);
}

async function insertMovement(
  tx: TxLike,
  ctx: TenantContext,
  m: {
    stockItemId: string;
    warehouse: string;
    quantity: bigint;
    kind: string;
    transferId: string | null;
    reference: string;
    valuePaise: bigint | null;
    /** Only a receipt may be `false`; migration 0087 refuses anything else. */
    checkedIn: boolean;
  },
): Promise<void> {
  try {
    await tx.query(
      `INSERT INTO procurement.stock_movements
         (tenant_id, id, stock_item_id, warehouse, quantity_micros, kind, transfer_id,
          reference, moved_by, value_paise, checked_in_at, checked_in_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               CASE WHEN $11::boolean THEN now() END,
               CASE WHEN $11::boolean THEN $9 END)`,
      [
        ctx.tenantId,
        randomUUID(),
        m.stockItemId,
        m.warehouse,
        m.quantity,
        m.kind,
        m.transferId,
        m.reference,
        ctx.principal.id,
        m.valuePaise,
        m.checkedIn,
      ],
    );
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === FK_VIOLATION) {
      throw new StockItemNotFound(`no such stock item: ${m.stockItemId}`);
    }
    throw error;
  }
}

export class ReceiptNotAwaitingCheckIn extends Error {
  override readonly name = 'ReceiptNotAwaitingCheckIn';
}

/**
 * Receipts at the gate — recorded with `checkedIn: false`, on the ledger and
 * out of every balance until somebody counts them in. Newest first.
 */
export async function listAwaitingReceipts(
  tx: TxLike,
  page: PageQuery,
): Promise<{
  items: {
    id: string;
    stockItemId: string;
    name: string;
    uom: string;
    warehouse: string;
    quantityMicros: string;
    reference: string;
    receivedAt: string;
  }[];
  nextCursor: string | null;
  prevCursor: string | null;
  count: number;
}> {
  const k = keyset(page, 'm.created_at', 'm.id', 'timestamptz', true, 1);
  const rows = await tx.query<{
    id: string;
    stock_item_id: string;
    name: string;
    uom: string;
    warehouse: string;
    quantity_micros: string;
    reference: string;
    created_at: string;
  }>(
    `SELECT m.id, m.stock_item_id, i.name, i.uom, m.warehouse,
            m.quantity_micros::text AS quantity_micros, m.reference,
            m.created_at::text AS created_at
       FROM procurement.stock_movements m
       JOIN procurement.stock_items i ON i.tenant_id = m.tenant_id AND i.id = m.stock_item_id
      WHERE m.kind = 'receipt' AND m.checked_in_at IS NULL
        AND ${k.where}
      ORDER BY ${k.orderBy}
      LIMIT $${1 + k.params.length}`,
    [...k.params, page.limit + 1],
  );
  const [counted] = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM procurement.stock_movements
      WHERE kind = 'receipt' AND checked_in_at IS NULL`,
  );
  const paged = finishPage(rows, page, (r) => ({ key: r.created_at, id: r.id }));
  return {
    items: paged.items.map((r) => ({
      id: r.id,
      stockItemId: r.stock_item_id,
      name: r.name,
      uom: r.uom,
      warehouse: r.warehouse,
      quantityMicros: r.quantity_micros,
      reference: r.reference,
      receivedAt: r.created_at,
    })),
    nextCursor: paged.nextCursor,
    prevCursor: paged.prevCursor,
    count: counted?.n ?? 0,
  };
}

/**
 * Count a gate receipt into its store. One UPDATE whose predicate is the
 * whole rule — a receipt, still waiting — so two people checking the same
 * delivery in at once cannot both succeed, and an issue or an already-counted
 * receipt is refused as not waiting rather than stamped twice.
 */
export async function checkInReceipt(
  tx: TxLike,
  ctx: TenantContext,
  movementId: string,
): Promise<void> {
  const rows = await tx.query<{ id: string }>(
    `UPDATE procurement.stock_movements
        SET checked_in_at = now(), checked_in_by = $2
      WHERE id = $1 AND kind = 'receipt' AND checked_in_at IS NULL
      RETURNING id`,
    [movementId, ctx.principal.id],
  );
  if (rows[0] === undefined) {
    throw new ReceiptNotAwaitingCheckIn('No receipt with that id is waiting to be checked in.');
  }
}

/** Goods received. One positive movement. */
export async function receiveStock(
  tx: TxLike,
  ctx: TenantContext,
  input: MovementInput,
): Promise<void> {
  const qty = micros(input.quantityWhole, input.quantityMillionths);
  if (qty <= 0n) throw new InvalidMovement('a receipt must be for more than zero');
  await assertItem(tx, input.stockItemId);

  // The only place a price enters the ledger. `rate x quantity` is formed
  // exactly and rounded once to paise — the same shape as a BOQ line amount,
  // and the reason the rate is per unit while the quantity is in millionths.
  let valuePaise: bigint | null = null;
  if (input.unitRatePaise !== undefined) {
    const rate = BigInt(input.unitRatePaise);
    if (rate < 0n) throw new InvalidMovement('a unit price cannot be negative');
    valuePaise = roundToPaise(rate * qty, QUANTITY_SCALE) as bigint;
  }

  await insertMovement(tx, ctx, {
    stockItemId: input.stockItemId,
    warehouse: input.warehouse,
    quantity: qty,
    kind: 'receipt',
    checkedIn: input.checkedIn ?? true,
    transferId: null,
    reference: input.reference ?? '',
    valuePaise,
  });
}

/** Material issued out. One negative movement, refused if it would go below zero. */
export async function issueStock(
  tx: TxLike,
  ctx: TenantContext,
  input: MovementInput,
): Promise<void> {
  const qty = micros(input.quantityWhole, input.quantityMillionths);
  if (qty <= 0n) throw new InvalidMovement('an issue must be for more than zero');
  await lockItem(tx, input.stockItemId);

  const balance = await balanceOf(tx, input.stockItemId, input.warehouse);
  if (balance < qty) {
    throw new InsufficientStock(
      `only ${balance.toString()} millionths are in ${input.warehouse}; ${qty.toString()} were requested`,
    );
  }

  // Valued at what the stock cost, never at a price the caller supplies. An
  // issue that could name its own rate would let somebody write down inventory
  // by issuing it cheaply and receiving it back.
  const held = await valueOf(tx, input.stockItemId, input.warehouse);
  const leaving = valueLeaving(held.value, balance, qty, held.fullyValued);

  await insertMovement(tx, ctx, {
    stockItemId: input.stockItemId,
    warehouse: input.warehouse,
    quantity: -qty,
    kind: 'issue',
    checkedIn: true,
    transferId: null,
    reference: input.reference ?? '',
    valuePaise: leaving === null ? null : -leaving,
  });
}

/**
 * Move stock between warehouses.
 *
 * **Two rows, one transaction, sharing a `transfer_id`.** This is what INV-01
 * is about: `createTransfer` in the legacy writes a transfer record and moves no
 * stock, so the source keeps its quantity and the destination never gains it.
 * Here the movement *is* the transfer; there is no separate record that could
 * disagree with the ledger.
 *
 * The request's transaction is the middleware's, so both rows land or neither
 * does.
 */
export async function transferStock(
  tx: TxLike,
  ctx: TenantContext,
  input: TransferInput,
): Promise<{ transferId: string }> {
  const qty = micros(input.quantityWhole, input.quantityMillionths);
  if (qty <= 0n) throw new InvalidMovement('a transfer must be for more than zero');
  if (input.fromWarehouse === input.toWarehouse) {
    throw new InvalidMovement('a transfer needs two different warehouses');
  }
  await lockItem(tx, input.stockItemId);

  const balance = await balanceOf(tx, input.stockItemId, input.fromWarehouse);
  if (balance < qty) {
    throw new InsufficientStock(
      `only ${balance.toString()} millionths are in ${input.fromWarehouse}; ${qty.toString()} were requested`,
    );
  }

  // **The dispatched stock's own cost travels with it**, which is what
  // `inventory.js:322-323` snapshots the source item for and `:337` applies at
  // the destination. The same figure leaves one warehouse and arrives at the
  // other, so a transfer moves value between warehouses and creates none.
  const held = await valueOf(tx, input.stockItemId, input.fromWarehouse);
  const moving = valueLeaving(held.value, balance, qty, held.fullyValued);

  const transferId = randomUUID();
  const reference = input.reference ?? '';
  await insertMovement(tx, ctx, {
    stockItemId: input.stockItemId,
    warehouse: input.fromWarehouse,
    quantity: -qty,
    kind: 'transfer',
    checkedIn: true,
    transferId,
    reference,
    valuePaise: moving === null ? null : -moving,
  });
  await insertMovement(tx, ctx, {
    stockItemId: input.stockItemId,
    warehouse: input.toWarehouse,
    quantity: qty,
    kind: 'transfer',
    checkedIn: true,
    transferId,
    valuePaise: moving,
    reference,
  });
  return { transferId };
}

/**
 * How this tenant values stock, and whether anybody has agreed to it.
 *
 * A tenant with no row gets the documented provisional default. The `status` is
 * returned, not swallowed, so a screen showing a valuation can say whether the
 * method behind it was chosen or inherited — the same shape as a project health
 * threshold, and for the same reason: INV-03 was answered from a legacy tree,
 * not by a finance director.
 */
export interface CostingPolicy {
  readonly method: 'weighted_average';
  readonly status: 'provisional' | 'confirmed';
}

export async function loadCostingPolicy(tx: TxLike): Promise<CostingPolicy> {
  const rows = await tx.query<{ method: string; status: string }>(
    `SELECT method, status FROM procurement.costing_policy LIMIT 1`,
  );
  const row = rows[0];
  if (row === undefined) return { method: 'weighted_average', status: 'provisional' };
  return {
    method: row.method as 'weighted_average',
    status: row.status as 'provisional' | 'confirmed',
  };
}

/**
 * Give a new tenant the costing policy INV-03 settled, as a row.
 *
 * `loadCostingPolicy` already falls back to the same values, and that fallback
 * stays — it covers tenants provisioned before this existed. But a fallback is
 * not configuration. It lives in this file, so "weighted average" would be
 * overridable only by editing code, which is the one thing a provisionally
 * adopted answer must not require.
 *
 * A seeded row makes it what the adoption promised: a value with `provisional`
 * on it, a note saying where it came from and that nobody signed it off, and a
 * single UPDATE between here and a different answer. It is the same shape as
 * the role catalogue and the approval chains, seeded in the same transaction,
 * for the same reason.
 *
 * Idempotent, and it never overwrites — a tenant that has since CONFIRMED its
 * method must not be quietly returned to provisional by a re-run.
 */
export async function seedCostingPolicy(tx: TxLike): Promise<void> {
  await tx.query(
    `INSERT INTO procurement.costing_policy (tenant_id, method, status, note)
     VALUES (tenancy.current_tenant_id(), 'weighted_average', 'provisional', $1)
     ON CONFLICT (tenant_id) DO NOTHING`,
    [
      'Provisional. Read out of the repaired legacy tree at inventory.js:61 — the ' +
        'unit cost is recomputed as a weighted average on every receipt, issues do ' +
        'not move it, and a transfer carries the dispatched cost to the destination. ' +
        'Adopted without anybody signing it off. See OPEN-DECISIONS INV-03.',
    ],
  );
}

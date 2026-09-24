import { randomUUID } from 'node:crypto';
import type { Paise, TenantContext } from '@cog/contracts';
import { bp, fromWire } from '@cog/money';
import { finishPage, keyset, type PageQuery } from '@cog/service-kit';
import { analyseRate, type RateAnalysis } from '../domain/rate-analysis.js';
import type { TxLike } from './boq-writes.js';

/**
 * Estimation items.
 *
 * **Every rule is in `domain/rate-analysis.ts`**, which already records RATE-01,
 * RATE-02 and RATE-03 and fixes all three. This file stores the inputs and the
 * rate that module computes from them.
 *
 * **The stored rate is pre-tax, and the breakdown is recomputed on read rather
 * than stored.** That is EST-02 turned around: `EstimationView.js:257`
 * recomputes the breakdown on every render and displays *that*, while
 * `boq.js:365` imports the **stored** `final_rate_with_gst`. Two engines, one
 * shown and one used, with nothing comparing them. Here the breakdown is
 * derived from the stored factors every time, so there is only one answer and
 * `base_rate` is a cache of it that the same function produced.
 */

const UNIQUE_VIOLATION = '23505';

export class EstimationConflict extends Error {
  override readonly name = 'EstimationConflict';
}

export class EstimationItemNotFound extends Error {
  override readonly name = 'EstimationItemNotFound';
}

export interface EstimationItemInput {
  readonly itemName: string;
  readonly trade?: string | undefined;
  readonly uom: string;
  readonly materialCost: string;
  readonly labourCost: string;
  readonly equipmentCost: string;
  readonly overheadBp: number;
  readonly marginBp: number;
  readonly benchmark?: string | undefined;
}

export interface EstimationItem {
  readonly id: string;
  readonly itemName: string;
  readonly trade: string;
  readonly uom: string;
  readonly materialCost: Paise;
  readonly labourCost: Paise;
  readonly equipmentCost: Paise;
  readonly overheadBp: number;
  readonly marginBp: number;
  readonly benchmark: string;
  readonly version: number;
  /** Recomputed from the stored factors on every read — see EST-02. */
  readonly analysis: RateAnalysis;
}

type Row = {
  id: string;
  item_name: string;
  trade: string;
  uom: string;
  material_cost: string;
  labour_cost: string;
  equipment_cost: string;
  overhead_bp: number;
  margin_bp: number;
  benchmark: string;
  version: number;
};

const COLUMNS = `id, item_name, trade, uom,
                 material_cost::text AS material_cost,
                 labour_cost::text AS labour_cost,
                 equipment_cost::text AS equipment_cost,
                 overhead_bp, margin_bp, benchmark, version`;

function analyse(r: Row): RateAnalysis {
  return analyseRate({
    materialCost: fromWire(r.material_cost),
    labourCost: fromWire(r.labour_cost),
    equipmentCost: fromWire(r.equipment_cost),
    overheadRate: bp(r.overhead_bp),
    marginRate: bp(r.margin_bp),
  });
}

function toItem(r: Row): EstimationItem {
  return {
    id: r.id,
    itemName: r.item_name,
    trade: r.trade,
    uom: r.uom,
    materialCost: fromWire(r.material_cost),
    labourCost: fromWire(r.labour_cost),
    equipmentCost: fromWire(r.equipment_cost),
    overheadBp: r.overhead_bp,
    marginBp: r.margin_bp,
    benchmark: r.benchmark,
    version: r.version,
    analysis: analyse(r),
  };
}

export interface EstimationListPage {
  readonly items: readonly EstimationItem[];
  readonly nextCursor: string | null;
  readonly prevCursor: string | null;
  readonly count: number;
}

/** `trade, item_name` as one text key, so `keyset` has a single expression for the composite order. */
const SORT_KEY_EXPR = `(trade || E'\\x1f' || item_name)`;

/**
 * The rate library, windowed.
 *
 * Ordered `trade, item_name`, ascending — the design's own order for the
 * library — as one key: `trade || U+001F || item_name`. The unit separator
 * cannot occur in either column, so the pair sorts exactly as the two-column
 * `ORDER BY` used to, with one expression for `keyset` to cut the page on.
 */
export async function listEstimationItems(
  tx: TxLike,
  page: PageQuery,
  trade?: string,
): Promise<EstimationListPage> {
  // No `WHERE tenant_id` — RLS applies it.
  const params: unknown[] = [trade ?? null];
  const where = `($1::text IS NULL OR trade = $1)`;
  const k = keyset(page, SORT_KEY_EXPR, 'id', 'text', false, params.length + 1);
  const rows = await tx.query<Row & { sort_key: string }>(
    `SELECT ${COLUMNS}, ${SORT_KEY_EXPR} AS sort_key
       FROM projects.estimation_items
      WHERE ${where}
        AND ${k.where}
      ORDER BY ${k.orderBy}
      LIMIT $${params.length + k.params.length + 1}`,
    [...params, ...k.params, page.limit + 1],
  );
  const [counted] = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM projects.estimation_items WHERE ${where}`,
    params,
  );
  const paged = finishPage(rows, page, (r) => ({ key: r.sort_key, id: r.id }));
  return {
    items: paged.items.map(toItem),
    nextCursor: paged.nextCursor,
    prevCursor: paged.prevCursor,
    count: counted?.n ?? 0,
  };
}

export async function getEstimationItem(tx: TxLike, id: string): Promise<EstimationItem> {
  const rows = await tx.query<Row>(
    `SELECT ${COLUMNS} FROM projects.estimation_items WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (row === undefined) throw new EstimationItemNotFound(`no such estimation item: ${id}`);
  return toItem(row);
}

/**
 * Create an item.
 *
 * `base_rate` is computed by `analyseRate` and stored so an estimate can be
 * reproduced as it was made. No caller supplies it — the four factors and the
 * two rates are the inputs, and the rate is the answer.
 */
export async function createEstimationItem(
  tx: TxLike,
  ctx: TenantContext,
  input: EstimationItemInput,
): Promise<EstimationItem> {
  const analysis = analyseRate({
    materialCost: fromWire(input.materialCost),
    labourCost: fromWire(input.labourCost),
    equipmentCost: fromWire(input.equipmentCost),
    overheadRate: bp(input.overheadBp),
    marginRate: bp(input.marginBp),
  });

  const id = randomUUID();
  try {
    await tx.query(
      `INSERT INTO projects.estimation_items
         (tenant_id, id, item_name, trade, uom, material_cost, labour_cost,
          equipment_cost, overhead_bp, margin_bp, base_rate, benchmark, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        ctx.tenantId,
        id,
        input.itemName,
        input.trade ?? '',
        input.uom,
        fromWire(input.materialCost),
        fromWire(input.labourCost),
        fromWire(input.equipmentCost),
        input.overheadBp,
        input.marginBp,
        analysis.baseRate,
        input.benchmark ?? '',
        ctx.principal.id,
      ],
    );
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === UNIQUE_VIOLATION) {
      throw new EstimationConflict(
        `an estimation item named ${input.itemName} already exists for that trade`,
      );
    }
    throw error;
  }
  return getEstimationItem(tx, id);
}

export async function deleteEstimationItem(tx: TxLike, id: string): Promise<void> {
  const rows = await tx.query<{ id: string }>(
    `DELETE FROM projects.estimation_items WHERE id = $1 RETURNING id`,
    [id],
  );
  if (rows[0] === undefined) throw new EstimationItemNotFound(`no such estimation item: ${id}`);
}

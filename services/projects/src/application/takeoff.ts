import { randomUUID } from 'node:crypto';
import type { Paise, TenantContext } from '@cog/contracts';
import { fromWire } from '@cog/money';
import { summarise, type TakeoffItem, type TakeoffSummary } from '../domain/takeoff.js';
import type { TxLike } from './boq-writes.js';

/**
 * Takeoff sheets.
 *
 * **Every rule is in `domain/takeoff.ts`** — `orderQuantity`, `lineValue`,
 * `summarise`, `assertExportable` — which already records TAKE-01. This file
 * stores the measurements and asks that module for the totals.
 *
 * **Exporting a takeoff to a BOQ is deliberately not built.** It is the one
 * operation here that decides something nobody has decided:
 *
 *   * `exportTakeoffToBOQ` turns a takeoff rate into a BOQ rate, and whether a
 *     BOQ rate carries GST is **PO-16**, open.
 *   * It is also the function that has **never run**. `takeoff.js:324` inserts
 *     into `boq_items(… unit, qty …)` — neither column exists (TAKE-02) — and
 *     `:307` inserts into `boq_schedules(… description …)`, which that table
 *     does not have either (TAKE-03). Both omit the required `id`.
 *
 * So the feature blocked on PO-16 is a feature that has never worked. Nothing
 * is lost by not porting it, and PO-16 stays open on its own merits because
 * `importEstimationItemsToBOQ` — which does work — needs the same answer.
 */

const FK_VIOLATION = '23503';
const SCALE = 1_000_000n;

export class TakeoffNotFound extends Error {
  override readonly name = 'TakeoffNotFound';
}

export class TakeoffRefused extends Error {
  override readonly name = 'TakeoffRefused';
}

export interface Sheet {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly floorName: string;
  readonly documentId: string | null;
  readonly scalePxNum: string | null;
  readonly scalePxDen: string | null;
  readonly scaleUnit: string;
  readonly version: number;
}

type SheetRow = {
  id: string;
  project_id: string;
  title: string;
  floor_name: string;
  document_id: string | null;
  scale_px_num: string | null;
  scale_px_den: string | null;
  scale_unit: string;
  version: number;
};

const SHEET_COLUMNS = `id, project_id, title, floor_name, document_id,
                       scale_px_num::text AS scale_px_num,
                       scale_px_den::text AS scale_px_den,
                       scale_unit, version`;

function toSheet(r: SheetRow): Sheet {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    floorName: r.floor_name,
    documentId: r.document_id,
    scalePxNum: r.scale_px_num,
    scalePxDen: r.scale_px_den,
    scaleUnit: r.scale_unit,
    version: r.version,
  };
}

export async function listSheets(tx: TxLike, projectId: string): Promise<Sheet[]> {
  const rows = await tx.query<SheetRow>(
    `SELECT ${SHEET_COLUMNS} FROM projects.takeoff_sheets
      WHERE project_id = $1 ORDER BY created_at DESC`,
    [projectId],
  );
  return rows.map(toSheet);
}

export interface CreateSheetInput {
  readonly projectId: string;
  readonly title: string;
  readonly floorName?: string | undefined;
  readonly documentId?: string | undefined;
  readonly scalePxNum?: number | undefined;
  readonly scalePxDen?: number | undefined;
  readonly scaleUnit?: string | undefined;
}

export async function createSheet(
  tx: TxLike,
  ctx: TenantContext,
  input: CreateSheetInput,
): Promise<Sheet> {
  // A scale is both halves or neither — the table says so too. Half a scale is
  // worse than none, because it reads as calibrated.
  if ((input.scalePxNum === undefined) !== (input.scalePxDen === undefined)) {
    throw new TakeoffRefused('a scale needs both a pixel count and a unit count');
  }

  const id = randomUUID();
  try {
    await tx.query(
      `INSERT INTO projects.takeoff_sheets
         (tenant_id, id, project_id, title, floor_name, document_id,
          scale_px_num, scale_px_den, scale_unit, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        ctx.tenantId,
        id,
        input.projectId,
        input.title,
        input.floorName ?? '',
        input.documentId ?? null,
        input.scalePxNum ?? null,
        input.scalePxDen ?? null,
        input.scaleUnit ?? 'ft',
        ctx.principal.id,
      ],
    );
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === FK_VIOLATION) {
      throw new TakeoffRefused('that project does not exist in this organisation');
    }
    throw error;
  }

  const rows = await tx.query<SheetRow>(
    `SELECT ${SHEET_COLUMNS} FROM projects.takeoff_sheets WHERE id = $1`,
    [id],
  );
  return toSheet(rows[0]!);
}

export interface ItemInputLike {
  readonly description: string;
  readonly category?: string | undefined;
  readonly uom: string;
  readonly quantityWhole: number;
  readonly quantityMillionths: number;
  readonly wastageBp?: number | undefined;
  readonly costRate?: string | undefined;
  readonly clientRate?: string | undefined;
  readonly geometry?: unknown;
}

/**
 * Replace a sheet's items.
 *
 * A set, not a patch: the whole sheet is redrawn when a measurement changes, so
 * a partial update would leave items nothing on screen produced. Both statements
 * run inside the middleware's transaction, so the delete and the inserts land
 * together — `saveTakeoffItems` (`takeoff.js:217-227`) issues them loose.
 */
export async function saveItems(
  tx: TxLike,
  ctx: TenantContext,
  sheetId: string,
  items: readonly ItemInputLike[],
): Promise<TakeoffSummary> {
  const sheets = await tx.query<{ id: string }>(
    `SELECT id FROM projects.takeoff_sheets WHERE id = $1`,
    [sheetId],
  );
  if (sheets[0] === undefined) throw new TakeoffNotFound(`no such takeoff sheet: ${sheetId}`);

  await tx.query(`DELETE FROM projects.takeoff_items WHERE sheet_id = $1`, [sheetId]);

  for (const item of items) {
    await tx.query(
      `INSERT INTO projects.takeoff_items
         (tenant_id, id, sheet_id, description, category, uom, measured_micros,
          wastage_bp, cost_rate, client_rate, geometry)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
      [
        ctx.tenantId,
        randomUUID(),
        sheetId,
        item.description,
        item.category ?? '',
        item.uom,
        BigInt(item.quantityWhole) * SCALE + BigInt(item.quantityMillionths),
        item.wastageBp ?? 0,
        // Neither rate is derived. An absent one stays absent.
        item.costRate === undefined ? null : fromWire(item.costRate),
        item.clientRate === undefined ? null : fromWire(item.clientRate),
        JSON.stringify(item.geometry ?? []),
      ],
    );
  }

  return summariseSheet(tx, sheetId);
}

/**
 * Totals for a sheet.
 *
 * `summarise` returns `null` for a cost or a value unless **every** item
 * carries the matching rate — a partial total reads as a figure while being
 * computed over a subset.
 */
export async function summariseSheet(tx: TxLike, sheetId: string): Promise<TakeoffSummary> {
  const rows = await tx.query<{
    id: string;
    description: string;
    uom: string;
    measured_micros: string;
    wastage_bp: number;
    cost_rate: string | null;
    client_rate: string | null;
  }>(
    `SELECT id, description, uom, measured_micros::text AS measured_micros,
            wastage_bp, cost_rate::text AS cost_rate, client_rate::text AS client_rate
       FROM projects.takeoff_items
      WHERE sheet_id = $1
      ORDER BY created_at`,
    [sheetId],
  );

  const items: TakeoffItem[] = rows.map((r) => ({
    id: r.id,
    description: r.description,
    uom: r.uom,
    measuredQuantity: BigInt(r.measured_micros),
    wastageBp: r.wastage_bp,
    ...(r.cost_rate === null ? {} : { costRate: fromWire(r.cost_rate) as Paise }),
    ...(r.client_rate === null ? {} : { clientRate: fromWire(r.client_rate) as Paise }),
  }));

  return summarise(items);
}

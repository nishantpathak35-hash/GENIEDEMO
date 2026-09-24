import { randomUUID } from 'node:crypto';
import type { Paise, TenantContext } from '@cog/contracts';
import { bp, fromWire, toWire } from '@cog/money';
import {
  type PurchaseOrder,
  type PurchaseOrderLine,
  PurchaseOrderError,
  applyEdit,
  purchaseOrderTotals,
  quantity,
} from '../domain/purchase-order.js';
import { type TxLike, PurchaseOrderNotFound } from './approval-subject.js';
import { allocateNumber } from './number-series.js';
import { resolveContractedRate } from './rate-contracts.js';

/**
 * Writing purchase orders.
 *
 * **Create is a port of `POService.createPO`. Update and rename are
 * replacements, and this file is where that distinction is recorded.**
 *
 * `updatePOFull` — the legacy's only update path, and the one the RPC allowlist
 * exposes at `app/api/rpc/route.js:34` — writes
 * `version = COALESCE(version, 1) + 1` on `purchase_orders` in both of its
 * branches (`write.js:104` and `write.js:126`). No such column exists: it is
 * absent from the CREATE TABLE in `db.js:86`, absent from the idempotent
 * `poColumns` ALTERs at `core.js:89-93`, and the only `ADD COLUMN version` in
 * the codebase targets `payment_requests` (`migrations.js:43`). libSQL raises
 * `no such column`, and `queryRun` does not swallow it — `executeWithRetry`
 * rethrows any error that is neither a network fault nor `SQLITE_BUSY`, on the
 * first attempt (`db.js:281`).
 *
 * So **editing a purchase order throws, always**, and every defect below that
 * line is unreachable: the five-table rename cascade at `:142`, the
 * client-supplied `gst_amount` at `:55`, the client-supplied line `amount` at
 * `:157`. They are recorded as PO-19..PO-22 in `docs/STACK-MIGRATION.md` as
 * **latent** rather than live. There is no prior update behaviour to preserve,
 * so update and rename are one commit each, not two (ADR-0014 decision 5 — the
 * two-commit protocol exists to keep a changed *figure* attributable, and a
 * path that never produced a figure has none).
 *
 * This claim is bounded by what the repository shows: a database built by this
 * code's own migrations has no `version` column on `purchase_orders`. A column
 * added out-of-band to the live instance is not knowable from here.
 *
 * **The one live divergence is PO-23.** `POService.ts:48` computes
 * `totalVal = subt + gstSum - tdsAmt` and writes it to both `po_value` and
 * `revised_po_value`, so the stored order value is net of a deduction that has
 * not happened yet. Nothing here nets TDS: `gross` is `taxable + gst`, which
 * migration 0009's CHECK already enforces. Declining to compute a figure needs
 * no ruling from anyone — but computing one would be a rate application on the
 * money path, which is where the CA questions bite, so it is not done here.
 */

/** Postgres unique-violation. A duplicate PO number is a caller error, not a fault. */
const UNIQUE_VIOLATION = '23505';

export class DuplicatePurchaseOrderNumber extends Error {
  override readonly name = 'DuplicatePurchaseOrderNumber';
}

export interface PurchaseOrderLineInputLike {
  readonly description: string;
  readonly hsnSac: string;
  readonly quantityWhole: number;
  readonly quantityMillionths: number;
  readonly unitRate: string;
  readonly gstRate: number;
  /**
   * The BOQ line this was ordered against, when it came from one.
   *
   * Not a field any HTTP caller can set: `purchaseOrderLineInput` in
   * `packages/contracts` does not declare it, so it can only be populated by
   * `purchaseOrderLinesFromBoq` after `projects` has confirmed the line is
   * orderable. The composite FK is what stops it naming another tenant's row.
   */
  readonly boqItemId?: string | undefined;
  /** Which trade this line buys. Optional, and the rate check's only key. */
  readonly tradeCode?: string | undefined;
}

/**
 * Wire lines to domain lines.
 *
 * There is no branch here that reads a caller-supplied amount or GST figure,
 * because no such field exists to read — `createPurchaseOrderInput` declares
 * `quantityWhole`, `quantityMillionths`, `unitRate` and `gstRate` and nothing
 * else, and `procurement.purchase_order_lines` has no `amount` column for one
 * to land in. Both absences are asserted in the tests: an absence is invisible,
 * and the next person to add a field will not know it was deliberate.
 */
export function toDomainLines(
  lines: readonly PurchaseOrderLineInputLike[],
): readonly PurchaseOrderLine[] {
  return lines.map((l) => ({
    description: l.description,
    hsnSac: l.hsnSac,
    quantity: quantity(BigInt(l.quantityWhole), BigInt(l.quantityMillionths)),
    unitRate: fromWire(l.unitRate),
    gstRate: bp(l.gstRate),
    ...(l.boqItemId === undefined ? {} : { boqItemId: l.boqItemId }),
    ...(l.tradeCode === undefined ? {} : { tradeCode: l.tradeCode }),
  }));
}

export interface CreateInput {
  /** Omit to have the server allocate one. See `allocateNumber`. */
  readonly number?: string | undefined;
  /**
   * The project this order is for, or absent for a general purchase.
   *
   * Migration `0036`. Before it there was no link at all and the legacy matched
   * a project **name** with `LIKE '%…%'` (PROJ-02), which is what made a
   * per-project spend total the sum over whatever the substring matched.
   */
  readonly projectId?: string | undefined;
  readonly vendorId: string;
  readonly lines: readonly PurchaseOrderLineInputLike[];
}

export interface WriteResult {
  readonly id: string;
  readonly number: string;
  readonly state: string;
  readonly version: number;
  readonly taxable: Paise;
  readonly gst: Paise;
  readonly gross: Paise;
}

/**
 * Create an order.
 *
 * `tenant_id` is stamped explicitly from the context, never defaulted from
 * `tenancy.current_tenant_id()`: a forgotten stamp must fail NOT NULL and a
 * wrong one must fail the RLS WITH CHECK, rather than quietly producing a row
 * attributed to whoever happened to be connected (M1/D3).
 *
 * `created_by` comes from the authenticated principal, never the body. It is
 * what self-approval is refused against (APPR-02), so a requester who could
 * supply it could approve their own order.
 */
export async function createPurchaseOrder(
  tx: TxLike,
  ctx: TenantContext,
  input: CreateInput,
): Promise<WriteResult> {
  const lines = toDomainLines(input.lines);
  const totals = purchaseOrderTotals(lines);
  const id = randomUUID();

  // Allocated here, in the transaction that is about to insert the order, so a
  // concurrent create cannot be handed the same number (PO-24). An explicit
  // number is still honoured — importing historic orders needs it — and the
  // unique constraint is what refuses a reused one.
  const number = input.number ?? (await allocateNumber(tx, ctx)).number;

  try {
    await tx.query(
      `INSERT INTO procurement.purchase_orders
         (tenant_id, id, number, vendor_id, state, taxable, gst, gross, version,
          created_by, project_id)
       VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, 1, $8, $9)`,
      [
        ctx.tenantId,
        id,
        number,
        input.vendorId,
        totals.taxable,
        totals.gst,
        totals.gross,
        ctx.principal.id,
        input.projectId ?? null,
      ],
    );
  } catch (error) {
    throw asDuplicateNumber(error, number);
  }

  await insertLines(tx, ctx, id, input.vendorId, lines);

  return {
    id,
    number,
    state: 'draft',
    version: 1,
    taxable: totals.taxable,
    gst: totals.gst,
    gross: totals.gross,
  };
}

export interface UpdateInput {
  readonly number: string;
  readonly vendorId: string;
  readonly lines: readonly PurchaseOrderLineInputLike[];
  readonly expectedVersion: number;
}

/**
 * Edit an order.
 *
 * The version check happens twice, and both are load-bearing. `applyEdit`
 * refuses in the domain, which is what the unit tests exercise; the
 * `WHERE version = $n` on the UPDATE is what makes it correct under
 * concurrency, since two requests can both read version 4 and both pass the
 * domain check. The transaction the middleware opened is what makes the second
 * one lose.
 */
export async function updatePurchaseOrder(
  tx: TxLike,
  ctx: TenantContext,
  id: string,
  input: UpdateInput,
): Promise<WriteResult> {
  const current = await loadForEdit(tx, id);
  const next = applyEdit({
    current,
    lines: toDomainLines(input.lines),
    vendorId: input.vendorId,
    number: input.number,
    expectedVersion: input.expectedVersion,
  });
  const totals = purchaseOrderTotals(next.lines);

  let rows: { version: number }[];
  try {
    rows = await tx.query<{ version: number }>(
      `UPDATE procurement.purchase_orders
          SET number     = $2,
              vendor_id  = $3,
              state      = $4,
              taxable    = $5,
              gst        = $6,
              gross      = $7,
              version    = version + 1,
              updated_at = now()
        WHERE id = $1 AND version = $8
      RETURNING version`,
      [
        id,
        next.number,
        next.vendorId,
        next.state,
        totals.taxable,
        totals.gst,
        totals.gross,
        input.expectedVersion,
      ],
    );
  } catch (error) {
    throw asDuplicateNumber(error, input.number);
  }

  const updated = rows[0];
  if (updated === undefined) {
    // The row was there a moment ago and the domain check passed, so this is
    // the concurrent case: someone else's write landed between the read and
    // this statement.
    throw new PurchaseOrderError(
      'this purchase order was modified by someone else while the change was being saved',
    );
  }

  await tx.query(`DELETE FROM procurement.purchase_order_lines WHERE purchase_order_id = $1`, [id]);
  await insertLines(tx, ctx, id, next.vendorId, next.lines);

  return {
    id,
    number: next.number,
    state: next.state,
    version: updated.version,
    taxable: totals.taxable,
    gst: totals.gst,
    gross: totals.gross,
  };
}

/**
 * Rename an order.
 *
 * **One row.** `number` is a display attribute; `purchase_order_lines`,
 * `workflow.approval_history` and everything downstream reference `id`, which
 * does not change. The legacy cascade this replaces is described on
 * `renamePurchaseOrderInput` in `packages/contracts`.
 *
 * A rename is not a financial change, so it does not reset an approved order to
 * draft — `requiresReapproval` tests the vendor and the gross, and neither
 * moves here.
 */
export async function renamePurchaseOrder(
  tx: TxLike,
  id: string,
  number: string,
  expectedVersion: number,
): Promise<WriteResult> {
  const current = await loadForEdit(tx, id);
  if (current.state === 'cancelled') {
    throw new PurchaseOrderError('a cancelled purchase order cannot be renamed');
  }
  if (expectedVersion !== current.version) {
    throw new PurchaseOrderError(
      `this purchase order was modified by someone else (expected version ${expectedVersion}, found ${current.version})`,
    );
  }

  let rows: { version: number; state: string; taxable: string; gst: string; gross: string }[];
  try {
    rows = await tx.query<{
      version: number;
      state: string;
      taxable: string;
      gst: string;
      gross: string;
    }>(
      `UPDATE procurement.purchase_orders
          SET number = $2, version = version + 1, updated_at = now()
        WHERE id = $1 AND version = $3
      RETURNING version, state, taxable::text, gst::text, gross::text`,
      [id, number, expectedVersion],
    );
  } catch (error) {
    throw asDuplicateNumber(error, number);
  }

  const updated = rows[0];
  if (updated === undefined) {
    throw new PurchaseOrderError(
      'this purchase order was modified by someone else while the change was being saved',
    );
  }

  return {
    id,
    number,
    state: updated.state,
    version: updated.version,
    taxable: fromWire(updated.taxable),
    gst: fromWire(updated.gst),
    gross: fromWire(updated.gross),
  };
}

// ------------------------------------------------------------------ helpers --

async function insertLines(
  tx: TxLike,
  ctx: TenantContext,
  purchaseOrderId: string,
  vendorId: string,
  lines: readonly PurchaseOrderLine[],
): Promise<void> {
  // The date the comparison is made on. `now()` in the database rather than a
  // clock read here, so a line written either side of midnight is measured
  // against the contract that was in force when the row was written.
  const today = await tx.query<{ on_date: string }>(
    `SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date::text AS on_date`,
  );
  const onDate = today[0]?.on_date ?? null;

  let lineNo = 1;
  for (const line of lines) {
    // THE RATE-CONTRACT CHECK, SERVER-SIDE, INSIDE THIS TRANSACTION.
    //
    // Resolved here rather than accepted from the caller, and that is the whole
    // design. If a line only got checked when somebody had already attached a
    // contract to it, the check would fire almost never — which is a table
    // nobody reads, which is what the legacy built. The columns below are an
    // OUTPUT of the write, not an input to it.
    //
    // A line that names no trade resolves to nothing and is stamped with
    // nothing. That is deliberately not the same as "priced correctly": the
    // deviation list omits it rather than reporting it as compliant.
    const tradeCode = line.tradeCode ?? null;
    const contracted =
      tradeCode === null || onDate === null
        ? null
        : await resolveContractedRate(tx, vendorId, tradeCode, onDate);

    await tx.query(
      `INSERT INTO procurement.purchase_order_lines
         (tenant_id, id, purchase_order_id, line_no, description, hsn_sac,
          quantity_micros, unit_rate, gst_rate_bp, boq_item_id,
          trade_code, rate_contract_item_id, contracted_unit_rate)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        ctx.tenantId,
        randomUUID(),
        purchaseOrderId,
        lineNo,
        line.description,
        line.hsnSac,
        line.quantity,
        line.unitRate,
        line.gstRate,
        line.boqItemId ?? null,
        tradeCode === null ? null : tradeCode.toUpperCase(),
        contracted?.itemId ?? null,
        // STAMPED, not read back through the pointer. A contract edited next
        // year must not silently change what last year's order was checked
        // against — the same reasoning as `losing_before` on a lead merge.
        contracted?.contractRatePaise ?? null,
      ],
    );
    lineNo += 1;
  }
}

/**
 * Read the order and its lines for editing.
 *
 * No `WHERE tenant_id`: RLS applies it, and another tenant's order is
 * indistinguishable from a missing one because the policy has already made the
 * row invisible.
 */
async function loadForEdit(tx: TxLike, id: string): Promise<PurchaseOrder> {
  const headers = await tx.query<{
    id: string;
    number: string;
    state: string;
    vendor_id: string;
    version: number;
  }>(
    `SELECT id, number, state, vendor_id, version
       FROM procurement.purchase_orders
      WHERE id = $1`,
    [id],
  );
  const header = headers[0];
  if (header === undefined) throw new PurchaseOrderNotFound(`no such purchase order: ${id}`);

  const lineRows = await tx.query<{
    description: string;
    hsn_sac: string;
    quantity_micros: string;
    unit_rate: string;
    gst_rate_bp: number;
    boq_item_id: string | null;
  }>(
    `SELECT description, hsn_sac, quantity_micros::text, unit_rate::text, gst_rate_bp,
            boq_item_id
       FROM procurement.purchase_order_lines
      WHERE purchase_order_id = $1
      ORDER BY line_no`,
    [id],
  );

  return {
    id: header.id,
    number: header.number,
    state: header.state as PurchaseOrder['state'],
    vendorId: header.vendor_id,
    version: header.version,
    lines: lineRows.map((r) => ({
      description: r.description,
      hsnSac: r.hsn_sac,
      quantity: BigInt(r.quantity_micros) as PurchaseOrderLine['quantity'],
      unitRate: fromWire(r.unit_rate),
      gstRate: bp(r.gst_rate_bp),
      // Carried, so editing an order does not silently sever the BOQ lines it
      // was raised from.
      ...(r.boq_item_id === null ? {} : { boqItemId: r.boq_item_id }),
    })),
  };
}

/**
 * A unique violation on `(tenant_id, number)` means the caller reused a number.
 *
 * Mapped to its own error so it becomes a 409 rather than a 500. The message
 * names the number the caller sent — which they already know — and nothing
 * about the row that holds it.
 */
function asDuplicateNumber(error: unknown, number: string): unknown {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === UNIQUE_VIOLATION) {
    return new DuplicatePurchaseOrderNumber(`a purchase order numbered ${number} already exists`);
  }
  return error;
}

/**
 * A write result in its wire shape.
 *
 * Lives here rather than in a route handler so `services/host` can return one
 * without importing `@cog/money`. Host orchestrates and must not touch a
 * monetary value at all — not even to format it — and the surest way to keep
 * that true is for the dependency not to exist.
 */
export function toWriteResponse(r: WriteResult): Record<string, unknown> {
  return {
    id: r.id,
    number: r.number,
    state: r.state,
    version: r.version,
    taxable: toWire(r.taxable),
    gst: toWire(r.gst),
    gross: toWire(r.gross),
  };
}

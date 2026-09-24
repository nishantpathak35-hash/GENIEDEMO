import { randomUUID } from 'node:crypto';
import type { Paise, TenantContext } from '@cog/contracts';
import { fromWire } from '@cog/money';
import { BoqError, type BoqLine, lineAmount } from '../domain/boq.js';
import { assertProjectOpen } from './project-guard.js';

/**
 * Writing BOQ lines.
 *
 * **Every write here is a replacement, not a port.** The legacy's BOQ writes
 * are `boq.js:89` `addBOQItem`, `:289` `updateBOQItem`, `:327` `deleteBOQItem`
 * and `:349` `importEstimationItemsToBOQ`, and each carries a defect that
 * ADR-0014 already classifies as blocking — a client-supplied line amount, an
 * invented cost rate, a hardcoded quantity. There is no correct prior behaviour
 * to preserve, so one commit each rather than two.
 *
 * | Legacy | Why it is not ported |
 * |---|---|
 * | `boq.js:114` `Number(realPayload.amount) \|\| Math.round(qty * rate * 100) / 100` | The caller asserts the line total. Rule 3: the server computes every monetary figure |
 * | `boq.js:110` `cost_rate ?? Math.round(rate * 0.8 * 100) / 100` | Invents a missing cost as 80% of the rate — and `BoqView.js:137` invents the same unknown as 78%. Two fabrications, no basis (BOQ-02, PO-15) |
 * | `boq.js:112` `margin_pct ?? 20` | A third invented commercial default, against `migrations.js:166`'s stored default of 15 |
 * | `boq.js:364` `const qty = 1` on estimation import | Discards the real quantity and makes `final_rate_with_gst` a unit rate (PO-16) |
 * | `Math.round(qty * rate * 100) / 100` at `:69`, `:114`, `:304` | Two-decimal rounding on a float. Here the multiplication is exact and rounds once to paise |
 * | Every write outside `withTransaction` | Only the two PO-minting functions are wrapped. Here the middleware opens one per request |
 *
 * **What is NOT in this file, deliberately: minting a purchase order from a BOQ
 * line.** `boq.js:135` `shootPOFromBOQItem` and `:199` `shootPOFromBOQItems` do
 * that, and both are recorded as **BOQ-03** — a live privilege escalation, not
 * a rounding defect. See `docs/ports/boq-writes.md`. Rebuilding it needs a
 * BOQ↔PO link that `0011` does not have and a decision about which service owns
 * the action, and doing it here would double this slice.
 */

/** Postgres unique-violation on `(tenant_id, project_id, section, item_no)`. */
const UNIQUE_VIOLATION = '23505';
/** Postgres foreign-key violation — here, a purchase order line still points here. */
const FK_VIOLATION = '23503';

export class DuplicateBoqLine extends Error {
  override readonly name = 'DuplicateBoqLine';
}

export class ProjectNotFound extends Error {
  override readonly name = 'ProjectNotFound';
}

export class BoqLineNotFound extends Error {
  override readonly name = 'BoqLineNotFound';
}

/** A BOQ line that has been ordered against, and so cannot be removed. */
export class BoqLineInUse extends Error {
  override readonly name = 'BoqLineInUse';
}

/** A BOQ line edit that lost a race, or was sent against a stale copy. */
export class BoqStaleWrite extends Error {
  override readonly name = 'BoqStaleWrite';
}

export interface TxLike {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<R[]>;
}

export interface BoqLineInputLike {
  readonly section: string;
  readonly itemNo: number;
  readonly description: string;
  readonly uom: string;
  readonly quantityWhole: number;
  readonly quantityMillionths: number;
  readonly rate: string;
  readonly costRate?: string | undefined;
}

export interface UpdateBoqLineInputLike extends BoqLineInputLike {
  /** Required. The purchase-order endpoints made the same choice, for the same
   *  reason: a control the caller can omit is not a control. */
  readonly expectedVersion: number;
}

export interface WrittenLine {
  readonly id: string;
  readonly section: string;
  readonly itemNo: number;
  readonly description: string;
  readonly uom: string;
  readonly quantityMicros: bigint;
  readonly rate: Paise;
  readonly costRate: Paise | null;
  /** quantity x rate, computed here. No caller can assert it. */
  readonly amount: Paise;
  /** Send back as `expectedVersion` on the next edit (BOQ-04). */
  readonly version: number;
}

const QUANTITY_SCALE = 1_000_000n;

/**
 * A line's quantity as millionths.
 *
 * Whole units and a fraction, never a decimal string, so a quantity cannot
 * arrive as a float. BOQ lines are genuinely fractional — 12.375 sqm — and a
 * float quantity re-enters money through the back door, because the line value
 * is quantity × rate.
 */
function quantityMicros(input: BoqLineInputLike): bigint {
  return BigInt(input.quantityWhole) * QUANTITY_SCALE + BigInt(input.quantityMillionths);
}

function toDomain(id: string, input: BoqLineInputLike): BoqLine {
  return {
    id,
    description: input.description,
    uom: input.uom,
    quantity: quantityMicros(input),
    rate: fromWire(input.rate),
    // Absent means UNKNOWN and stays UNKNOWN. `boq.js:110` turns "we do not
    // know" into 80% of the rate, which then drives every margin on the screen.
    ...(input.costRate === undefined ? {} : { costRate: fromWire(input.costRate) }),
  };
}

function toWritten(id: string, input: BoqLineInputLike, version: number): WrittenLine {
  const line = toDomain(id, input);
  return {
    version,
    id,
    section: input.section,
    itemNo: input.itemNo,
    description: input.description,
    uom: input.uom,
    quantityMicros: line.quantity,
    rate: line.rate,
    costRate: line.costRate ?? null,
    amount: lineAmount(line),
  };
}

/** Refuse early if the project is not visible to this caller. RLS makes another
 *  tenant's project indistinguishable from a missing one, and so does this. */
async function assertProject(tx: TxLike, projectId: string): Promise<void> {
  const rows = await tx.query<{ id: string }>(
    `SELECT id FROM projects.projects WHERE id = $1`,
    [projectId],
  );
  if (rows[0] === undefined) throw new ProjectNotFound(`no such project: ${projectId}`);
}

/**
 * Add lines to a project's BOQ.
 *
 * All or nothing: the middleware's transaction covers the whole set, so a
 * duplicate item number in line 40 of 50 leaves none of them written. The
 * legacy inserts in a bare loop (`boq.js:71`, `:367`) and a failure part-way
 * leaves a partial schedule that reads as complete.
 */
export async function addBoqLines(
  tx: TxLike,
  ctx: TenantContext,
  projectId: string,
  lines: readonly BoqLineInputLike[],
): Promise<WrittenLine[]> {
  await assertProject(tx, projectId);
  await assertProjectOpen(tx, projectId);

  // Within the request, before touching the database: two lines claiming the
  // same (section, item_no) would otherwise surface as a constraint violation
  // naming only one of them.
  const seen = new Set<string>();
  for (const line of lines) {
    const key = `${line.section} ${line.itemNo}`;
    if (seen.has(key)) {
      throw new BoqError(`two lines claim ${line.section} item ${line.itemNo}`);
    }
    seen.add(key);
  }

  const written: WrittenLine[] = [];
  for (const input of lines) {
    const id = randomUUID();
    const line = toWritten(id, input, 1);
    try {
      await tx.query(
        `INSERT INTO projects.boq_items
           (tenant_id, id, project_id, section, item_no, description, uom,
            quantity_micros, rate, cost_rate)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          ctx.tenantId,
          id,
          projectId,
          line.section,
          line.itemNo,
          line.description,
          line.uom,
          line.quantityMicros,
          line.rate,
          line.costRate,
        ],
      );
    } catch (error) {
      throw asDuplicate(error, line);
    }
    written.push(line);
  }
  return written;
}

/**
 * Replace one line.
 *
 * The whole line is sent, not a patch. A partial edit needs a merge, a merge
 * needs the prior line, and the only copy the client has is the one it
 * rendered — which is how a stale rate gets written back.
 *
 * **BOQ-04: there is no optimistic lock here**, because `projects.boq_items`
 * has no version column. Two concurrent edits to one line: last writer wins,
 * silently. That is a real gap and it is recorded rather than papered over —
 * adding a version column is its own change, with its own migration and its own
 * negative test, and inventing a half-control here would look like the
 * purchase-order one without being it.
 */
export async function updateBoqLine(
  tx: TxLike,
  projectId: string,
  itemId: string,
  input: UpdateBoqLineInputLike,
): Promise<WrittenLine> {
  await assertProject(tx, projectId);
  await assertProjectOpen(tx, projectId);

  // Read first, so a stale version and a missing line are distinguishable. A
  // single conditional UPDATE that matched nothing could be either, and
  // answering "not found" to a concurrent edit would be a lie the caller acts
  // on by re-creating the line.
  const current = await tx.query<{ version: number }>(
    `SELECT version FROM projects.boq_items WHERE id = $1 AND project_id = $2`,
    [itemId, projectId],
  );
  const found = current[0];
  if (found === undefined) throw new BoqLineNotFound(`no such BOQ line: ${itemId}`);
  if (found.version !== input.expectedVersion) {
    throw new BoqStaleWrite(
      `this BOQ line was modified by someone else (expected version ${input.expectedVersion}, found ${found.version})`,
    );
  }

  let rows: { version: number }[];
  try {
    rows = await tx.query<{ version: number }>(
      `UPDATE projects.boq_items
          SET section         = $3,
              item_no         = $4,
              description     = $5,
              uom             = $6,
              quantity_micros = $7,
              rate            = $8,
              cost_rate       = $9,
              version         = version + 1
        WHERE id = $1 AND project_id = $2 AND version = $10
      RETURNING version`,
      [
        itemId,
        projectId,
        input.section,
        input.itemNo,
        input.description,
        input.uom,
        quantityMicros(input),
        fromWire(input.rate),
        input.costRate === undefined ? null : fromWire(input.costRate),
        input.expectedVersion,
      ],
    );
  } catch (error) {
    throw asDuplicate(error, toWritten(itemId, input, found.version));
  }

  const updated = rows[0];
  if (updated === undefined) {
    // The row was there a moment ago and the version matched, so this is the
    // concurrent case: another write landed between the read and this
    // statement. The predicate on the UPDATE is what makes that lose.
    throw new BoqStaleWrite(
      'this BOQ line was modified by someone else while the change was being saved',
    );
  }
  return toWritten(itemId, input, updated.version);
}

/**
 * Remove one line.
 *
 * Returns nothing and refuses when the line is not visible, rather than
 * reporting success for a row it did not touch. `deleteBOQItem` (`boq.js:339`)
 * issues the DELETE and returns `{ ok: true }` whatever happened, so deleting
 * another tenant's line and deleting nothing look identical to the caller.
 */
export async function deleteBoqLine(
  tx: TxLike,
  projectId: string,
  itemId: string,
): Promise<void> {
  await assertProject(tx, projectId);
  await assertProjectOpen(tx, projectId);

  let rows: { id: string }[];
  try {
    rows = await tx.query<{ id: string }>(
      `DELETE FROM projects.boq_items
        WHERE id = $1 AND project_id = $2
      RETURNING id`,
      [itemId, projectId],
    );
  } catch (error) {
    // `purchase_order_lines.boq_item_id` is ON DELETE RESTRICT (migration
    // `0031`): a line that has been ordered against cannot be removed while the
    // order stands. Surfaced as a refusal rather than a 500, because it is a
    // thing the caller can act on — cancel the order, or leave the line alone.
    if ((error as { code?: unknown } | null)?.code === FK_VIOLATION) {
      throw new BoqLineInUse(
        'this BOQ line has been ordered against and cannot be deleted while that purchase order exists',
      );
    }
    throw error;
  }
  if (rows[0] === undefined) throw new BoqLineNotFound(`no such BOQ line: ${itemId}`);
}

function asDuplicate(error: unknown, line: WrittenLine): unknown {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === UNIQUE_VIOLATION) {
    return new DuplicateBoqLine(
      `this BOQ already has ${line.section} item ${line.itemNo}`,
    );
  }
  return error;
}

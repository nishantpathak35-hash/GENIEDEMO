import { randomUUID } from 'node:crypto';
import type { Paise, TenantContext } from '@cog/contracts';
import { fromWire, mulRate, roundToPaise, bp } from '@cog/money';
import { finishPage, keyset, type PageQuery } from '@cog/service-kit';
import type { TxLike } from './approval-subject.js';
import { payeeProfile, type PayeeProfile } from './payables.js';

/**
 * Retention withheld from a vendor.
 *
 * **RET-01: the legacy never records it.** `vendor_retention_ledger` is created
 * (`migrations.js:271`), read by `getRetentionLedger` and updated by
 * `releaseRetentionAmount` — and **nothing in that codebase INSERTs into it**.
 * The release function therefore operates on rows only a manual seed could have
 * produced, and in an ordinary deployment there are none.
 *
 * So this is not a port. It records what is held, which nothing has ever done.
 *
 * **A release is a payment, so finance records it** (ADR-0014, addendum). What
 * was withheld is summed from bill payments, a release pays that out as a
 * payment voucher, and this module only marks the holding released in the same
 * transaction. The legacy `releaseRetentionAmount` (`site-controls.js:168`)
 * wrote no payment record of any kind (RET-02) — it moved `released_amount` and
 * the vendor was not paid — and none of it is ported.
 */

const FK_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

export class RetentionRefused extends Error {
  override readonly name = 'RetentionRefused';
}

export interface RetentionHolding {
  readonly id: string;
  readonly purchaseOrderId: string;
  readonly vendorId: string;
  readonly grossAmount: Paise;
  readonly retainedAmount: Paise;
  readonly retentionRateBp: number;
  readonly stage: string;
  readonly version: number;
  readonly orderNumber: string | null;
  readonly vendorName: string | null;
}

type Row = {
  id: string;
  purchase_order_id: string;
  vendor_id: string;
  gross_amount: string;
  retained_amount: string;
  retention_rate_bp: number;
  stage: string;
  version: number;
  order_number?: string | null;
  vendor_name?: string | null;
};

const COLUMNS = `id, purchase_order_id, vendor_id,
                 gross_amount::text AS gross_amount,
                 retained_amount::text AS retained_amount,
                 retention_rate_bp, stage, version`;

function toHolding(r: Row): RetentionHolding {
  return {
    id: r.id,
    purchaseOrderId: r.purchase_order_id,
    vendorId: r.vendor_id,
    grossAmount: fromWire(r.gross_amount),
    retainedAmount: fromWire(r.retained_amount),
    retentionRateBp: r.retention_rate_bp,
    stage: r.stage,
    version: r.version,
    orderNumber: r.order_number ?? null,
    vendorName: r.vendor_name ?? null,
  };
}

export interface RetentionFilters {
  readonly vendorId?: string;
  readonly projectId?: string;
  /** `held` or `released`. */
  readonly stage?: string;
}

export interface RetentionListPage {
  readonly items: readonly RetentionHolding[];
  readonly nextCursor: string | null;
  readonly prevCursor: string | null;
  readonly count: number;
}

/**
 * Retention holdings, newest first. `projectId` is not a column on this
 * table — it is the order's — so filtering by it is a join, the same one that
 * lets a purchase order's own tenant scoping cover the holding without a
 * second `tenant_id` predicate here.
 */
export async function listRetention(
  tx: TxLike,
  page: PageQuery,
  filters: RetentionFilters = {},
): Promise<RetentionListPage> {
  const params: unknown[] = [filters.vendorId ?? null, filters.projectId ?? null, filters.stage ?? null];
  const where = `($1::uuid IS NULL OR r.vendor_id = $1)
               AND ($2::uuid IS NULL OR o.project_id = $2)
               AND ($3::text IS NULL OR r.stage = $3)`;
  const k = keyset(page, 'r.created_at', 'r.id', 'timestamptz', true, params.length + 1);

  const rows = await tx.query<Row & { created_at: string }>(
    `SELECT r.id, r.purchase_order_id, r.vendor_id,
            r.gross_amount::text AS gross_amount,
            r.retained_amount::text AS retained_amount,
            r.retention_rate_bp, r.stage, r.version,
            o.number AS order_number, v.name AS vendor_name,
            r.created_at::text AS created_at
       FROM procurement.retention_holdings r
       LEFT JOIN procurement.purchase_orders o
              ON o.tenant_id = r.tenant_id AND o.id = r.purchase_order_id
       LEFT JOIN procurement.vendors v
              ON v.tenant_id = r.tenant_id AND v.id = r.vendor_id
      WHERE ${where}
        AND ${k.where}
      ORDER BY ${k.orderBy}
      LIMIT $${params.length + k.params.length + 1}`,
    [...params, ...k.params, page.limit + 1],
  );
  const [counted] = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM procurement.retention_holdings r
       LEFT JOIN procurement.purchase_orders o
              ON o.tenant_id = r.tenant_id AND o.id = r.purchase_order_id
      WHERE ${where}`,
    params,
  );
  const paged = finishPage(rows, page, (r) => ({ key: r.created_at, id: r.id }));
  return {
    items: paged.items.map(toHolding),
    nextCursor: paged.nextCursor,
    prevCursor: paged.prevCursor,
    count: counted?.n ?? 0,
  };
}

/**
 * Record retention against a purchase order.
 *
 * The retained amount is **computed here** from the order's gross and the rate,
 * through `mulRate` with `roundToPaise` named at the call site. No caller
 * supplies it — the rate is the input, the amount is the answer.
 *
 * `roundToPaise` rather than a statutory boundary: retention is a contractual
 * holdback, not a tax. No section governs it, and `mulRatio` refuses to
 * multiply without the boundary being named, which is what makes that
 * distinction visible at every call site rather than in a comment.
 */
export async function recordRetention(
  tx: TxLike,
  ctx: TenantContext,
  input: { purchaseOrderId: string; retentionRateBp: number },
): Promise<RetentionHolding> {
  const orders = await tx.query<{ vendor_id: string; gross: string }>(
    `SELECT vendor_id, gross::text AS gross
       FROM procurement.purchase_orders WHERE id = $1`,
    [input.purchaseOrderId],
  );
  const order = orders[0];
  if (order === undefined) {
    throw new RetentionRefused('that purchase order does not exist in this organisation');
  }

  const gross = fromWire(order.gross);
  const retained = mulRate(gross, bp(input.retentionRateBp), roundToPaise);

  const id = randomUUID();
  try {
    await tx.query(
      `INSERT INTO procurement.retention_holdings
         (tenant_id, id, purchase_order_id, vendor_id, gross_amount, retained_amount,
          retention_rate_bp)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        ctx.tenantId,
        id,
        input.purchaseOrderId,
        order.vendor_id,
        gross,
        retained,
        input.retentionRateBp,
      ],
    );
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === UNIQUE_VIOLATION) {
      throw new RetentionRefused('retention is already recorded against that purchase order');
    }
    if (code === FK_VIOLATION) {
      throw new RetentionRefused('that purchase order does not exist in this organisation');
    }
    throw error;
  }

  const rows = await tx.query<Row>(
    `SELECT ${COLUMNS} FROM procurement.retention_holdings WHERE id = $1`,
    [id],
  );
  return toHolding(rows[0]!);
}

export class RetentionNotFound extends Error {
  override readonly name = 'RetentionNotFound';
}

/** A holding about to be released, and who is paid. Refused once it has been released. */
export async function retentionForRelease(
  tx: TxLike,
  holdingId: string,
): Promise<{ readonly holding: RetentionHolding; readonly payee: PayeeProfile }> {
  const rows = await tx.query<Row>(
    `SELECT ${COLUMNS} FROM procurement.retention_holdings WHERE id = $1`,
    [holdingId],
  );
  const row = rows[0];
  if (row === undefined) throw new RetentionNotFound('No such retention holding.');
  const holding = toHolding(row);
  if (holding.stage === 'released') throw new RetentionRefused('This retention has already been released.');
  return { holding, payee: await payeeProfile(tx, holding.vendorId) };
}

/** Mark a holding released, in the transaction finance recorded the release in. */
export async function markRetentionReleased(tx: TxLike, holdingId: string): Promise<void> {
  const updated = await tx.query<{ id: string }>(
    `UPDATE procurement.retention_holdings
        SET stage = 'released', version = version + 1, updated_at = now()
      WHERE id = $1 AND stage = 'held'
      RETURNING id`,
    [holdingId],
  );
  if (updated.length === 0) throw new RetentionRefused('This retention was released by someone else first.');
}

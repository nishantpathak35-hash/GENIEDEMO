import { randomUUID } from 'node:crypto';
import type { Page, Paise, TenantContext } from '@cog/contracts';
import { fromWire } from '@cog/money';
import { finishPage, keyset, type PageQuery } from '@cog/service-kit';

/**
 * Site controls — imprest and joint measurement.
 *
 * **Retention is not here.** `procurement.retention_holdings` records what is
 * withheld, and **releasing it is deliberately not built**: a release is a
 * payment, and payments are gated on CA-01..CA-08. The legacy's
 * `releaseRetentionAmount` (`site-controls.js:149`) writes no payment record
 * either (RET-02), so porting it would move a number and pay nobody — which is
 * worse than not having it, because the ledger would say the vendor was paid.
 *
 * | Legacy | Why it is not ported |
 * |---|---|
 * | `amount_requested REAL`, `amount_approved REAL` (`migrations.js:245-246`) | Paise |
 * | `reconcileSiteImprest` stores receipt text and compares nothing (`:72-90`) | A reconciliation carries an amount, and a CHECK keeps it within the sanction (IMP-01) |
 * | The same principal may request and sanction (`:25`, `:53`) | Recorded separately so a chain can refuse it; the rule itself is PO-13 |
 * | `measured_qty REAL` (`migrations.js:262`) | Millionths of a unit |
 * | JMRs are mutable in principle — there is simply no update function | Append-only by grant: `app_runtime` has no UPDATE and no DELETE |
 */

export interface TxLike {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<R[]>;
}

const FK_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';

export class ImprestNotFound extends Error {
  override readonly name = 'ImprestNotFound';
}

export class ImprestConflict extends Error {
  override readonly name = 'ImprestConflict';
}

export class MeasurementRefused extends Error {
  override readonly name = 'MeasurementRefused';
}

export interface Imprest {
  readonly id: string;
  readonly projectId: string;
  readonly purpose: string;
  readonly amountRequested: Paise;
  readonly amountSanctioned: Paise | null;
  readonly amountReconciled: Paise | null;
  readonly status: string;
  readonly requestedBy: string;
  readonly sanctionedBy: string | null;
  readonly reconciledBy: string | null;
  readonly version: number;
}

const IMPREST_COLUMNS = `id, project_id, purpose,
  amount_requested::text AS amount_requested,
  amount_sanctioned::text AS amount_sanctioned,
  amount_reconciled::text AS amount_reconciled,
  status, requested_by, sanctioned_by, reconciled_by, version`;

type ImprestRow = {
  id: string;
  project_id: string;
  purpose: string;
  amount_requested: string;
  amount_sanctioned: string | null;
  amount_reconciled: string | null;
  status: string;
  requested_by: string;
  sanctioned_by: string | null;
  reconciled_by: string | null;
  version: number;
};

type ImprestListRow = ImprestRow & { created_at: string };

function toImprest(r: ImprestRow): Imprest {
  return {
    id: r.id,
    projectId: r.project_id,
    purpose: r.purpose,
    amountRequested: fromWire(r.amount_requested),
    amountSanctioned: r.amount_sanctioned === null ? null : fromWire(r.amount_sanctioned),
    amountReconciled: r.amount_reconciled === null ? null : fromWire(r.amount_reconciled),
    status: r.status,
    requestedBy: r.requested_by,
    sanctionedBy: r.sanctioned_by,
    reconciledBy: r.reconciled_by,
    version: r.version,
  };
}

export async function listImprest(
  tx: TxLike,
  projectId: string,
  page: PageQuery,
): Promise<Page<Imprest>> {
  const k = keyset(page, 'created_at', 'id', 'timestamptz', true, 2);
  const rows = await tx.query<ImprestListRow>(
    `SELECT ${IMPREST_COLUMNS}, created_at::text AS created_at
       FROM siteops.imprest_requests
      WHERE project_id = $1
        AND ${k.where}
      ORDER BY ${k.orderBy}
      LIMIT $${2 + k.params.length}`,
    [projectId, ...k.params, page.limit + 1],
  );
  const [counted] = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM siteops.imprest_requests WHERE project_id = $1`,
    [projectId],
  );
  const paged = finishPage(rows, page, (r) => ({ key: r.created_at, id: r.id }));
  return {
    items: paged.items.map(toImprest),
    nextCursor: paged.nextCursor,
    prevCursor: paged.prevCursor,
    count: counted?.n ?? 0,
  };
}

export async function requestImprest(
  tx: TxLike,
  ctx: TenantContext,
  input: { projectId: string; purpose: string; amountRequested: string },
): Promise<Imprest> {
  const id = randomUUID();
  try {
    await tx.query(
      `INSERT INTO siteops.imprest_requests
         (tenant_id, id, project_id, purpose, amount_requested, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        ctx.tenantId,
        id,
        input.projectId,
        input.purpose,
        fromWire(input.amountRequested),
        // Never from the body: who asked is who is authenticated.
        ctx.principal.id,
      ],
    );
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === FK_VIOLATION) {
      throw new ImprestNotFound('that project does not exist in this organisation');
    }
    throw error;
  }
  return getImprest(tx, id);
}

export async function getImprest(tx: TxLike, id: string): Promise<Imprest> {
  const rows = await tx.query<ImprestRow>(
    `SELECT ${IMPREST_COLUMNS} FROM siteops.imprest_requests WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (row === undefined) throw new ImprestNotFound(`no such imprest request: ${id}`);
  return toImprest(row);
}

/**
 * Sanction an imprest, for an amount that may be less than was asked.
 *
 * **The sanctioner is recorded separately from the requester.** They may be the
 * same person today — the legacy has no gate at all (IMP-02) — but the two
 * columns are what a separation-of-duties rule will read when PO-13 lands. A
 * single `approved_by` column would make that rule unwritable.
 */
export async function sanctionImprest(
  tx: TxLike,
  ctx: TenantContext,
  id: string,
  amountSanctioned: string,
  expectedVersion: number,
): Promise<Imprest> {
  const current = await getImprest(tx, id);
  assertVersion(current, expectedVersion);
  if (current.status !== 'requested') {
    throw new ImprestConflict(`this imprest is already ${current.status}`);
  }

  const rows = await tx.query<ImprestRow>(
    `UPDATE siteops.imprest_requests
        SET status = 'sanctioned', amount_sanctioned = $2, sanctioned_by = $3,
            version = version + 1, updated_at = now()
      WHERE id = $1 AND version = $4 AND status = 'requested'
    RETURNING ${IMPREST_COLUMNS}`,
    [id, fromWire(amountSanctioned), ctx.principal.id, expectedVersion],
  );
  return oneOr(rows, 'sanctioned');
}

/**
 * Reconcile a sanctioned imprest against what was actually spent.
 *
 * **IMP-01: the amount is required and cannot exceed the sanction.**
 * `reconcileSiteImprest` (`site-controls.js:72-90`) sets the status to
 * `Reconciled` and stores whatever `receipt_vouchers` text it was given,
 * comparing nothing — so an imprest can be reconciled against no receipts and
 * any amount.
 *
 * The ceiling is a CHECK constraint as well as a branch here, because a rule
 * enforced only in application code is a rule the next write path can miss.
 */
export async function reconcileImprest(
  tx: TxLike,
  ctx: TenantContext,
  id: string,
  amountReconciled: string,
  expectedVersion: number,
): Promise<Imprest> {
  const current = await getImprest(tx, id);
  assertVersion(current, expectedVersion);
  if (current.status !== 'sanctioned') {
    throw new ImprestConflict(
      `only a sanctioned imprest can be reconciled; this one is ${current.status}`,
    );
  }

  let rows: ImprestRow[];
  try {
    rows = await tx.query<ImprestRow>(
      `UPDATE siteops.imprest_requests
          SET status = 'reconciled', amount_reconciled = $2, reconciled_by = $3,
              version = version + 1, updated_at = now()
        WHERE id = $1 AND version = $4 AND status = 'sanctioned'
      RETURNING ${IMPREST_COLUMNS}`,
      [id, fromWire(amountReconciled), ctx.principal.id, expectedVersion],
    );
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === CHECK_VIOLATION) {
      throw new ImprestConflict('a reconciliation cannot exceed the sanctioned amount');
    }
    throw error;
  }
  return oneOr(rows, 'reconciled');
}

function assertVersion(current: Imprest, expectedVersion: number): void {
  if (current.version !== expectedVersion) {
    throw new ImprestConflict(
      `this imprest was modified by someone else (expected version ${expectedVersion}, found ${current.version})`,
    );
  }
}

function oneOr(rows: ImprestRow[], what: string): Imprest {
  const row = rows[0];
  if (row === undefined) {
    throw new ImprestConflict(`this imprest was ${what} by someone else while saving`);
  }
  return toImprest(row);
}

// ------------------------------------------------------ joint measurement ---

export interface Measurement {
  readonly id: string;
  readonly projectId: string;
  readonly boqItemId: string | null;
  readonly description: string;
  readonly location: string;
  readonly measuredMicros: string;
  readonly uom: string;
  readonly signedByClient: string;
  readonly signedBySite: string;
  readonly measuredOn: string;
}

/**
 * `created_at` was only ever a tiebreak the screen never renders — the
 * measurement sheet shows `measuredOn` and nothing finer — so the page key is
 * the date column itself, tiebroken by `id` rather than by a second timestamp
 * carried only for ordering. Simpler than a composite text key, and no less
 * correct: two measurements on the same date sort in an order nobody
 * distinguishes either way.
 */
export async function listMeasurements(
  tx: TxLike,
  projectId: string,
  page: PageQuery,
): Promise<Page<Measurement>> {
  const k = keyset(page, 'measured_on', 'id', 'date', true, 2);
  const rows = await tx.query<{
    id: string;
    project_id: string;
    boq_item_id: string | null;
    description: string;
    location: string;
    measured_micros: string;
    uom: string;
    signed_by_client: string;
    signed_by_site: string;
    measured_on: string;
  }>(
    `SELECT id, project_id, boq_item_id, description, location,
            measured_micros::text AS measured_micros, uom,
            signed_by_client, signed_by_site, measured_on::text AS measured_on
       FROM siteops.measurement_records
      WHERE project_id = $1
        AND ${k.where}
      ORDER BY ${k.orderBy}
      LIMIT $${2 + k.params.length}`,
    [projectId, ...k.params, page.limit + 1],
  );
  const [counted] = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM siteops.measurement_records WHERE project_id = $1`,
    [projectId],
  );
  const paged = finishPage(rows, page, (r) => ({ key: r.measured_on, id: r.id }));
  return {
    items: paged.items.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      boqItemId: r.boq_item_id,
      description: r.description,
      location: r.location,
      measuredMicros: r.measured_micros,
      uom: r.uom,
      signedByClient: r.signed_by_client,
      signedBySite: r.signed_by_site,
      measuredOn: r.measured_on,
    })),
    nextCursor: paged.nextCursor,
    prevCursor: paged.prevCursor,
    count: counted?.n ?? 0,
  };
}

/**
 * Record a joint measurement.
 *
 * There is no update and no delete, and `app_runtime` holds no grant for either
 * — a signed measurement that can be edited afterwards is not evidence of what
 * was agreed. A correction is a further record.
 *
 * `signed_by_site` is the authenticated principal. `signed_by_client` is free
 * text because the client's signatory is not a user of this system, and a CHECK
 * requires it to be non-empty: a JMR with one signature is not joint.
 */
export async function recordMeasurement(
  tx: TxLike,
  ctx: TenantContext,
  input: {
    projectId: string;
    boqItemId?: string | undefined;
    description: string;
    location?: string | undefined;
    quantityWhole: number;
    quantityMillionths: number;
    uom: string;
    signedByClient: string;
    measuredOn: string;
  },
): Promise<{ id: string }> {
  const id = randomUUID();
  const micros = BigInt(input.quantityWhole) * 1_000_000n + BigInt(input.quantityMillionths);
  if (micros <= 0n) throw new MeasurementRefused('a measurement must be greater than zero');

  try {
    await tx.query(
      `INSERT INTO siteops.measurement_records
         (tenant_id, id, project_id, boq_item_id, description, location,
          measured_micros, uom, signed_by_client, signed_by_site, measured_on)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        ctx.tenantId,
        id,
        input.projectId,
        input.boqItemId ?? null,
        input.description,
        input.location ?? '',
        micros,
        input.uom,
        input.signedByClient,
        ctx.principal.id,
        input.measuredOn,
      ],
    );
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === FK_VIOLATION) {
      throw new MeasurementRefused(
        'that project or BOQ line does not exist in this organisation',
      );
    }
    if (code === CHECK_VIOLATION) {
      throw new MeasurementRefused('a joint measurement needs both signatures');
    }
    throw error;
  }
  return { id };
}

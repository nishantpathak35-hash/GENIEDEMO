import { randomUUID } from 'node:crypto';
import type { Paise, TenantContext } from '@cog/contracts';
import { fromWire } from '@cog/money';
import {
  type ChangeOrder,
  type ChangeOrderState,
  type ClientDecision,
  ChangeOrderError,
  contractValue,
  decide,
  submitToClient,
} from '../domain/change-order.js';
import type { TxLike } from './boq-writes.js';
import { assertProjectOpen } from './project-guard.js';

/**
 * Change orders — persistence for `domain/change-order.ts`.
 *
 * **Every rule already lives in the domain**, which was written before this
 * table existed and records CO-01, CO-02 and CO-03. Nothing here decides
 * anything: `decide()` refuses an illegal transition, `submitToClient()` refuses
 * a zero-value variation, and `contractValue()` derives the current value from
 * the original plus the approved rows. This file loads, calls and stores.
 *
 * That division is the reason **CO-04 cannot happen here**. Approving the same
 * variation twice adds its cost twice in the legacy (`change-orders.js:62-94`
 * never checks the current status before incrementing). The domain's transition
 * table has `client_approved: []` — an approved variation has nowhere to go —
 * so the second call is refused before any write is attempted. The `WHERE state
 * = $n` on the UPDATE is what makes that hold under concurrency too.
 */

const FK_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

export class ChangeOrderNotFound extends Error {
  override readonly name = 'ChangeOrderNotFound';
}

export class ChangeOrderConflict extends Error {
  override readonly name = 'ChangeOrderConflict';
}

export interface StoredChangeOrder extends ChangeOrder {
  readonly number: string;
  readonly description: string;
  /** When it went to the client; `null` while a draft, and for a variation decided before 0101 recorded the moment. */
  readonly submittedAt: Date | null;
  readonly version: number;
}

type Row = {
  id: string;
  project_id: string;
  number: string;
  title: string;
  description: string;
  cost_impact: string;
  state: string;
  submitted_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
  version: number;
};

const COLUMNS = `id, project_id, number, title, description,
                 cost_impact::text AS cost_impact, state,
                 submitted_at::text AS submitted_at, decided_by,
                 decided_at::text AS decided_at, version`;

function toStored(r: Row): StoredChangeOrder {
  return {
    id: r.id,
    projectId: r.project_id,
    number: r.number,
    title: r.title,
    description: r.description,
    state: r.state as ChangeOrderState,
    costImpact: fromWire(r.cost_impact),
    submittedAt: r.submitted_at === null ? null : new Date(r.submitted_at),
    decidedBy: r.decided_by,
    decidedAt: r.decided_at === null ? null : new Date(r.decided_at),
    version: r.version,
  };
}

export async function listChangeOrders(
  tx: TxLike,
  projectId: string,
): Promise<StoredChangeOrder[]> {
  const rows = await tx.query<Row>(
    `SELECT ${COLUMNS} FROM projects.change_orders WHERE project_id = $1 ORDER BY number`,
    [projectId],
  );
  return rows.map(toStored);
}

export async function getChangeOrder(tx: TxLike, id: string): Promise<StoredChangeOrder> {
  const rows = await tx.query<Row>(`SELECT ${COLUMNS} FROM projects.change_orders WHERE id = $1`, [
    id,
  ]);
  const row = rows[0];
  if (row === undefined) throw new ChangeOrderNotFound(`no such change order: ${id}`);
  return toStored(row);
}

export interface CreateChangeOrderInputLike {
  readonly projectId: string;
  readonly number: string;
  readonly title: string;
  readonly description?: string | undefined;
  /** Signed paise: positive is an addition, negative an omission. */
  readonly costImpact: string;
}

export async function createChangeOrder(
  tx: TxLike,
  ctx: TenantContext,
  input: CreateChangeOrderInputLike,
): Promise<StoredChangeOrder> {
  await assertProjectOpen(tx, input.projectId);
  const id = randomUUID();
  try {
    await tx.query(
      `INSERT INTO projects.change_orders
         (tenant_id, id, project_id, number, title, description, cost_impact, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        ctx.tenantId,
        id,
        input.projectId,
        input.number,
        input.title,
        input.description ?? '',
        fromWire(input.costImpact),
        ctx.principal.id,
      ],
    );
  } catch (error) {
    throw asWriteError(error, input.number);
  }
  return getChangeOrder(tx, id);
}

/** Send a draft variation to the client. `submitToClient` refuses a zero one. */
export async function submitChangeOrder(
  tx: TxLike,
  id: string,
  expectedVersion: number,
): Promise<StoredChangeOrder> {
  const current = await getChangeOrder(tx, id);
  assertVersion(current, expectedVersion);
  await assertProjectOpen(tx, current.projectId);

  // The domain decides whether this is legal. If it throws, nothing is written.
  const next = submitToClient(current);

  const rows = await tx.query<Row>(
    `UPDATE projects.change_orders
        SET state = $2, submitted_at = now(), version = version + 1, updated_at = now()
      WHERE id = $1 AND version = $3 AND state = $4
    RETURNING ${COLUMNS}`,
    [id, next.state, expectedVersion, current.state],
  );
  return oneOr(rows);
}

/**
 * Record the client's decision.
 *
 * `decide()` refuses anything but an explicit approve or reject, refuses an
 * empty signatory, and refuses a transition the state machine does not allow —
 * which is what stops an approved variation being approved again (CO-04).
 *
 * `approveChangeOrderAsClient` (`change-orders.js:96-118`) instead treats
 * everything that is not the literal string `Reject` as approval, including a
 * missing field (CO-03).
 */
export async function decideChangeOrder(
  tx: TxLike,
  id: string,
  decision: ClientDecision,
  signedBy: string,
  expectedVersion: number,
): Promise<StoredChangeOrder> {
  const current = await getChangeOrder(tx, id);
  assertVersion(current, expectedVersion);

  const at = new Date();
  const next = decide(current, decision, signedBy, at);

  const rows = await tx.query<Row>(
    `UPDATE projects.change_orders
        SET state = $2, decided_by = $3, decided_at = $4,
            version = version + 1, updated_at = now()
      WHERE id = $1 AND version = $5 AND state = $6
    RETURNING ${COLUMNS}`,
    [id, next.state, signedBy, at.toISOString(), expectedVersion, current.state],
  );
  return oneOr(rows);
}

export interface DerivedContract {
  readonly original: Paise | null;
  readonly current: Paise | null;
  readonly approvedVariations: number;
  readonly pendingVariations: number;
}

/**
 * The contract value for a project.
 *
 * `contractValue()` in the domain does the arithmetic; this supplies the rows.
 * `original` may be `null` — a project with no entered contract value has no
 * derived one either, and returning zero would be PROJ-01's mistake in a new
 * place.
 */
export async function derivedContractValue(
  tx: TxLike,
  projectId: string,
  original: Paise | null,
): Promise<DerivedContract> {
  const orders = await listChangeOrders(tx, projectId);
  const pending = orders.filter((co) => co.state === 'pending_client').length;

  if (original === null) {
    return {
      original: null,
      current: null,
      approvedVariations: orders.filter((co) => co.state === 'client_approved').length,
      pendingVariations: pending,
    };
  }

  const value = contractValue(original, orders);
  return {
    original: value.original,
    current: value.current,
    approvedVariations: value.approvedVariations,
    pendingVariations: pending,
  };
}

function assertVersion(current: StoredChangeOrder, expectedVersion: number): void {
  if (current.version !== expectedVersion) {
    throw new ChangeOrderConflict(
      `this change order was modified by someone else (expected version ${expectedVersion}, found ${current.version})`,
    );
  }
}

function oneOr(rows: Row[]): StoredChangeOrder {
  const row = rows[0];
  if (row === undefined) {
    throw new ChangeOrderConflict(
      'this change order was changed by someone else while the change was being saved',
    );
  }
  return toStored(row);
}

function asWriteError(error: unknown, number: string): unknown {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === UNIQUE_VIOLATION) {
    return new ChangeOrderConflict(`this project already has a change order numbered ${number}`);
  }
  if (code === FK_VIOLATION) {
    return new ChangeOrderNotFound('that project does not exist in this organisation');
  }
  return error;
}

export { ChangeOrderError };

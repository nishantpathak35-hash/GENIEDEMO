import type { Paise } from '@cog/contracts';
import { fromWire, sum, toWire } from '@cog/money';
import type { TxLike } from './approval-subject.js';

/**
 * Orders waiting on a decision — the queue, as procurement sees it.
 *
 * **Procurement's half of the Today hero.** Which orders are pending, how much
 * they hold up and how long each has waited is answerable from
 * `procurement.purchase_orders` alone. WHO they wait on is not: the awaiting
 * stage is workflow's rule (`awaitingStage`) and the people holding that role
 * are identity's, so the composition happens in `services/host`, which hands
 * this module the stage per order and takes back the summary.
 *
 * `waitingSince` is `updated_at`, which `submitForApproval` sets when the
 * order enters the queue and nothing else touches while it waits — an approval
 * that advances the chain also moves it, which is right: an order that just
 * cleared procurement and is now with finance has been waiting on finance
 * since then, not since it was raised.
 *
 * The age is counted HERE, in whole days from a clock the caller passes, so a
 * screen never compares two dates in the browser and two screens never
 * disagree about how old an order is.
 */

export interface PendingOrder {
  readonly id: string;
  readonly number: string;
  readonly gross: Paise;
  readonly vendorName: string | null;
  readonly projectId: string | null;
  /** `approval_stage` as stored: the stage being collected, `''` before the chain is entered. */
  readonly currentStage: string;
  readonly waitingSince: string;
  /** `created_by` as stored — a principal id for anything raised in this product. */
  readonly requesterId: string;
  readonly raisedAt: string;
}

export async function pendingApprovals(tx: TxLike): Promise<PendingOrder[]> {
  // No `WHERE tenant_id` — RLS applies it.
  const rows = await tx.query<{
    id: string;
    number: string;
    gross: string;
    vendor_name: string | null;
    project_id: string | null;
    approval_stage: string | null;
    updated_at: string;
    created_by: string | null;
    created_at: string;
  }>(
    `SELECT o.id, o.number, o.gross::text AS gross, v.name AS vendor_name, o.project_id,
            o.approval_stage, o.updated_at::text AS updated_at,
            o.created_by, o.created_at::text AS created_at
       FROM procurement.purchase_orders o
       LEFT JOIN procurement.vendors v
              ON v.tenant_id = o.tenant_id AND v.id = o.vendor_id
      WHERE o.state = 'pending_approval'
      ORDER BY o.updated_at ASC`,
  );
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    gross: fromWire(r.gross),
    vendorName: r.vendor_name,
    projectId: r.project_id,
    currentStage: r.approval_stage ?? '',
    waitingSince: r.updated_at,
    requesterId: r.created_by ?? '',
    raisedAt: r.created_at,
  }));
}

/** What host resolved for one pending order from the other two services. */
export interface StageResolution {
  readonly stageName: string;
  readonly approverRole: string;
  readonly projectCode: string | null;
}

export interface BlockedApprovalItem {
  readonly id: string;
  readonly number: string;
  readonly gross: string;
  readonly vendorName: string | null;
  readonly projectId: string | null;
  readonly projectCode: string | null;
  readonly waitingSince: string;
  readonly days: number;
  readonly stageName: string;
  readonly approverRole: string;
  readonly requesterId: string;
  readonly raisedAt: string;
}

export interface BlockedApprovalsSummary {
  readonly count: number;
  /** Wire string: the gross of every waiting order, summed here. */
  readonly total: string;
  readonly oldestDays: number | null;
  /** How many have waited more than seven whole days — "older than a week" on the hero. */
  readonly olderThanWeek: number;
  readonly items: readonly BlockedApprovalItem[];
  /** Orders per awaiting role, for the owners row. */
  readonly byRole: ReadonlyMap<string, number>;
}

/** The week an approval is "older than": more than seven whole days in the queue. */
export const WEEK_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days between two instants, floored at zero.
 *
 * Floored, not rounded: an order submitted this morning has waited zero days,
 * and "1 day" on the day it was raised would over-state the age of every
 * order in the queue by half a day on average.
 */
export function wholeDaysBetween(from: string, now: Date): number {
  const elapsed = now.getTime() - new Date(from).getTime();
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;
  return Math.floor(elapsed / DAY_MS);
}

/**
 * Summarise the queue.
 *
 * The one place the held-up value is summed — `sum` from `packages/money`, on
 * `Paise`, never on the wire strings — and the one place an age is counted.
 * `resolve` is host's answer per order (stage name, role, project code); an
 * order whose stage cannot be resolved is still counted and still summed, with
 * an empty role, because an order nobody can approve is the most blocked kind.
 */
export function summariseBlockedApprovals(
  orders: readonly PendingOrder[],
  resolve: (order: PendingOrder) => StageResolution,
  now: Date,
): BlockedApprovalsSummary {
  const byRole = new Map<string, number>();
  const items = orders.map((order) => {
    const stage = resolve(order);
    byRole.set(stage.approverRole, (byRole.get(stage.approverRole) ?? 0) + 1);
    return {
      id: order.id,
      number: order.number,
      gross: toWire(order.gross),
      vendorName: order.vendorName,
      projectId: order.projectId,
      projectCode: stage.projectCode,
      waitingSince: order.waitingSince,
      days: wholeDaysBetween(order.waitingSince, now),
      stageName: stage.stageName,
      approverRole: stage.approverRole,
      requesterId: order.requesterId,
      raisedAt: order.raisedAt,
    };
  });
  const oldest = items.reduce<number | null>(
    (acc, item) => (acc === null || item.days > acc ? item.days : acc),
    null,
  );
  return {
    count: items.length,
    total: toWire(sum(orders.map((o) => o.gross))),
    oldestDays: oldest,
    olderThanWeek: items.filter((item) => item.days > WEEK_DAYS).length,
    items,
    byRole,
  };
}

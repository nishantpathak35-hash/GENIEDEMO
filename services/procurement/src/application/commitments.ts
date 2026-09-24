import type { Paise } from '@cog/contracts';
import { fromWire } from '@cog/money';
import type { TxLike } from './approval-subject.js';

/**
 * Committed spend, per project.
 *
 * **Procurement's answer to "what have we committed", and procurement is the
 * only service that can give it** — `services/projects` may not read
 * `procurement.purchase_orders`, so the project rollup is assembled in
 * `services/host` from this and from projects' own figures.
 *
 * `gross` is `taxable + gst`, and **TDS is not netted** (PO-23). The legacy
 * writes `po_value = subt + gstSum - tdsAmt` (`POService.ts:48`), so its
 * committed spend is under-stated by the deduction — and `committedSpend` in
 * `services/projects` sums exactly that column.
 *
 * Cancelled orders are excluded: a cancelled order commits nothing. Draft
 * orders **are** included, because a raised order is a commitment in the sense
 * a director cares about even before it is approved — and excluding them would
 * make the figure jump when an approval lands rather than when the spend was
 * decided.
 */

export interface ProjectCommitment {
  /** `null` for orders not attached to a project — a general purchase. */
  readonly projectId: string | null;
  readonly committed: Paise;
  readonly orderCount: number;
}

/**
 * Committed spend grouped by project.
 *
 * `project_id` arrived in migration `0036`; before it, an order carried a
 * project **name** and the legacy matched it with `LIKE '%…%'`, so a per-project
 * total was the sum over whatever the substring matched (PROJ-02).
 *
 * Orders with no project are returned under a `null` key rather than dropped: a
 * general overhead purchase is real spend, and silently excluding it would make
 * the tenant total and the sum of the per-project totals disagree.
 */
/**
 * APPROVED spend grouped by project — what margin at risk measures against the
 * BOQ cost budget. Narrower than `committedByProject` on purpose: a draft or
 * an order still waiting is spend somebody intends, not spend anybody signed.
 */
export async function approvedCommitmentsByProject(tx: TxLike): Promise<ProjectCommitment[]> {
  const rows = await tx.query<{ project_id: string | null; committed: string; n: number }>(
    `SELECT project_id,
            COALESCE(SUM(gross), 0)::text AS committed,
            count(*)::int AS n
       FROM procurement.purchase_orders
      WHERE state = 'approved'
      GROUP BY project_id`,
  );
  return rows.map((r) => ({
    projectId: r.project_id,
    committed: fromWire(r.committed),
    orderCount: r.n,
  }));
}

export async function committedByProject(tx: TxLike): Promise<ProjectCommitment[]> {
  const rows = await tx.query<{ project_id: string | null; committed: string; n: number }>(
    `SELECT project_id,
            COALESCE(SUM(gross), 0)::text AS committed,
            count(*)::int AS n
       FROM procurement.purchase_orders
      WHERE state <> 'cancelled'
      GROUP BY project_id`,
  );
  return rows.map((r) => ({
    projectId: r.project_id,
    committed: fromWire(r.committed),
    orderCount: r.n,
  }));
}

import type { Paise } from '@cog/contracts';
import { ZERO, add, excessBasisPoints, fromWire, shareBasisPoints, sum, toWire } from '@cog/money';
import type { TxLike } from './boq-writes.js';
import type { BoqLine } from '../domain/boq.js';
import { costBudget, marginAtRisk, type CostBudget } from '../domain/margin.js';
import type { CommitmentLike, ProjectBudgetRow } from './rollup.js';

/**
 * Every project's BOQ cost budget, keyed by project id.
 *
 * Reads the four columns the budget needs from every BOQ line in the tenant —
 * a whole-tenant read, bounded by the tenant's BOQ, feeding a server-side
 * aggregate and never a screen. RLS scopes it; no `WHERE tenant_id`.
 */
export async function listBoqCostBudgets(tx: TxLike): Promise<ReadonlyMap<string, CostBudget>> {
  const rows = await tx.query<{
    project_id: string;
    id: string;
    quantity_micros: string;
    rate: string;
    cost_rate: string | null;
  }>(
    `SELECT project_id, id, quantity_micros::text AS quantity_micros,
            rate::text AS rate, cost_rate::text AS cost_rate
       FROM projects.boq_items`,
  );
  const byProject = new Map<string, BoqLine[]>();
  for (const r of rows) {
    const lines = byProject.get(r.project_id) ?? [];
    lines.push({
      id: r.id,
      description: '',
      uom: '',
      quantity: BigInt(r.quantity_micros),
      rate: fromWire(r.rate),
      ...(r.cost_rate === null ? {} : { costRate: fromWire(r.cost_rate) }),
    });
    byProject.set(r.project_id, lines);
  }
  return new Map([...byProject].map(([id, lines]) => [id, costBudget(lines)]));
}

/**
 * The Today stat: margin at risk across every project, on the wire.
 *
 * `absent` only when no project has a BOQ at all — then there is no budget
 * anywhere to measure against. Otherwise present: the total at risk over the
 * projects that have one, how many are over, and how many of those figures
 * are partial and by how many unpriced lines. The top five over, largest first.
 */
export function marginAtRiskSummary(
  budgets: readonly ProjectBudgetRow[],
  costBudgets: ReadonlyMap<string, CostBudget>,
  approved: readonly CommitmentLike[],
): Record<string, unknown> {
  const approvedOf = new Map(approved.map((a) => [a.projectId, a.committed]));
  const measured = budgets
    .map((p) => ({ project: p, margin: marginAtRisk(costBudgets.get(p.id), approvedOf.get(p.id) ?? ZERO) }))
    .filter((m) => m.margin.status !== 'no-boq');

  if (measured.length === 0) {
    return {
      status: 'absent' as const,
      why: 'No project has a BOQ yet, so there is no cost budget to measure approved orders against.',
      missing: ['projects.boq_items — no lines on any project'],
    };
  }

  const over = measured
    .filter((m) => (m.margin.atRisk ?? ZERO) > ZERO)
    .sort((a, b) => {
      const x = a.margin.atRisk ?? ZERO;
      const y = b.margin.atRisk ?? ZERO;
      return x > y ? -1 : x < y ? 1 : 0;
    });
  const partial = measured.filter((m) => m.margin.status === 'partial');
  const total = sum(measured.map((m) => m.margin.atRisk ?? ZERO)) as Paise;
  const costBudget = sum(measured.map((m) => m.margin.costBudget ?? ZERO)) as Paise;
  const committedApproved = sum(measured.map((m) => m.margin.committedApproved)) as Paise;
  // The tile's bar: the budget's share of budget plus what is past it — the
  // covered part; the remainder is the shortfall. Two decimals, truncated; a
  // display width, so no rounding boundary governs it.
  const scale = add(costBudget, total);
  const coveredBp = scale <= ZERO ? 0 : shareBasisPoints(costBudget, scale);
  const coveredPct = Math.min(100, coveredBp / 100);

  return {
    status: 'present' as const,
    total: toWire(total),
    costBudget: toWire(costBudget),
    committedApproved: toWire(committedApproved),
    coveredPct,
    projectsOver: over.length,
    partialProjects: partial.length,
    unpricedLines: partial.reduce((lines, m) => lines + m.margin.unpricedLines, 0),
    items: over.slice(0, 5).map((m) => ({
      projectId: m.project.id,
      code: m.project.code,
      status: m.margin.status,
      costBudget: toWire(m.margin.costBudget ?? ZERO),
      committedApproved: toWire(m.margin.committedApproved),
      atRisk: toWire(m.margin.atRisk ?? ZERO),
      unpricedLines: m.margin.unpricedLines,
    })),
  };
}

/** The cost rate of each named BOQ line; `null` for a line with none. Absent ids are not this tenant's. */
export async function boqCostRatesByIds(
  tx: TxLike,
  ids: readonly string[],
): Promise<ReadonlyMap<string, Paise | null>> {
  if (ids.length === 0) return new Map();
  const rows = await tx.query<{ id: string; cost_rate: string | null }>(
    `SELECT id, cost_rate::text AS cost_rate FROM projects.boq_items WHERE id = ANY($1::uuid[])`,
    [[...new Set(ids)]],
  );
  return new Map(rows.map((r) => [r.id, r.cost_rate === null ? null : fromWire(r.cost_rate)]));
}

/**
 * Agreed rates against the BOQ cost rates they were ordered from, for the
 * rate library: each pair names the BOQ line an order line was raised from
 * and the rate agreed with the vendor for it, and the answer is that line's
 * cost rate and the agreed rate's excess over it in basis points (signed;
 * null where the line carries no cost rate). Wires in, wires out: the
 * composition root that asks holds no money package and converts nothing.
 */
export async function agreedAgainstBoqCostRates(
  tx: TxLike,
  pairs: ReadonlyArray<{ readonly boqItemId: string; readonly agreedRate: string }>,
): Promise<ReadonlyMap<string, { readonly boqCostRate: string | null; readonly agreedBpOfBoqCost: number | null }>> {
  const costRates = await boqCostRatesByIds(
    tx,
    pairs.map((p) => p.boqItemId),
  );
  const out = new Map<string, { boqCostRate: string | null; agreedBpOfBoqCost: number | null }>();
  for (const pair of pairs) {
    const cost = costRates.get(pair.boqItemId) ?? null;
    out.set(pair.boqItemId, {
      boqCostRate: cost === null ? null : toWire(cost),
      // the one division, in packages/money; a cost rate of zero has no percentage above it
      agreedBpOfBoqCost: cost === null || cost <= 0n ? null : excessBasisPoints(cost, fromWire(pair.agreedRate)),
    });
  }
  return out;
}

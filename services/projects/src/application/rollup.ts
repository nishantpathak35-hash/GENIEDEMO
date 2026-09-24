import type { Paise } from '@cog/contracts';
import { ZERO, add, fromWire, isZero, mulRatio, ratio, roundToPaise, shareBasisPoints, sub, sum, toWire } from '@cog/money';
import type { TxLike } from './boq-writes.js';
import { marginAtRisk, type CostBudget } from '../domain/margin.js';
import {
  DEFAULT_HEALTH_THRESHOLD,
  type HealthThreshold,
  healthThreshold,
  projectFinancials,
  projectHealth,
} from '../domain/project-financials.js';

/**
 * What a project rollup needs from `projects`.
 *
 * The rollup itself is assembled in `services/host`, because committed spend
 * comes from `procurement.purchase_orders` and no service may import another.
 * Everything that is *projects'* to answer is answered here — including which
 * threshold bands a project, which is a projects rule and not host's.
 */

export interface ProjectBudgetRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly state: string;
  /**
   * The originally signed contract value, or `null` when nobody has entered
   * one. Never a guess and never zero — PROJ-01 is what happens when a missing
   * budget is filled in with something plausible.
   *
   * `projects.projects.original_value` is *original* on purpose: CO-02 records
   * that the legacy rewrites the contract value in place when a change order is
   * approved, losing the figure that was signed. The current value is
   * `original_value` plus approved variations — and **there is no change-order
   * table yet**, so today the two are the same and this is exact rather than
   * provisional. When that table lands, this is the function that changes.
   */
  readonly contractValue: Paise | null;
}

export async function listProjectBudgets(tx: TxLike): Promise<ProjectBudgetRow[]> {
  // No `WHERE tenant_id` — RLS applies it.
  const rows = await tx.query<{
    id: string;
    code: string;
    name: string;
    state: string;
    original_value: string | null;
  }>(
    `SELECT id, code, name, state, original_value::text AS original_value
       FROM projects.projects
      ORDER BY code`,
  );
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    state: r.state,
    contractValue: r.original_value === null ? null : fromWire(r.original_value),
  }));
}

/**
 * The tenant's at-risk threshold, or the documented provisional default.
 *
 * A tenant with no row gets `DEFAULT_HEALTH_THRESHOLD`, whose `provisional`
 * flag travels with every answer computed from it — so a screen can say the
 * band was inherited rather than agreed (PO-18). The default is **not** silently
 * indistinguishable from a confirmed 85.
 */
/**
 * `part` as a percentage of `whole`, two decimals, floored. Display only —
 * a bar's width — so no rounding boundary governs it; `shareBasisPoints` is
 * the one exact division. Zero for an empty scale.
 */
function share(part: Paise, whole: Paise): number {
  if (isZero(whole) || whole < 0n || part < 0n) return 0;
  const bp = shareBasisPoints(part, whole);
  const pct = bp / 100;
  return pct > 100 ? 100 : pct;
}

export async function loadHealthThreshold(tx: TxLike): Promise<HealthThreshold> {
  const rows = await tx.query<{ at_risk_pct: number; status: string }>(
    `SELECT at_risk_pct, status FROM projects.health_thresholds`,
  );
  const row = rows[0];
  if (row === undefined) return DEFAULT_HEALTH_THRESHOLD;
  return healthThreshold(row.at_risk_pct, row.status === 'confirmed');
}

/** What procurement can tell us about a project, in procurement's own terms. */
export interface CommitmentLike {
  readonly projectId: string | null;
  readonly committed: Paise;
  readonly orderCount: number;
}

/**
 * Assemble the project rollup.
 *
 * **This lives in `projects`, not in `services/host`, because it multiplies
 * money.** Host composes the two services that hold the inputs and must not
 * touch a monetary value at all — it has no `@cog/money` dependency, so it
 * could not format one even if it wanted to. Banding a project against its
 * budget is projects' rule; assembling it here is what keeps that true.
 *
 * **Five figures are deliberately absent: inflow, outflow, TDS, the actual
 * margin and the balance.** All five come from the payment path, and none of
 * those tables exists — payments are gated on CA-01..CA-08. They are omitted
 * rather than zeroed: `outflow: 0` is a statement that nothing has been paid,
 * and a screen would render it beside a real committed figure as though the two
 * were comparable.
 *
 * `plannedMargin` is absent for a different reason — it needs a budgeted cost of
 * sale, and `projects.projects` has no `bcs` column. The legacy keeps it in
 * `project_financials`, a manual-override table declared three times with three
 * different column sets (`projects.js:132`, `:208`, `:408`).
 */
export function buildProjectRollup(
  budgets: readonly ProjectBudgetRow[],
  threshold: HealthThreshold,
  commitments: readonly CommitmentLike[],
  costBudgets: ReadonlyMap<string, CostBudget>,
  approved: readonly CommitmentLike[],
  /** Billed to each client so far, finance's sum per project, passed by the host. Absent means nothing billed anywhere. */
  invoiced: ReadonlyMap<string, Paise> = new Map(),
): Record<string, unknown> {
  const byProject = new Map(commitments.map((c) => [c.projectId, c]));
  const approvedOf = new Map(approved.map((c) => [c.projectId, c.committed]));

  const items = budgets.map((p) => {
    const commitment = byProject.get(p.id);
    const committed = commitment?.committed ?? ZERO;

    const financials = projectFinancials({
      committed,
      contractValue: p.contractValue,
      bcs: null,
      inflow: ZERO,
      outflow: ZERO,
      tds: ZERO,
    });

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      state: p.state,
      contractValue: p.contractValue === null ? null : toWire(p.contractValue),
      committed: toWire(committed),
      orderCount: commitment?.orderCount ?? 0,
      health: projectHealth(financials, threshold),
      margin: toMarginWire(marginAtRisk(costBudgets.get(p.id), approvedOf.get(p.id) ?? ZERO)),
    };
  });

  const unattached = byProject.get(null);

  // One scale for every bar: the largest contract, or the largest commitment
  // where a project has no contract, is the full row. Computed here because
  // it is a comparison of money, and drawn by the screen from the percentages.
  const denominator = budgets.reduce<Paise>((max, p) => {
    const contract = p.contractValue ?? ZERO;
    const committed = byProject.get(p.id)?.committed ?? ZERO;
    const larger = contract > committed ? contract : committed;
    return larger > max ? larger : max;
  }, ZERO);

  const drawn = items.map((item, index) => {
    const p = budgets[index];
    const committed = byProject.get(item.id)?.committed ?? ZERO;
    const contract = p?.contractValue ?? null;
    const usable = contract !== null && !isZero(contract) && contract > 0n;
    // Two statements on purpose: the lint rule reads any money-named identifier
    // under a `/`, and `bp` is a plain number by the time it is divided.
    const bp = usable ? shareBasisPoints(committed, contract) : 0;
    const orderedPct = usable ? Math.floor(bp / 100) : null;
    // Billed to the client so far, and its share of the same contract — the
    // Overview's first tile: contract · ordered · billed on one bar.
    const billed = invoiced.get(item.id) ?? ZERO;
    const billedBp = usable ? shareBasisPoints(billed, contract) : 0;
    const billedPct = usable ? Math.floor(billedBp / 100) : null;
    const meter = {
      trackPct: usable ? share(contract, denominator) : 0,
      fillPct: usable && committed > contract ? share(contract, denominator) : share(committed, denominator),
      thresholdPct: usable
        ? share(mulRatio(contract, ratio(BigInt(threshold.atRiskPct), 100n), roundToPaise), denominator)
        : null,
      overPct: usable && committed > contract ? share(sub(committed, contract), denominator) : 0,
    };
    return { ...item, orderedPct, billed: toWire(billed), billedPct, meter };
  });

  return {
    items: drawn,
    orderedSoFar: toWire(sum(commitments.filter((c) => c.projectId !== null).map((c) => c.committed))),
    // The band every `health` above was computed against, and whether anybody
    // confirmed it. PO-18: 85 is inherited from `ProjectsSidebar.js:12` and has
    // never been observed working, so the answer says so rather than looking
    // settled.
    threshold: { atRiskPct: threshold.atRiskPct, provisional: threshold.provisional },
    // Spend attached to no project — a general purchase. Reported rather than
    // dropped, so the per-project figures and the tenant total cannot silently
    // disagree.
    unattached: {
      committed: toWire(unattached?.committed ?? ZERO),
      orderCount: unattached?.orderCount ?? 0,
    },
  };
}

function toMarginWire(m: ReturnType<typeof marginAtRisk>): Record<string, unknown> {
  // The tile's bar: the budget's share of budget plus what is past it. Two
  // statements, so the division is on the basis points and not on money.
  const scale = m.costBudget === null ? null : add(m.costBudget, m.atRisk ?? ZERO);
  const coveredBp = scale === null || scale <= ZERO || m.costBudget === null ? null : shareBasisPoints(m.costBudget, scale);
  return {
    status: m.status,
    costBudget: m.costBudget === null ? null : toWire(m.costBudget),
    committedApproved: toWire(m.committedApproved),
    atRisk: m.atRisk === null ? null : toWire(m.atRisk),
    unpricedLines: m.unpricedLines,
    coveredPct: coveredBp === null ? null : Math.min(100, coveredBp / 100),
  };
}

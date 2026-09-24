import type { Paise } from '@cog/contracts';
import { ZERO, sub, sum } from '@cog/money';
import { lineCost, type BoqLine } from './boq.js';

/**
 * Margin at risk — orders already approved against what the BOQ says the work
 * should cost.
 *
 * **The cost budget is derived, never typed.** It is Σ(quantity × cost rate)
 * over the project's BOQ, each line rounded once to paise by `lineCost`, the
 * same boundary the BOQ screen's own cost total uses. There is no budget
 * column for somebody to fill in with a round number (PROJ-01), and no cost
 * rate is ever invented for a line that has none (BOQ-02).
 *
 * **Absent is not zero, and partial is said.** A project with no BOQ has no
 * budget to measure against — `no-boq`, no figure. A BOQ with unpriced lines
 * has a budget that is too LOW by whatever those lines cost, so the figure
 * over it overstates the risk; it is still the best statement on file, and it
 * travels as `partial` with the count of lines that made it so, never as a
 * complete answer.
 *
 * At risk = approved orders − cost budget, where that is positive; zero when
 * the orders sit inside the budget. Approved, not merely raised: a draft is
 * not yet a commitment anybody signed.
 */

export type MarginStatus = 'complete' | 'partial' | 'no-boq';

export interface CostBudget {
  /** Σ line cost over the lines that carry a cost rate. */
  readonly budget: Paise;
  readonly pricedLines: number;
  readonly unpricedLines: number;
}

export interface MarginAtRisk {
  readonly status: MarginStatus;
  /** `null` for `no-boq`. */
  readonly costBudget: Paise | null;
  readonly committedApproved: Paise;
  /** `null` for `no-boq`; zero when approved orders sit inside the budget. */
  readonly atRisk: Paise | null;
  readonly unpricedLines: number;
}

export function costBudget(lines: readonly BoqLine[]): CostBudget {
  const priced = lines.filter((l) => l.costRate !== undefined);
  return {
    budget: sum(priced.map(lineCost)),
    pricedLines: priced.length,
    unpricedLines: lines.length - priced.length,
  };
}

export function marginAtRisk(budget: CostBudget | undefined, committedApproved: Paise): MarginAtRisk {
  if (budget === undefined || budget.pricedLines + budget.unpricedLines === 0) {
    return { status: 'no-boq', costBudget: null, committedApproved, atRisk: null, unpricedLines: 0 };
  }
  return {
    status: budget.unpricedLines > 0 ? 'partial' : 'complete',
    costBudget: budget.budget,
    committedApproved,
    atRisk: committedApproved > budget.budget ? sub(committedApproved, budget.budget) : ZERO,
    unpricedLines: budget.unpricedLines,
  };
}

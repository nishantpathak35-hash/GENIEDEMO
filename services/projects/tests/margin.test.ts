import { describe, expect, it } from 'vitest';
import type { Paise } from '@cog/contracts';
import type { BoqLine } from '../src/domain/boq.js';
import { costBudget, marginAtRisk } from '../src/domain/margin.js';

const p = (n: bigint): Paise => n as Paise;

function line(id: string, quantity: bigint, costRate?: bigint): BoqLine {
  return {
    id,
    description: id,
    uom: 'nos',
    quantity,
    rate: p(100_000n),
    ...(costRate === undefined ? {} : { costRate: p(costRate) }),
  };
}

describe('cost budget', () => {
  it('sums quantity × cost rate over the priced lines only, and counts the rest', () => {
    // 2 units × ₹500.00 = ₹1,000.00; 1.5 units × ₹200.00 = ₹300.00; one line unpriced.
    const budget = costBudget([
      line('a', 2_000_000n, 50_000n),
      line('b', 1_500_000n, 20_000n),
      line('c', 3_000_000n),
    ]);
    expect(budget.budget).toBe(130_000n);
    expect(budget.pricedLines).toBe(2);
    expect(budget.unpricedLines).toBe(1);
  });
});

describe('margin at risk', () => {
  it('is what approved orders exceed a complete budget by', () => {
    const budget = costBudget([line('a', 2_000_000n, 50_000n)]);
    expect(marginAtRisk(budget, p(150_000n))).toEqual({
      status: 'complete',
      costBudget: 100_000n,
      committedApproved: 150_000n,
      atRisk: 50_000n,
      unpricedLines: 0,
    });
  });

  it('is zero, not negative, when orders sit inside the budget', () => {
    const budget = costBudget([line('a', 2_000_000n, 50_000n)]);
    expect(marginAtRisk(budget, p(80_000n)).atRisk).toBe(0n);
  });

  it('is partial, with the unpriced count, when any line has no cost rate', () => {
    const budget = costBudget([line('a', 2_000_000n, 50_000n), line('b', 1_000_000n)]);
    const result = marginAtRisk(budget, p(120_000n));
    expect(result.status).toBe('partial');
    expect(result.atRisk).toBe(20_000n);
    expect(result.unpricedLines).toBe(1);
  });

  it('has no figure at all without a BOQ — absent, not zero', () => {
    expect(marginAtRisk(undefined, p(500_000n))).toEqual({
      status: 'no-boq',
      costBudget: null,
      committedApproved: 500_000n,
      atRisk: null,
      unpricedLines: 0,
    });
    expect(marginAtRisk(costBudget([]), p(0n)).status).toBe('no-boq');
  });
});

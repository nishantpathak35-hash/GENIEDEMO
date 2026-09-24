import { describe, expect, it } from 'vitest';
import { fromWire, toWire } from '@cog/money';
import { costBudget } from '../src/domain/margin.js';
import { pipelineSummary, pipelineTotals, type PipelineLead } from '../src/domain/pipeline.js';
import { marginAtRiskSummary } from '../src/application/cost-budgets.js';

const lead = (over: Partial<PipelineLead>): PipelineLead => ({
  clientName: 'A client',
  stage: 'qualified',
  value: fromWire('100'),
  nextFollowupOn: null,
  expectedClose: null,
  ...over,
});

describe('the pipeline as Today reads it', () => {
  it('sums the quotes a client is sitting on, unweighted, and names them', () => {
    // The design's derivation of the demo seed: two quotes shared, ₹7,75,00,000.00 between them.
    const s = pipelineSummary(
      [
        lead({ clientName: 'Nilgiri Crest Bank Limited', stage: 'proposal_shared', value: fromWire('4300000000') }),
        lead({ clientName: 'Krayashala Stores Private Limited', stage: 'proposal_shared', value: fromWire('3450000000') }),
        lead({ clientName: 'Won already', stage: 'won', value: fromWire('9900000000') }),
        lead({ clientName: 'Lost', stage: 'rejected', value: fromWire('1') }),
      ],
      '2026-09',
    );
    expect(s.quoted).toEqual({
      count: 2,
      total: '7750000000',
      names: ['Nilgiri Crest Bank Limited', 'Krayashala Stores Private Limited'],
    });
    expect(s.open).toMatchObject({ count: 2, total: '7750000000' });
  });

  it('dates the next step and the expected close by the month, decided leads excluded', () => {
    const s = pipelineSummary(
      [
        lead({ clientName: 'Next this month', nextFollowupOn: '2026-09-22', value: fromWire('10') }),
        lead({ clientName: 'Next next month', nextFollowupOn: '2026-10-02', value: fromWire('20') }),
        lead({ clientName: 'Closing this month', expectedClose: '2026-09-30', value: fromWire('40') }),
        lead({ clientName: 'Closing, but won', stage: 'won', expectedClose: '2026-09-30', value: fromWire('80') }),
        lead({ clientName: 'Undated', value: fromWire('160') }),
      ],
      '2026-09',
    );
    expect(s.nextStepThisMonth).toEqual({ count: 1, total: '10', names: ['Next this month'] });
    expect(s.closingThisMonth).toEqual({ count: 1, total: '40', names: ['Closing this month'] });
    expect(s.open).toEqual({
      count: 4,
      total: '230',
      names: ['Next this month', 'Next next month', 'Closing this month', 'Undated'],
    });
    expect(s.month).toBe('2026-09');
  });

  it('names at most five', () => {
    const s = pipelineSummary(
      Array.from({ length: 7 }, (_, i) => lead({ clientName: `Client ${String(i)}`, stage: 'proposal_shared' })),
      '2026-09',
    );
    expect(s.quoted.count).toBe(7);
    expect(s.quoted.names).toHaveLength(5);
  });

  it('is empty, not a division, with no leads', () => {
    expect(pipelineSummary([], '2026-09').open).toEqual({ count: 0, total: '0', names: [] });
  });
});

describe('the pipeline weighted by stage', () => {
  const line = (stage: string, value: string, probabilityPct: number) => ({ stage, value: fromWire(value), probabilityPct });

  it('weighs each open lead by its stage — 10, 25, 40, 70 — beside the unweighted total, and leaves the entered probability alone', () => {
    const t = pipelineTotals([
      line('lead', '10000000', 50), // ₹1,00,000 at 10% → ₹10,000
      line('qualified', '10000000', 50), // 25% → ₹25,000
      line('proposal_shared', '10000000', 50), // 40% → ₹40,000
      line('negotiation', '10000000', 50), // 70% → ₹70,000
      line('won', '10000000', 100), // decided: in neither figure
    ]);
    expect(toWire(t.total)).toBe('40000000');
    expect(toWire(t.weightedByStage)).toBe('14500000');
    // the lead's own probability still drives `weighted`
    expect(toWire(t.weighted)).toBe('20000000');
  });

  it('is zero, not a division, with nothing open', () => {
    expect(toWire(pipelineTotals([]).weightedByStage)).toBe('0');
  });
});

describe('margin at risk carries the budget its bar is set against', () => {
  const line = (id: string, quantityMicros: bigint, rate: bigint, costRate?: bigint) => ({
    id,
    description: '',
    uom: '',
    quantity: quantityMicros,
    rate: fromWire(String(rate)),
    ...(costRate === undefined ? {} : { costRate: fromWire(String(costRate)) }),
  });
  const project = (id: string, code: string) => ({ id, code, name: code, state: 'in_progress', contractValue: null });

  it('sums the cost budgets and approved orders, and covers the budget against budget plus the overrun', () => {
    // Two projects: budget 1,000 with 1,300 approved (300 past), budget 2,000 with 500 approved.
    const budgets = new Map([
      ['p1', costBudget([line('a', 1_000_000n, 3000n, 1000n)])],
      ['p2', costBudget([line('b', 1_000_000n, 5000n, 2000n)])],
    ]);
    const summary = marginAtRiskSummary(
      [project('p1', 'ONE'), project('p2', 'TWO')],
      budgets,
      [
        { projectId: 'p1', committed: fromWire('1300'), orderCount: 1 },
        { projectId: 'p2', committed: fromWire('500'), orderCount: 1 },
      ],
    );
    expect(summary).toMatchObject({
      status: 'present',
      total: '300',
      costBudget: '3000',
      committedApproved: '1800',
      projectsOver: 1,
    });
    // 3000 of 3300, truncated to two decimals.
    expect(summary['coveredPct']).toBe(90.9);
  });

  it('covers the whole bar when nothing is past a budget', () => {
    const summary = marginAtRiskSummary(
      [project('p1', 'ONE')],
      new Map([['p1', costBudget([line('a', 1_000_000n, 3000n, 1000n)])]]),
      [{ projectId: 'p1', committed: fromWire('400'), orderCount: 1 }],
    );
    expect(summary).toMatchObject({ total: '0', costBudget: '1000', coveredPct: 100 });
  });
});

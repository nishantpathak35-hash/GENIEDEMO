import { describe, expect, it } from 'vitest';
import { fromWire } from '@cog/money';
import { DEFAULT_HEALTH_THRESHOLD } from '../src/domain/project-financials.js';
import { buildProjectRollup, type ProjectBudgetRow } from '../src/application/rollup.js';

/**
 * The rollup draws its own chart: every width is a percentage the server
 * computed on ONE scale. The figures below are written down first — the
 * largest contract is the row, and every other bar is a share of it,
 * truncated to two decimals.
 */

const budget = (code: string, contract: string | null): ProjectBudgetRow => ({
  id: `id-${code}`,
  code,
  name: `Project ${code}`,
  state: 'in_progress',
  contractValue: contract === null ? null : fromWire(contract),
});

const commitment = (code: string, committed: string, orderCount = 1) => ({
  projectId: `id-${code}`,
  committed: fromWire(committed),
  orderCount,
});

describe('buildProjectRollup — the meter', () => {
  const rollup = buildProjectRollup(
    [
      budget('NEEL-01', '42500000000'), // ₹4,25,00,000 — the scale
      budget('ARAV-01', '18000000000'), // ₹1,80,00,000
      budget('VAYU-01', '4000000000'), // ₹40,00,000, over-ordered
      budget('TARA-01', null), // no contract value
    ],
    DEFAULT_HEALTH_THRESHOLD,
    [
      commitment('NEEL-01', '31240500000', 4),
      commitment('ARAV-01', '15872300000', 3),
      commitment('VAYU-01', '4318900000', 2),
      commitment('TARA-01', '2260000000', 1),
      { projectId: null, committed: fromWire('100'), orderCount: 1 },
    ],
    new Map(),
    [],
    // billed to the client so far, finance's sum per project: a third of ARAV-01's contract, nothing elsewhere
    new Map([['id-ARAV-01', fromWire('6000000000')], ['id-TARA-01', fromWire('500000000')]]),
  ) as {
    items: Array<{ code: string; orderedPct: number | null; billed: string; billedPct: number | null; meter: Record<string, number | null> }>;
    orderedSoFar: string;
  };
  const by = (code: string) => rollup.items.find((i) => i.code === code)!;

  it('the margin carries its bar: the budget covered against budget plus the overrun; none without a BOQ', () => {
    const noBoq = by('NEEL-01') as unknown as { margin: { coveredPct: number | null } };
    expect(noBoq.margin.coveredPct).toBeNull();
  });

  it('carries what is billed to the client and its truncated share of the contract; nothing billed is "0"', () => {
    expect(by('ARAV-01').billed).toBe('6000000000');
    expect(by('ARAV-01').billedPct).toBe(33);
    expect(by('NEEL-01').billed).toBe('0');
    expect(by('NEEL-01').billedPct).toBe(0);
    // billed, but no contract to be a share of
    expect(by('TARA-01').billed).toBe('500000000');
    expect(by('TARA-01').billedPct).toBeNull();
  });

  it('the largest contract fills its row; the others are a share of it', () => {
    expect(by('NEEL-01').meter).toEqual({ trackPct: 100, fillPct: 73.5, thresholdPct: 85, overPct: 0 });
    // 1,80,00,000 / 4,25,00,000 = 42.352…% → 42.35; 1,58,72,300 / 4,25,00,000 = 37.346…% → 37.34
    expect(by('ARAV-01').meter).toEqual({ trackPct: 42.35, fillPct: 37.34, thresholdPct: 36, overPct: 0 });
  });

  it('a project past its contract keeps its fill at the contract and draws the run past it', () => {
    // track 40,00,000 / 4,25,00,000 = 9.411…% → 9.41; over 3,18,900 / 4,25,00,000 = 0.750…% → 0.75
    expect(by('VAYU-01').meter).toEqual({ trackPct: 9.41, fillPct: 9.41, thresholdPct: 8, overPct: 0.75 });
    expect(by('VAYU-01').orderedPct).toBe(107);
  });

  it('a project with no contract value has no track and no threshold, and its fill is still to scale', () => {
    // 22,60,000 / 4,25,00,000 = 5.317…% → 5.31
    expect(by('TARA-01').meter).toEqual({ trackPct: 0, fillPct: 5.31, thresholdPct: null, overPct: 0 });
    expect(by('TARA-01').orderedPct).toBeNull();
  });

  it('orderedPct is a whole truncated percent of the contract', () => {
    expect(by('NEEL-01').orderedPct).toBe(73);
    expect(by('ARAV-01').orderedPct).toBe(88);
  });

  it('orderedSoFar sums every project’s committed spend and leaves out unattached orders', () => {
    // 3,12,40,500 + 1,58,72,300 + 43,18,900 + 22,60,000 = 5,36,91,700 → paise
    expect(rollup.orderedSoFar).toBe('53691700000');
  });

  it('an empty tenant draws nothing and sums to zero', () => {
    const empty = buildProjectRollup([], DEFAULT_HEALTH_THRESHOLD, [], new Map(), []) as { items: unknown[]; orderedSoFar: string };
    expect(empty.items).toEqual([]);
    expect(empty.orderedSoFar).toBe('0');
  });
});

import { describe, expect, it } from 'vitest';
import {
  calculateFloorManpowerLegacy as legacyFloor,
  calculateOverallManpowerLegacy as legacyOverall,
} from '../src/domain/manpower-legacy.js';
import {
  ManpowerError,
  floorManpower,
  headcount,
  manpowerByTrade,
  overallManpower,
} from '../src/domain/manpower.js';

describe('COMMIT 1 — the legacy behaviour, recorded', () => {
  it('sums counts across floors', () => {
    const dpr = {
      floors: [
        { manpower: [{ count: 4 }, { count: 3 }] },
        { manpower: [{ count: 2 }] },
      ],
    };
    expect(legacyOverall(dpr)).toBe(9);
  });

  it('DPR-01 — parseInt takes a prefix of free text', () => {
    // A site engineer typing "12 workers" gets 12. Typing "1.9" gets 1.
    expect(legacyFloor({ manpower: [{ count: '12 workers' }] })).toBe(12);
    expect(legacyFloor({ manpower: [{ count: '1.9' }] })).toBe(1);
    expect(legacyFloor({ manpower: [{ count: '0x10' }] })).toBe(16);
  });

  it('DPR-02 — an unparseable count silently becomes zero', () => {
    // On a document that supports a progress claim, this under-reports labour.
    expect(legacyFloor({ manpower: [{ count: 'twelve' }, { count: 5 }] })).toBe(5);
  });

  it('DPR-03 — a negative count subtracts from the total', () => {
    expect(legacyFloor({ manpower: [{ count: 10 }, { count: -4 }] })).toBe(6);
  });

  it('returns 0 for anything shaped unexpectedly', () => {
    expect(legacyOverall(null)).toBe(0);
    expect(legacyOverall({})).toBe(0);
    expect(legacyFloor({ manpower: 'not an array' })).toBe(0);
  });
});

describe('COMMIT 2 — corrected', () => {
  const floors = [
    { name: 'Ground', manpower: [{ trade: 'Carpenter', count: 4 }, { trade: 'Painter', count: 3 }] },
    { name: 'First', manpower: [{ trade: 'Carpenter', count: 2 }] },
  ];

  it('sums the same way when the input is sound', () => {
    // The arithmetic was never the defect; the input handling was.
    expect(overallManpower(floors)).toBe(9);
    expect(floorManpower(floors[0]!)).toBe(7);
  });

  it('DPR-01 — refuses anything that is not a whole number', () => {
    expect(() => headcount(1.9)).toThrow(ManpowerError);
    // @ts-expect-error a string is not a headcount
    expect(() => headcount('12 workers')).toThrow(ManpowerError);
    expect(legacyFloor({ manpower: [{ count: '12 workers' }] })).toBe(12); // recorded divergence
  });

  it('DPR-02 — raises instead of quietly lowering the figure', () => {
    expect(() =>
      floorManpower({ name: 'G', manpower: [{ trade: 'X', count: Number.NaN }] }),
    ).toThrow(ManpowerError);
  });

  it('DPR-03 — refuses a negative headcount', () => {
    expect(() => headcount(-1)).toThrow(/cannot be negative/);
  });

  it('refuses an unlabelled entry, which cannot be reconciled', () => {
    expect(() => floorManpower({ name: 'G', manpower: [{ trade: '  ', count: 3 }] })).toThrow(
      /no trade/,
    );
  });

  it('accepts a genuine zero', () => {
    // Distinct from the legacy, where zero is also what a malformed entry
    // produces — so "nobody on site" and "somebody typed nonsense" are the same
    // value.
    expect(headcount(0)).toBe(0);
    expect(floorManpower({ name: 'G', manpower: [{ trade: 'Painter', count: 0 }] })).toBe(0);
  });
});

describe('manpowerByTrade — new', () => {
  it('breaks the total down, which the legacy cannot', () => {
    // A single total cannot be reconciled against a subcontractor's attendance,
    // nor reveal that one trade was recorded on two floors.
    const byTrade = manpowerByTrade([
      { name: 'Ground', manpower: [{ trade: 'Carpenter', count: 4 }] },
      { name: 'First', manpower: [{ trade: 'Carpenter', count: 2 }, { trade: 'Painter', count: 3 }] },
    ]);
    expect(byTrade.get('Carpenter')).toBe(6);
    expect(byTrade.get('Painter')).toBe(3);
  });

  it('trims trade names so one trade is not counted as two', () => {
    const byTrade = manpowerByTrade([
      { name: 'G', manpower: [{ trade: 'Carpenter', count: 1 }, { trade: ' Carpenter ', count: 1 }] },
    ]);
    expect(byTrade.size).toBe(1);
    expect(byTrade.get('Carpenter')).toBe(2);
  });
});

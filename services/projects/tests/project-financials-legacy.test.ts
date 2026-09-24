import { describe, expect, it } from 'vitest';
import {
  legacyHealth,
  legacyProjectDetails,
} from '../src/domain/project-financials-legacy.js';

/**
 * **Commit 1 of the port: what the legacy actually does.**
 *
 * These are not expectations. They are a defect report written as assertions,
 * so that the corrected implementation can be compared against measured
 * behaviour rather than against a memory of it. Every value here was derived by
 * reading the frozen tree, and the surprising ones were re-checked against the
 * source line before being written down.
 *
 * All fixtures are synthetic.
 */

const po = (project: string | null, value: unknown) => ({ project, po_value: value });

describe('the rollup sums purchase orders by name string', () => {
  it('groups by the project NAME, because there is no project id', () => {
    const rows = legacyProjectDetails(
      [po('Tower Fitout', 100), po('Tower Fitout', 250), po('Lobby', 40)],
      {},
      [],
    );
    expect(rows.map((r) => r.project).sort()).toEqual(['Lobby', 'Tower Fitout']);
    expect(rows.find((r) => r.project === 'Tower Fitout')?.poIssued).toBe(350);
  });

  it('treats two spellings of one project as two projects', () => {
    // The defect that makes `mergeProjects` exist as an RPC.
    const rows = legacyProjectDetails([po('Tower Fitout', 100), po('tower fitout', 100)], {}, []);
    expect(rows).toHaveLength(2);
  });

  it('skips a purchase order with no project', () => {
    expect(legacyProjectDetails([po(null, 100), po('', 100)], {}, [])).toHaveLength(0);
  });

  it('coerces an unparseable po_value to zero rather than failing', () => {
    // `Number(value) || 0`. ADR-0012: in a statutory system this must throw.
    // Recorded here, corrected in `project-financials.ts`.
    const rows = legacyProjectDetails([po('P', 'not a number'), po('P', 100)], {}, []);
    expect(rows[0]?.poIssued).toBe(100);
  });

  it('loses precision on values that are not exact in binary floating point', () => {
    // 0.1 + 0.2 !== 0.3. Every monetary column in the legacy schema is REAL.
    const rows = legacyProjectDetails([po('P', 0.1), po('P', 0.2)], {}, []);
    expect(rows[0]?.poIssued).not.toBe(0.3);
    expect(rows[0]?.poIssued).toBeCloseTo(0.3, 10);
  });
});

describe('projectValue and poIssued are fed by the SAME value', () => {
  it('makes them identical when no override row exists', () => {
    // `projects.js:118-120` adds `val` to both fields in one loop. This is the
    // root of the health-band defect below.
    const rows = legacyProjectDetails([po('P', 500)], {}, []);
    expect(rows[0]?.projectValue).toBe(500);
    expect(rows[0]?.poIssued).toBe(500);
  });
});

describe('the health band, as the browser computes it', () => {
  it('reports At Risk for EVERY project that has no budget override', () => {
    // The finding. With no override, projectValue === poIssued exactly, so the
    // ratio is exactly 1: `1 > 1` is false, `1 > 0.85` is true. A project can
    // therefore never read "On Track" until somebody types a budget in by hand,
    // and never reads "Over Budget" either.
    const rows = legacyProjectDetails([po('P', 1_000_000)], {}, []);
    expect(legacyHealth(rows[0]!)).toBe('At Risk');
  });

  it('reports No Budget when there are no purchase orders at all', () => {
    expect(legacyHealth({ poIssued: 0, projectValue: 0 })).toBe('No Budget');
  });

  it('reports On Track only once a budget exceeds committed spend by ~18%', () => {
    expect(legacyHealth({ poIssued: 850, projectValue: 1000 })).toBe('On Track');
    expect(legacyHealth({ poIssued: 851, projectValue: 1000 })).toBe('At Risk');
  });

  it('reports Over Budget strictly above the budget', () => {
    expect(legacyHealth({ poIssued: 1000, projectValue: 1000 })).toBe('At Risk');
    expect(legacyHealth({ poIssued: 1001, projectValue: 1000 })).toBe('Over Budget');
  });

  it('treats a negative budget as No Budget rather than as an error', () => {
    // `!pv` is false for a negative number, so this falls through to the ratio.
    // Recorded as measured: -1 gives a negative ratio, hence On Track.
    expect(legacyHealth({ poIssued: 100, projectValue: -1 })).toBe('On Track');
  });
});

describe('the override arithmetic', () => {
  it('lets an override of exactly zero fall through to the computed value', () => {
    // `Number(row.project_value) || projectsMap[name].projectValue`.
    // `0 || x` is `x`, so a deliberate zero budget cannot be expressed.
    const rows = legacyProjectDetails([po('P', 700)], {}, [{ project: 'P', project_value: 0 }]);
    expect(rows[0]?.projectValue).toBe(700);
  });

  it('computes planned margin as projectValue minus bcs', () => {
    const rows = legacyProjectDetails([po('P', 0)], {}, [
      { project: 'P', project_value: 1000, bcs: 600 },
    ]);
    expect(rows[0]?.plannedGM).toBe(400);
    expect(rows[0]?.plannedGMPct).toBeCloseTo(0.4, 10);
  });

  it('computes actual margin as inflow minus outflow minus tds', () => {
    const rows = legacyProjectDetails([po('P', 0)], { P: 300 }, [
      { project: 'P', project_value: 1000, inflow: 900, tds: 50 },
    ]);
    expect(rows[0]?.actualGM).toBe(550);
    expect(rows[0]?.balanceAvailable).toBe(550);
  });

  it('lets balanceAvailable go negative with no floor', () => {
    // `Math.max(0, ...)` guards pendingInflow and pendingOutflow but not this.
    const rows = legacyProjectDetails([po('P', 0)], { P: 900 }, [
      { project: 'P', project_value: 1000, inflow: 100, tds: 50 },
    ]);
    expect(rows[0]?.balanceAvailable).toBe(-850);
  });

  it('creates a project row from an override with no purchase orders', () => {
    const rows = legacyProjectDetails([], {}, [{ project: 'Ghost', project_value: 5000 }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.project).toBe('Ghost');
  });
});

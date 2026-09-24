import { describe, expect, it } from 'vitest';
import { paise } from '@cog/money';
import {
  DEFAULT_AT_RISK_PCT,
  DEFAULT_HEALTH_THRESHOLD,
  HealthThresholdError,
  committedSpend,
  healthThreshold,
  projectFinancials,
  projectHealth,
  type ProjectFinancialsInput,
} from '../src/domain/project-financials.js';
import { legacyHealth, legacyProjectDetails } from '../src/domain/project-financials-legacy.js';

/**
 * **Commit 2: the corrections, each tied to the defect row it closes.**
 *
 * Where a figure differs from the legacy figure, the difference is asserted
 * here against the legacy behaviour recorded in
 * `project-financials-legacy.test.ts` — so the divergence is a decision with a
 * name, not an artefact of the rewrite (ADR-0014 decision 5).
 *
 * All fixtures are synthetic.
 */

const base = (over: Partial<ProjectFinancialsInput> = {}): ProjectFinancialsInput => ({
  committed: paise(0n),
  contractValue: null,
  bcs: null,
  inflow: paise(0n),
  outflow: paise(0n),
  tds: paise(0n),
  ...over,
});

describe('PROJ-01 — committed spend and contract value are different numbers', () => {
  it('answers no-budget when nobody has entered a contract value', () => {
    // The legacy answers "At Risk" here, permanently, for every project without
    // a hand-entered budget — because it compares a number with itself.
    const financials = projectFinancials(base({ committed: paise(1_000_000n) }));
    expect(projectHealth(financials)).toBe('no-budget');
  });

  it('differs from the legacy on exactly that case, and the difference is the fix', () => {
    // Asserted side by side so the divergence is attributable. If this ever
    // starts agreeing, one of the two changed and the history says which.
    const legacyRows = legacyProjectDetails([{ project: 'P', po_value: 1_000_000 }], {}, []);
    expect(legacyHealth(legacyRows[0]!)).toBe('At Risk');

    const ported = projectFinancials(base({ committed: paise(100_000_000n) }));
    expect(projectHealth(ported)).toBe('no-budget');
  });

  it('reports on-track when committed spend is comfortably under the contract value', () => {
    const financials = projectFinancials(
      base({ committed: paise(50_000_00n), contractValue: paise(100_000_00n) }),
    );
    expect(projectHealth(financials)).toBe('on-track');
  });

  it('reports over-budget only above the contract value', () => {
    const at = projectFinancials(
      base({ committed: paise(100_000_00n), contractValue: paise(100_000_00n) }),
    );
    expect(projectHealth(at)).toBe('at-risk');

    const over = projectFinancials(
      base({ committed: paise(100_000_01n), contractValue: paise(100_000_00n) }),
    );
    expect(projectHealth(over)).toBe('over-budget');
  });

  it('uses the legacy 85% only as a DEFAULT, and marks it provisional', () => {
    // Not ported as a constant. Because PROJ-01 pinned the legacy ratio at 1.0,
    // the 85% band never fired from either side — so it is a number somebody
    // typed, never one observed working (PO-18).
    expect(DEFAULT_AT_RISK_PCT).toBe(85);
    expect(DEFAULT_HEALTH_THRESHOLD.provisional).toBe(true);

    const under = projectFinancials(
      base({ committed: paise(8_500_00n), contractValue: paise(10_000_00n) }),
    );
    expect(projectHealth(under)).toBe('on-track');

    const over = projectFinancials(
      base({ committed: paise(8_500_01n), contractValue: paise(10_000_00n) }),
    );
    expect(projectHealth(over)).toBe('at-risk');
  });
});

describe('PO-18 — the threshold is configuration, not a constant', () => {
  const financials = projectFinancials(
    base({ committed: paise(7_000_00n), contractValue: paise(10_000_00n) }),
  );

  it('bands the same project differently under a different tenant threshold', () => {
    // 70% committed. At the inherited 85% default that is on-track; a tenant
    // that considers 60% the warning point sees at-risk. Same figures, and the
    // answer is the tenant's to decide.
    expect(projectHealth(financials, DEFAULT_HEALTH_THRESHOLD)).toBe('on-track');
    expect(projectHealth(financials, healthThreshold(60, true))).toBe('at-risk');
  });

  it('marks a threshold provisional unless it was confirmed', () => {
    expect(healthThreshold(60, true).provisional).toBe(false);
    expect(healthThreshold(60, false).provisional).toBe(true);
  });

  it('refuses a threshold outside 1..100, rather than clamping it', () => {
    for (const bad of [0, -5, 101, 85.5, Number.NaN]) {
      expect(() => healthThreshold(bad, true), String(bad)).toThrow(HealthThresholdError);
    }
  });

  it('defaults to the inherited value when no threshold is passed', () => {
    expect(projectHealth(financials)).toBe(projectHealth(financials, DEFAULT_HEALTH_THRESHOLD));
  });
});

describe('PROJ-02 — zero is a value, absent is null', () => {
  it('treats a contract value of zero as entered, not as missing', () => {
    // The legacy `Number(x) || existing` silently discards a deliberate zero.
    const financials = projectFinancials(base({ contractValue: paise(0n), committed: paise(500n) }));
    expect(financials.contractValue).toBe(0n);
    expect(projectHealth(financials)).toBe('no-budget');
  });

  it('does not invent a contract value from committed spend', () => {
    const financials = projectFinancials(base({ committed: paise(999n) }));
    expect(financials.contractValue).toBeNull();
    expect(financials.pendingInflow).toBeNull();
    expect(financials.plannedMargin).toBeNull();
  });
});

describe('PROJ-05 — exact integers, and a balance that is allowed to be negative', () => {
  it('sums committed spend exactly, with no floating point drift', () => {
    // The legacy loses precision here: 0.1 + 0.2 !== 0.3 on REAL columns.
    const total = committedSpend([paise(10n), paise(20n), paise(1n)]);
    expect(total).toBe(31n);
  });

  it('lets the balance go negative rather than flooring it', () => {
    const financials = projectFinancials(
      base({ inflow: paise(100_00n), outflow: paise(900_00n), tds: paise(50_00n) }),
    );
    expect(financials.balance).toBe(-850_00n);
  });

  it('floors pendingInflow and pendingOutflow, as the legacy does', () => {
    // These two ARE floored in the legacy, and that behaviour is kept. Only the
    // inconsistency is recorded, not silently harmonised.
    const financials = projectFinancials(
      base({
        committed: paise(100n),
        outflow: paise(500n),
        contractValue: paise(100n),
        inflow: paise(500n),
      }),
    );
    expect(financials.pendingOutflow).toBe(0n);
    expect(financials.pendingInflow).toBe(0n);
  });

  it('computes planned margin only when both inputs are known', () => {
    const known = projectFinancials(
      base({ contractValue: paise(1_000_00n), bcs: paise(600_00n) }),
    );
    expect(known.plannedMargin).toBe(400_00n);

    const unknown = projectFinancials(base({ contractValue: paise(1_000_00n) }));
    expect(unknown.plannedMargin).toBeNull();
  });

  it('computes actual margin as inflow minus outflow minus tds', () => {
    const financials = projectFinancials(
      base({ inflow: paise(900_00n), outflow: paise(300_00n), tds: paise(50_00n) }),
    );
    expect(financials.actualMargin).toBe(550_00n);
  });
});

describe('every figure is a bigint, never a number', () => {
  it('returns bigints throughout', () => {
    const financials = projectFinancials(
      base({ committed: paise(1n), contractValue: paise(2n), bcs: paise(1n) }),
    );
    for (const [key, value] of Object.entries(financials)) {
      if (value === null) continue;
      expect(typeof value, key).toBe('bigint');
    }
  });
});

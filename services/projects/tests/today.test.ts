import { describe, expect, it } from 'vitest';
import { fromWire } from '@cog/money';
import { DEFAULT_HEALTH_THRESHOLD, healthThreshold } from '../src/domain/project-financials.js';
import {
  ABSENT_CANDIDATES,
  contractCeilingCandidate,
  orderedSoFar,
  rankToday,
  type ProjectCommitmentRow,
} from '../src/domain/today.js';

/**
 * The Today hero's ranking, and the two candidates projects computes for it.
 *
 * Every expected figure is written down first. The percentages in particular:
 * `contractCeilingCandidate` truncates a basis-point ratio to a whole percent,
 * and the cases sit on both sides of the band edge so a change from truncate
 * to round is caught.
 */

const row = (over: Partial<ProjectCommitmentRow> & { code: string }): ProjectCommitmentRow => ({
  id: `id-${over.code}`,
  name: `Project ${over.code}`,
  contractValue: fromWire('18000000000'), // ₹1,80,00,000.00
  committed: fromWire('0'),
  orderCount: 0,
  ...over,
});

describe('contractCeilingCandidate', () => {
  it('names the project furthest along, as a whole truncated percent', () => {
    // 1,58,72,300 of 1,80,00,000 = 88.179…% → 88
    const candidate = contractCeilingCandidate(
      [
        row({ code: 'ARAV-01', committed: fromWire('15872300000'), orderCount: 4 }),
        row({ code: 'NEEL-01', contractValue: fromWire('42500000000'), committed: fromWire('31240500000') }),
      ],
      DEFAULT_HEALTH_THRESHOLD,
    );
    expect(candidate).toMatchObject({
      kind: 'contract-ceiling',
      code: 'ARAV-01',
      orderedPct: 88,
      thresholdPct: 85,
      over: false,
      overBy: null,
      committed: '15872300000',
      contractValue: '18000000000',
    });
  });

  it('is null when nobody has reached the band — on track is not a thing to watch', () => {
    // 84.99% must not become 85 by rounding.
    const candidate = contractCeilingCandidate(
      [row({ code: 'A', contractValue: fromWire('10000'), committed: fromWire('8499') })],
      DEFAULT_HEALTH_THRESHOLD,
    );
    expect(candidate).toBeNull();
  });

  it('exactly at the band edge counts', () => {
    const candidate = contractCeilingCandidate(
      [row({ code: 'A', contractValue: fromWire('10000'), committed: fromWire('8500') })],
      DEFAULT_HEALTH_THRESHOLD,
    );
    expect(candidate?.orderedPct).toBe(85);
  });

  it('a project past its contract wins over one merely near it, and says by how much', () => {
    // VAYU-01: 43,18,900 of 40,00,000 = 107.97% → 107, over by 3,18,900.
    const candidate = contractCeilingCandidate(
      [
        row({ code: 'ARAV-01', committed: fromWire('15872300000') }),
        row({ code: 'VAYU-01', contractValue: fromWire('4000000000'), committed: fromWire('4318900000') }),
      ],
      DEFAULT_HEALTH_THRESHOLD,
    );
    expect(candidate).toMatchObject({ code: 'VAYU-01', orderedPct: 107, over: true, overBy: '318900000' });
  });

  it('a project with no contract value is never a candidate, however much is ordered', () => {
    const candidate = contractCeilingCandidate(
      [row({ code: 'TARA-01', contractValue: null, committed: fromWire('2260000000') })],
      DEFAULT_HEALTH_THRESHOLD,
    );
    expect(candidate).toBeNull();
  });

  it('honours the tenant threshold, not the default', () => {
    const rows = [row({ code: 'A', contractValue: fromWire('10000'), committed: fromWire('7000') })];
    expect(contractCeilingCandidate(rows, DEFAULT_HEALTH_THRESHOLD)).toBeNull();
    expect(contractCeilingCandidate(rows, healthThreshold(70, true))?.orderedPct).toBe(70);
  });
});

describe('orderedSoFar', () => {
  it('sums committed spend and counts orders and the projects that have any', () => {
    expect(
      orderedSoFar([
        row({ code: 'A', committed: fromWire('100'), orderCount: 2 }),
        row({ code: 'B', committed: fromWire('250'), orderCount: 1 }),
        row({ code: 'C', committed: fromWire('0'), orderCount: 0 }),
      ]),
    ).toEqual({ kind: 'ordered-so-far', total: '350', orderCount: 3, projectCount: 2 });
  });

  it('is zero, not absent, for a tenant with no projects', () => {
    expect(orderedSoFar([])).toEqual({ kind: 'ordered-so-far', total: '0', orderCount: 0, projectCount: 0 });
  });
});

describe('rankToday', () => {
  const ordered = { kind: 'ordered-so-far' as const, total: '350', orderCount: 3, projectCount: 2 };
  const ceiling = {
    kind: 'contract-ceiling' as const,
    projectId: 'id-ARAV-01',
    code: 'ARAV-01',
    name: 'Workplace refresh',
    committed: '15872300000',
    contractValue: '18000000000',
    orderedPct: 88,
    thresholdPct: 85,
    over: false,
    overBy: null,
  };
  const blocked = {
    kind: 'blocked-approvals' as const,
    count: 3,
    total: '368500000',
    oldestDays: 6,
    olderThanWeek: 0,
    owners: [{ role: 'finance', count: 3, holders: 1, people: [{ id: '00000000-0000-4000-8000-000000000001', name: 'Rahul Menon' }] }],
  };

  it('blocked approvals outrank a project near its ceiling — a decision is owed', () => {
    const { hero, candidates } = rankToday({ blocked, ceiling, ordered });
    expect(hero.kind).toBe('blocked-approvals');
    expect(candidates.map((c) => [c.kind, c.rank])).toEqual([
      ['blocked-approvals', 1],
      ['absent', 2],
      ['contract-ceiling', 3],
      ['ordered-so-far', 4],
    ]);
  });

  it('with nothing waiting, the amber project is the hero — and the absences keep their place', () => {
    const { hero, candidates } = rankToday({ blocked: null, ceiling, ordered });
    expect(hero.kind).toBe('contract-ceiling');
    expect(candidates[0]).toMatchObject({ kind: 'absent', name: 'cash-shortfall', rank: 1 });
    // Margin at risk is measured now (BOQ cost against approved orders) and is a
    // stat on its own, so it no longer sits in the ranking as an absence.
    expect(candidates[1]).toMatchObject({ kind: 'contract-ceiling', rank: 2 });
  });

  it('an empty queue does not become the hero', () => {
    const { hero } = rankToday({ blocked: { ...blocked, count: 0 }, ceiling: null, ordered });
    expect(hero.kind).toBe('ordered-so-far');
  });

  it('when nothing is amber, the hero is ordered so far', () => {
    const { hero, candidates } = rankToday({ blocked: null, ceiling: null, ordered });
    expect(hero).toEqual({ ...ordered, rank: 2 });
    expect(candidates).toHaveLength(2);
  });

  it('names what each absent candidate is missing', () => {
    for (const absent of ABSENT_CANDIDATES) {
      expect(absent.missing.length).toBeGreaterThan(0);
      expect(absent.why).not.toBe('');
    }
  });
});

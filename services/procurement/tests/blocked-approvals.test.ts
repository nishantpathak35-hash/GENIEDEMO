import { describe, expect, it } from 'vitest';
import { fromWire } from '@cog/money';
import {
  summariseBlockedApprovals,
  wholeDaysBetween,
  type PendingOrder,
} from '../src/application/blocked-approvals.js';

/**
 * The queue summary the Today hero is built from.
 *
 * Two things are computed here and nowhere else: the value held up, and the
 * age of each order. Both are asserted against values written down first —
 * a summary derived from its own implementation would test nothing.
 */

const NOW = new Date('2026-09-15T09:00:00+05:30');

const order = (over: Partial<PendingOrder> & { id: string }): PendingOrder => ({
  number: `PO-${over.id}`,
  gross: fromWire('100'),
  vendorName: 'Ashvale',
  projectId: null,
  currentStage: '',
  waitingSince: '2026-09-15T08:00:00+05:30',
  requesterId: 'raiser',
  raisedAt: '2026-09-15T07:00:00+05:30',
  ...over,
});

describe('wholeDaysBetween', () => {
  it('counts whole days, floored — this morning is zero, not one', () => {
    expect(wholeDaysBetween('2026-09-15T08:00:00+05:30', NOW)).toBe(0);
    expect(wholeDaysBetween('2026-09-14T09:00:00+05:30', NOW)).toBe(1);
    expect(wholeDaysBetween('2026-09-09T10:30:00+05:30', NOW)).toBe(5);
    expect(wholeDaysBetween('2026-09-09T08:30:00+05:30', NOW)).toBe(6);
  });

  it('never goes negative for a clock that is behind the row', () => {
    expect(wholeDaysBetween('2026-09-16T00:00:00+05:30', NOW)).toBe(0);
  });
});

describe('summariseBlockedApprovals', () => {
  const resolve = (o: PendingOrder) => ({
    stageName: 'Pending Approval',
    approverRole: o.id === 'c' ? '' : 'finance',
    projectCode: o.projectId === null ? null : 'ARAV-01',
  });

  it('sums the gross held up as Paise and reports the oldest wait', () => {
    const summary = summariseBlockedApprovals(
      [
        order({ id: 'a', gross: fromWire('303595600'), waitingSince: '2026-09-09T08:00:00+05:30' }),
        order({ id: 'b', gross: fromWire('35968000'), waitingSince: '2026-09-13T08:00:00+05:30' }),
      ],
      resolve,
      NOW,
    );
    expect(summary.count).toBe(2);
    // 3,03,595,600 + 35,968,000 = 3,39,563,600 paise, written down, not derived.
    expect(summary.total).toBe('339563600');
    expect(summary.oldestDays).toBe(6);
    expect(summary.items.map((i) => i.days)).toEqual([6, 2]);
  });

  it('an order whose stage cannot be resolved is still counted and summed', () => {
    const summary = summariseBlockedApprovals(
      [order({ id: 'a' }), order({ id: 'c', gross: fromWire('250') })],
      resolve,
      NOW,
    );
    expect(summary.count).toBe(2);
    expect(summary.total).toBe('350');
    expect(summary.byRole.get('finance')).toBe(1);
    expect(summary.byRole.get('')).toBe(1);
  });

  it('counts the ones older than a week — more than seven whole days, so day seven is not', () => {
    const summary = summariseBlockedApprovals(
      [
        order({ id: 'a', waitingSince: '2026-09-06T08:00:00+05:30' }), // 9 days
        order({ id: 'b', waitingSince: '2026-09-08T08:00:00+05:30' }), // 7 days
        order({ id: 'c', waitingSince: '2026-09-07T08:00:00+05:30' }), // 8 days
        order({ id: 'd', waitingSince: '2026-09-14T08:00:00+05:30' }), // 1 day
      ],
      resolve,
      NOW,
    );
    expect(summary.items.map((i) => i.days)).toEqual([9, 7, 8, 1]);
    expect(summary.olderThanWeek).toBe(2);
  });

  it('an empty queue is zero of everything and no oldest', () => {
    const summary = summariseBlockedApprovals([], resolve, NOW);
    expect(summary).toMatchObject({ count: 0, total: '0', oldestDays: null, olderThanWeek: 0, items: [] });
  });
});

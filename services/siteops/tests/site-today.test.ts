import { describe, expect, it } from 'vitest';
import { headCountByDay } from '../src/application/site-issues.js';

describe('the head count by day, for Site today', () => {
  it('is the seven days ending today, oldest first, a day with no report null', () => {
    // 2026-09-14 is a Monday; the seed reports the five days before it.
    const days = headCountByDay(
      '2026-09-14',
      new Map([
        ['2026-09-09', 24],
        ['2026-09-10', 30],
        ['2026-09-11', 18],
        ['2026-09-12', 12],
        ['2026-09-13', 15],
      ]),
    );
    expect(days.map((d) => d.date)).toEqual([
      '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14',
    ]);
    expect(days.map((d) => d.label)).toEqual(['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon']);
    expect(days.map((d) => d.onSite)).toEqual([null, 24, 30, 18, 12, 15, null]);
    expect(days.map((d) => d.index)).toEqual([0, 8000, 10000, 6000, 4000, 5000, 0]);
  });

  it('indexes to zero, not a division, when nobody reported', () => {
    const days = headCountByDay('2026-09-14', new Map());
    expect(days).toHaveLength(7);
    expect(days.every((d) => d.onSite === null && d.index === 0)).toBe(true);
  });
});

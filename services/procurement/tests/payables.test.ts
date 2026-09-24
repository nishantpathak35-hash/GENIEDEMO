import { describe, expect, it } from 'vitest';
import { todayInIndia, weekBounds } from '../src/domain/payables.js';

describe('the week a payable is due in', () => {
  it('runs Monday to Sunday', () => {
    // 2026-09-15 is a Tuesday.
    expect(weekBounds('2026-09-15')).toEqual({ weekEnds: '2026-09-20', nextWeekEnds: '2026-09-27' });
    expect(weekBounds('2026-09-14')).toEqual({ weekEnds: '2026-09-20', nextWeekEnds: '2026-09-27' });
  });

  it('ends a week on its own Sunday', () => {
    expect(weekBounds('2026-09-20')).toEqual({ weekEnds: '2026-09-20', nextWeekEnds: '2026-09-27' });
  });

  it('crosses a month and a year', () => {
    expect(weekBounds('2026-12-30')).toEqual({ weekEnds: '2027-01-03', nextWeekEnds: '2027-01-10' });
  });

  it('refuses a malformed date', () => {
    expect(() => weekBounds('15-09-2026')).toThrow(RangeError);
  });
});

describe("today's date for a payable", () => {
  it('is the date in India, not the server clock', () => {
    // 20:00 UTC on the 14th is 01:30 on the 15th in India.
    expect(todayInIndia(new Date('2026-09-14T20:00:00Z'))).toBe('2026-09-15');
    expect(todayInIndia(new Date('2026-09-14T18:00:00Z'))).toBe('2026-09-14');
  });
});

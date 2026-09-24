import { describe, expect, it } from 'vitest';
import { isoWeeksEnding } from '../src/weeks.js';

describe('isoWeeksEnding', () => {
  it('ends with the week containing now, Monday to Monday, oldest first', () => {
    // Monday 14 September 2026, 03:00 IST is still Sunday 13 September in UTC.
    const weeks = isoWeeksEnding(new Date('2026-09-13T21:30:00Z'), 3);
    expect(weeks.map((w) => w.start)).toEqual(['2026-08-31', '2026-09-07', '2026-09-14']);
    expect(weeks.map((w) => w.end)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21']);
    expect(weeks.map((w) => w.isoWeek)).toEqual(['2026-W36', '2026-W37', '2026-W38']);
  });

  it('labels the first week of a year by its Thursday (ISO 8601)', () => {
    // 1 January 2027 is a Friday, so it belongs to 2026-W53.
    const [week] = isoWeeksEnding(new Date('2027-01-01T12:00:00Z'), 1);
    expect(week?.isoWeek).toBe('2026-W53');
    expect(week?.start).toBe('2026-12-28');
  });

  it('returns exactly count weeks with no gaps', () => {
    const weeks = isoWeeksEnding(new Date('2026-09-14T12:00:00Z'), 8);
    expect(weeks).toHaveLength(8);
    for (let i = 1; i < weeks.length; i += 1) expect(weeks[i]?.start).toBe(weeks[i - 1]?.end);
  });
});

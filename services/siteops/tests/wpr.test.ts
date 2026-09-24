import { describe, expect, it } from 'vitest';
import { WprError, aggregateWeek, assertIssuable, type DailyReport } from '../src/domain/wpr.js';

const WEEK = [
  '2026-09-01',
  '2026-09-02',
  '2026-09-03',
  '2026-09-04',
  '2026-09-05',
  '2026-09-06',
];

const day = (date: string, carpenters: number, painters = 0): DailyReport => ({
  date,
  submitted: true,
  floors: [
    {
      name: 'Ground',
      manpower: [
        { trade: 'Carpenter', count: carpenters },
        ...(painters > 0 ? [{ trade: 'Painter', count: painters }] : []),
      ],
    },
  ],
});

describe('aggregateWeek', () => {
  it('sums person-days across submitted reports', () => {
    const a = aggregateWeek(WEEK, WEEK.map((d) => day(d, 5)));
    expect(a.reportedDays).toBe(6);
    expect(a.personDays).toBe(30);
    expect(a.averageOverReportedDays).toBe(5);
  });

  it('NAMES the missing days rather than averaging over a full week', () => {
    // A week that silently averages five submitted days as though they were six
    // reads as a slow week; averaging over five without saying so overstates
    // coverage. The figure supports a progress claim either way.
    const a = aggregateWeek(WEEK, [day('2026-09-01', 6), day('2026-09-02', 6)]);
    expect(a.reportedDays).toBe(2);
    expect(a.missingDates).toEqual(['2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']);
    expect(a.personDays).toBe(12);
    // The denominator is stated, so neither reading is implied.
    expect(a.averageOverReportedDays).toBe(6);
  });

  it('breaks person-days down by trade', () => {
    const a = aggregateWeek(WEEK, [day('2026-09-01', 4, 2), day('2026-09-02', 3, 1)]);
    expect(a.personDaysByTrade.get('Carpenter')).toBe(7);
    expect(a.personDaysByTrade.get('Painter')).toBe(3);
  });

  it('ignores an unsubmitted draft', () => {
    const a = aggregateWeek(WEEK, [{ ...day('2026-09-01', 9), submitted: false }]);
    expect(a.reportedDays).toBe(0);
    expect(a.personDays).toBe(0);
    expect(a.averageOverReportedDays).toBeNull();
  });

  it('takes the expected days from the caller, because a six-day week is normal', () => {
    // What counts as a working day is a site decision, and a public holiday is
    // not a missing report.
    const sixDay = aggregateWeek(WEEK, WEEK.map((d) => day(d, 1)));
    expect(sixDay.missingDates).toEqual([]);

    const withHoliday = aggregateWeek(WEEK.slice(0, 5), WEEK.slice(0, 5).map((d) => day(d, 1)));
    expect(withHoliday.missingDates).toEqual([]);
    expect(withHoliday.weekEnd).toBe('2026-09-05');
  });

  it('refuses a report for a date outside the week', () => {
    // A data-entry error, not a bonus day.
    expect(() => aggregateWeek(WEEK, [day('2026-10-01', 5)])).toThrow(/outside the week/);
  });

  it('refuses a malformed date or an empty week', () => {
    expect(() => aggregateWeek(['01-09-2026'], [])).toThrow(WprError);
    expect(() => aggregateWeek([], [])).toThrow(WprError);
  });
});

describe('assertIssuable', () => {
  it('allows a complete week', () => {
    expect(() => assertIssuable(aggregateWeek(WEEK, WEEK.map((d) => day(d, 4))))).not.toThrow();
  });

  it('refuses a week with gaps, naming them', () => {
    // A weekly report with gaps is still useful internally. Sending one to a
    // client as evidence of progress without saying which days are missing is
    // the problem.
    expect(() => assertIssuable(aggregateWeek(WEEK, [day('2026-09-01', 4)]))).toThrow(
      /2026-09-02/,
    );
  });

  it('refuses a week with nothing submitted', () => {
    expect(() => assertIssuable(aggregateWeek(WEEK, []))).toThrow(/no submitted reports/);
  });
});

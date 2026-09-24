import { describe, expect, it } from 'vitest';
import { addDays, businessWeek, daysBetween, financialWindow, todayInIndia, weekdayLabel } from '../src/calendar.js';

describe('the day in India', () => {
  it('is the calendar date in Asia/Kolkata, not the server clock', () => {
    // 20:00 UTC on the 14th is 01:30 on the 15th in India.
    expect(todayInIndia(new Date('2026-09-14T20:00:00Z'))).toBe('2026-09-15');
    expect(todayInIndia(new Date('2026-09-14T18:00:00Z'))).toBe('2026-09-14');
  });
});

describe('day arithmetic', () => {
  it('adds and counts whole days across a month and a year', () => {
    expect(addDays('2026-09-14', 7)).toBe('2026-09-21');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-09-14', -1)).toBe('2026-09-13');
    expect(daysBetween('2026-09-01', '2026-09-14')).toBe(13);
    expect(daysBetween('2026-09-14', '2026-09-01')).toBe(-13);
  });

  it('names the weekday', () => {
    expect(weekdayLabel('2026-09-14')).toBe('Mon');
    expect(weekdayLabel('2026-09-20')).toBe('Sun');
  });

  it('refuses a malformed date', () => {
    expect(() => addDays('14-09-2026', 1)).toThrow(RangeError);
  });
});

describe('the business week', () => {
  it('runs Monday to Sunday and a Sunday ends its own week', () => {
    // 2026-09-14 is a Monday.
    expect(businessWeek('2026-09-14')).toEqual({ start: '2026-09-14', end: '2026-09-20' });
    expect(businessWeek('2026-09-17')).toEqual({ start: '2026-09-14', end: '2026-09-20' });
    expect(businessWeek('2026-09-20')).toEqual({ start: '2026-09-14', end: '2026-09-20' });
    expect(businessWeek('2026-09-21')).toEqual({ start: '2026-09-21', end: '2026-09-27' });
  });
});

describe('the financial window', () => {
  it('runs the financial year to date from April', () => {
    const fy = financialWindow('2026-09-14', 'fy');
    expect(fy.label).toBe('FY 2026-27');
    expect(fy.financialYear).toBe('2026-27');
    expect(fy.months.map((m) => m.month)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    expect(fy.months.map((m) => m.label)).toEqual(['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']);
    expect(fy.start).toBe('2026-04-01');
    expect(fy.end).toBe('2026-10-01');
    expect(fy.from).toBe('2026-04');
    expect(fy.to).toBe('2026-09');
  });

  it('runs the quarter to date, and September is the second quarter', () => {
    const q = financialWindow('2026-09-14', 'q');
    expect(q.label).toBe('Q2 2026-27');
    expect(q.months.map((m) => m.month)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(q.start).toBe('2026-07-01');
    expect(q.end).toBe('2026-10-01');
  });

  it('puts January in the previous financial year, in its fourth quarter', () => {
    const fy = financialWindow('2027-01-20', 'fy');
    expect(fy.label).toBe('FY 2026-27');
    expect(fy.months).toHaveLength(10);
    expect(fy.months[9]?.month).toBe('2027-01');
    const q = financialWindow('2027-01-20', 'q');
    expect(q.label).toBe('Q4 2026-27');
    expect(q.months.map((m) => m.month)).toEqual(['2027-01']);
    expect(q.end).toBe('2027-02-01');
  });

  it('crosses December into the next calendar year without a gap', () => {
    const fy = financialWindow('2026-12-31', 'fy');
    expect(fy.months.map((m) => m.month).slice(-2)).toEqual(['2026-11', '2026-12']);
    expect(fy.end).toBe('2027-01-01');
    expect(financialWindow('2026-04-01', 'fy').months.map((m) => m.month)).toEqual(['2026-04']);
  });
});

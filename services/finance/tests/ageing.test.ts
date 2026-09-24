import { describe, expect, it } from 'vitest';
import { fromWire as paise } from '@cog/money';
import { ageing, bucketOf, monthSeries, sharePct } from '../src/domain/ageing.js';

describe('which ageing bucket a day count falls in', () => {
  it('is current until the day after the date, then 1–30, 31–60, over 60 on their edges', () => {
    expect(bucketOf(-5)).toBe('current');
    expect(bucketOf(0)).toBe('current');
    expect(bucketOf(1)).toBe('days1to30');
    expect(bucketOf(30)).toBe('days1to30');
    expect(bucketOf(31)).toBe('days31to60');
    expect(bucketOf(60)).toBe('days31to60');
    expect(bucketOf(61)).toBe('over60');
  });
});

describe('a share for a bar', () => {
  it('is truncated to two decimals and capped at 100', () => {
    expect(sharePct(paise('1'), paise('3'))).toBe(33.33);
    expect(sharePct(paise('5'), paise('4'))).toBe(100);
    expect(sharePct(paise('0'), paise('4'))).toBe(0);
    expect(sharePct(paise('4'), paise('0'))).toBe(0);
  });
});

describe('money owed in ageing buckets', () => {
  // The design's derivation of the demo seed (build/panels.mjs): one receivable
  // is overdue, so one bucket carries all of it and the others are ₹0.00.
  it('puts one overdue balance in one bucket and the rest in current', () => {
    const aged = ageing([
      { daysPast: 12, amount: paise('24780000') },
      { daysPast: -9, amount: paise('50000000') },
      { daysPast: -20, amount: paise('12500000') },
    ]);
    expect(aged.total).toBe('87280000');
    expect(aged.openCount).toBe(3);
    expect(aged.overdue).toEqual({ count: 1, total: '24780000', pct: 28.39 });
    expect(aged.buckets.days1to30).toEqual({ count: 1, total: '24780000', pct: 28.39 });
    expect(aged.buckets.days31to60).toEqual({ count: 0, total: '0', pct: 0 });
    expect(aged.buckets.over60).toEqual({ count: 0, total: '0', pct: 0 });
    expect(aged.buckets.current).toEqual({ count: 2, total: '62500000', pct: 71.6 });
  });

  it('ignores a settled line and answers empty for nothing owed', () => {
    const aged = ageing([{ daysPast: 40, amount: paise('0') }]);
    expect(aged.total).toBe('0');
    expect(aged.openCount).toBe(0);
    expect(aged.overdue.pct).toBe(0);
    expect(aged.buckets.days31to60.count).toBe(0);
  });

  it('spreads three overdue lines over the three buckets', () => {
    const aged = ageing([
      { daysPast: 3, amount: paise('100') },
      { daysPast: 45, amount: paise('300') },
      { daysPast: 90, amount: paise('600') },
    ]);
    expect(aged.buckets.days1to30.pct).toBe(10);
    expect(aged.buckets.days31to60.pct).toBe(30);
    expect(aged.buckets.over60.pct).toBe(60);
    expect(aged.overdue).toEqual({ count: 3, total: '1000', pct: 100 });
  });
});

describe('money in and out by month', () => {
  it('indexes both series to the largest month on either, and nets the totals', () => {
    const s = monthSeries([
      { month: '2026-07', label: 'Jul', collected: paise('0'), paidOut: paise('40000') },
      { month: '2026-08', label: 'Aug', collected: paise('100000'), paidOut: paise('25000') },
      { month: '2026-09', label: 'Sep', collected: paise('50000'), paidOut: paise('0') },
    ]);
    expect(s.months.map((m) => m.collectedIndex)).toEqual([0, 10000, 5000]);
    expect(s.months.map((m) => m.paidOutIndex)).toEqual([4000, 2500, 0]);
    expect(s.collected).toBe('150000');
    expect(s.paidOut).toBe('65000');
    expect(s.net).toBe('85000');
    expect(s.ticks).toEqual([
      { index: 2500, wire: '25000' },
      { index: 5000, wire: '50000' },
      { index: 7500, wire: '75000' },
      { index: 10000, wire: '100000' },
    ]);
  });

  it('is all zeros, and a zero net, for a window with nothing in it', () => {
    const s = monthSeries([{ month: '2026-04', label: 'Apr', collected: paise('0'), paidOut: paise('0') }]);
    expect(s.months[0]?.collectedIndex).toBe(0);
    expect(s.net).toBe('0');
    expect(s.ticks).toEqual([]);
  });

  it('nets negative when more went out than came in', () => {
    const s = monthSeries([{ month: '2026-04', label: 'Apr', collected: paise('10'), paidOut: paise('25') }]);
    expect(s.net).toBe('-15');
  });
});

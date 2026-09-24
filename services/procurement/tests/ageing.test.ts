import { describe, expect, it } from 'vitest';
import { fromWire } from '@cog/money';
import { ageing, bucketOf, spendByTrade } from '../src/domain/ageing.js';

describe('which ageing bucket a bill falls in', () => {
  it('is current until the day after it was due, then 1–30, 31–60, over 60 on their edges', () => {
    expect(bucketOf(0)).toBe('current');
    expect(bucketOf(1)).toBe('days1to30');
    expect(bucketOf(30)).toBe('days1to30');
    expect(bucketOf(31)).toBe('days31to60');
    expect(bucketOf(60)).toBe('days31to60');
    expect(bucketOf(61)).toBe('over60');
  });
});

describe('what the firm owes, in ageing buckets', () => {
  it('buckets each unpaid bill gross and shares the bar by the whole owed', () => {
    const aged = ageing([
      { daysPast: -4, amount: fromWire('4000') },
      { daysPast: 2, amount: fromWire('1000') },
      { daysPast: 35, amount: fromWire('3000') },
      { daysPast: 75, amount: fromWire('2000') },
    ]);
    expect(aged.total).toBe('10000');
    expect(aged.openCount).toBe(4);
    expect(aged.buckets.current).toEqual({ count: 1, total: '4000', pct: 40 });
    expect(aged.buckets.days1to30).toEqual({ count: 1, total: '1000', pct: 10 });
    expect(aged.buckets.days31to60).toEqual({ count: 1, total: '3000', pct: 30 });
    expect(aged.buckets.over60).toEqual({ count: 1, total: '2000', pct: 20 });
    expect(aged.overdue).toEqual({ count: 3, total: '6000', pct: 60 });
  });

  it('is empty, with zero shares, when nothing is owed', () => {
    const aged = ageing([]);
    expect(aged).toMatchObject({ total: '0', openCount: 0, overdue: { count: 0, total: '0', pct: 0 } });
  });
});

describe('spend by trade package', () => {
  const label = (code: string) => ({ MEP: 'Electrical and plumbing', CIV: 'Civil', JOI: 'Joinery', FLR: 'Flooring', CEI: 'Ceilings', GLZ: 'Glazing', PNT: 'Painting' })[code] ?? code;

  it('sums each trade over its lines, names the top five and folds the rest', () => {
    const spend = spendByTrade(
      [
        { tradeCode: 'MEP', gross: fromWire('300') },
        { tradeCode: 'MEP', gross: fromWire('200') },
        { tradeCode: 'CIV', gross: fromWire('400') },
        { tradeCode: 'JOI', gross: fromWire('150') },
        { tradeCode: 'FLR', gross: fromWire('120') },
        { tradeCode: 'CEI', gross: fromWire('100') },
        { tradeCode: 'GLZ', gross: fromWire('60') },
        { tradeCode: 'PNT', gross: fromWire('40') },
      ],
      label,
    );
    expect(spend.total).toBe('1370');
    expect(spend.items.map((i) => [i.label, i.gross])).toEqual([
      ['Electrical and plumbing', '500'],
      ['Civil', '400'],
      ['Joinery', '150'],
      ['Flooring', '120'],
      ['Ceilings', '100'],
    ]);
    expect(spend.items[0]?.pct).toBe(36.49);
    expect(spend.rest).toEqual({ count: 2, gross: '100', pct: 7.29 });
  });

  it('keeps lines that name no trade apart as Unassigned, and never asks for their label', () => {
    const spend = spendByTrade(
      [
        { tradeCode: null, gross: fromWire('90') },
        { tradeCode: 'CIV', gross: fromWire('10') },
      ],
      (code) => {
        if (code !== 'CIV') throw new Error(`asked for a label for ${code} — a null code has no label to look up`);
        return code;
      },
    );
    expect(spend.items.map((i) => [i.tradeCode, i.label, i.pct])).toEqual([
      [null, 'Unassigned', 90],
      ['CIV', 'CIV', 10],
    ]);
    expect(spend.rest).toEqual({ count: 0, gross: '0', pct: 0 });
  });

  it('answers empty, not a division, for a window with no orders', () => {
    expect(spendByTrade([], label)).toEqual({ total: '0', items: [], rest: { count: 0, gross: '0', pct: 0 } });
  });
});

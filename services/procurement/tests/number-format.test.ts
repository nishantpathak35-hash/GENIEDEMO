import { describe, expect, it } from 'vitest';
import {
  FY_FORMATS,
  financialYear,
  formatSeriesNumber,
  isFyFormat,
  previewSeries,
  type SeriesFormat,
} from '../src/domain/number-format.js';

/**
 * The Indian financial year runs 1 April to 31 March.
 *
 * These expectations come from that rule, not from running the implementation
 * and writing down what it said. The boundary cases are the whole test: any
 * function returns the right answer in July.
 */
describe('the financial year', () => {
  it('names a year by the calendar year it starts in', () => {
    expect(financialYear('YYYY-YY', new Date('2026-07-15T06:00:00Z'))).toBe('2026-27');
  });

  it('is still the old year on 31 March', () => {
    // 23:59 IST on 31 March 2027.
    expect(financialYear('YYYY-YY', new Date('2027-03-31T18:29:00Z'))).toBe('2026-27');
  });

  it('turns over on 1 April', () => {
    // 00:01 IST on 1 April 2027 — 18:31 UTC the evening before.
    expect(financialYear('YYYY-YY', new Date('2027-03-31T18:31:00Z'))).toBe('2027-28');
  });

  /**
   * The reason the timezone is explicit rather than the process default.
   *
   * At this instant it is 02:00 on 1 April in India and still 20:30 on 31 March
   * in UTC. A container running UTC — which ours do — would file a purchase
   * order raised at that moment in the year that ended the night before.
   */
  it('reads the date in India, not in the container', () => {
    expect(financialYear('YYYY-YY', new Date('2027-03-31T20:30:00Z'))).toBe('2027-28');
  });

  it('writes the year four ways, and only those four', () => {
    const at = new Date('2026-07-15T06:00:00Z');
    expect(financialYear('YYYY-YY', at)).toBe('2026-27');
    expect(financialYear('YY-YY', at)).toBe('26-27');
    expect(financialYear('YYYY', at)).toBe('2026');
    expect(financialYear('YY', at)).toBe('26');
    expect(FY_FORMATS).toHaveLength(4);
  });

  it('rejects a format it does not know rather than inventing one', () => {
    expect(isFyFormat('YYYY-YY')).toBe(true);
    expect(isFyFormat('MMM-YY')).toBe(false);
    expect(isFyFormat('')).toBe(false);
  });

  it('crosses a century without producing 2099-00 nonsense', () => {
    expect(financialYear('YYYY-YY', new Date('2099-07-15T06:00:00Z'))).toBe('2099-00');
    expect(financialYear('YY-YY', new Date('2099-07-15T06:00:00Z'))).toBe('99-00');
  });
});

const BASE: SeriesFormat = {
  prefix: 'PO',
  separator: '-',
  padding: 4,
  includeFy: false,
  fyFormat: 'YYYY-YY',
};

describe('spelling a number', () => {
  it('pads to the configured width', () => {
    expect(formatSeriesNumber(BASE, 42, '2026-27')).toBe('PO-0042');
  });

  it('puts the year between the prefix and the number when asked', () => {
    expect(
      formatSeriesNumber({ ...BASE, separator: '/', includeFy: true }, 1, '2026-27'),
    ).toBe('PO/2026-27/0001');
  });

  it('does not truncate a number wider than the padding', () => {
    // Padding is a minimum. Trimming here would issue PO-0000 after 9999.
    expect(formatSeriesNumber(BASE, 123456, '2026-27')).toBe('PO-123456');
  });

  it('drops a separator the user typed at the end of the prefix', () => {
    // Somebody who types `PO/` into a prefix field means `PO`. The legacy does
    // this too (formatNumber:41) and it is the one piece of its defensive
    // coding worth keeping.
    expect(formatSeriesNumber({ ...BASE, prefix: 'PO/', separator: '/' }, 7, '2026-27')).toBe(
      'PO/0007',
    );
  });

  it('falls back to a slash when the separator is empty', () => {
    expect(formatSeriesNumber({ ...BASE, separator: '' }, 7, '2026-27')).toBe('PO/0007');
  });

  it('previews three consecutive numbers, so an overflow is visible', () => {
    const examples = previewSeries(
      { ...BASE, padding: 2 },
      98,
      new Date('2026-07-15T06:00:00Z'),
    );
    expect(examples).toEqual(['PO-98', 'PO-99', 'PO-100']);
  });
});

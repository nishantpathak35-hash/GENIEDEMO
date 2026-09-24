import { describe, expect, it } from 'vitest';
import { EXPORT_ROW_CAP, everyRow, exportHref, rupees, text, toCsv } from '../lib/export';

describe('CSV export helpers', () => {
  it('writes rupees in Indian grouping without the symbol, and absent as an empty cell', () => {
    expect(rupees('1234567890')).toBe('1,23,45,678.90');
    expect(rupees(null)).toBe('');
  });

  it('defuses a cell a spreadsheet would run as a formula', () => {
    expect(text('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(text('@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(text('Plain name')).toBe('Plain name');
  });

  it('quotes commas, quotes and line breaks, and starts with a byte-order mark', () => {
    const csv = toCsv(['A', 'B'], [['one, two', 'say "hi"'], ['line\nbreak', 'x']]);
    expect(csv).toBe('\uFEFFA,B\r\n"one, two","say ""hi"""\r\n"line\nbreak",x\r\n');
  });

  it('follows the cursor to the end of the list, not just the first window', async () => {
    const windows = [
      { items: [1, 2], nextCursor: 'c1' },
      { items: [3], nextCursor: null },
    ];
    let call = 0;
    const result = await everyRow(async () => ({ kind: 'ok' as const, data: windows[call++]! }));
    expect(result).toEqual({ kind: 'ok', data: [1, 2, 3] });
  });

  it('refuses past the cap rather than writing a truncated file', async () => {
    const big = Array.from({ length: EXPORT_ROW_CAP + 1 }, (_, i) => i);
    const result = await everyRow(async () => ({ kind: 'ok' as const, data: { items: big, nextCursor: null } }));
    expect(result).toEqual({ kind: 'too-many' });
  });

  it('carries only the filters the screen names into the link', () => {
    expect(exportHref('orders', { state: 'approved', cursor: 'abc', q: '' }, ['state', 'q'])).toBe(
      '/export/orders?state=approved',
    );
    expect(exportHref('vendors', {}, ['q'])).toBe('/export/vendors');
  });
});

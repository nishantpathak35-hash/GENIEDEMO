import { describe, expect, it } from 'vitest';
import {
  STATUTORY_NUMBER_MAX_LENGTH,
  formatSeriesNumber,
  statutoryNumberProblem,
} from '../src/domain/number-format.js';

/**
 * Statute text, CGST Rule 46(b) — provisional, CA-17: a tax invoice's number
 * is at most sixteen characters of letters, digits, hyphen and slash. Payment
 * vouchers are held to the same until the CA says otherwise.
 */
describe('a statutory document number', () => {
  it('allows the default formats at their widest year', () => {
    const invoice = formatSeriesNumber(
      { prefix: 'INV', separator: '/', padding: 4, includeFy: true, fyFormat: 'YYYY-YY' },
      1,
      '2026-27',
    );
    expect(invoice).toBe('INV/2026-27/0001');
    expect(invoice).toHaveLength(STATUTORY_NUMBER_MAX_LENGTH);
    expect(statutoryNumberProblem(invoice)).toBeNull();
    expect(statutoryNumberProblem('PV/2026-27/0001')).toBeNull();
  });

  it('refuses a seventeenth character', () => {
    expect(statutoryNumberProblem('INV/2026-27/00001')).toMatch(/sixteen/);
  });

  it('refuses a character outside letters, digits, hyphen and slash', () => {
    expect(statutoryNumberProblem('INV 2026-27/0001')).toMatch(/letters, digits, hyphen and slash/);
    expect(statutoryNumberProblem('INV#0001')).toMatch(/letters, digits, hyphen and slash/);
  });
});

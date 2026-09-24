import { describe, expect, it } from 'vitest';
import { asConstitution, constitutionFromPan, constitutionMismatch } from '../src/domain/vendor-constitution.js';

/**
 * The PAN's fourth character is the holder's status — its structure, not a CA's
 * answer — and under the CA's answer to CA-07 it only cross-checks the
 * constitution a person recorded.
 */
describe("a PAN's fourth character, as a cross-check on the constitution", () => {
  it('reads P, H, F and C as an individual, an HUF, a firm and a company', () => {
    expect(constitutionFromPan('AAAPB1234F')).toBe('individual');
    expect(constitutionFromPan('AAAHB1234F')).toBe('huf');
    expect(constitutionFromPan('AAAFB1234F')).toBe('firm');
    expect(constitutionFromPan('AAACB1234F')).toBe('company');
  });

  it('reads any other status letter as other, and nothing without a well-formed PAN', () => {
    expect(constitutionFromPan('AAATB1234F')).toBe('other');
    expect(constitutionFromPan(null)).toBeNull();
    expect(constitutionFromPan('not a pan')).toBeNull();
  });

  it('is a mismatch only when both are there and they differ', () => {
    expect(constitutionMismatch('huf', 'AAACB1234F')).toBe(true);
    expect(constitutionMismatch('company', 'AAACB1234F')).toBe(false);
    expect(constitutionMismatch(null, 'AAACB1234F')).toBe(false);
    expect(constitutionMismatch('firm', null)).toBe(false);
  });

  it('reads a stored value outside the five as not recorded', () => {
    expect(asConstitution('firm')).toBe('firm');
    expect(asConstitution('partnership')).toBeNull();
    expect(asConstitution(null)).toBeNull();
  });
});

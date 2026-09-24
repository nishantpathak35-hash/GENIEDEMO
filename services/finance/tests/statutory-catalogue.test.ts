import { describe, expect, it } from 'vitest';
import {
  CATALOGUE_EFFECTIVE_FROM,
  CA_CALL,
  PAYEE_CLASSES,
  PROVISIONAL_RATES,
  PROVISIONAL_THRESHOLDS,
  RATE_KEYS,
  STATUTE_TEXT,
  TDS_SECTIONS,
  payeeClassFromConstitution,
} from '../src/domain/statutory-catalogue.js';

/**
 * The catalogue is the one place a provisional statutory value is written
 * down. These tests hold it to what the owner's decision of 2026-09-15 says a
 * provisional value must carry — they do not, and cannot, say the values are
 * right. That is the CA's to say.
 */
describe('the provisional catalogue', () => {
  const all = [...PROVISIONAL_RATES, ...PROVISIONAL_THRESHOLDS];

  it('names a source, a statute and a CA question for every value', () => {
    for (const value of all) {
      expect([CA_CALL, STATUTE_TEXT]).toContain(value.source);
      expect(value.statute.length).toBeGreaterThan(0);
      expect(value.questionRef).toMatch(/^CA-\d{2}(, CA-\d{2})*$/);
    }
  });

  it('carries no verification field at all — promotion is a person, in the database', () => {
    for (const value of all) {
      expect(Object.keys(value)).not.toContain('verifiedBy');
      expect(Object.keys(value)).not.toContain('verifiedOn');
      expect(Object.keys(value)).not.toContain('status');
    }
  });

  it('is effective from the date relayed from the CA call', () => {
    expect(CATALOGUE_EFFECTIVE_FROM).toBe('2026-04-01');
  });

  it('keeps the relayed answers marked as relayed, and nothing else', () => {
    const relayed = PROVISIONAL_RATES.filter((r) => r.source === CA_CALL).map((r) => [r.key, r.rate]);
    expect(relayed).toEqual([
      [RATE_KEYS.noValidPan, 2000],
      [RATE_KEYS.gstWorksContract, 1800],
    ]);
  });

  it('covers the four sections in scope, and no other', () => {
    expect([...TDS_SECTIONS]).toEqual(['194C', '194I', '194J', '194Q']);
    const thresholdSections = new Set(PROVISIONAL_THRESHOLDS.map((t) => t.section));
    expect([...thresholdSections].sort()).toEqual(['194C', '194I', '194J', '194Q']);
  });

  it('has one rate per key and payee class — a lookup never finds two', () => {
    const seen = new Set<string>();
    for (const rate of PROVISIONAL_RATES) {
      const id = `${rate.key}/${rate.payeeClass ?? ''}`;
      expect(seen.has(id), id).toBe(false);
      seen.add(id);
    }
  });

  it('has a rate for every payee class a section is split by', () => {
    for (const section of TDS_SECTIONS) {
      const classes = PAYEE_CLASSES[section];
      const rows = PROVISIONAL_RATES.filter((r) => r.key === RATE_KEYS[section]);
      expect(rows.map((r) => r.payeeClass).sort()).toEqual(
        classes.length === 0 ? [null] : [...classes].sort(),
      );
    }
  });
});

describe("the 194C payee class from the vendor's constitution (CA-07)", () => {
  it('is individual_huf for an individual or an HUF — 1% under s.194C(1)', () => {
    expect(payeeClassFromConstitution('individual')).toBe('individual_huf');
    expect(payeeClassFromConstitution('huf')).toBe('individual_huf');
  });

  it('is other for a firm, a company or anything else — 2%', () => {
    expect(payeeClassFromConstitution('firm')).toBe('other');
    expect(payeeClassFromConstitution('company')).toBe('other');
    expect(payeeClassFromConstitution('other')).toBe('other');
  });
});

import { describe, expect, it } from 'vitest';
import {
  STATUTORY_OUTPUTS,
  ProvisionalOutputRefused,
  assertStatutoryOutputAllowed,
  environmentFrom,
} from '../src/domain/go-live-gate.js';

const REFUSING = { draftStatutoryOutputs: false };
const DRAFTS = { draftStatutoryOutputs: true };

const provisionalRate = { key: 'tds_194c', status: 'provisional', questionRef: 'CA-12' };
const provisionalThreshold = { key: '194C/annual_aggregate', status: 'provisional', questionRef: 'CA-12' };
const verifiedRate = { key: 'tds_194c', status: 'verified', questionRef: 'CA-12' };

describe('the go-live gate, without STATUTORY_OUTPUTS=draft', () => {
  it.each(STATUTORY_OUTPUTS)('refuses %s computed from a provisional row, by name', (output) => {
    let refused: unknown;
    try {
      assertStatutoryOutputAllowed(output, [verifiedRate, provisionalRate, provisionalThreshold], REFUSING);
    } catch (error) {
      refused = error;
    }
    expect(refused).toBeInstanceOf(ProvisionalOutputRefused);
    const error = refused as ProvisionalOutputRefused;
    expect(error.code).toBe('PROVISIONAL_OUTPUT_REFUSED');
    expect(error.output).toBe(output);
    // Every provisional row it would have relied on is named — and the
    // verified one is not, because it is not what stands in the way.
    expect(error.rows).toEqual([
      { key: 'tds_194c', questionRef: 'CA-12' },
      { key: '194C/annual_aggregate', questionRef: 'CA-12' },
    ]);
    expect(error.message).toMatch(/^Refused: /);
    expect(error.message).toMatch(/STATUTORY_OUTPUTS=draft/);
  });

  it('allows an output whose every row is verified, and says it is not provisional', () => {
    expect(assertStatutoryOutputAllowed('challan', [verifiedRate], REFUSING)).toEqual({
      provisional: false,
    });
  });

  it('treats any status other than exactly "verified" as provisional', () => {
    // A typo must not be the thing that lets an unverified figure out.
    expect(() =>
      assertStatutoryOutputAllowed('tds_deduction', [{ key: 'x', status: 'Verified' }], REFUSING),
    ).toThrow(ProvisionalOutputRefused);
  });
});

describe('the go-live gate, with STATUTORY_OUTPUTS=draft', () => {
  it.each(STATUTORY_OUTPUTS)('computes %s and marks it provisional', (output) => {
    expect(assertStatutoryOutputAllowed(output, [provisionalRate], DRAFTS)).toEqual({
      provisional: true,
    });
  });
});

describe('which process produces drafts — it fails closed', () => {
  it('is only one told STATUTORY_OUTPUTS=draft, exactly', () => {
    expect(environmentFrom('draft')).toEqual({ draftStatutoryOutputs: true });
  });

  it('refuses when the value is unset, empty, or anything else — production or not', () => {
    for (const value of [undefined, '', 'DRAFT', 'Draft', ' draft', 'draft ', 'true', '1', 'development', 'production']) {
      expect(environmentFrom(value), String(value)).toEqual({ draftStatutoryOutputs: false });
    }
  });
});

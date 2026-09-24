import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  roundChallanSec288B,
  roundGstHeadToPaise,
  roundInvoiceTotalSec170,
  type RoundingBoundary,
} from '../src/index.js';

/**
 * The golden files, held to the boundaries they describe.
 *
 * A golden is the provenance record — who said a rule, against what, and whether
 * a CA has verified it. Without this test it is also only a record: a boundary
 * could change and its golden still say the old thing. Every file under
 * `golden/` names its rule; each rule maps to exactly one boundary here, and an
 * unmapped rule fails rather than being skipped.
 */

const BOUNDARIES: Readonly<Record<string, RoundingBoundary>> = {
  'gst-head-to-the-paise': roundGstHeadToPaise,
  'sec-170-invoice-total-to-the-rupee': roundInvoiceTotalSec170,
  'sec-288b-challan-drop-paise-then-nearest-ten': roundChallanSec288B,
};

interface Golden {
  readonly rule: string;
  readonly status: string;
  readonly verified_by: string | null;
  readonly verified_on: string | null;
  readonly cases: readonly { numerator: number; denominator: number; expect: number; comment: string }[];
}

const DIR = new URL('../golden/', import.meta.url);
const files = readdirSync(DIR).filter((name) => name.endsWith('.json'));

describe('the golden files', () => {
  it('exist', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s matches its boundary, case by case', (name) => {
    const golden = JSON.parse(readFileSync(new URL(name, DIR), 'utf8')) as Golden;
    const boundary = BOUNDARIES[golden.rule];
    expect(boundary, `no boundary is mapped for ${golden.rule}`).toBeDefined();
    for (const c of golden.cases) {
      expect(boundary?.(BigInt(c.numerator), BigInt(c.denominator)), c.comment).toBe(BigInt(c.expect));
    }
  });

  it.each(files)('%s is verified only with a name and a date, and provisional only without', (name) => {
    const golden = JSON.parse(readFileSync(new URL(name, DIR), 'utf8')) as Golden;
    expect(['provisional', 'verified']).toContain(golden.status);
    if (golden.status === 'verified') {
      expect(golden.verified_by).not.toBeNull();
      expect(golden.verified_on).not.toBeNull();
    } else {
      expect(golden.verified_by).toBeNull();
      expect(golden.verified_on).toBeNull();
    }
    expect(name.endsWith(`.${golden.status}.json`)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { TERM_OPTIONS } from '@cog/contracts';
import { DEFAULT_TERMINOLOGY, TERM_PAIRS, WORDS, relabel, termsFor } from '../src/words.js';

/**
 * One vocabulary: the label map's words, and the firm's four choices turned
 * into every derived label — so no screen builds "Unsigned change orders"
 * by string arithmetic of its own.
 */
describe('the words', () => {
  it('the label map says the design’s word, never the shipped one', () => {
    expect(WORDS.orderedSoFar).toBe('Ordered so far');
    expect(WORDS.waitingForApproval).toBe('Waiting for approval');
    expect(Object.values(WORDS).some((w) => /committed spend|taxable|pending_approval/i.test(w))).toBe(false);
  });

  it('four pairs, one word each, the first the default', () => {
    expect(TERM_PAIRS.map((p) => p.key)).toEqual(['boq', 'variation', 'dailyReport', 'vendor']);
    for (const pair of TERM_PAIRS) expect(DEFAULT_TERMINOLOGY[pair.key]).toBe(pair.options[0]);
  });

  it('derives every label from the choice', () => {
    const t = termsFor({ boq: 'Estimate', variation: 'Change order', dailyReport: 'Site diary', vendor: 'Supplier' });
    expect(t.boqLines).toBe('Estimate lines');
    expect(t.newVariation).toBe('New change order');
    expect(t.unsignedVariations).toBe('Unsigned change orders');
    expect(t.dailyReports).toBe('Site diaries');
    expect(t.fileTodaysReport).toBe('File today’s site diary');
    expect(t.vendors).toBe('Suppliers');
    expect(t.vendorPortal).toBe('Supplier portal');
  });

  it('the pairs are the contract’s, so a service and a screen compile against one list', () => {
    for (const pair of TERM_PAIRS) expect(pair.options).toEqual(TERM_OPTIONS[pair.key]);
  });

  it('a word outside its pair reads as the default, never as a stray label', () => {
    const t = termsFor({ boq: 'Quotation' as never, vendor: 'Supplier' });
    expect(t.boq).toBe('BOQ');
    expect(t.vendors).toBe('Suppliers');
  });

  it('relabels the navigation’s canonical entries and leaves the rest alone', () => {
    const t = termsFor({ variation: 'Change order', vendor: 'Supplier', dailyReport: 'Site diary' });
    expect(relabel('Vendors', t)).toBe('Suppliers');
    expect(relabel('Variations', t)).toBe('Change orders');
    expect(relabel('Daily reports', t)).toBe('Site diaries');
    expect(relabel('File today’s report', t)).toBe('File today’s site diary');
    expect(relabel('New vendor', t)).toBe('New supplier');
    expect(relabel('Orders', t)).toBe('Orders');
  });

  it('nobody chose: the defaults', () => {
    const t = termsFor(null);
    expect(t.boq).toBe('BOQ');
    expect(t.variations).toBe('Variations');
    expect(t.fileTodaysReport).toBe('File today’s report');
    expect(t.newVendor).toBe('New vendor');
  });
});

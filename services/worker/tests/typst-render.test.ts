import { describe, expect, it } from 'vitest';
import {
  RenderError,
  SANDBOX,
  archiveRecord,
  bindInputs,
  escapeTypst,
  withTerminology,
  type RenderRequest,
} from '../src/domain/typst-render.js';

const request = (over: Partial<RenderRequest> = {}): RenderRequest => ({
  template: 'purchase-order',
  templateVersion: '1.0.0',
  data: { vendorName: 'M/s A&B Interiors', totalRupees: '5,900.00' },
  ...over,
});

describe('tenant input never becomes template code', () => {
  it('escapes the character that begins Typst code', () => {
    // Typst is a programming language: `#` begins code. A vendor named
    // `#read("/etc/passwd")` in an unescaped template is code execution inside
    // the renderer.
    expect(escapeTypst('#read("/etc/passwd")')).toBe('\\#read\\(\\"/etc/passwd\\"\\)'.replace(/\\\(|\\\)/g, (m) => m[1] as string));
  });

  it('escapes every metacharacter', () => {
    for (const ch of ['#', '$', '\\', '_', '&', '%', '~', '^', '{', '}', '[', ']', '"', '@', '<', '>']) {
      expect(escapeTypst(ch), ch).toBe(`\\${ch}`);
    }
  });

  it('escapes the ampersand in the vendor name from the brief', () => {
    expect(escapeTypst('M/s A&B Interiors')).toBe('M/s A\\&B Interiors');
  });

  it('escapes a dollar so a description does not become a maths block', () => {
    // `$` begins math in Typst and would swallow the rest of the line.
    expect(escapeTypst('Rate $ per sqm')).toBe('Rate \\$ per sqm');
  });
});

describe('bindInputs', () => {
  it('escapes every value it binds', () => {
    const bound = bindInputs(request());
    expect(bound['vendorName']).toBe('M/s A\\&B Interiors');
  });

  it('refuses a template that is not on the allowlist', () => {
    // A template name that is not on the list would be a path, and a path is
    // `../../` away from anything the worker can read.
    for (const bad of ['../../etc/passwd', 'unknown', '', 'purchase-order.typ']) {
      expect(() => bindInputs(request({ template: bad })), bad).toThrow(RenderError);
    }
  });

  it('refuses an unsafe key, because a key is emitted as an identifier', () => {
    expect(() => bindInputs(request({ data: { '#evil': 'x' } }))).toThrow(/unsafe template key/);
    expect(() => bindInputs(request({ data: { 'a-b': 'x' } }))).toThrow(/unsafe template key/);
  });

  it('requires a template version', () => {
    // Without it an archived PDF cannot be tied to the code that produced it,
    // and "show me the document you issued" has no verifiable answer.
    expect(() => bindInputs(request({ templateVersion: '  ' }))).toThrow(/template version/);
  });

  it('renders null as empty rather than the string "null"', () => {
    expect(bindInputs(request({ data: { note: null } }))['note']).toBe('');
  });

  it('takes money already formatted, never as a number', () => {
    // The template is not allowed to know about lakh/crore grouping, so
    // packages/money formats it and this binds a string.
    expect(bindInputs(request())['totalRupees']).toBe('5,900.00');
  });
});

describe('the archive record', () => {
  it('captures template, version, inputs and checksum', () => {
    // ADR-0013: the auditor asks "show me the document you issued", not
    // "re-render it identically" — which is what makes the snapshot the
    // evidence and renderer determinism secondary.
    const rec = archiveRecord(request(), 'a'.repeat(64), new Date('2026-09-04T10:00:00Z'));
    expect(rec.template).toBe('purchase-order');
    expect(rec.templateVersion).toBe('1.0.0');
    expect(rec.renderedAt).toBe('2026-09-04T10:00:00.000Z');
    expect(rec.inputs['vendorName']).toBe('M/s A\\&B Interiors');
  });

  it('refuses a record with no real checksum', () => {
    for (const bad of ['', 'not-a-hash', 'A'.repeat(64)]) {
      expect(() => archiveRecord(request(), bad, new Date())).toThrow(/sha256/);
    }
  });

  it('stores the ESCAPED inputs, which is what was actually rendered', () => {
    const rec = archiveRecord(request(), 'b'.repeat(64), new Date());
    expect(rec.inputs['vendorName']).not.toBe('M/s A&B Interiors');
  });
});

describe('the sandbox is asserted, not just documented', () => {
  it('has no network and no writable root', () => {
    // Stated as data so a test can hold it, rather than living only in a
    // Dockerfile comment where nothing checks it.
    expect(SANDBOX.network).toBe(false);
    expect(SANDBOX.writableRoot).toBe(false);
    expect(SANDBOX.tempDirOnly).toBe(true);
    expect(SANDBOX.templatesReadOnly).toBe(true);
  });
});

describe('the firm’s words reach a document as data', () => {
  // Settings › Terminology reaches a heading the way it reaches a label: the
  // chosen word is bound as an input the template prints, never as template
  // code — so it is escaped like every other value.
  it('binds every pair under a snake_case key, escaped', () => {
    const bound = bindInputs(
      withTerminology(request(), { boq: 'Estimate', variation: 'Change order', dailyReport: 'Site diary', vendor: 'Supplier' }),
    );
    expect(bound['term_boq']).toBe('Estimate');
    expect(bound['term_variation']).toBe('Change order');
    expect(bound['term_daily_report']).toBe('Site diary');
    expect(bound['term_vendor']).toBe('Supplier');
    // the request's own data is still there
    expect(bound['vendorName']).toBe('M/s A\\&B Interiors');
  });

  it('a firm that never chose still binds every key, with the pair’s first word', () => {
    const bound = bindInputs(withTerminology(request(), { boq: 'BOQ', variation: 'Variation', dailyReport: 'Daily report', vendor: 'Vendor' }));
    expect(Object.keys(bound).filter((k) => k.startsWith('term_')).sort()).toEqual(['term_boq', 'term_daily_report', 'term_variation', 'term_vendor']);
  });
});

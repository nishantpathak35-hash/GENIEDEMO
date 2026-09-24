import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { bp, paise, toRupeeString } from '@cog/money';
import {
  RateLookupError,
  TallyXmlError,
  buildVoucherXml,
  escapeXml,
  financialYearOf,
  rateOn,
  splitGst,
  tallyAccepted,
  tallyDate,
  unverified,
  type RateRow,
} from '../src/index.js';

/**
 * FIXTURE RATES ARE DELIBERATELY ABSURD.
 *
 * 10% and 20% flat, effective from 1999. Their only job is to prove the lookup
 * mechanism selects correctly across a boundary. A plausible-looking
 * placeholder — 2% for 194C, say — is the thing that gets mistaken for a
 * verified figure later and promoted by accident.
 *
 * Every real rate is CA-05 and is deferred to M2.5.
 */
const TABLE: readonly RateRow[] = [
  {
    key: 'SYNTHETIC',
    rate: bp(1000),
    effectiveFrom: '1999-01-01',
    effectiveTo: '2020-04-01',
    status: 'provisional',
    questionRef: 'CA-05',
  },
  {
    key: 'SYNTHETIC',
    rate: bp(2000),
    effectiveFrom: '2020-04-01',
    effectiveTo: null,
    status: 'provisional',
    questionRef: 'CA-05',
  },
];

describe('effective-dated rate lookup', () => {
  it('selects the rate in force on the day', () => {
    expect(rateOn(TABLE, 'SYNTHETIC', '2019-12-31').rate).toBe(1000);
    expect(rateOn(TABLE, 'SYNTHETIC', '2020-04-01').rate).toBe(2000);
    expect(rateOn(TABLE, 'SYNTHETIC', '2026-09-04').rate).toBe(2000);
  });

  it('treats effectiveFrom as inclusive and effectiveTo as exclusive', () => {
    // Otherwise a rate change lands a day early or late for half the vouchers
    // raised on the boundary.
    expect(rateOn(TABLE, 'SYNTHETIC', '2020-03-31').rate).toBe(1000);
    expect(rateOn(TABLE, 'SYNTHETIC', '2020-04-01').rate).toBe(2000);
  });

  it('throws when no rate is in force rather than defaulting to zero', () => {
    // `Number(value) || 0` is how a return gets filed with no tax on it.
    expect(() => rateOn(TABLE, 'SYNTHETIC', '1998-01-01')).toThrow(RateLookupError);
    expect(() => rateOn(TABLE, 'NOT_A_KEY', '2026-01-01')).toThrow(RateLookupError);
  });

  it('throws on overlapping rows rather than silently picking one', () => {
    const overlapping: RateRow[] = [
      { key: 'X', rate: bp(100), effectiveFrom: '2020-01-01', effectiveTo: null, status: 'provisional' },
      { key: 'X', rate: bp(200), effectiveFrom: '2021-01-01', effectiveTo: null, status: 'provisional' },
    ];
    expect(() => rateOn(overlapping, 'X', '2022-01-01')).toThrow(/overlapping/);
  });

  it('rejects a malformed date', () => {
    expect(() => rateOn(TABLE, 'SYNTHETIC', '04-09-2026')).toThrow(RateLookupError);
  });
});

describe('provenance', () => {
  it('reports every row no CA has signed', () => {
    // An API surface calls this before letting a figure reach a filed document.
    expect(unverified(TABLE)).toHaveLength(2);
  });

  it('no fixture in this repository claims to be verified', () => {
    // Only a human may promote provisional -> verified.
    expect(TABLE.every((r) => r.status === 'provisional')).toBe(true);
  });
});

describe('financialYearOf', () => {
  it('runs April to March, not January to December', () => {
    // A calendar-year lookup puts a 15 March voucher in the wrong year.
    expect(financialYearOf('2024-04-01')).toBe('2024-25');
    expect(financialYearOf('2025-03-31')).toBe('2024-25');
    expect(financialYearOf('2025-04-01')).toBe('2025-26');
    expect(financialYearOf('2024-01-15')).toBe('2023-24');
  });
});

describe('GST split — each head to the paise (CA-02)', () => {
  const RATE = bp(1800);

  it('splits an intra-state supply into equal halves', () => {
    const g = splitGst(paise(1_00_000n), RATE, 'intra_state');
    expect(toRupeeString(g.cgst)).toBe('90.00');
    expect(g.cgst).toBe(g.sgst);
    expect(g.igst).toBe(0n);
  });

  it('puts the whole rate on IGST for an inter-state supply', () => {
    const g = splitGst(paise(1_00_000n), RATE, 'inter_state');
    expect(toRupeeString(g.igst)).toBe('180.00');
    expect(g.cgst).toBe(0n);
  });

  it('cgst === sgst for every taxable amount', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 1_00_00_000_00n }), (amount) => {
        const g = splitGst(paise(amount), RATE, 'intra_state');
        expect(g.cgst).toBe(g.sgst);
      }),
      { numRuns: 2000 },
    );
  });

  it('|igst - (cgst + sgst)| <= 1 paisa — the rounding-placement property', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 1_00_00_000_00n }), (amount) => {
        const intra = splitGst(paise(amount), RATE, 'intra_state');
        const inter = splitGst(paise(amount), RATE, 'inter_state');
        const diff = intra.total - inter.igst;
        expect(diff < 0n ? -diff : diff).toBeLessThanOrEqual(1n);
      }),
      { numRuns: 2000 },
    );
  });

  it('the one-paisa divergence is reachable, so the bound is tight', () => {
    // 6 paise at 9% is 0.54p a head -> 1p each, 2p in all; at 18% it is 1.08p -> 1p.
    const intra = splitGst(paise(6n), RATE, 'intra_state');
    const inter = splitGst(paise(6n), RATE, 'inter_state');
    expect(intra.total - inter.igst).toBe(1n);
  });

  it('refuses a rate it cannot halve exactly', () => {
    expect(() => splitGst(paise(100n), bp(1801), 'intra_state')).toThrow(/even number/);
  });
});

describe('Tally XML escaping', () => {
  it('escapes an ampersand in a vendor name', () => {
    // The named case from the brief. The legacy generator interpolates this
    // unescaped, producing an undefined entity that makes the document
    // unparseable — and then reads Tally's rejection as HTTP 200 success.
    expect(escapeXml('M/s A&B Interiors')).toBe('M/s A&amp;B Interiors');
  });

  it('escapes every metacharacter, ampersand first', () => {
    expect(escapeXml('<a href="x">&\'</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;',
    );
  });

  it('does not double-escape an ampersand it just introduced', () => {
    expect(escapeXml('<')).toBe('&lt;');
    expect(escapeXml('&lt;')).toBe('&amp;lt;');
  });
});

describe('buildVoucherXml', () => {
  const input = {
    remoteId: 'cog-po-3f2504e0',
    voucherType: 'Purchase',
    voucherNumber: 'PO/2026/0001',
    date: '2026-09-04',
    company: 'Aarambh Interiors Pvt Ltd',
    partyLedger: 'M/s A&B Interiors',
    narration: 'Tiles <first floor>',
    entries: [
      { ledgerName: 'M/s A&B Interiors', amountRupees: '-5900.00' },
      { ledgerName: 'Purchases', amountRupees: '5900.00' },
    ],
  };

  it('emits a complete envelope Tally can import', () => {
    const xml = buildVoucherXml(input);
    // The legacy generator emits a bare <TALLYMESSAGE> with none of these, so
    // Tally cannot import it at all.
    expect(xml).toContain('<ENVELOPE>');
    expect(xml).toContain('<TALLYREQUEST>Import Data</TALLYREQUEST>');
    expect(xml).toContain('<IMPORTDATA>');
    expect(xml).toContain('<ALLLEDGERENTRIES.LIST>');
  });

  it('targets a named company rather than whichever one is open', () => {
    expect(buildVoucherXml(input)).toContain(
      '<SVCURRENTCOMPANY>Aarambh Interiors Pvt Ltd</SVCURRENTCOMPANY>',
    );
  });

  it('carries a stable REMOTEID so a re-offer cannot become a second voucher', () => {
    expect(buildVoucherXml(input)).toContain('REMOTEID="cog-po-3f2504e0"');
  });

  it('escapes every caller-supplied value', () => {
    const xml = buildVoucherXml(input);
    expect(xml).toContain('M/s A&amp;B Interiors');
    expect(xml).not.toMatch(/A&B/);
    expect(xml).toContain('Tiles &lt;first floor&gt;');
  });

  it('normalises the date to YYYYMMDD', () => {
    expect(buildVoucherXml(input)).toContain('<DATE>20260904</DATE>');
    // The legacy `String(date).replace(/-/g,'')` works by accident for a
    // date-only column and produces garbage for a timestamp.
    expect(tallyDate('2026-09-04T10:30:00+05:30')).toBe('20260904');
    expect(() => tallyDate('04/09/2026')).toThrow();
  });

  it('refuses a voucher that is not a double entry', () => {
    expect(() =>
      buildVoucherXml({ ...input, entries: [{ ledgerName: 'x', amountRupees: '1.00' }] }),
    ).toThrow(TallyXmlError);
  });

  it('refuses entries that do not balance to zero', () => {
    expect(() =>
      buildVoucherXml({
        ...input,
        entries: [
          { ledgerName: 'a', amountRupees: '-5900.00' },
          { ledgerName: 'b', amountRupees: '5800.00' },
        ],
      }),
    ).toThrow(/balance/);
  });
});

describe('tallyAccepted — HTTP 200 is not success', () => {
  it('accepts a genuine creation', () => {
    expect(
      tallyAccepted('<RESPONSE><CREATED>1</CREATED><ERRORS>0</ERRORS></RESPONSE>'),
    ).toBe(true);
  });

  it('rejects CREATED=0 with ERRORS=0 — a silent no-op', () => {
    // The most dangerous outcome available, and the one the legacy code counts
    // as success.
    expect(
      tallyAccepted('<RESPONSE><CREATED>0</CREATED><ERRORS>0</ERRORS></RESPONSE>'),
    ).toBe(false);
  });

  it('rejects a LINEERROR even when the counters look clean', () => {
    expect(
      tallyAccepted(
        '<RESPONSE><CREATED>1</CREATED><ERRORS>0</ERRORS><LINEERROR>Ledger does not exist</LINEERROR></RESPONSE>',
      ),
    ).toBe(false);
  });

  it('rejects a body that is not a Tally response at all', () => {
    expect(tallyAccepted('<html>Bad Gateway</html>')).toBe(false);
    expect(tallyAccepted('')).toBe(false);
  });

  it('rejects when a voucher was ignored', () => {
    expect(
      tallyAccepted('<RESPONSE><CREATED>0</CREATED><IGNORED>1</IGNORED><ERRORS>0</ERRORS></RESPONSE>'),
    ).toBe(false);
  });
});

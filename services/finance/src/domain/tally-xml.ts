/**
 * Tally voucher XML.
 *
 * **Written from scratch. This is not a port.** ADR-0014's addendum records
 * that the legacy integration has never worked: `generateTallyVoucherXML`
 * emits a bare `<TALLYMESSAGE>` with no `<ENVELOPE>`, no
 * `<HEADER><TALLYREQUEST>Import Data`, and no `ALLLEDGERENTRIES.LIST`, so there
 * is no double entry and Tally cannot import it. `syncVoucherToTally` then
 * treats HTTP 200 as success without reading the body — and Tally answers 200
 * while rejecting — so every `tally_sync_logs` row marked *Synced* records a
 * request that was sent, not a voucher that landed.
 *
 * There is therefore no prior behaviour to preserve, and the two-commit port
 * protocol does not apply.
 *
 * What this file owns, and the legacy did not:
 *
 *   - **Escaping.** The contract is explicit that escaping is the cloud's
 *     responsibility, never the connector's.
 *   - The full envelope, so Tally can actually import the voucher.
 *   - `SVCURRENTCOMPANY`, so it imports into the intended company rather than
 *     whichever one happens to be open.
 *   - A stable `REMOTEID`, so a re-offer after a lost result cannot become a
 *     second voucher in a book of account.
 *   - `YYYYMMDD` dates, normalised rather than working by accident.
 */

/**
 * Escape text for an XML text node or attribute value.
 *
 * The legacy generator interpolates the vendor name and the caller-supplied
 * voucher reference directly, so `M/s A&B Interiors` produces `A&B`, which is
 * an undefined entity and makes the whole document unparseable. Tally rejects
 * it, the legacy code reads HTTP 200 as success, and the voucher is silently
 * lost.
 *
 * `&` must be replaced first, or the ampersands introduced by the later
 * replacements would themselves be escaped.
 */
export function escapeXml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** `2026-09-04` or an ISO timestamp becomes `20260904`. */
export function tallyDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (match === null) {
    // The legacy code does `String(date).replace(/-/g, '')`, which works by
    // accident for a date-only column and produces garbage for a timestamp.
    throw new RangeError(`not an ISO date: ${JSON.stringify(iso)}`);
  }
  return `${match[1]}${match[2]}${match[3]}`;
}

/** One side of a double entry. Amounts are in rupees, as Tally expects. */
export interface LedgerEntry {
  readonly ledgerName: string;
  /**
   * Positive debits, negative credits — Tally's own convention.
   * A voucher whose entries do not sum to zero is not a double entry, and this
   * module refuses to emit one.
   */
  readonly amountRupees: string;
}

export interface VoucherInput {
  /** Stable for the life of the underlying document, across every re-offer. */
  readonly remoteId: string;
  readonly voucherType: string;
  readonly voucherNumber: string;
  readonly date: string;
  readonly company: string;
  readonly partyLedger: string;
  readonly narration: string;
  readonly entries: readonly LedgerEntry[];
}

export class TallyXmlError extends Error {
  override readonly name = 'TallyXmlError';
}

/**
 * Build a complete, importable Tally voucher.
 *
 * Every interpolated value is escaped. There is no path through this function
 * that emits caller text unescaped, which is what makes the connector's job
 * "forward these bytes" rather than "sanitise them".
 */
export function buildVoucherXml(input: VoucherInput): string {
  if (input.entries.length < 2) {
    throw new TallyXmlError('a voucher needs at least two ledger entries to be a double entry');
  }

  const total = input.entries.reduce((acc, e) => acc + parseRupeeString(e.amountRupees), 0n);
  if (total !== 0n) {
    // Tally will accept an unbalanced voucher in some configurations and leave
    // the books wrong. Refusing here is cheaper than finding it in a trial
    // balance three months later.
    throw new TallyXmlError('ledger entries do not balance to zero');
  }

  const entries = input.entries
    .map(
      (e) => `        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${escapeXml(e.ledgerName)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${parseRupeeString(e.amountRupees) < 0n ? 'No' : 'Yes'}</ISDEEMEDPOSITIVE>
          <AMOUNT>${escapeXml(e.amountRupees)}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>`,
    )
    .join('\n');

  return `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${escapeXml(input.company)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER REMOTEID="${escapeXml(input.remoteId)}" VCHTYPE="${escapeXml(input.voucherType)}" ACTION="Create">
            <DATE>${tallyDate(input.date)}</DATE>
            <VOUCHERTYPENAME>${escapeXml(input.voucherType)}</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${escapeXml(input.voucherNumber)}</VOUCHERNUMBER>
            <PARTYLEDGERNAME>${escapeXml(input.partyLedger)}</PARTYLEDGERNAME>
            <NARRATION>${escapeXml(input.narration)}</NARRATION>
${entries}
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

/** `"-1234.50"` → -123450 (hundredths), without going through a float. */
function parseRupeeString(value: string): bigint {
  const m = /^(-)?(0|[1-9][0-9]*)(?:\.([0-9]{2}))?$/.exec(value);
  if (m === null) throw new TallyXmlError(`not a rupee amount: ${JSON.stringify(value)}`);
  const magnitude = BigInt(m[2] as string) * 100n + (m[3] === undefined ? 0n : BigInt(m[3]));
  return m[1] === '-' ? -magnitude : magnitude;
}

/**
 * Whether Tally actually accepted a voucher.
 *
 * The legacy code treats HTTP 200 as success without reading the body. Tally
 * answers 200 while rejecting, so every historical "Synced" row is meaningless.
 *
 * `CREATED=0` with `ERRORS=0` is the most dangerous outcome available — a
 * silent no-op — and is treated as failure here.
 */
export function tallyAccepted(responseBody: string): boolean {
  if (!responseBody.includes('<RESPONSE>')) return false;
  if (/<LINEERROR>/i.test(responseBody)) return false;

  const value = (tag: string): number => {
    const m = new RegExp(`<${tag}>\\s*(-?\\d+)\\s*</${tag}>`, 'i').exec(responseBody);
    return m === null ? 0 : Number(m[1]);
  };

  if (value('ERRORS') > 0) return false;
  if (value('EXCEPTIONS') > 0) return false;
  if (value('IGNORED') > 0) return false;
  return value('CREATED') + value('ALTERED') >= 1;
}

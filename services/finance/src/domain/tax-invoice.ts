import type { BasisPoints, Paise } from '@cog/contracts';
import { ZERO, compare, negate, toRupeeString } from '@cog/money';
import { invoiceTotal, splitGst, type GstBreakdown, type SupplyType } from './gst.js';
import type { LedgerEntry } from './tally-xml.js';

/**
 * A tax invoice's GST: which heads, at what rate, rounded where.
 *
 * Provisional, all of it (ADR-0014, addendum):
 *   - the rate on works contracts is 18%, from the CA call (CA-06);
 *   - the place of supply for work at a client's site is where the site is
 *     (IGST Act s.12(3)(a)), and it decides the heads against the state the
 *     supplier is registered in — CA-06 and CA-16;
 *   - each head keeps its calculated value to the paise, and only the invoice
 *     total is rounded to the rupee, once, with the difference on its own
 *     round-off line — the CA's answer to CA-02 (`splitGst`, `invoiceTotal`).
 */

export class TaxInvoiceRefused extends Error {
  override readonly name = 'TaxInvoiceRefused';
}

const GSTIN = /^([0-9]{2})[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const STATE_CODE = /^[0-9]{2}$/;

/** The state a GSTIN is registered in: its first two digits. */
export function stateOfGstin(gstin: string): string {
  const match = GSTIN.exec(gstin);
  if (match === null) throw new TaxInvoiceRefused(`not a GSTIN: ${JSON.stringify(gstin)}`);
  return match[1] as string;
}

/** The same state is CGST and SGST; another state is IGST. */
export function supplyTypeFor(supplierState: string, placeOfSupply: string): SupplyType {
  if (!STATE_CODE.test(placeOfSupply)) {
    throw new TaxInvoiceRefused('A place of supply is a two-digit state code, the way a GSTIN begins.');
  }
  return supplierState === placeOfSupply ? 'intra_state' : 'inter_state';
}

export interface InvoiceTax extends GstBreakdown {
  /** The taxable value plus every head, exactly. */
  readonly exactTotal: Paise;
  /** What the invoice is for: rounded to the rupee, once (CA-02). */
  readonly invoiceTotal: Paise;
  /** `invoiceTotal − exactTotal`, its own line on the invoice and in the voucher. */
  readonly roundOff: Paise;
}

export function invoiceTax(taxable: Paise, rate: BasisPoints, supplyType: SupplyType): InvoiceTax {
  const breakdown = splitGst(taxable, rate, supplyType);
  const { exact, total, roundOff } = invoiceTotal(breakdown);
  return { ...breakdown, exactTotal: exact, invoiceTotal: total, roundOff };
}

/**
 * The invoice as a double entry for Tally: the client debited with the invoice
 * total; sales, each head charged, and the round-off credited. The round-off is
 * its own line, as it is on the invoice (CA-02) — a debit when the total was
 * rounded down. Ledger names are fixed until a tenant maps its own, as they are
 * for payments.
 */
export function invoiceLedgerEntries(clientLedger: string, tax: InvoiceTax): LedgerEntry[] {
  const entries: LedgerEntry[] = [
    { ledgerName: clientLedger, amountRupees: toRupeeString(tax.invoiceTotal) },
    { ledgerName: 'Sales — works contract', amountRupees: toRupeeString(negate(tax.taxable)) },
  ];
  const heads: ReadonlyArray<readonly [string, Paise]> = [
    ['Output CGST', tax.cgst],
    ['Output SGST', tax.sgst],
    ['Output IGST', tax.igst],
  ];
  for (const [ledgerName, amount] of heads) {
    if (compare(amount, ZERO) !== 0) entries.push({ ledgerName, amountRupees: toRupeeString(negate(amount)) });
  }
  if (compare(tax.roundOff, ZERO) !== 0) {
    entries.push({ ledgerName: 'Round off', amountRupees: toRupeeString(negate(tax.roundOff)) });
  }
  return entries;
}

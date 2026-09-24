import { describe, expect, it } from 'vitest';
import { bp, paise, toRupeeString } from '@cog/money';
import {
  TaxInvoiceRefused,
  invoiceLedgerEntries,
  invoiceTax,
  stateOfGstin,
  supplyTypeFor,
} from '../src/domain/tax-invoice.js';
import { buildVoucherXml } from '../src/domain/tally-xml.js';

/**
 * 18% is the provisional works-contract rate from the CA call. Where the
 * rounding happens is the CA's answer to CA-02 (the CA answers document,
 * provisional): each head keeps its calculated value to the paise, and only the
 * invoice total is rounded to the rupee under Sec 170, with the difference on
 * its own line. The figures below follow those, and move when a CA's answer
 * moves them.
 */
const WORKS_CONTRACT = bp(1800);

describe('which heads a tax invoice charges', () => {
  it('reads the supplier state from the GSTIN', () => {
    expect(stateOfGstin('29ABCDE1234F1Z5')).toBe('29');
    expect(() => stateOfGstin('Karnataka')).toThrow(TaxInvoiceRefused);
  });

  it('charges CGST and SGST in the same state, IGST in another', () => {
    expect(supplyTypeFor('29', '29')).toBe('intra_state');
    expect(supplyTypeFor('29', '27')).toBe('inter_state');
    expect(() => supplyTypeFor('29', 'KA')).toThrow(TaxInvoiceRefused);
  });
});

describe('the GST on a tax invoice', () => {
  it('is 9% and 9% within the state', () => {
    const tax = invoiceTax(paise(1_00_000_00n), WORKS_CONTRACT, 'intra_state');
    expect([toRupeeString(tax.cgst), toRupeeString(tax.sgst), toRupeeString(tax.igst)]).toEqual([
      '9000.00',
      '9000.00',
      '0.00',
    ]);
    expect(toRupeeString(tax.total)).toBe('18000.00');
    expect(toRupeeString(tax.invoiceTotal)).toBe('118000.00');
    expect(toRupeeString(tax.roundOff)).toBe('0.00');
  });

  it('is 18% across states', () => {
    const tax = invoiceTax(paise(1_00_000_00n), WORKS_CONTRACT, 'inter_state');
    expect(toRupeeString(tax.igst)).toBe('18000.00');
    expect(toRupeeString(tax.cgst)).toBe('0.00');
  });

  it('keeps each head to the paise, never rounding it to the rupee', () => {
    // ₹1,234.56 at 9% is ₹111.1104 a head: ₹111.11. At 18% it is ₹222.2208: ₹222.22.
    const within = invoiceTax(paise(1_234_56n), WORKS_CONTRACT, 'intra_state');
    expect([toRupeeString(within.cgst), toRupeeString(within.sgst)]).toEqual(['111.11', '111.11']);
    expect(toRupeeString(invoiceTax(paise(1_234_56n), WORKS_CONTRACT, 'inter_state').igst)).toBe('222.22');
  });
});

describe("a tax invoice's total and its round-off", () => {
  it('rounds only the total, up, with the difference on its own line', () => {
    // ₹1,234.56 + ₹111.11 + ₹111.11 = ₹1,456.78, rounded once to ₹1,457.00.
    const tax = invoiceTax(paise(1_234_56n), WORKS_CONTRACT, 'intra_state');
    expect(toRupeeString(tax.exactTotal)).toBe('1456.78');
    expect(toRupeeString(tax.invoiceTotal)).toBe('1457.00');
    expect(toRupeeString(tax.roundOff)).toBe('0.22');
  });

  it('rounds the total down when the paise are under fifty', () => {
    // ₹1,234.00 at 9% is ₹111.06 a head: ₹1,456.12 in all, rounded to ₹1,456.00.
    const tax = invoiceTax(paise(1_234_00n), WORKS_CONTRACT, 'intra_state');
    expect(toRupeeString(tax.invoiceTotal)).toBe('1456.00');
    expect(toRupeeString(tax.roundOff)).toBe('-0.12');
  });

  it('posts the round-off as its own ledger line, and the voucher balances', () => {
    const tax = invoiceTax(paise(1_234_56n), WORKS_CONTRACT, 'intra_state');
    const entries = invoiceLedgerEntries('Billing Client Bank', tax);
    expect(entries).toEqual([
      { ledgerName: 'Billing Client Bank', amountRupees: '1457.00' },
      { ledgerName: 'Sales — works contract', amountRupees: '-1234.56' },
      { ledgerName: 'Output CGST', amountRupees: '-111.11' },
      { ledgerName: 'Output SGST', amountRupees: '-111.11' },
      { ledgerName: 'Round off', amountRupees: '-0.22' },
    ]);
    // buildVoucherXml refuses entries that do not sum to zero.
    expect(() =>
      buildVoucherXml({
        remoteId: 'invoice:test',
        voucherType: 'Sales',
        voucherNumber: 'INV/2026-27/0001',
        date: '2026-09-15',
        company: 'Test Company',
        partyLedger: 'Billing Client Bank',
        narration: 'Tax invoice',
        entries,
      }),
    ).not.toThrow();
  });

  it('debits the round-off when the total was rounded down, and leaves it out when there is none', () => {
    const down = invoiceLedgerEntries('Client', invoiceTax(paise(1_234_00n), WORKS_CONTRACT, 'inter_state'));
    expect(down.at(-1)).toEqual({ ledgerName: 'Round off', amountRupees: '0.12' });
    const whole = invoiceLedgerEntries('Client', invoiceTax(paise(1_00_000_00n), WORKS_CONTRACT, 'inter_state'));
    expect(whole.map((e) => e.ledgerName)).toEqual(['Client', 'Sales — works contract', 'Output IGST']);
  });
});

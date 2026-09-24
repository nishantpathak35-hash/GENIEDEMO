import type { BasisPoints, Paise } from '@cog/contracts';
import { ZERO, add, mulRate, roundGstHeadToPaise, roundInvoiceTotalSec170, sub, sum } from '@cog/money';

/**
 * GST on an invoice.
 *
 * The rate is always a parameter. Nothing in this file knows what 18% means or
 * which supplies attract it — that is CA-06 and CA-16, provisional. What this
 * file owns is *where the rounding happens*, which the CA's answer to CA-02
 * settles, provisionally: each head to the paise, the invoice total to the
 * rupee, once.
 */

/**
 * Whether the supply is intra-state (CGST + SGST) or inter-state (IGST).
 *
 * Determined by place of supply — for work at a client's site, the state the
 * site is in, against the state the supplier is registered in (CA-06, CA-16).
 * The legacy app defaults to IGST and lets a user override it in the browser,
 * which is both a guess and a client-side authority inversion. Here it is an
 * explicit input with no default: a caller must decide, and the decision is
 * auditable.
 */
export type SupplyType = 'intra_state' | 'inter_state';

export interface GstBreakdown {
  readonly supplyType: SupplyType;
  readonly taxable: Paise;
  readonly cgst: Paise;
  readonly sgst: Paise;
  readonly igst: Paise;
  /** The heads added together — the tax, to the paise. */
  readonly total: Paise;
}

/**
 * Split GST for one invoice.
 *
 * **Each head keeps its calculated value, to the paise — the CA's answer to
 * CA-02** (CA answers document, reviewed by the CA; CA details to follow;
 * provisional): "The taxable/basic value and the GST components shall retain
 * their calculated values and shall not be individually rounded to the nearest
 * rupee." The rupee rounding belongs to the invoice total, once — `invoiceTotal`.
 *
 * For an intra-state supply the rate is split in half across the two heads.
 * Because both halves share a base and a rate they round identically, so
 * `cgst === sgst` always — which is one of the properties asserted in the tests.
 */
export function splitGst(
  taxable: Paise,
  rate: BasisPoints,
  supplyType: SupplyType,
): GstBreakdown {
  if (supplyType === 'inter_state') {
    const igst = mulRate(taxable, rate, roundGstHeadToPaise);
    return { supplyType, taxable, cgst: ZERO, sgst: ZERO, igst, total: igst };
  }

  // Half the rate to each head. Basis points are integers, and every GST slab
  // in use is even in basis points (5% = 500, 12% = 1200, 18% = 1800,
  // 28% = 2800), so the halves are exact.
  if (rate % 2 !== 0) {
    throw new RangeError(
      `an intra-state rate must be an even number of basis points to split exactly; got ${rate}`,
    );
  }
  // This divides a RATE, not money. `rate` is `BasisPoints` — an integer — and
  // the guard above refuses an odd one, so the halves are exact and no rounding
  // decision is being taken here. The money multiplication that follows goes
  // through `mulRate` with the head's boundary named, which is the thing the
  // rule exists to require.
  // eslint-disable-next-line no-restricted-syntax
  const half = (rate / 2) as BasisPoints;

  const cgst = mulRate(taxable, half, roundGstHeadToPaise);
  const sgst = mulRate(taxable, half, roundGstHeadToPaise);
  return { supplyType, taxable, cgst, sgst, igst: ZERO, total: add(cgst, sgst) };
}

export interface InvoiceTotal {
  /** The taxable value plus every head, exactly. */
  readonly exact: Paise;
  /** Rounded to the rupee, once, under Sec 170 (CA-02). */
  readonly total: Paise;
  /** `total − exact`: the invoice's round-off line. Never more than fifty paise either way. */
  readonly roundOff: Paise;
}

/**
 * An invoice's total, and its round-off line.
 *
 * "Rounding shall be applied only to the final total invoice value ... Any
 * round-off adjustment will therefore be posted only at the invoice-total
 * level" — the CA's answer to CA-02. The difference is returned as a figure of
 * its own so it is shown and posted rather than absorbed: the e-invoice schema
 * carries it in `RndOffAmt`, and Tally books it to a round-off ledger.
 */
export function invoiceTotal(breakdown: GstBreakdown): InvoiceTotal {
  const exact = add(breakdown.taxable, breakdown.total);
  const total = roundInvoiceTotalSec170(exact, 1n);
  return { exact, total, roundOff: sub(total, exact) };
}

/** Total of a set of invoice-level breakdowns. Exact; no rounding. */
export function totalGst(breakdowns: readonly GstBreakdown[]): Paise {
  return sum(breakdowns.map((b) => b.total));
}

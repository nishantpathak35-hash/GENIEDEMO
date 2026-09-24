import { VENDOR_CONSTITUTIONS, type VendorConstitution } from '@cog/contracts';

/**
 * A vendor's constitution — what the vendor is in law — and the cross-check its
 * PAN gives.
 *
 * The CA's answer to CA-07 (CA answers document, reviewed by the CA; CA details
 * to follow; provisional): "The vendor master shall contain the information
 * required to determine TDS treatment, including constitution/classification
 * (individual, HUF, firm, company, etc.) ... Vendor classification will drive
 * whether the Section 194C rate is 1% or 2%." So a person records it, on the
 * vendor.
 *
 * A PAN's fourth character is the holder's status as the department issued it:
 * `P` a person, `H` a Hindu undivided family, `F` a firm, `C` a company, and
 * other letters for the rest. It only cross-checks what was recorded. A
 * mismatch is shown on the vendor; it never corrects the record and never
 * decides a rate.
 */

const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** A stored value, if it is one of the five; anything else reads as not recorded. */
export function asConstitution(value: string | null): VendorConstitution | null {
  return VENDOR_CONSTITUTIONS.find((known) => known === value) ?? null;
}

/** What a PAN's fourth character reads as, or `null` when there is no PAN to read. */
export function constitutionFromPan(pan: string | null): VendorConstitution | null {
  if (pan === null || !PAN.test(pan)) return null;
  switch (pan.charAt(3)) {
    case 'P':
      return 'individual';
    case 'H':
      return 'huf';
    case 'F':
      return 'firm';
    case 'C':
      return 'company';
    default:
      return 'other';
  }
}

/** The recorded constitution and the PAN disagree. Nothing to compare is not a mismatch. */
export function constitutionMismatch(recorded: string | null, pan: string | null): boolean {
  const read = constitutionFromPan(pan);
  return recorded !== null && read !== null && recorded !== read;
}

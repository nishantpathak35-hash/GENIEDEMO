import { randomUUID } from 'node:crypto';
import type { TenantContext } from '@cog/contracts';
import type { TxLike } from './approval-subject.js';
import { VendorNotFound } from './vendors.js';

/**
 * A transporter's 194C(6) declaration, kept against the vendor for its
 * financial year.
 *
 * The CA's answer to CA-07 (CA answers document, reviewed by the CA; CA details
 * to follow; provisional): "no TDS shall be deducted if the prescribed
 * declaration and PAN are furnished. The declaration should be obtained for the
 * relevant financial year and retained against the vendor record", capturing
 * "the vendor's name, PAN, financial year, confirmation that the statutory
 * goods-carriage ownership condition is satisfied, date and authorised
 * signature/declaration evidence".
 *
 * So a row is one year's declaration: the name and PAN copied from the vendor
 * when it is recorded, the year, the confirmation, the date and the evidence — a
 * document the vault holds against this vendor, which the host checks, because
 * the vault is workflow's. A row is never edited or deleted.
 */

export class TransporterDeclarationRefused extends Error {
  override readonly name = 'TransporterDeclarationRefused';
}

export interface TransporterDeclaration {
  readonly id: string;
  readonly vendorId: string;
  readonly vendorName: string;
  readonly pan: string;
  readonly financialYear: string;
  readonly goodsCarriageConfirmed: boolean;
  readonly declaredOn: string;
  readonly evidenceDocumentId: string;
  readonly recordedAt: string;
}

type Row = {
  id: string;
  vendor_id: string;
  vendor_name: string;
  pan: string;
  financial_year: string;
  goods_carriage_confirmed: boolean;
  declared_on: string;
  evidence_document_id: string;
  recorded_at: string;
};

const COLUMNS = `id, vendor_id, vendor_name, pan, financial_year, goods_carriage_confirmed,
                 declared_on::text AS declared_on, evidence_document_id, recorded_at::text AS recorded_at`;

function toDeclaration(r: Row): TransporterDeclaration {
  return {
    id: r.id,
    vendorId: r.vendor_id,
    vendorName: r.vendor_name,
    pan: r.pan,
    financialYear: r.financial_year,
    goodsCarriageConfirmed: r.goods_carriage_confirmed,
    declaredOn: r.declared_on,
    evidenceDocumentId: r.evidence_document_id,
    recordedAt: r.recorded_at,
  };
}

/** The financial year an ISO date falls in, as `2026-27`: April to March. */
export function financialYearOfDate(date: string): string {
  const year = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 4 ? year : year - 1;
  return `${String(start)}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** This vendor's declarations, newest year first. RLS scopes them. */
export async function listTransporterDeclarations(
  tx: TxLike,
  vendorId: string,
): Promise<readonly TransporterDeclaration[]> {
  const rows = await tx.query<Row>(
    `SELECT ${COLUMNS}
       FROM procurement.transporter_declarations
      WHERE vendor_id = $1
      ORDER BY financial_year DESC`,
    [vendorId],
  );
  return rows.map(toDeclaration);
}

export interface RecordTransporterDeclarationInput {
  readonly financialYear: string;
  readonly declaredOn: string;
  readonly goodsCarriageConfirmed: boolean;
  readonly evidenceDocumentId: string;
}

/**
 * Record one year's declaration. Every refusal comes before anything is
 * written, and each says what to do: a declaration applies under 194C, is
 * furnished with a PAN, confirms the goods-carriage condition, is dated in the
 * year it is for, and is one a year. The evidence is the host's to check.
 */
export async function recordTransporterDeclaration(
  tx: TxLike,
  ctx: TenantContext,
  vendorId: string,
  input: RecordTransporterDeclarationInput,
): Promise<TransporterDeclaration> {
  const vendors = await tx.query<{ name: string; pan: string | null; tds_section: string | null }>(
    `SELECT name, pan, tds_section FROM procurement.vendors WHERE id = $1`,
    [vendorId],
  );
  const vendor = vendors[0];
  if (vendor === undefined) throw new VendorNotFound(`no such vendor: ${vendorId}`);
  if (vendor.tds_section !== '194C') {
    throw new TransporterDeclarationRefused(
      'A transporter declaration applies only to a vendor deducted under 194C — set its section first.',
    );
  }
  if (vendor.pan === null) {
    throw new TransporterDeclarationRefused(
      'A 194C(6) declaration is furnished with a PAN, and this vendor has none on record.',
    );
  }
  if (!input.goodsCarriageConfirmed) {
    throw new TransporterDeclarationRefused(
      'The declaration has to confirm the goods-carriage condition of s.194C(6).',
    );
  }
  if (financialYearOfDate(input.declaredOn) !== input.financialYear) {
    throw new TransporterDeclarationRefused(
      `A declaration for ${input.financialYear} is dated within that financial year, 1 April to 31 March.`,
    );
  }
  const existing = await tx.query<{ id: string }>(
    `SELECT id FROM procurement.transporter_declarations WHERE vendor_id = $1 AND financial_year = $2`,
    [vendorId, input.financialYear],
  );
  if (existing.length > 0) {
    throw new TransporterDeclarationRefused(
      `A declaration for ${input.financialYear} is already on record for this vendor.`,
    );
  }

  const id = randomUUID();
  await tx.query(
    `INSERT INTO procurement.transporter_declarations
       (tenant_id, id, vendor_id, vendor_name, pan, financial_year, goods_carriage_confirmed,
        declared_on, evidence_document_id, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, $10)`,
    [
      ctx.tenantId,
      id,
      vendorId,
      vendor.name,
      vendor.pan,
      input.financialYear,
      input.goodsCarriageConfirmed,
      input.declaredOn,
      input.evidenceDocumentId,
      ctx.principal.id,
    ],
  );
  const rows = await tx.query<Row>(
    `SELECT ${COLUMNS} FROM procurement.transporter_declarations WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (row === undefined) throw new Error(`the declaration ${id} was not recorded`);
  return toDeclaration(row);
}

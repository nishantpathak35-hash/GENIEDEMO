import type { TxLike } from './provisioning.js';

/**
 * The organisation's own details, and the defaults it works to.
 *
 * Both are one row per tenant and both behave the same way when the row is
 * absent: they answer with empty values rather than faulting, because a tenant
 * provisioned before migration 0068 has no row and its settings screen must
 * still open.
 */

export interface CompanyProfile {
  readonly gstin: string | null;
  readonly pan: string | null;
  readonly cin: string | null;
  readonly tan: string | null;
  readonly address: string;
  readonly phone: string;
  readonly email: string;
  readonly website: string;
  readonly bankName: string;
  readonly bankBranch: string;
  readonly bankIfsc: string | null;
  readonly documentFooter: string;
  readonly updatedAt: string | null;
}

const EMPTY: CompanyProfile = {
  gstin: null,
  pan: null,
  cin: null,
  tan: null,
  address: '',
  phone: '',
  email: '',
  website: '',
  bankName: '',
  bankBranch: '',
  bankIfsc: null,
  documentFooter: '',
  updatedAt: null,
};

export async function getCompanyProfile(tx: TxLike): Promise<CompanyProfile> {
  const rows = await tx.query<{
    gstin: string | null;
    pan: string | null;
    cin: string | null;
    tan: string | null;
    address: string;
    phone: string;
    email: string;
    website: string;
    bank_name: string;
    bank_branch: string;
    bank_ifsc: string | null;
    document_footer: string;
    updated_at: string;
  }>(
    `SELECT gstin, pan, cin, tan, address, phone, email, website,
            bank_name, bank_branch, bank_ifsc, document_footer,
            updated_at::text AS updated_at
       FROM tenancy.company_profile`,
  );
  const row = rows[0];
  if (row === undefined) return EMPTY;
  return {
    gstin: row.gstin,
    pan: row.pan,
    cin: row.cin,
    tan: row.tan,
    address: row.address,
    phone: row.phone,
    email: row.email,
    website: row.website,
    bankName: row.bank_name,
    bankBranch: row.bank_branch,
    bankIfsc: row.bank_ifsc,
    documentFooter: row.document_footer,
    updatedAt: row.updated_at,
  };
}

export interface CompanyProfileInput {
  readonly gstin?: string | null | undefined;
  readonly pan?: string | null | undefined;
  readonly cin?: string | null | undefined;
  readonly tan?: string | null | undefined;
  readonly address?: string | undefined;
  readonly phone?: string | undefined;
  readonly email?: string | undefined;
  readonly website?: string | undefined;
  readonly bankName?: string | undefined;
  readonly bankBranch?: string | undefined;
  readonly bankIfsc?: string | null | undefined;
  readonly documentFooter?: string | undefined;
}

/**
 * Save it.
 *
 * The whole record is sent, not a patch — this is one form and what it submits
 * is what the organisation says it is. An empty tax field clears the value
 * rather than leaving the previous one: "we do not have a CIN" has to be
 * expressible, and a merge would make it impossible to un-say something.
 */
export async function saveCompanyProfile(
  tx: TxLike,
  tenantId: string,
  input: CompanyProfileInput,
  updatedBy: string,
): Promise<void> {
  await tx.query(
    `INSERT INTO tenancy.company_profile
       (tenant_id, gstin, pan, cin, address, phone, email, website,
        bank_name, bank_branch, bank_ifsc, document_footer, updated_by, updated_at, tan)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), $14)
     ON CONFLICT (tenant_id) DO UPDATE
        SET gstin           = EXCLUDED.gstin,
            pan             = EXCLUDED.pan,
            cin             = EXCLUDED.cin,
            tan             = EXCLUDED.tan,
            address         = EXCLUDED.address,
            phone           = EXCLUDED.phone,
            email           = EXCLUDED.email,
            website         = EXCLUDED.website,
            bank_name       = EXCLUDED.bank_name,
            bank_branch     = EXCLUDED.bank_branch,
            bank_ifsc       = EXCLUDED.bank_ifsc,
            document_footer = EXCLUDED.document_footer,
            updated_by      = EXCLUDED.updated_by,
            updated_at      = now()`,
    [
      tenantId,
      blankToNull(input.gstin),
      blankToNull(input.pan),
      blankToNull(input.cin),
      input.address ?? '',
      input.phone ?? '',
      input.email ?? '',
      input.website ?? '',
      input.bankName ?? '',
      input.bankBranch ?? '',
      blankToNull(input.bankIfsc),
      input.documentFooter ?? '',
      updatedBy,
      blankToNull(input.tan),
    ],
  );
}

export interface TaxSetup {
  readonly worksContractBundling: boolean | null;
  readonly transporterPanDeclared: boolean | null;
  /** s.194Q applies to this organisation as a buyer (CA-15). `null` until answered. */
  readonly buyerTurnoverOver10Crore: boolean | null;
  readonly answeredAt: string | null;
  readonly answeredBy: string | null;
  readonly reviewCompletedAt: string | null;
  readonly reviewCompletedBy: string | null;
}

export class TaxReviewRefused extends Error {
  override readonly name = 'TaxReviewRefused';
}

const TAX_SETUP_COLUMNS = `s.works_contract_bundling, s.transporter_pan_declared, s.buyer_turnover_over_194q,
       s.answered_at::text AS answered_at,
       COALESCE(a.display_name, a.email) AS answered_by,
       s.review_completed_at::text AS review_completed_at,
       COALESCE(r.display_name, r.email) AS review_completed_by`;

const TAX_SETUP_JOINS = `FROM tenancy.tax_setup s
       LEFT JOIN identity.principals a ON a.tenant_id = s.tenant_id AND a.id = s.answered_by
       LEFT JOIN identity.principals r ON r.tenant_id = s.tenant_id AND r.id = s.review_completed_by`;

type TaxSetupRow = {
  works_contract_bundling: boolean | null;
  transporter_pan_declared: boolean | null;
  buyer_turnover_over_194q: boolean | null;
  answered_at: string | null;
  answered_by: string | null;
  review_completed_at: string | null;
  review_completed_by: string | null;
};

const NO_TAX_SETUP: TaxSetup = {
  worksContractBundling: null,
  transporterPanDeclared: null,
  buyerTurnoverOver10Crore: null,
  answeredAt: null,
  answeredBy: null,
  reviewCompletedAt: null,
  reviewCompletedBy: null,
};

function toTaxSetup(row: TaxSetupRow | undefined): TaxSetup {
  if (row === undefined) return NO_TAX_SETUP;
  return {
    worksContractBundling: row.works_contract_bundling,
    transporterPanDeclared: row.transporter_pan_declared,
    buyerTurnoverOver10Crore: row.buyer_turnover_over_194q,
    answeredAt: row.answered_at,
    answeredBy: row.answered_by,
    reviewCompletedAt: row.review_completed_at,
    reviewCompletedBy: row.review_completed_by,
  };
}

/**
 * The two questions about the business and the review's state (0084).
 * Flags and provenance only — nothing here is a rate, and nothing reads
 * these to compute one.
 */
export async function getTaxSetup(tx: TxLike): Promise<TaxSetup> {
  const rows = await tx.query<TaxSetupRow>(`SELECT ${TAX_SETUP_COLUMNS} ${TAX_SETUP_JOINS}`);
  return toTaxSetup(rows[0]);
}

/**
 * Answer both questions. Answering again after the review was completed
 * reopens it: the completion said "these answers were read", and they have
 * changed.
 */
export async function saveTaxSetup(
  tx: TxLike,
  tenantId: string,
  input: {
    readonly worksContractBundling: boolean;
    readonly transporterPanDeclared: boolean;
    /** Omitted keeps the previous answer; the two questions above are always sent. */
    readonly buyerTurnoverOver10Crore?: boolean | undefined;
  },
  answeredBy: string,
): Promise<TaxSetup> {
  await tx.query(
    `INSERT INTO tenancy.tax_setup
       (tenant_id, works_contract_bundling, transporter_pan_declared, answered_by, answered_at, updated_at,
        buyer_turnover_over_194q)
     VALUES ($1, $2, $3, $4, now(), now(), $5)
     ON CONFLICT (tenant_id) DO UPDATE
        SET works_contract_bundling  = EXCLUDED.works_contract_bundling,
            transporter_pan_declared = EXCLUDED.transporter_pan_declared,
            buyer_turnover_over_194q = COALESCE(EXCLUDED.buyer_turnover_over_194q,
                                                tenancy.tax_setup.buyer_turnover_over_194q),
            answered_by              = EXCLUDED.answered_by,
            answered_at              = now(),
            review_completed_by      = CASE
              WHEN tenancy.tax_setup.works_contract_bundling IS DISTINCT FROM EXCLUDED.works_contract_bundling
                OR tenancy.tax_setup.transporter_pan_declared IS DISTINCT FROM EXCLUDED.transporter_pan_declared
              THEN NULL ELSE tenancy.tax_setup.review_completed_by END,
            review_completed_at      = CASE
              WHEN tenancy.tax_setup.works_contract_bundling IS DISTINCT FROM EXCLUDED.works_contract_bundling
                OR tenancy.tax_setup.transporter_pan_declared IS DISTINCT FROM EXCLUDED.transporter_pan_declared
              THEN NULL ELSE tenancy.tax_setup.review_completed_at END,
            updated_at               = now()`,
    [
      tenantId,
      input.worksContractBundling,
      input.transporterPanDeclared,
      answeredBy,
      input.buyerTurnoverOver10Crore ?? null,
    ],
  );
  return getTaxSetup(tx);
}

/** Record that the review was read. Refused while a question is unanswered. */
export async function completeTaxReview(tx: TxLike, completedBy: string): Promise<TaxSetup> {
  const current = await getTaxSetup(tx);
  if (current.worksContractBundling === null || current.transporterPanDeclared === null) {
    throw new TaxReviewRefused('Answer both questions before completing the review.');
  }
  if (current.reviewCompletedAt !== null) return current;
  await tx.query(
    `UPDATE tenancy.tax_setup
        SET review_completed_by = $1, review_completed_at = now(), updated_at = now()`,
    [completedBy],
  );
  return getTaxSetup(tx);
}

export interface OperationalDefaults {
  readonly poTerms: string;
  /** Days of silence before an opportunity is stale. Null means no rule. */
  readonly crmStaleDays: number | null;
  readonly updatedAt: string | null;
}

export async function getOperationalDefaults(tx: TxLike): Promise<OperationalDefaults> {
  const rows = await tx.query<{
    po_terms: string;
    crm_stale_days: number | null;
    updated_at: string;
  }>(
    `SELECT po_terms, crm_stale_days, updated_at::text AS updated_at
       FROM tenancy.operational_defaults`,
  );
  const row = rows[0];
  if (row === undefined) return { poTerms: '', crmStaleDays: null, updatedAt: null };
  return { poTerms: row.po_terms, crmStaleDays: row.crm_stale_days, updatedAt: row.updated_at };
}

export async function saveOperationalDefaults(
  tx: TxLike,
  tenantId: string,
  input: { readonly poTerms: string; readonly crmStaleDays: number | null },
  updatedBy: string,
): Promise<void> {
  await tx.query(
    `INSERT INTO tenancy.operational_defaults
       (tenant_id, po_terms, crm_stale_days, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (tenant_id) DO UPDATE
        SET po_terms       = EXCLUDED.po_terms,
            crm_stale_days = EXCLUDED.crm_stale_days,
            updated_by     = EXCLUDED.updated_by,
            updated_at     = now()`,
    [tenantId, input.poTerms, input.crmStaleDays, updatedBy],
  );
}

/**
 * An empty tax field is NULL, not `''`.
 *
 * The CHECK constraints allow NULL and reject a malformed value, so an empty
 * string would be refused as a bad GSTIN rather than accepted as "not
 * supplied". Absent and blank are the same statement from a form.
 */
function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed.toUpperCase();
}

/**
 * Whether an on-prem Tally connector has ever reached this tenant.
 *
 * `tenancy.connector_instances.last_seen_at` is touched on every connector
 * call, so the latest one is the last moment an agent was alive. "Seen but
 * never posted" and "never seen" are different setup states (DATA-05), and
 * finance answers the posting half.
 */
export interface ConnectorPresence {
  readonly instances: number;
  readonly lastSeenAt: string | null;
}

export async function connectorPresence(tx: TxLike): Promise<ConnectorPresence> {
  const rows = await tx.query<{ instances: number; last_seen_at: string | null }>(
    `SELECT count(*)::int AS instances, max(last_seen_at)::text AS last_seen_at
       FROM tenancy.connector_instances
      WHERE disabled_at IS NULL`,
  );
  return { instances: rows[0]?.instances ?? 0, lastSeenAt: rows[0]?.last_seen_at ?? null };
}

/**
 * This organisation's legal name, as registered at provisioning — what a Tally
 * voucher names as its company. Read inside the tenant's own context.
 */
export async function currentTenantName(tx: TxLike): Promise<string> {
  const rows = await tx.query<{ legal_name: string }>(`SELECT legal_name FROM tenancy.tenants LIMIT 1`);
  const row = rows[0];
  if (row === undefined) throw new Error('no organisation is visible in this context');
  return row.legal_name;
}

-- 0100 — What a vendor is in law, and a transporter's 194C(6) declaration kept for its year.
--
-- Forward-only. Never edit this file.
--
-- The CA's answer to CA-07 (CA answers document, reviewed by the CA; CA details
-- to follow; provisional): "The vendor master shall contain the information
-- required to determine TDS treatment, including constitution/classification
-- (individual, HUF, firm, company, etc.), PAN and transporter status. Vendor
-- classification will drive whether the Section 194C rate is 1% or 2%."
--
-- ============================================================================
-- THE CONSTITUTION
-- ============================================================================
--
-- 0094 read a 194C payee's class from the PAN's fourth character. From here a
-- person records what the vendor is; the PAN only cross-checks it, and the
-- application shows a mismatch rather than acting on one.

ALTER TABLE procurement.vendors
  ADD COLUMN constitution text,
  ADD CONSTRAINT vendors_constitution_check
    CHECK (constitution IS NULL OR constitution IN ('individual', 'huf', 'firm', 'company', 'other'));

-- ============================================================================
-- THE TRANSPORTER'S DECLARATION
-- ============================================================================
--
-- "The declaration should be obtained for the relevant financial year and
-- retained against the vendor record ... the vendor's name, PAN, financial
-- year, confirmation that the statutory goods-carriage ownership condition is
-- satisfied, date and authorised signature/declaration evidence."
--
-- 0094's one `transporter_declared_on` date said none of that, so it goes, and
-- a declaration is a row of its own, one a year. The name and PAN are copied
-- from the vendor when it is recorded, because a declaration says what it said.
-- The evidence is a document in the vault (`workflow.documents`) registered
-- against this vendor — a soft reference the host checks, since the vault is
-- another service's table. Rows are never edited or deleted: SELECT and INSERT.

ALTER TABLE procurement.vendors
  DROP CONSTRAINT vendors_transporter_declaration_check,
  DROP COLUMN transporter_declared_on;

CREATE TABLE procurement.transporter_declarations (
  tenant_id                uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id                       uuid NOT NULL,
  vendor_id                uuid NOT NULL,
  vendor_name              text NOT NULL,
  pan                      text NOT NULL,
  financial_year           text NOT NULL,
  goods_carriage_confirmed boolean NOT NULL,
  declared_on              date NOT NULL,
  evidence_document_id     uuid NOT NULL,
  recorded_by              uuid NOT NULL,
  recorded_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT transporter_declarations_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT transporter_declarations_vendor_fkey
    FOREIGN KEY (tenant_id, vendor_id) REFERENCES procurement.vendors (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT transporter_declarations_year_key UNIQUE (tenant_id, vendor_id, financial_year),
  CONSTRAINT transporter_declarations_pan_check CHECK (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  CONSTRAINT transporter_declarations_year_check CHECK (financial_year ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT transporter_declarations_confirmed_check CHECK (goods_carriage_confirmed),
  -- Dated within the financial year it is for: 1 April to 31 March.
  CONSTRAINT transporter_declarations_dated_in_year_check CHECK (
    declared_on >= make_date(substr(financial_year, 1, 4)::int, 4, 1)
    AND declared_on < make_date(substr(financial_year, 1, 4)::int + 1, 4, 1)
  )
);

CREATE INDEX transporter_declarations_vendor_idx
  ON procurement.transporter_declarations (tenant_id, vendor_id);

ALTER TABLE procurement.transporter_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.transporter_declarations FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON procurement.transporter_declarations AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON procurement.transporter_declarations AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON procurement.transporter_declarations FROM PUBLIC;
GRANT SELECT, INSERT ON procurement.transporter_declarations TO app_runtime;

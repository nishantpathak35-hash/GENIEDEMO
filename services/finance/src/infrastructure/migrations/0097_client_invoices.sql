-- 0097 — Client tax invoices, and what the client has paid against them.
--
-- Forward-only. Never edit this file.
--
-- Built on provisional values (ADR-0014, addendum): the GST rate on works
-- contracts is 18% from the CA call, its notification and the place-of-supply
-- rule are statute text (CA-06, CA-16). Every invoice records whether it was
-- computed from a provisional value and which, and in production one is refused.
--
-- NUMBERS HAVE NO GAPS AND ARE NEVER REUSED (CA-09, CA-18). The number comes
-- from the tenant's tax-invoice series in the transaction that writes the
-- invoice. An invoice is never deleted: cancelling one keeps its number and its
-- row, so the privilege on this table is SELECT and INSERT, plus UPDATE on the
-- four cancellation columns and nothing else.
--
-- The project is a soft reference to projects' table; its code and the client's
-- name are copied as they were when the invoice was raised, because an issued
-- invoice says what it said.

CREATE TABLE finance.client_invoices (
  tenant_id       uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id              uuid NOT NULL,
  number          text NOT NULL,

  project_id      uuid NOT NULL,
  project_code    text NOT NULL,
  client_name     text NOT NULL,
  client_gstin    text,

  invoice_date    date NOT NULL,
  -- When payment is expected. A certified receivable is one whose work the
  -- client certified — `certified_on` — and that is still owed.
  expected_on     date NOT NULL,
  certified_on    date,
  description     text NOT NULL DEFAULT '',

  -- Two-digit state codes: the supplier's from its GSTIN, the place of supply
  -- where the site is (IGST Act s.12(3)(a), provisional CA-16).
  supplier_state  text NOT NULL,
  place_of_supply text NOT NULL,
  supply_type     text NOT NULL,

  -- Paise throughout. Each head is rounded once, for the invoice (Sec 170).
  taxable         bigint NOT NULL,
  gst_rate_bp     integer NOT NULL,
  cgst            bigint NOT NULL DEFAULT 0,
  sgst            bigint NOT NULL DEFAULT 0,
  igst            bigint NOT NULL DEFAULT 0,
  total           bigint NOT NULL,

  provisional     boolean NOT NULL,
  rows_used       jsonb NOT NULL DEFAULT '[]'::jsonb,

  state           text NOT NULL DEFAULT 'issued',
  cancelled_at    timestamptz,
  cancelled_by    uuid,
  cancel_reason   text,

  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT client_invoices_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT client_invoices_number_key UNIQUE (tenant_id, number),
  CONSTRAINT client_invoices_state_check CHECK (state IN ('issued', 'cancelled')),
  CONSTRAINT client_invoices_supply_type_check CHECK (supply_type IN ('intra_state', 'inter_state')),
  CONSTRAINT client_invoices_state_codes_check
    CHECK (supplier_state ~ '^[0-9]{2}$' AND place_of_supply ~ '^[0-9]{2}$'),
  CONSTRAINT client_invoices_supply_matches_check
    CHECK ((supply_type = 'intra_state') = (supplier_state = place_of_supply)),
  CONSTRAINT client_invoices_amounts_check
    CHECK (taxable > 0 AND cgst >= 0 AND sgst >= 0 AND igst >= 0),
  CONSTRAINT client_invoices_heads_check CHECK (
    (supply_type = 'intra_state' AND igst = 0) OR (supply_type = 'inter_state' AND cgst = 0 AND sgst = 0)
  ),
  CONSTRAINT client_invoices_total_check CHECK (total = taxable + cgst + sgst + igst),
  CONSTRAINT client_invoices_gstin_check CHECK (
    client_gstin IS NULL OR client_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$'
  ),
  CONSTRAINT client_invoices_expected_check CHECK (expected_on >= invoice_date),
  -- A cancellation carries who, when and why, and an issued invoice carries none of them.
  CONSTRAINT client_invoices_cancelled_check CHECK (
    state <> 'cancelled' OR (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND cancel_reason IS NOT NULL)
  ),
  CONSTRAINT client_invoices_issued_check CHECK (
    state = 'cancelled' OR (cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL)
  )
);

CREATE INDEX client_invoices_project_idx ON finance.client_invoices (tenant_id, project_id, invoice_date);
CREATE INDEX client_invoices_date_idx ON finance.client_invoices (tenant_id, invoice_date);

ALTER TABLE finance.client_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.client_invoices FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON finance.client_invoices AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON finance.client_invoices AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON finance.client_invoices FROM PUBLIC;
GRANT SELECT, INSERT ON finance.client_invoices TO app_runtime;
GRANT UPDATE (state, cancelled_at, cancelled_by, cancel_reason) ON finance.client_invoices TO app_runtime;

-- ----------------------------------------------------------------- receipts --
--
-- What the client paid against an invoice. Append-only by privilege: a receipt
-- recorded wrongly is answered by another document, not by editing this row.

CREATE TABLE finance.client_receipts (
  tenant_id   uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id          uuid NOT NULL,
  invoice_id  uuid NOT NULL,
  received_on date NOT NULL,
  -- Paise.
  amount      bigint NOT NULL,
  reference   text NOT NULL DEFAULT '',
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT client_receipts_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT client_receipts_invoice_fkey
    FOREIGN KEY (tenant_id, invoice_id)
    REFERENCES finance.client_invoices (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT client_receipts_amount_check CHECK (amount > 0)
);

CREATE INDEX client_receipts_invoice_idx ON finance.client_receipts (tenant_id, invoice_id);

ALTER TABLE finance.client_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.client_receipts FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON finance.client_receipts AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON finance.client_receipts AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON finance.client_receipts FROM PUBLIC;
GRANT SELECT, INSERT ON finance.client_receipts TO app_runtime;

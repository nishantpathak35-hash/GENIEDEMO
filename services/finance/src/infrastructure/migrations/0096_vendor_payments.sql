-- 0096 — Vendor payments: what was paid against a bill, and what was deducted.
--
-- Forward-only. Never edit this file.
--
-- Built on provisional values (ADR-0014, addendum). Every row records whether
-- it was computed from a provisional value (`provisional`) and which values it
-- relied on (`rows_used` — key, status and CA question), so a payment made
-- before the CA brief can be found and re-checked after it.
--
-- APPEND-ONLY BY PRIVILEGE. No UPDATE, no DELETE: a payment that went out went
-- out. A mistake is answered by a later document, never by editing this row.
--
-- The bill, order and vendor are soft references to procurement's tables,
-- whose migrations stay independent of these; the host writes the payment and
-- marks the bill paid in one transaction. The payee's name and PAN are copied
-- as they were at payment, because a 26Q line reports the deductee as paid,
-- not as the vendor record says later.

CREATE TABLE finance.vendor_payments (
  tenant_id          uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id                 uuid NOT NULL,

  -- From the tenant's payment-voucher series, taken in this transaction, so a
  -- payment that fails to save gives its number back (CA-09).
  number             text NOT NULL,
  kind               text NOT NULL,
  bill_id            uuid,
  bill_number        text,
  purchase_order_id  uuid NOT NULL,
  vendor_id          uuid NOT NULL,
  payee_name         text NOT NULL,
  payee_pan          text,
  paid_on            date NOT NULL,
  -- What the bank calls it: a UTR, a cheque number. Free text.
  reference          text NOT NULL DEFAULT '',

  -- Paise throughout.
  gross_amount       bigint NOT NULL,
  taxable_amount     bigint NOT NULL,
  gst_amount         bigint NOT NULL,
  tds_section        text,
  tds_payee_class    text,
  tds_rate_bp        integer,
  tds_base           bigint NOT NULL DEFAULT 0,
  tds_amount         bigint NOT NULL DEFAULT 0,
  tds_reason         text NOT NULL,
  retention_withheld bigint NOT NULL DEFAULT 0,
  net_paid           bigint NOT NULL,

  provisional        boolean NOT NULL,
  rows_used          jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_by         uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vendor_payments_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT vendor_payments_number_key UNIQUE (tenant_id, number),
  CONSTRAINT vendor_payments_kind_check CHECK (kind IN ('bill', 'retention_release')),
  CONSTRAINT vendor_payments_bill_check CHECK ((kind = 'bill') = (bill_id IS NOT NULL)),
  CONSTRAINT vendor_payments_reason_check CHECK (tds_reason IN (
    'deducted', 'higher_rate_no_valid_pan', 'below_threshold', 'transporter_declaration',
    'no_section', 'buyer_not_covered', 'retention_release'
  )),
  CONSTRAINT vendor_payments_amounts_check CHECK (
    gross_amount > 0 AND taxable_amount >= 0 AND gst_amount >= 0 AND tds_base >= 0
    AND tds_amount >= 0 AND retention_withheld >= 0 AND net_paid >= 0
  ),
  -- Net is derived, and the database holds it to its derivation.
  CONSTRAINT vendor_payments_net_check
    CHECK (net_paid = gross_amount - tds_amount - retention_withheld),
  CONSTRAINT vendor_payments_tds_shape_check
    CHECK (tds_amount = 0 OR (tds_section IS NOT NULL AND tds_rate_bp IS NOT NULL)),
  CONSTRAINT vendor_payments_pan_check
    CHECK (payee_pan IS NULL OR payee_pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$')
);

-- One payment settles one bill. Two requests that both pass every check in the
-- application at the same moment still cannot both land.
CREATE UNIQUE INDEX vendor_payments_one_per_bill
  ON finance.vendor_payments (tenant_id, bill_id) WHERE kind = 'bill';
CREATE INDEX vendor_payments_paid_idx ON finance.vendor_payments (tenant_id, paid_on);
CREATE INDEX vendor_payments_vendor_year_idx
  ON finance.vendor_payments (tenant_id, vendor_id, tds_section, paid_on);

ALTER TABLE finance.vendor_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.vendor_payments FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON finance.vendor_payments AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON finance.vendor_payments AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON finance.vendor_payments FROM PUBLIC;
GRANT SELECT, INSERT ON finance.vendor_payments TO app_runtime;

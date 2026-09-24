-- 0039 — Retention withheld from a vendor.
--
-- Forward-only. Never edit this file.
--
-- Scouted with the site-controls module (`SiteControlsView.js`), which is where
-- the legacy keeps it, but the table belongs to `procurement`: it is money held
-- back against a purchase order.
-- ============================================================================
-- RETENTION
-- ============================================================================
--
-- **RET-01: nothing in the legacy ever inserts into `vendor_retention_ledger`.**
-- The table is created (`migrations.js:271`), read by `getRetentionLedger`, and
-- updated by `releaseRetentionAmount` — and there is **no INSERT anywhere in the
-- codebase**. So retention has never been recorded by the application, and the
-- release function operates on rows that only a manual seed could have created.
--
-- **RET-02: releasing retention creates no payment.** `site-controls.js:168`
-- updates `released_amount` and nothing else. No row is written to
-- `manual_payments`, `system_payments` or `payment_requests` — the vendor is not
-- paid, the ledger simply says they were.
--
-- **So this table records what is HELD, and releasing is deliberately not built
-- here.** A release is a payment, and payments are gated on CA-01..CA-08. The
-- held amount is recorded now, because it is money withheld from a vendor and
-- the legacy has never recorded it at all; the release path lands with payments.

CREATE TABLE procurement.retention_holdings (
  tenant_id         uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id                uuid NOT NULL,

  purchase_order_id uuid NOT NULL,
  vendor_id         uuid NOT NULL,

  -- What the retention was calculated on, and what was withheld. Paise.
  gross_amount      bigint NOT NULL,
  retained_amount   bigint NOT NULL,
  -- Basis points, so 5% is 500 — the same representation as a GST rate, and
  -- exact. The legacy stores retention_pct as REAL with a default of 5.
  retention_rate_bp integer NOT NULL,

  -- Released is derived from release rows once those exist. Not a column here:
  -- a stored running total is what made INV-01 and INV-04 possible.
  stage             text NOT NULL DEFAULT 'held',

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  version           integer NOT NULL DEFAULT 1,

  CONSTRAINT retention_holdings_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT retention_holdings_po_fkey
    FOREIGN KEY (tenant_id, purchase_order_id)
    REFERENCES procurement.purchase_orders (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT retention_holdings_vendor_fkey
    FOREIGN KEY (tenant_id, vendor_id)
    REFERENCES procurement.vendors (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT retention_holdings_po_key UNIQUE (tenant_id, purchase_order_id),
  CONSTRAINT retention_holdings_amounts_check
    CHECK (gross_amount >= 0 AND retained_amount >= 0 AND retained_amount <= gross_amount),
  CONSTRAINT retention_holdings_rate_check
    CHECK (retention_rate_bp >= 0 AND retention_rate_bp <= 10000),
  CONSTRAINT retention_holdings_stage_check CHECK (stage IN ('held', 'released')),
  CONSTRAINT retention_holdings_version_check CHECK (version >= 1)
);

CREATE INDEX retention_holdings_vendor_idx
  ON procurement.retention_holdings (tenant_id, vendor_id, stage);

ALTER TABLE procurement.retention_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.retention_holdings FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON procurement.retention_holdings AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON procurement.retention_holdings AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
REVOKE ALL ON procurement.retention_holdings FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON procurement.retention_holdings TO app_runtime;

COMMENT ON TABLE procurement.retention_holdings IS
  'Money withheld from a vendor against a purchase order. Recorded because the '
  'legacy never records it: nothing in that codebase INSERTs into '
  'vendor_retention_ledger (RET-01), so the release function operates on rows '
  'only a manual seed could have created. RELEASING is not built here — a '
  'release is a payment, and payments are gated on CA-01..CA-08. The legacy '
  'release writes no payment record either (RET-02).';

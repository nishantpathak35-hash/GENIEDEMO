-- What a vendor does through the portal: accept an order, and claim against it.
--
-- Prefix from the unallocated `0050+` block, claimed in `docs/plans/M6.md`.
-- `0024` would have been the obvious next number and is allocated to identity;
-- taking it would repeat exactly the drift that plan already records as TOOL-09.
--
-- Both tables record a VENDOR'S ASSERTION and nothing derived from it. That is
-- the line this migration is drawn along, because the vendor portal is the one
-- place where an outside party's input enters the money path, and everything
-- downstream of the claim — what is deducted, what is netted, what is paid — is
-- gated on CA-01..CA-08.
--
--   * `amount_claimed` is what the vendor says the work is worth. It is stored
--     exactly as submitted and nothing computes from it.
--   * There is **no TDS column, no net-payable column and no approved amount**.
--     A claim is not a payable. `POsView.js:153-154` derives both in a browser
--     from a rate typed into a form, and that is the shape being avoided.
--   * There is no link to a payment, because there is no payment table.
--
-- Recording the claim is safe and useful on its own: a vendor with no way to
-- submit a bill telephones somebody, and the record of what was claimed is then
-- an email.

-- ------------------------------------------------------- order acceptance ---

-- A vendor's answer to an order that was issued to them. Append-only: an
-- acceptance and a later rejection are two facts, not one field overwritten,
-- and which came first is exactly what a dispute turns on.
CREATE TABLE procurement.purchase_order_acceptances (
  tenant_id         uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id                uuid NOT NULL DEFAULT gen_random_uuid(),

  purchase_order_id uuid NOT NULL,
  vendor_id         uuid NOT NULL,

  decision          text NOT NULL,
  remarks           text NOT NULL DEFAULT '',

  -- The principal that submitted it, from the session. Never from the body.
  decided_by        uuid NOT NULL,
  decided_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT po_acceptances_pkey PRIMARY KEY (tenant_id, id),

  CONSTRAINT po_acceptances_order_fkey
    FOREIGN KEY (tenant_id, purchase_order_id)
    REFERENCES procurement.purchase_orders (tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT po_acceptances_vendor_fkey
    FOREIGN KEY (tenant_id, vendor_id)
    REFERENCES procurement.vendors (tenant_id, id) ON DELETE RESTRICT,

  CONSTRAINT po_acceptances_decision_check
    CHECK (decision IN ('accepted', 'rejected'))
);

CREATE INDEX po_acceptances_tenant_idx
  ON procurement.purchase_order_acceptances (tenant_id);
CREATE INDEX po_acceptances_order_idx
  ON procurement.purchase_order_acceptances (tenant_id, purchase_order_id);

ALTER TABLE procurement.purchase_order_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.purchase_order_acceptances FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON procurement.purchase_order_acceptances AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON procurement.purchase_order_acceptances AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON procurement.purchase_order_acceptances FROM PUBLIC;
-- No UPDATE and no DELETE: append-only by privilege, not by convention.
GRANT SELECT, INSERT ON procurement.purchase_order_acceptances TO app_runtime;

-- ------------------------------------------------------------ vendor bill ---

CREATE TABLE procurement.vendor_bills (
  tenant_id         uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id                uuid NOT NULL DEFAULT gen_random_uuid(),

  purchase_order_id uuid NOT NULL,
  vendor_id         uuid NOT NULL,

  -- The vendor's own invoice or running-account bill number. Unique per vendor
  -- so the same bill cannot be submitted twice; tenant-prefixed so the
  -- duplicate error cannot confirm a bill exists in another tenant.
  bill_number       text NOT NULL,

  -- Exactly what the vendor claimed, in paise. NOT a payable: nothing deducts
  -- from it, nothing nets it, and no column here holds a figure derived from
  -- it. What is actually paid is CA-01..CA-08 and is not built.
  amount_claimed    bigint NOT NULL,

  period_from       date,
  period_to         date,
  narrative         text NOT NULL DEFAULT '',

  state             text NOT NULL DEFAULT 'submitted',

  submitted_by      uuid NOT NULL,
  submitted_at      timestamptz NOT NULL DEFAULT now(),
  version           integer NOT NULL DEFAULT 1,

  CONSTRAINT vendor_bills_pkey PRIMARY KEY (tenant_id, id),

  CONSTRAINT vendor_bills_order_fkey
    FOREIGN KEY (tenant_id, purchase_order_id)
    REFERENCES procurement.purchase_orders (tenant_id, id) ON DELETE RESTRICT,

  CONSTRAINT vendor_bills_vendor_fkey
    FOREIGN KEY (tenant_id, vendor_id)
    REFERENCES procurement.vendors (tenant_id, id) ON DELETE RESTRICT,

  CONSTRAINT vendor_bills_number_key UNIQUE (tenant_id, vendor_id, bill_number),

  CONSTRAINT vendor_bills_amount_check CHECK (amount_claimed > 0),

  CONSTRAINT vendor_bills_state_check
    CHECK (state IN ('submitted', 'acknowledged', 'returned')),

  -- Both dates or neither. Half a period reads as a stated one.
  CONSTRAINT vendor_bills_period_check
    CHECK ((period_from IS NULL) = (period_to IS NULL)),
  CONSTRAINT vendor_bills_period_order_check
    CHECK (period_from IS NULL OR period_from <= period_to)
);

CREATE INDEX vendor_bills_tenant_idx ON procurement.vendor_bills (tenant_id);
CREATE INDEX vendor_bills_vendor_idx ON procurement.vendor_bills (tenant_id, vendor_id);

ALTER TABLE procurement.vendor_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.vendor_bills FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON procurement.vendor_bills AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON procurement.vendor_bills AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON procurement.vendor_bills FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON procurement.vendor_bills TO app_runtime;

COMMENT ON COLUMN procurement.vendor_bills.amount_claimed IS
  'Paise, exactly as the vendor submitted it. A CLAIM, not a payable: no TDS, '
  'no netting and no approved amount exists here, because those are '
  'CA-01..CA-08 and unverified.';

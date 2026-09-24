-- 0032 — Vendors.
--
-- Forward-only. Never edit this file.
--
-- **`procurement.purchase_orders.vendor_id` has been a bare uuid with no
-- foreign key since `0009`**, because there was no table to point at. An order
-- could name a vendor that does not exist, and nothing objected. The FK lands
-- in `0033`, once there are rows to reference.
--
-- **Identity is a surrogate uuid, never the name.** The legacy keys vendors by
-- `vendor_key` and matches them by name in several places; TOPOLOGY lists
-- name-keying as blocking the rebuild, and the same argument as PO-19 applies —
-- a human-facing string that can be edited is not an identity.
--
-- **Bank details are in a separate table (`0032` second half), not columns
-- here.** A vendor's name, GSTIN and contact are needed by anyone raising a
-- purchase order; the bank account and IFSC are needed only when paying one.
-- Keeping them in one row means every read of a vendor list carries payment
-- credentials, and the only thing standing between a junior user and a vendor's
-- bank account is whether whoever wrote the query remembered to omit the
-- column. Splitting the table makes the omission structural.

CREATE TABLE procurement.vendors (
  tenant_id  uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id         uuid NOT NULL,

  -- Human-facing and freely editable, exactly like purchase_orders.number.
  name       text NOT NULL,
  -- The legacy's `vendor_key`, kept as a display/import code rather than a key.
  code       text NOT NULL,

  status     text NOT NULL DEFAULT 'active',

  -- Statutory identifiers. Format-checked, never invented: tdsChallan281.js:54
  -- fabricates a TAN into filed content, which is the failure this refuses to
  -- repeat. NULL means "not supplied", never a placeholder.
  gstin      text,
  pan        text,

  -- Contact. Nothing here decides anything; it is display.
  email      text,
  phone      text,
  address    text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version    integer NOT NULL DEFAULT 1,

  CONSTRAINT vendors_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT vendors_code_key UNIQUE (tenant_id, code),
  CONSTRAINT vendors_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT vendors_version_check CHECK (version >= 1),
  -- 15 characters: 2 state + 10 PAN + 1 entity + 1 'Z' + 1 checksum. The
  -- checksum itself is not verified here — that is application logic with a
  -- test, not a CHECK nobody can read.
  CONSTRAINT vendors_gstin_check CHECK (
    gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$'
  ),
  CONSTRAINT vendors_pan_check CHECK (pan IS NULL OR pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$')
);

CREATE INDEX vendors_tenant_idx ON procurement.vendors (tenant_id);

ALTER TABLE procurement.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.vendors FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON procurement.vendors AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON procurement.vendors AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON procurement.vendors FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON procurement.vendors TO app_runtime;

COMMENT ON TABLE procurement.vendors IS
  'Vendors, keyed by surrogate uuid. The legacy keys them by vendor_key and '
  'matches by name in places; a human-facing editable string is not an '
  'identity. Bank details are deliberately NOT here — see vendor_bank_accounts.';

-- ---------------------------------------------------------------------------

-- **Payment credentials, separated on purpose.**
--
-- A vendor list is read by anyone raising a purchase order. A bank account is
-- needed only to pay one. In one table those are the same read, and the only
-- control is whether each query remembered to omit the column — which is the
-- kind of control that holds until somebody writes `SELECT *`.
--
-- Its own table means the vendor read cannot leak them by accident, and a
-- future role gate has something to gate.
CREATE TABLE procurement.vendor_bank_accounts (
  tenant_id     uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id            uuid NOT NULL,
  vendor_id     uuid NOT NULL,

  account_name  text NOT NULL,
  account_number text NOT NULL,
  ifsc          text NOT NULL,
  bank_name     text,

  is_primary    boolean NOT NULL DEFAULT false,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vendor_bank_accounts_pkey PRIMARY KEY (tenant_id, id),
  -- Composite, like every FK here: referential integrity bypasses RLS, so a
  -- single-column FK would let one tenant attach an account to another
  -- tenant's vendor and confirm, by the insert succeeding, that it exists.
  CONSTRAINT vendor_bank_accounts_vendor_fkey
    FOREIGN KEY (tenant_id, vendor_id)
    REFERENCES procurement.vendors (tenant_id, id) ON DELETE CASCADE,
  -- IFSC: 4 letters, '0', 6 alphanumerics.
  CONSTRAINT vendor_bank_accounts_ifsc_check CHECK (ifsc ~ '^[A-Z]{4}0[0-9A-Z]{6}$'),
  CONSTRAINT vendor_bank_accounts_number_check CHECK (account_number ~ '^[0-9A-Za-z]{5,34}$')
);

CREATE INDEX vendor_bank_accounts_vendor_idx
  ON procurement.vendor_bank_accounts (tenant_id, vendor_id);

-- At most one primary account per vendor. A partial unique index rather than a
-- constraint, because the rule is about the `true` rows only.
CREATE UNIQUE INDEX vendor_bank_accounts_one_primary
  ON procurement.vendor_bank_accounts (tenant_id, vendor_id)
  WHERE is_primary;

ALTER TABLE procurement.vendor_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.vendor_bank_accounts FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON procurement.vendor_bank_accounts AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON procurement.vendor_bank_accounts AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON procurement.vendor_bank_accounts FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON procurement.vendor_bank_accounts TO app_runtime;

COMMENT ON TABLE procurement.vendor_bank_accounts IS
  'Vendor payment credentials, held apart from the vendor row so an ordinary '
  'vendor read cannot return them. Never echoed back in an API error: a '
  'validation message quoting a rejected account number puts it in a browser '
  'console.';

-- 0004 — Tally voucher staging.
--
-- Forward-only. Never edit this file.
--
-- ADR-0004: the cloud cannot reach a customer's 127.0.0.1:9000, so it stages
-- vouchers here and an on-prem connector pulls them. This table IS the queue.
--
-- ADR-0014's addendum records that the legacy integration never worked and that
-- every historical `tally_sync_logs` row marked "Synced" describes a request
-- that was sent rather than a voucher that landed. Nothing migrates into this
-- table from there.

CREATE SCHEMA IF NOT EXISTS finance AUTHORIZATION app_migrator;
GRANT USAGE ON SCHEMA finance TO app_runtime;

CREATE TABLE finance.tally_vouchers (
  tenant_id  uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id         uuid NOT NULL,

  -- Open on the wire and open here. The cloud may add kinds, and an older
  -- connector must keep forwarding one it does not recognise — so this is
  -- deliberately NOT a CHECK constraint against a fixed list.
  kind       text NOT NULL,

  -- Complete Tally XML, already escaped. Escaping is the cloud's job, never the
  -- connector's: the legacy generator interpolates vendor names unescaped, so
  -- "M/s A&B Interiors" produces an undefined entity and Tally rejects the
  -- whole document.
  xml        text NOT NULL,

  -- Stable for the life of the underlying document, across every re-offer and
  -- re-queue. This is what lets Tally itself reject a duplicate: leasing stops
  -- two connectors being HANDED the same voucher, but it cannot stop the same
  -- voucher REACHING Tally twice after a lost result.
  remote_id  text NOT NULL,

  status     text NOT NULL DEFAULT 'pending',

  -- Counts PERMANENT failures only. Hand-out does not count: a connector that
  -- leases fifty vouchers and crash-loops would otherwise dead-letter all fifty
  -- in about twenty-five minutes with nothing having reached Tally.
  -- See CONNECTOR-02 — the wire semantics are not yet agreed.
  attempts   integer NOT NULL DEFAULT 0,

  -- Leasing. A voucher under an unexpired lease held by one instance is not
  -- offered to another. Customers do install the connector on two machines, and
  -- per-machine local ledgers cannot see each other, so this can only be solved
  -- cloud-side.
  leased_by    uuid,
  leased_until timestamptz,

  tally_voucher_id   text,
  last_error_code    text,
  last_error_message text,

  created_at timestamptz NOT NULL DEFAULT now(),
  posted_at  timestamptz,

  CONSTRAINT tally_vouchers_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT tally_vouchers_status_check CHECK (
    status IN ('pending', 'leased', 'posted', 'failed', 'needs_verify', 'dead')
  ),
  -- Tenant-prefixed: a bare UNIQUE (remote_id) would let one tenant discover,
  -- through the violation message, that another tenant staged a document.
  CONSTRAINT tally_vouchers_remote_id_key UNIQUE (tenant_id, remote_id)
);

-- Oldest first, within a tenant, for vouchers actually on offer.
CREATE INDEX tally_vouchers_pending_idx
  ON finance.tally_vouchers (tenant_id, created_at)
  WHERE status IN ('pending', 'leased');

ALTER TABLE finance.tally_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.tally_vouchers FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON finance.tally_vouchers AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON finance.tally_vouchers AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON finance.tally_vouchers TO app_runtime;

COMMENT ON TABLE finance.tally_vouchers IS
  'Staged Tally vouchers. The connector pulls PENDING rows for its own tenant, '
  'posts the XML to local Tally, and reports back. Isolation here is a '
  'book-integrity control, not only a privacy one: the connector forwards '
  'opaque XML, so a row visible to the wrong tenant is a write into the wrong '
  'set of books.';

-- ------------------------------------------------ effective-dated rates ----
-- The mechanism. Seeded with NOTHING.
--
-- ADR-0014 requires rates to be time-versioned, and CA-05 records that the
-- legacy system holds two disagreeing rate tables, neither of which filters on
-- the effective-date columns it already has. Every value is stale until a
-- chartered accountant says otherwise, so this table ships empty rather than
-- pre-populated with plausible-looking numbers that would later be mistaken for
-- verified ones.

CREATE TABLE finance.tax_rates (
  tenant_id      uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id             uuid NOT NULL,
  key            text NOT NULL,
  payee_class    text,
  -- Basis points. 1 bp = 0.01%.
  rate_bp        integer NOT NULL,
  effective_from date NOT NULL,
  effective_to   date,

  -- 'provisional' | 'verified'. Only a human promotes a row to 'verified',
  -- and only with a name, a date and a statute.
  status         text NOT NULL DEFAULT 'provisional',
  statute        text,
  verified_by    text,
  verified_on    date,
  question_ref   text,

  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tax_rates_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT tax_rates_status_check CHECK (status IN ('provisional', 'verified')),
  CONSTRAINT tax_rates_rate_check CHECK (rate_bp >= 0),
  CONSTRAINT tax_rates_period_check CHECK (effective_to IS NULL OR effective_to > effective_from),
  -- A verified row must carry its evidence. Without this the status column is
  -- a claim rather than a record.
  CONSTRAINT tax_rates_verified_evidence_check CHECK (
    status <> 'verified'
    OR (verified_by IS NOT NULL AND verified_on IS NOT NULL AND statute IS NOT NULL)
  )
);

CREATE INDEX tax_rates_lookup_idx ON finance.tax_rates (tenant_id, key, effective_from);

ALTER TABLE finance.tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.tax_rates FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON finance.tax_rates AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON finance.tax_rates AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON finance.tax_rates TO app_runtime;

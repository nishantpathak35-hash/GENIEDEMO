-- 0038 — Site controls: imprest and joint measurement.
--
-- Forward-only. Never edit this file.
--
-- Prefix `0038` is in the `0030`-`0039` block claimed for M5 in `M6.md`.
--
-- Retention lives in `procurement` (migration `0039`), because it is money
-- withheld against a purchase order and procurement owns that table. The
-- legacy keeps all three in one module, which is why they are scouted
-- together and land apart.
--
-- ============================================================================
-- IMPREST
-- ============================================================================
--
-- **IMP-02: the legacy has no role gate**, so the same principal may request an
-- imprest and sanction it (`site-controls.js:25`, `:53`). That is a separation
-- of duties question and belongs to the approval engine, not to a column — the
-- state machine here records who did each, and the workflow chain is what will
-- refuse the same person doing both once PO-13 lands.
--
-- **IMP-01**: `reconcileSiteImprest` stores `receipt_vouchers` as given and
-- compares nothing to the sanctioned amount, so an imprest can be reconciled
-- against no receipts at all. Here `reconciled_amount` is required to reconcile
-- and must not exceed what was sanctioned.

CREATE TABLE siteops.imprest_requests (
  tenant_id         uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id                uuid NOT NULL,
  project_id        uuid NOT NULL,

  purpose           text NOT NULL,
  -- Paise throughout. The legacy stores these as REAL.
  amount_requested  bigint NOT NULL,
  amount_sanctioned bigint,
  amount_reconciled bigint,

  status            text NOT NULL DEFAULT 'requested',

  requested_by      uuid NOT NULL,
  sanctioned_by     uuid,
  reconciled_by     uuid,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  version           integer NOT NULL DEFAULT 1,

  CONSTRAINT imprest_requests_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT imprest_requests_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT imprest_requests_requested_by_fkey
    FOREIGN KEY (tenant_id, requested_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT imprest_requests_sanctioned_by_fkey
    FOREIGN KEY (tenant_id, sanctioned_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT imprest_requests_reconciled_by_fkey
    FOREIGN KEY (tenant_id, reconciled_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE RESTRICT,

  CONSTRAINT imprest_requests_status_check
    CHECK (status IN ('requested', 'sanctioned', 'reconciled', 'rejected')),
  CONSTRAINT imprest_requests_requested_check CHECK (amount_requested > 0),
  CONSTRAINT imprest_requests_sanctioned_amount_check
    CHECK (amount_sanctioned IS NULL OR amount_sanctioned >= 0),
  CONSTRAINT imprest_requests_reconciled_amount_check
    CHECK (amount_reconciled IS NULL OR amount_reconciled >= 0),
  CONSTRAINT imprest_requests_version_check CHECK (version >= 1),

  -- Sanctioned means an amount and an author; reconciled means both of those
  -- plus a reconciled amount and its author. A status cannot outrun its record.
  CONSTRAINT imprest_requests_sanction_check CHECK (
    (status IN ('sanctioned', 'reconciled'))
      = (amount_sanctioned IS NOT NULL AND sanctioned_by IS NOT NULL)
  ),
  CONSTRAINT imprest_requests_reconcile_check CHECK (
    (status = 'reconciled') = (amount_reconciled IS NOT NULL AND reconciled_by IS NOT NULL)
  ),
  -- IMP-01: you cannot reconcile more than was sanctioned.
  CONSTRAINT imprest_requests_within_sanction_check CHECK (
    amount_reconciled IS NULL
    OR amount_sanctioned IS NULL
    OR amount_reconciled <= amount_sanctioned
  )
);

CREATE INDEX imprest_requests_project_idx
  ON siteops.imprest_requests (tenant_id, project_id, status);

ALTER TABLE siteops.imprest_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE siteops.imprest_requests FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON siteops.imprest_requests AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON siteops.imprest_requests AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
REVOKE ALL ON siteops.imprest_requests FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON siteops.imprest_requests TO app_runtime;

COMMENT ON TABLE siteops.imprest_requests IS
  'Site cash advances. Money is paise, not REAL. A reconciliation must carry an '
  'amount within the sanction — reconcileSiteImprest (site-controls.js:72) '
  'stores receipt text and compares nothing (IMP-01).';

-- ============================================================================
-- JOINT MEASUREMENT
-- ============================================================================
--
-- A JMR is what the client and the site engineer agreed was built. It is
-- evidence, so it is append-only: `app_runtime` gets no UPDATE and no DELETE.
-- The legacy allows neither in practice — there is no update or delete function
-- — but that is an absence of code rather than a property of the table.

CREATE TABLE siteops.measurement_records (
  tenant_id        uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id               uuid NOT NULL,
  project_id       uuid NOT NULL,

  -- Which BOQ line was measured, when it maps to one. Composite FK; NULL for a
  -- measurement that has no BOQ line yet.
  boq_item_id      uuid,

  description      text NOT NULL,
  location         text NOT NULL DEFAULT '',
  -- Millionths of a unit, like every other quantity here. The legacy stores
  -- measured_qty as REAL.
  measured_micros  bigint NOT NULL,
  uom              text NOT NULL,

  -- Both signatures are the point of a JMR. Free text: the client's signatory
  -- is not a principal in this system.
  signed_by_client text NOT NULL,
  signed_by_site   uuid NOT NULL,
  measured_on      date NOT NULL,

  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT measurement_records_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT measurement_records_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT measurement_records_boq_fkey
    FOREIGN KEY (tenant_id, boq_item_id)
    REFERENCES projects.boq_items (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT measurement_records_signed_by_site_fkey
    FOREIGN KEY (tenant_id, signed_by_site)
    REFERENCES identity.principals (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT measurement_records_qty_check CHECK (measured_micros > 0),
  CONSTRAINT measurement_records_client_signature_check
    CHECK (length(trim(signed_by_client)) > 0)
);

CREATE INDEX measurement_records_project_idx
  ON siteops.measurement_records (tenant_id, project_id);
CREATE INDEX measurement_records_boq_idx
  ON siteops.measurement_records (tenant_id, boq_item_id)
  WHERE boq_item_id IS NOT NULL;

ALTER TABLE siteops.measurement_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE siteops.measurement_records FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON siteops.measurement_records AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON siteops.measurement_records AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
REVOKE ALL ON siteops.measurement_records FROM PUBLIC;
-- No UPDATE, no DELETE: a joint measurement is signed evidence. A correction is
-- a new record, which leaves both visible.
GRANT SELECT, INSERT ON siteops.measurement_records TO app_runtime;

COMMENT ON TABLE siteops.measurement_records IS
  'Joint measurement records — what the client and the site engineer agreed was '
  'built. Append-only: app_runtime has no UPDATE and no DELETE, because a '
  'signed measurement that can be edited is not evidence.';

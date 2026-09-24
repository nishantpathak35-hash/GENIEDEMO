-- 0012 — Per-tenant project health thresholds.
--
-- Forward-only. Never edit this file.
--
-- **Why this is configuration and not a constant.**
--
-- `ProjectsSidebar.js:12` bands a project "At Risk" once committed spend passes
-- 85% of the budget. That number cannot be ported as a constant, because
-- PROJ-01 means **it has never meaningfully fired**: `projects.js:118-120` adds
-- the same value to both `poIssued` and `projectValue`, so without a
-- hand-entered budget the ratio is pinned at exactly 1.0 and no project ever
-- crossed the band from either side.
--
-- So 85 is a number somebody typed, not a number that was observed working. It
-- carries zero evidence. Porting it as a constant would launder an untested
-- value into an apparently-settled one — the same move ADR-0014 forbids for
-- statutory figures, for the same reason.
--
-- No statute governs it, so it is **not** a HUMAN(CA-) marker. It is a business
-- threshold a director acts on, which is why it does not get to be a magic
-- number in a component either. It is per-tenant, and its default is marked
-- provisional until somebody with authority over the business confirms it
-- (PO-18).

CREATE TABLE projects.health_thresholds (
  tenant_id  uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,

  -- Percent of budget at which a project becomes "at risk". Whole percent —
  -- there is no case for 85.5% here, and an integer keeps the comparison exact.
  at_risk_pct integer NOT NULL,

  -- 'provisional' until a human confirms it. The application surfaces this, so
  -- a director reading the traffic light can tell whether the threshold behind
  -- it was agreed or inherited.
  status     text NOT NULL DEFAULT 'provisional',
  set_by     text,
  set_on     date,
  note       text NOT NULL DEFAULT '',

  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One row per tenant. The tenant IS the key.
  CONSTRAINT health_thresholds_pkey PRIMARY KEY (tenant_id),
  CONSTRAINT health_thresholds_pct_check CHECK (at_risk_pct > 0 AND at_risk_pct <= 100),
  CONSTRAINT health_thresholds_status_check CHECK (status IN ('provisional', 'confirmed')),
  -- A confirmed threshold must say who confirmed it and when. Without this the
  -- status column is a claim rather than a record — the same shape as
  -- `finance.tax_rates`, deliberately.
  CONSTRAINT health_thresholds_confirmed_evidence_check CHECK (
    status <> 'confirmed' OR (set_by IS NOT NULL AND set_on IS NOT NULL)
  )
);

ALTER TABLE projects.health_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.health_thresholds FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects.health_thresholds AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON projects.health_thresholds AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON projects.health_thresholds TO app_runtime;

COMMENT ON TABLE projects.health_thresholds IS
  'Per-tenant project health banding. Ships with no rows: a tenant without a '
  'row gets the documented provisional default from the domain, and the API '
  'says the threshold is provisional. 85 percent is inherited from the legacy '
  'and has never been observed working (PROJ-01), so it is not a constant.';

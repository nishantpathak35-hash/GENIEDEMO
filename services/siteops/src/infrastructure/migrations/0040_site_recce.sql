-- 0040 — Site recce.
--
-- Forward-only. Never edit this file.
--
-- Prefix `0040` is the block re-allocated to `siteops` in `M6.md` after
-- `0019`-`0022` were taken outside the plan (TOOL-09).
--
-- **RECCE-01: the legacy table is created outside the migration system.**
-- `recce.js:14-37` calls an inline `ensureTable()` at the top of every recce
-- function, and it is never recorded in `schema_migrations` — the same shape as
-- TASK-01. Nothing knows whether it exists or what version of it exists.
--
-- The columns checked clean otherwise: every write names a column the inline
-- CREATE declares. This is one of the modules where the missing-column pattern
-- does not appear.
--
-- **Measurements are millionths, not REAL.** `bua_sqft`, `carpet_sqft` and
-- `floor_height_ft` are `REAL` in the legacy. None of them is money, but a
-- built-up area drives an estimate, and `12.375` is exactly as
-- unrepresentable in binary floating point here as it is anywhere else.
--
-- `measurements_json`, `services_json` and `photos_json` stay JSON. They are a
-- survey form's free shape, not a schema — modelling them as columns would be
-- guessing at a form that a site engineer changes.

CREATE TABLE siteops.site_recces (
  tenant_id        uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id               uuid NOT NULL,
  project_id       uuid NOT NULL,

  recce_on         date NOT NULL,
  conducted_by     uuid NOT NULL,
  client_present   boolean NOT NULL DEFAULT false,

  -- Millionths of a square foot / a foot. Integer, for the same reason
  -- quantities are integers everywhere else here.
  bua_micros       bigint,
  carpet_micros    bigint,
  floor_height_micros bigint,

  floor_number     text NOT NULL DEFAULT '',
  num_floors       integer NOT NULL DEFAULT 1,
  site_condition   text NOT NULL DEFAULT 'bare_shell',
  handover_on      date,

  key_challenges   text NOT NULL DEFAULT '',
  observations     text NOT NULL DEFAULT '',

  -- A survey form's free shape. jsonb, so it can at least be queried.
  measurements     jsonb NOT NULL DEFAULT '{}'::jsonb,
  services         jsonb NOT NULL DEFAULT '{}'::jsonb,

  status           text NOT NULL DEFAULT 'draft',

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  version          integer NOT NULL DEFAULT 1,

  CONSTRAINT site_recces_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT site_recces_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT site_recces_conducted_by_fkey
    FOREIGN KEY (tenant_id, conducted_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT site_recces_status_check CHECK (status IN ('draft', 'submitted', 'approved')),
  CONSTRAINT site_recces_condition_check CHECK (
    site_condition IN ('bare_shell', 'warm_shell', 'fitted', 'occupied')
  ),
  CONSTRAINT site_recces_floors_check CHECK (num_floors >= 1),
  CONSTRAINT site_recces_area_check CHECK (
    (bua_micros IS NULL OR bua_micros >= 0)
    AND (carpet_micros IS NULL OR carpet_micros >= 0)
    AND (floor_height_micros IS NULL OR floor_height_micros >= 0)
  ),
  -- Carpet area cannot exceed built-up area. A survey that says otherwise is a
  -- transcription error, and it is cheaper to refuse it than to find it later
  -- in an estimate.
  CONSTRAINT site_recces_carpet_within_bua_check CHECK (
    bua_micros IS NULL OR carpet_micros IS NULL OR carpet_micros <= bua_micros
  ),
  CONSTRAINT site_recces_version_check CHECK (version >= 1)
);

CREATE INDEX site_recces_project_idx ON siteops.site_recces (tenant_id, project_id);

ALTER TABLE siteops.site_recces ENABLE ROW LEVEL SECURITY;
ALTER TABLE siteops.site_recces FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON siteops.site_recces AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON siteops.site_recces AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
REVOKE ALL ON siteops.site_recces FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON siteops.site_recces TO app_runtime;

COMMENT ON TABLE siteops.site_recces IS
  'Site survey. In the migration system, unlike the legacy table, which an '
  'inline ensureTable() creates on first call and schema_migrations never '
  'records (RECCE-01). Areas are integer millionths, not REAL.';

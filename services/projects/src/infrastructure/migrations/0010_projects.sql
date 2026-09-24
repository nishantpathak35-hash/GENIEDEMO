-- 0010 — The projects master table.
--
-- Forward-only. Never edit this file.
--
-- **This is TOPOLOGY's known defect #1**, and the reason it says "fix it
-- first": the legacy system has no projects table at all. A project is a name
-- string, repeated across 51 tables, joined with
-- `LOWER(TRIM(project)) LIKE '%…%'`. Tenancy cannot be layered on top of that,
-- because there is no row to attach a tenant to and no key to make composite.
-- A `mergeProjects` RPC exists precisely because name-keying corrupts.
--
-- Every consequence follows from giving a project an identity:
--   * BOQ, takeoff and change orders get a composite FK instead of a substring
--     match, so a line cannot belong to a project in another tenant;
--   * renaming a project stops being a data migration;
--   * two projects may legitimately share a name, which under the old scheme
--     silently merged them.
--
-- ADR-0014 records that when these fuzzy-matched rows move to real foreign
-- keys, **historical totals will change**. That reconciliation is a tenant #1
-- migration concern (T1) and must be agreed with the customer before go-live;
-- it is not something this migration can or should paper over.

CREATE SCHEMA IF NOT EXISTS projects AUTHORIZATION app_migrator;
GRANT USAGE ON SCHEMA projects TO app_runtime;

CREATE TABLE projects.projects (
  tenant_id   uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id          uuid NOT NULL,

  -- A short human key, unique within the tenant. This is what a person quotes
  -- on the phone; it is NOT the primary key, so it can be corrected.
  code        text NOT NULL,
  name        text NOT NULL,

  client_name text NOT NULL,
  site_address text,

  state       text NOT NULL DEFAULT 'lead',

  -- The originally signed contract value, in paise, and never overwritten.
  -- `CO-02` records that the legacy rewrites the contract value IN PLACE on
  -- approving a change order, so the figure that was actually signed is lost.
  -- Variations are separate rows; the current value is derived.
  original_value bigint,

  started_on  date,
  handed_over_on date,

  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT projects_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT projects_state_check CHECK (
    state IN ('lead', 'won', 'in_progress', 'handed_over', 'closed', 'lost')
  ),
  -- Tenant-prefixed: a bare UNIQUE (code) would let one tenant discover, from
  -- the violation message, that another tenant runs a project with that code.
  CONSTRAINT projects_code_key UNIQUE (tenant_id, code),
  CONSTRAINT projects_value_check CHECK (original_value IS NULL OR original_value >= 0),
  CONSTRAINT projects_version_check CHECK (version >= 1)
);

CREATE INDEX projects_listing_idx ON projects.projects (tenant_id, state, created_at DESC);

ALTER TABLE projects.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.projects FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects.projects AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON projects.projects AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON projects.projects TO app_runtime;

COMMENT ON TABLE projects.projects IS
  'The project master. Replaces name-string keying, which is TOPOLOGY defect 1 '
  'and the reason tenancy could not be layered onto the legacy schema. The '
  'code is a human key unique within a tenant; the id is what everything else '
  'references, as half of a composite foreign key.';

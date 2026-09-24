-- 0019 — Daily progress reports, and the manpower recorded on them.
--
-- Forward-only. Never edit this file.
--
-- `DPR-01`..`DPR-03` (STACK-MIGRATION): the legacy stores a manpower count by
-- running it through `parseInt`, which takes a **prefix** of free text — so
-- `'12 workers'` becomes 12 and `'0x10'` becomes 16 — and a malformed value
-- becomes `NaN`, which then lowers the site total rather than failing. A
-- negative count subtracts.
--
-- The column here is `integer NOT NULL CHECK (count >= 0)`. A count that cannot
-- be represented is refused at the boundary by `headcount()` in
-- `services/siteops/src/domain/manpower.ts`, which raises rather than guessing.
-- The database is the second line of that, not the first.
--
-- Manpower is a separate table rather than a JSON blob on the report because
-- the per-trade breakdown is a query the legacy cannot answer at all: it stores
-- floors as nested JSON and totals them in the browser.

CREATE SCHEMA IF NOT EXISTS siteops AUTHORIZATION app_migrator;
GRANT USAGE ON SCHEMA siteops TO app_runtime;

CREATE TABLE siteops.daily_reports (
  tenant_id   uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id          uuid NOT NULL,
  project_id  uuid NOT NULL,

  -- The site date the report covers, not the timestamp it was typed. A weekly
  -- aggregate is built by naming the dates it expects and comparing; storing
  -- only a submission timestamp makes "which day is missing" unanswerable,
  -- which is the single thing a weekly report must get right.
  report_date date NOT NULL,

  submitted   boolean NOT NULL DEFAULT false,
  submitted_at timestamptz,
  notes       text NOT NULL DEFAULT '',

  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT daily_reports_pkey PRIMARY KEY (tenant_id, id),

  -- COMPOSITE: referential integrity is exempt from RLS, so a single-column FK
  -- would let one tenant attach a report to another tenant's project and
  -- confirm, by the insert succeeding, that the project exists.
  CONSTRAINT daily_reports_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE CASCADE,

  -- One report per project per day. Tenant-prefixed like every unique
  -- constraint here, because the violation message is readable.
  CONSTRAINT daily_reports_day_key UNIQUE (tenant_id, project_id, report_date),
  CONSTRAINT daily_reports_submitted_check CHECK (
    submitted = false OR submitted_at IS NOT NULL
  )
);

CREATE INDEX daily_reports_project_date_idx
  ON siteops.daily_reports (tenant_id, project_id, report_date DESC);

ALTER TABLE siteops.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE siteops.daily_reports FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON siteops.daily_reports AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON siteops.daily_reports AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON siteops.daily_reports TO app_runtime;

COMMENT ON TABLE siteops.daily_reports IS
  'One progress report per project per site date. The date is the day covered, '
  'not the moment of entry, because a weekly aggregate must be able to name '
  'the days that are missing.';

-- ------------------------------------------------------------- manpower ----

CREATE TABLE siteops.daily_manpower (
  tenant_id       uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id              uuid NOT NULL,
  daily_report_id uuid NOT NULL,

  floor           text NOT NULL,
  trade           text NOT NULL,

  -- Whole, non-negative. `DPR-01`: `parseInt` on free text silently accepts a
  -- prefix, and NaN then propagates into a site total.
  head_count      integer NOT NULL,

  CONSTRAINT daily_manpower_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT daily_manpower_report_fkey
    FOREIGN KEY (tenant_id, daily_report_id)
    REFERENCES siteops.daily_reports (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT daily_manpower_key UNIQUE (tenant_id, daily_report_id, floor, trade),
  CONSTRAINT daily_manpower_count_check CHECK (head_count >= 0)
);

CREATE INDEX daily_manpower_report_idx
  ON siteops.daily_manpower (tenant_id, daily_report_id);

ALTER TABLE siteops.daily_manpower ENABLE ROW LEVEL SECURITY;
ALTER TABLE siteops.daily_manpower FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON siteops.daily_manpower AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON siteops.daily_manpower AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON siteops.daily_manpower TO app_runtime;

COMMENT ON TABLE siteops.daily_manpower IS
  'Headcount per floor per trade for one daily report. A separate table rather '
  'than nested JSON, because the per-trade breakdown is a query the legacy '
  'cannot answer: it stores floors as JSON and totals them in the browser.';

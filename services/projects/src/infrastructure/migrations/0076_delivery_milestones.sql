-- Workflow 7 of eleven: delivery milestones.
--
-- **Verdict: THIN**, and three of the legacy's columns are the evidence:
--
--   `predecessor_id` is written (`design-build.js:1365`, `:1390`) and **read
--   nowhere**. Nothing checks that a predecessor finished, which is the entire
--   point of a predecessor. It is not built here: a field that looks like a
--   dependency and enforces nothing is worse than its absence, because people
--   fill it in and believe it. Real scheduling dependencies are a feature with
--   a design, not a column.
--
--   `site_readiness_gate` defaults to the literal `'Passed'` (`:1367`, `:1392`).
--   A gate whose default is "passed" is not a gate. Not built.
--
--   `is_critical_path` is stored and appears in no query. Not built.
--
-- What IS here is the part that carries information somebody uses: planned
-- against actual, and what a delay was caused by. Plus the two-week lookahead
-- (`getTwoWeekLookahead:1406`), which is small and real, and is computed rather
-- than stored.
--
-- Off by default — `tenancy.tenant_modules`, migration 0065.

CREATE TABLE projects.delivery_milestones (
  tenant_id  uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,

  name       text NOT NULL,
  -- Which trade it belongs to. Free text rather than a foreign key to
  -- `trade_packages`: a milestone can span trades ("first fix complete") and a
  -- required link would make somebody choose one arbitrarily.
  trade      text NOT NULL DEFAULT '',

  planned_start  date NOT NULL,
  planned_finish date NOT NULL,
  actual_start   date,
  actual_finish  date,

  -- not_started | in_progress | delayed | complete
  status     text NOT NULL DEFAULT 'not_started',

  -- Why it slipped, and what is being done. Both are the reason a delayed
  -- milestone is worth recording rather than just a late date.
  delay_reason  text NOT NULL DEFAULT '',
  recovery_plan text NOT NULL DEFAULT '',

  responsible_party text NOT NULL DEFAULT '',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT delivery_milestones_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT delivery_milestones_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT delivery_milestones_name_key UNIQUE (tenant_id, project_id, name),
  CONSTRAINT delivery_milestones_name_check CHECK (length(name) BETWEEN 1 AND 200),
  CONSTRAINT delivery_milestones_status_check CHECK (
    status IN ('not_started', 'in_progress', 'delayed', 'complete')
  ),
  -- A finish before its start is a typo that survives review, because both
  -- dates look plausible on their own.
  CONSTRAINT delivery_milestones_planned_check CHECK (planned_finish >= planned_start),
  CONSTRAINT delivery_milestones_actual_check CHECK (
    actual_start IS NULL OR actual_finish IS NULL OR actual_finish >= actual_start
  ),
  -- **A delay carries a reason.** A status of 'delayed' with nothing beside it
  -- is a flag on a screen that tells nobody anything, and it is what makes a
  -- delay report worth reading three weeks later.
  CONSTRAINT delivery_milestones_delay_check CHECK (
    status <> 'delayed' OR length(delay_reason) > 0
  ),
  -- A complete milestone finished on a day.
  CONSTRAINT delivery_milestones_complete_check CHECK (
    status <> 'complete' OR actual_finish IS NOT NULL
  )
);

CREATE INDEX delivery_milestones_tenant_idx ON projects.delivery_milestones (tenant_id);
-- The lookahead's read: what starts soon and is not finished.
CREATE INDEX delivery_milestones_lookahead_idx
  ON projects.delivery_milestones (tenant_id, project_id, planned_start);

ALTER TABLE projects.delivery_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.delivery_milestones FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects.delivery_milestones AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON projects.delivery_milestones AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON projects.delivery_milestones FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON projects.delivery_milestones TO app_runtime;

COMMENT ON TABLE projects.delivery_milestones IS
  'Site milestones, planned against actual. No predecessor, no critical-path flag and no readiness gate: the legacy stores all three and reads none.';

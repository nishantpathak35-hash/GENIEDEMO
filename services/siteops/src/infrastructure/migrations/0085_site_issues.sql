-- 0085 — site issues: what is wrong on site, raised by a report, resolved by a person.
--
-- Forward-only. Never edit this file.
--
-- The Site screen draws "Open site issues" and the daily report carried no
-- issues at all (DATA-11) — a report said what was done and who was there,
-- and a thing that stopped work went into `notes` where nothing could count
-- it. An issue is its own row so it can be raised on one day, stay open
-- across the reports that follow, and be resolved on another day by whoever
-- fixed it — a count of open issues is then a fact, not a phrase in a note.
--
-- Raised against a project, optionally from the report of the day it was
-- noticed. The report link is SET NULL on delete: an issue outlives the
-- report that first mentioned it. Severity is the design's three words, and
-- "blocking" is what the handover checklist and the Today hero care about.

CREATE TABLE siteops.site_issues (
  tenant_id       uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL,
  daily_report_id uuid,

  title           text NOT NULL,
  severity        text NOT NULL DEFAULT 'minor',
  raised_on       date NOT NULL DEFAULT CURRENT_DATE,
  raised_by       text NOT NULL,

  resolved_on     date,
  resolved_by     text,
  resolution      text NOT NULL DEFAULT '',

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT site_issues_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT site_issues_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT site_issues_report_fkey
    FOREIGN KEY (tenant_id, daily_report_id)
    REFERENCES siteops.daily_reports (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT site_issues_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT site_issues_severity_check CHECK (severity IN ('minor', 'major', 'blocking')),
  -- Resolved carries who and when, or is not resolved.
  CONSTRAINT site_issues_resolution_check CHECK (
    (resolved_on IS NULL) = (resolved_by IS NULL)
  ),
  CONSTRAINT site_issues_resolved_after_raised_check CHECK (
    resolved_on IS NULL OR resolved_on >= raised_on
  )
);

-- The open count per project is the query every screen asks.
CREATE INDEX site_issues_open_idx
  ON siteops.site_issues (tenant_id, project_id) WHERE resolved_on IS NULL;

ALTER TABLE siteops.site_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE siteops.site_issues FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON siteops.site_issues AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON siteops.site_issues AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON siteops.site_issues FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON siteops.site_issues TO app_runtime;

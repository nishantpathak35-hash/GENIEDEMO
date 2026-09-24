-- Workflow 9 of eleven: warranty claims after handover.
--
-- **Verdict: THIN**, and the defaults are the whole case.
-- `saveWarrantyCase:1660` invents an **SLA target of seven days from now** when
-- none is given — a service-level commitment fabricated by software, which is a
-- promise nobody made. It also defaults `category` to `'Carpentry'` (`:1673`),
-- `assigned_contractor` to `'General Works'` (`:1676`) and `client_name` to the
-- literal `'Client'` (`:1670`): a trade, a contractor and a customer invented
-- for a claim. And **nothing reads `sla_target_date`** — no escalation, no
-- overdue list, no report.
--
-- **None of the four defaults exists here.** `respond_by` is nullable and
-- nothing fills it in; when somebody does set one, it is read — an unresolved
-- claim past its date is reported as overdue. A date nothing looks at is
-- decoration, and the legacy has one.
--
-- Off by default — `tenancy.tenant_modules`, migration 0065.

CREATE TABLE projects.warranty_cases (
  tenant_id  uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,

  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  -- What kind of work. Free text and **no default**: the legacy assumes
  -- `'Carpentry'`, so an electrical fault filed in a hurry is a carpentry claim.
  category    text NOT NULL DEFAULT '',

  reported_on date NOT NULL DEFAULT current_date,

  -- When it was promised by, if anything was promised. **NULLABLE, and nothing
  -- writes a default.** The legacy invents seven days from now.
  respond_by  date,

  -- Who is fixing it. Free text, no default: `'General Works'` is not a
  -- contractor.
  assigned_to text NOT NULL DEFAULT '',

  -- reported | in_progress | resolved | rejected
  status      text NOT NULL DEFAULT 'reported',

  resolution_notes        text NOT NULL DEFAULT '',
  resolution_evidence_url text NOT NULL DEFAULT '',
  closed_at   timestamptz,

  raised_by  uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT warranty_cases_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT warranty_cases_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT warranty_cases_raised_by_fkey
    FOREIGN KEY (tenant_id, raised_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,

  CONSTRAINT warranty_cases_title_check CHECK (length(title) BETWEEN 1 AND 200),
  CONSTRAINT warranty_cases_status_check CHECK (
    status IN ('reported', 'in_progress', 'resolved', 'rejected')
  ),
  -- A response date before the claim was reported is a typo.
  CONSTRAINT warranty_cases_respond_check CHECK (respond_by IS NULL OR respond_by >= reported_on),
  -- **A closed claim says what was done about it.** "Resolved" with nothing
  -- beside it is the row a client asks about six months later and nobody can
  -- answer. A rejection needs a reason for the same reason.
  CONSTRAINT warranty_cases_closed_check CHECK (
    status IN ('reported', 'in_progress')
    OR (closed_at IS NOT NULL AND length(resolution_notes) > 0)
  )
);

CREATE INDEX warranty_cases_tenant_idx ON projects.warranty_cases (tenant_id);
CREATE INDEX warranty_cases_project_idx ON projects.warranty_cases (tenant_id, project_id, status);
-- The overdue read: open claims with a date that has passed. This index is the
-- difference between a promised date and a decorative one.
CREATE INDEX warranty_cases_respond_idx
  ON projects.warranty_cases (tenant_id, respond_by)
  WHERE status IN ('reported', 'in_progress') AND respond_by IS NOT NULL;

ALTER TABLE projects.warranty_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.warranty_cases FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects.warranty_cases AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON projects.warranty_cases AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON projects.warranty_cases FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON projects.warranty_cases TO app_runtime;

COMMENT ON COLUMN projects.warranty_cases.respond_by IS
  'When it was promised by, if anything was promised. Nullable and never defaulted: the legacy invents seven days and then reads the column nowhere.';

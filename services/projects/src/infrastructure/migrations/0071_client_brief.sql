-- Workflow 1 of eleven: the client brief, and the rooms it covers.
--
-- **Verdict: SOLID.** See `docs/ports/design-build-workflows.md`. The rule that
-- earns it is at `design-build.js:222-233` and `:242-244`: a brief the client
-- has ACKNOWLEDGED cannot be edited in place. Editing creates a new version and
-- an in-place edit is refused outright — *"Cannot modify acknowledged brief
-- in-place. Create a new version revision to update scope after client
-- signature."* Nobody writes that without having had the argument it prevents.
--
-- **Off by default**, like all eleven: `tenancy.tenant_modules`, migration 0065.
--
-- What is NOT carried over from the legacy's table:
--
--   The project as a NAME (`LOWER(project) = LOWER(?)`). Here it is a composite
--   foreign key to `projects.projects`.
--
--   `decision_makers`, `client_supplied_items`, `assumptions` and `exclusions`
--   as four JSON blobs. They are four kinds of the same thing — a list of
--   statements attached to a brief — so they are rows in `brief_statements`,
--   which can be counted, ordered and read one at a time by a client.
--
--   Budgets as `Number(...)`. Paise, bigint, like every other amount here.
--
--   `acknowledged_by` holding `session?.name || session?.email || 'Client'`. A
--   display name is not an identity and cannot be joined on; worse, the string
--   'Client' is what it records when it knows nothing at all. Here it is a
--   principal or it is nothing.

CREATE TABLE projects.client_briefs (
  tenant_id  uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,

  -- Versions of ONE project's brief. Version 1 is the first; an acknowledged
  -- brief is superseded by version n+1 rather than edited.
  version    integer NOT NULL DEFAULT 1,

  -- draft      — being written, freely editable
  -- issued     — sent to the client, still editable by us
  -- acknowledged — the client has said yes. FROZEN.
  -- superseded — a later version exists
  status     text NOT NULL DEFAULT 'draft',

  engagement_type text NOT NULL DEFAULT '',
  scope_summary   text NOT NULL DEFAULT '',

  -- Paise, and NULLABLE. A budget nobody has stated is absent, not zero: the
  -- legacy writes `Number(payload.budgetMin ?? 0)`, so "we have not discussed
  -- the budget" and "the budget is nothing" become the same row.
  budget_min_paise bigint,
  budget_max_paise bigint,

  target_start_date      date,
  target_completion_date date,

  -- Who on the client's side may say yes. Free text, because it is a job title
  -- at another company and this system has no identity for them.
  approval_authority text NOT NULL DEFAULT '',

  acknowledged_at timestamptz,
  acknowledged_by uuid,

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT client_briefs_pkey PRIMARY KEY (tenant_id, id),

  CONSTRAINT client_briefs_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT client_briefs_acknowledged_by_fkey
    FOREIGN KEY (tenant_id, acknowledged_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT client_briefs_created_by_fkey
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,

  -- One row per version per project. Includes tenant_id, like every unique
  -- constraint here, so a violation cannot report another tenant's project id.
  CONSTRAINT client_briefs_version_key UNIQUE (tenant_id, project_id, version),

  CONSTRAINT client_briefs_status_check
    CHECK (status IN ('draft', 'issued', 'acknowledged', 'superseded')),
  CONSTRAINT client_briefs_version_check CHECK (version >= 1),
  CONSTRAINT client_briefs_budget_check CHECK (
    (budget_min_paise IS NULL OR budget_min_paise >= 0)
    AND (budget_max_paise IS NULL OR budget_max_paise >= 0)
    -- A maximum below the minimum is a typo, and it is one that survives review
    -- because both numbers look plausible on their own.
    AND (budget_min_paise IS NULL OR budget_max_paise IS NULL
         OR budget_max_paise >= budget_min_paise)
  ),
  CONSTRAINT client_briefs_dates_check CHECK (
    target_start_date IS NULL OR target_completion_date IS NULL
    OR target_completion_date >= target_start_date
  ),

  -- **Acknowledgement carries who and when, or it did not happen.** A brief
  -- marked acknowledged with nobody's name against it is the state the legacy
  -- reaches whenever the session has no name, and it is worse than an
  -- unacknowledged brief because it looks settled.
  CONSTRAINT client_briefs_acknowledged_check CHECK (
    (status <> 'acknowledged')
    OR (acknowledged_at IS NOT NULL AND acknowledged_by IS NOT NULL)
  )
);

CREATE INDEX client_briefs_tenant_idx  ON projects.client_briefs (tenant_id);
CREATE INDEX client_briefs_project_idx ON projects.client_briefs (tenant_id, project_id, version DESC);

ALTER TABLE projects.client_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.client_briefs FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects.client_briefs AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON projects.client_briefs AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON projects.client_briefs FROM PUBLIC;
-- No DELETE. A brief is superseded, never removed: it is what the client agreed
-- to at a point in time, and the version that was agreed has to stay readable.
GRANT SELECT, INSERT, UPDATE ON projects.client_briefs TO app_runtime;

-- ------------------------------------------------------------------------ --

-- The statements attached to a brief.
--
-- One table with a `kind` rather than four JSON columns. `decision_makers`,
-- `client_supplied_items`, `assumptions` and `exclusions` are the same shape —
-- an ordered list of sentences that belong to a version of a brief — and as
-- rows they can be counted, reordered, and read back one at a time by a client
-- who is being asked to agree to them.
CREATE TABLE projects.brief_statements (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id        uuid NOT NULL DEFAULT gen_random_uuid(),
  brief_id  uuid NOT NULL,

  kind      text NOT NULL,
  body      text NOT NULL,
  position  integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT brief_statements_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT brief_statements_brief_fkey
    FOREIGN KEY (tenant_id, brief_id)
    REFERENCES projects.client_briefs (tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT brief_statements_kind_check
    CHECK (kind IN ('decision_maker', 'client_supplied', 'assumption', 'exclusion')),
  CONSTRAINT brief_statements_body_check CHECK (length(body) BETWEEN 1 AND 1000)
);

CREATE INDEX brief_statements_brief_idx
  ON projects.brief_statements (tenant_id, brief_id, kind, position);

ALTER TABLE projects.brief_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.brief_statements FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects.brief_statements AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON projects.brief_statements AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON projects.brief_statements FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON projects.brief_statements TO app_runtime;

-- ------------------------------------------------------------------------ --

-- The rooms a brief covers.
CREATE TABLE projects.brief_rooms (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id        uuid NOT NULL DEFAULT gen_random_uuid(),
  brief_id  uuid NOT NULL,

  room_name text NOT NULL,
  -- Whole square feet. Integer, not a float: an area that arrives as 412.7 and
  -- comes back as 412.69999999999999 is a number people stop trusting, and
  -- nothing in a brief needs a fraction of a square foot.
  area_sqft integer,
  headcount integer,
  purpose   text NOT NULL DEFAULT '',
  -- What the room needs, in the client's words. The legacy keeps an
  -- `appliance_specs` JSON array here; a requirement in a brief is a sentence,
  -- and turning it into a structure invents a schema for something nobody has
  -- specified yet.
  requirements text NOT NULL DEFAULT '',
  position  integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT brief_rooms_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT brief_rooms_brief_fkey
    FOREIGN KEY (tenant_id, brief_id)
    REFERENCES projects.client_briefs (tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT brief_rooms_name_key UNIQUE (tenant_id, brief_id, room_name),
  CONSTRAINT brief_rooms_name_check CHECK (length(room_name) BETWEEN 1 AND 120),
  CONSTRAINT brief_rooms_area_check CHECK (area_sqft IS NULL OR area_sqft > 0),
  CONSTRAINT brief_rooms_headcount_check CHECK (headcount IS NULL OR headcount >= 0)
);

CREATE INDEX brief_rooms_brief_idx ON projects.brief_rooms (tenant_id, brief_id, position);

ALTER TABLE projects.brief_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.brief_rooms FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects.brief_rooms AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON projects.brief_rooms AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON projects.brief_rooms FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON projects.brief_rooms TO app_runtime;

COMMENT ON TABLE projects.client_briefs IS
  'What the client asked for, by version. An acknowledged version is frozen: editing it creates the next one.';

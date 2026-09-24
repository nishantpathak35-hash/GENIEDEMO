-- Workflow 6 of eleven: bespoke joinery, from measurement to acceptance.
--
-- **Verdict: SOLID**, on two pieces of evidence.
--
-- The rule: `advanceJoineryStage:1280-1288` refuses to advance a stage while
-- any earlier one is incomplete, and names the ones outstanding. You cannot
-- reach Factory Fabrication before Shop Drawing Approval is signed off — which
-- is the whole reason a joinery package is tracked separately from a purchase
-- order in the first place.
--
-- The vocabulary: nine stages, in this order (`:1166-1176`) — Site Measurement,
-- Shop Drawing Approval, Finish / Sample Approval, Factory Fabrication, Factory
-- Quality Inspection, Dispatch from Works, Site Receipt, Installation, Final
-- Client Acceptance. **Nobody sketches that list.** It comes from watching a
-- workshop, and it is ported as-is rather than shortened, because the two
-- inspection stages and the separation of dispatch from receipt are exactly the
-- points where things go wrong.
--
-- Off by default — `tenancy.tenant_modules`, migration 0065.

CREATE TABLE projects.joinery_packages (
  tenant_id  uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,

  name       text NOT NULL,
  room_label text NOT NULL DEFAULT '',

  -- Which workshop is making it. **Text, and not a vendor id**, deliberately:
  -- `services/projects` may not reference `procurement.vendors` (M1/D5), and a
  -- single-column foreign key across that boundary is exactly the shortcut this
  -- architecture exists to prevent. When joinery needs to be ordered against a
  -- vendor it will be a purchase order, which is where vendors live.
  workshop   text NOT NULL DEFAULT '',

  -- The stage it is waiting on, or 'completed'. Denormalised from the stage
  -- rows on purpose: it is read on every list and derived by the only function
  -- that can change it.
  current_stage text NOT NULL DEFAULT '',

  target_install_date date,
  notes      text NOT NULL DEFAULT '',

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT joinery_packages_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT joinery_packages_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT joinery_packages_created_by_fkey
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,

  CONSTRAINT joinery_packages_name_check CHECK (length(name) BETWEEN 1 AND 200)
);

CREATE INDEX joinery_packages_tenant_idx  ON projects.joinery_packages (tenant_id);
CREATE INDEX joinery_packages_project_idx ON projects.joinery_packages (tenant_id, project_id);

ALTER TABLE projects.joinery_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.joinery_packages FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects.joinery_packages AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON projects.joinery_packages AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON projects.joinery_packages FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON projects.joinery_packages TO app_runtime;

-- ------------------------------------------------------------------------ --

-- The stages of one package, in order.
CREATE TABLE projects.joinery_stages (
  tenant_id  uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL,

  position   integer NOT NULL,
  name       text NOT NULL,

  -- pending | completed. There is no 'in progress': a stage is either signed
  -- off or it is not, and the thing people need to know is which stage the
  -- package is stuck at.
  status     text NOT NULL DEFAULT 'pending',

  -- What proves it happened. A photograph of the sample, the approved shop
  -- drawing, the dispatch note.
  evidence_url text NOT NULL DEFAULT '',
  notes        text NOT NULL DEFAULT '',

  completed_at timestamptz,
  -- Who signed it off, as a PRINCIPAL. The legacy stores
  -- `session?.name || session?.email || 'Inspector'`, so a session with no name
  -- signs off a factory quality inspection as the string "Inspector".
  completed_by uuid,

  CONSTRAINT joinery_stages_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT joinery_stages_package_fkey
    FOREIGN KEY (tenant_id, package_id)
    REFERENCES projects.joinery_packages (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT joinery_stages_completed_by_fkey
    FOREIGN KEY (tenant_id, completed_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,

  CONSTRAINT joinery_stages_position_key UNIQUE (tenant_id, package_id, position),
  CONSTRAINT joinery_stages_status_check CHECK (status IN ('pending', 'completed')),

  -- **A completed stage carries who and when.** A sign-off with nobody against
  -- it is the state the legacy reaches whenever the session has no name, and on
  -- a quality inspection that is worse than no sign-off at all.
  CONSTRAINT joinery_stages_completed_check CHECK (
    status <> 'completed' OR (completed_at IS NOT NULL AND completed_by IS NOT NULL)
  )
);

CREATE INDEX joinery_stages_package_idx
  ON projects.joinery_stages (tenant_id, package_id, position);

ALTER TABLE projects.joinery_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.joinery_stages FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects.joinery_stages AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON projects.joinery_stages AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON projects.joinery_stages FROM PUBLIC;
-- No DELETE. A stage that was signed off and then removed takes the evidence
-- with it.
GRANT SELECT, INSERT, UPDATE ON projects.joinery_stages TO app_runtime;

COMMENT ON TABLE projects.joinery_stages IS
  'The nine stages of a joinery package, in order. A stage cannot be signed off while an earlier one is outstanding.';

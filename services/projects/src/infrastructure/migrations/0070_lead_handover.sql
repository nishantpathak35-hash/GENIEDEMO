-- Handing a won opportunity to the people who will build it.
--
-- The moment sales stops owning a job and delivery starts. `CrmHandoverModal.js`
-- is the legacy's version and the useful part of it is the checklist: scope
-- confirmed, commercials confirmed, letter of intent received. Everything after
-- that modal — the project, its purchase orders, its BOQ — is built on those
-- three answers, and in the legacy they are collected and thrown away. Nothing
-- stores them, so six weeks later "was the scope signed off before we started
-- ordering" has no answer.
--
-- **Two of the three are a GATE and one is a FACT.**
--
--   `scope_confirmed` and `commercials_confirmed` are refused when false. A
--   project handed over with a scope nobody confirmed is the origin of the
--   variation argument that follows, and there is no reading of "we handed over
--   without agreeing what we are building" that is a decision rather than an
--   oversight.
--
--   `loi_received` is recorded either way. Starting work on a verbal commitment
--   while the paperwork follows is an ordinary commercial judgement in this
--   trade, and a system that refuses it is a system people work around. What it
--   must not do is let the fact go unrecorded — so if a letter of intent is
--   claimed, its date is required.
--
-- One handover per opportunity. A second one would mean the job was handed over
-- twice, which is either a mistake or a different job.

CREATE TABLE projects.lead_handovers (
  tenant_id  uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id         uuid NOT NULL DEFAULT gen_random_uuid(),

  lead_id    uuid NOT NULL,
  -- The project the handover created. Not nullable: a handover that produced no
  -- project is a form somebody filled in.
  project_id uuid NOT NULL,

  scope_confirmed       boolean NOT NULL,
  commercials_confirmed boolean NOT NULL,

  loi_received boolean NOT NULL DEFAULT false,
  loi_date     date,

  notes      text NOT NULL DEFAULT '',

  handed_by  uuid,
  handed_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lead_handovers_pkey PRIMARY KEY (tenant_id, id),

  -- Composite, all three: referential integrity is exempt from RLS, so a
  -- single-column FK would confirm another tenant's project exists by whether
  -- the insert succeeded.
  CONSTRAINT lead_handovers_lead_fkey
    FOREIGN KEY (tenant_id, lead_id)
    REFERENCES projects.leads (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT lead_handovers_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT lead_handovers_by_fkey
    FOREIGN KEY (tenant_id, handed_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,

  CONSTRAINT lead_handovers_lead_key UNIQUE (tenant_id, lead_id),

  -- The gate, in the database rather than only in a route. A second caller
  -- added later cannot write a handover that skipped the confirmations.
  CONSTRAINT lead_handovers_confirmed_check
    CHECK (scope_confirmed AND commercials_confirmed),

  -- A claimed letter of intent carries its date. "We have an LOI" with no date
  -- is the shape of a fact nobody checked.
  CONSTRAINT lead_handovers_loi_check
    CHECK ((NOT loi_received AND loi_date IS NULL) OR (loi_received AND loi_date IS NOT NULL)),

  CONSTRAINT lead_handovers_notes_check CHECK (length(notes) <= 4000)
);

CREATE INDEX lead_handovers_tenant_idx  ON projects.lead_handovers (tenant_id);
CREATE INDEX lead_handovers_project_idx ON projects.lead_handovers (tenant_id, project_id);

ALTER TABLE projects.lead_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.lead_handovers FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects.lead_handovers AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON projects.lead_handovers AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON projects.lead_handovers FROM PUBLIC;
-- **No UPDATE and no DELETE.** This records what was true at the moment a job
-- moved from sales to delivery. A record that can be edited afterwards answers
-- nothing, in the same way `workflow.audit_events` and `projects.lead_merges`
-- answer nothing if they can be rewritten.
GRANT SELECT, INSERT ON projects.lead_handovers TO app_runtime;

COMMENT ON TABLE projects.lead_handovers IS
  'What was confirmed at the moment a won opportunity became a project. Append-only by grant.';

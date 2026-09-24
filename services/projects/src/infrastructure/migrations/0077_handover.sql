-- Workflow 8 of eleven: handing the finished job to the client.
--
-- **Verdict: SOLID.** `generateHandoverPack:1604-1612` refuses to issue the
-- pack while any punch item of severity `Critical` is unrectified, and says how
-- many remain. A handover that can be issued over open critical defects is a
-- handover nobody would trust, and that refusal is the reason this workflow is
-- a process rather than a form.
--
-- Also real, and ported: rectification requires an after-photo and records who
-- verified it (`rectifyHandoverItem:1588-1594`), against the before-photo taken
-- when the item was raised.
--
-- **What is not ported:** `generateHandoverPack` returns a `documentUrl`
-- pointing at `/api/handover-packs/<project>-closeout.pdf`, an endpoint that
-- does not exist, alongside a `content` field holding a JSON string of the same
-- counts. A link to a document nobody generates is worse than no link: somebody
-- sends it to a client. Here issuing a handover records that it was issued,
-- with the counts as they stood; the document is a thing somebody produces.
--
-- Off by default — `tenancy.tenant_modules`, migration 0065.

CREATE TABLE projects.handover_items (
  tenant_id  uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,

  room_label text NOT NULL DEFAULT '',
  -- snag | defect | incomplete
  kind       text NOT NULL DEFAULT 'snag',
  description text NOT NULL,

  -- minor | major | critical. **`critical` is the one with a consequence** —
  -- it blocks the handover — so it is a closed vocabulary rather than free
  -- text, and there is no default of 'Minor': somebody raising a defect says
  -- how bad it is.
  severity   text NOT NULL,

  -- open | rectified | accepted
  status     text NOT NULL DEFAULT 'open',

  -- The evidence, before and after. The before is taken when the item is
  -- raised; the after is required to rectify it.
  before_photo_url text NOT NULL DEFAULT '',
  after_photo_url  text NOT NULL DEFAULT '',

  -- Who is fixing it. Free text: it is usually a subcontractor's foreman, who
  -- has no login here.
  assigned_to text NOT NULL DEFAULT '',

  rectified_at timestamptz,
  verified_by  uuid,
  notes        text NOT NULL DEFAULT '',

  raised_by  uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT handover_items_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT handover_items_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT handover_items_verified_by_fkey
    FOREIGN KEY (tenant_id, verified_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT handover_items_raised_by_fkey
    FOREIGN KEY (tenant_id, raised_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,

  CONSTRAINT handover_items_kind_check CHECK (kind IN ('snag', 'defect', 'incomplete')),
  CONSTRAINT handover_items_severity_check CHECK (severity IN ('minor', 'major', 'critical')),
  CONSTRAINT handover_items_status_check CHECK (status IN ('open', 'rectified', 'accepted')),
  CONSTRAINT handover_items_description_check CHECK (length(description) BETWEEN 1 AND 2000),

  -- **Rectified means there is proof and somebody stood behind it.** An item
  -- marked fixed with no photograph and nobody's name is the row that gets
  -- ticked to clear a list, and the whole value of a punch list is that it
  -- cannot be.
  CONSTRAINT handover_items_rectified_check CHECK (
    status = 'open'
    OR (rectified_at IS NOT NULL AND verified_by IS NOT NULL AND length(after_photo_url) > 0)
  )
);

CREATE INDEX handover_items_tenant_idx ON projects.handover_items (tenant_id);
-- The read the handover gate makes: are there critical items still open.
CREATE INDEX handover_items_blocking_idx
  ON projects.handover_items (tenant_id, project_id, severity, status);

ALTER TABLE projects.handover_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.handover_items FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects.handover_items AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON projects.handover_items AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON projects.handover_items FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON projects.handover_items TO app_runtime;

-- ------------------------------------------------------------------------ --

-- That the job was handed over, and what was true when it was.
CREATE TABLE projects.handover_records (
  tenant_id  uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,

  -- The counts AT THE MOMENT of handover, copied rather than joined. The items
  -- go on being worked on afterwards — a minor snag closed next week must not
  -- change what the handover said.
  total_items     integer NOT NULL,
  rectified_items integer NOT NULL,
  open_minor      integer NOT NULL,

  notes      text NOT NULL DEFAULT '',

  issued_by  uuid,
  issued_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT handover_records_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT handover_records_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT handover_records_issued_by_fkey
    FOREIGN KEY (tenant_id, issued_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,

  -- One handover per project. A second one means the job was handed over twice.
  CONSTRAINT handover_records_project_key UNIQUE (tenant_id, project_id),
  CONSTRAINT handover_records_counts_check CHECK (
    total_items >= 0 AND rectified_items >= 0 AND open_minor >= 0
  )
);

CREATE INDEX handover_records_tenant_idx ON projects.handover_records (tenant_id);

ALTER TABLE projects.handover_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.handover_records FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects.handover_records AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON projects.handover_records AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON projects.handover_records FROM PUBLIC;
-- Append-only: what was true at handover is what it said at handover.
GRANT SELECT, INSERT ON projects.handover_records TO app_runtime;

COMMENT ON TABLE projects.handover_records IS
  'That a job was handed over, and the punch-list counts as they stood. Append-only. Issuing is refused while any critical item is open.';

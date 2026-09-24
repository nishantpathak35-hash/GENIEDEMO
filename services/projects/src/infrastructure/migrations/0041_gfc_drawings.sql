-- 0041 — GFC drawings.
--
-- Forward-only. Never edit this file.
--
-- **GFC-01: the legacy invents a URL when no file is chosen.**
-- `DesignView.js:117` falls back to
-- `https://luxeworx-vault.s3.amazonaws.com/gfc/${drawingNo.toLowerCase()}.pdf`
-- — a hardcoded bucket belonging to one tenant, and a link to a file that may
-- not exist. A drawing record pointing at nothing is worse than no record,
-- because it reads as though the drawing was issued.
--
-- **GFC-02: a chosen file is base64-encoded into the URL column.**
-- `DesignView.js:87-100` reads it with `readAsDataURL` and passes the whole
-- data URL as `fileUrl`, which lands in `gfc_drawings.file_url TEXT`. Same
-- failure as VAULT-02, in a different table.
--
-- Here a drawing references `workflow.documents` — the vault — or nothing at
-- all. There is no URL column to invent a URL into.
--
-- **GFC-03: superseding matches the project by name.**
-- `change-orders.js:146` does
-- `WHERE LOWER(project) = LOWER(?) AND LOWER(drawing_no) = LOWER(?)`. Project is
-- a `project_id` here, and the revision chain is a unique constraint rather
-- than a string comparison.

CREATE TABLE projects.gfc_drawings (
  tenant_id   uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id          uuid NOT NULL,
  project_id  uuid NOT NULL,

  drawing_no  text NOT NULL,
  title       text NOT NULL,
  category    text NOT NULL DEFAULT 'architectural',
  revision    text NOT NULL,

  status      text NOT NULL DEFAULT 'active',

  -- The drawing file, in the vault. NULL means the record exists and the file
  -- has not been attached — an honest state the legacy cannot represent,
  -- because it invents a URL instead (GFC-01).
  --
  -- No composite FK: `workflow.documents` is another service's table and
  -- `projects` references nothing outside itself. The application checks it,
  -- and a missing document reads as "not attached" rather than dangling.
  document_id uuid,

  uploaded_by uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gfc_drawings_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT gfc_drawings_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT gfc_drawings_uploaded_by_fkey
    FOREIGN KEY (tenant_id, uploaded_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE RESTRICT,
  -- One revision of one drawing number per project. Superseding is inserting
  -- the next revision, not editing the last one.
  CONSTRAINT gfc_drawings_revision_key UNIQUE (tenant_id, project_id, drawing_no, revision),
  CONSTRAINT gfc_drawings_status_check CHECK (status IN ('active', 'superseded', 'withdrawn')),
  CONSTRAINT gfc_drawings_category_check CHECK (
    category IN ('architectural', 'structural', 'mep', 'interior', 'other')
  )
);

CREATE INDEX gfc_drawings_project_idx
  ON projects.gfc_drawings (tenant_id, project_id, drawing_no);

-- At most one active revision per drawing number per project. A partial unique
-- index, because the rule is about the active rows only.
CREATE UNIQUE INDEX gfc_drawings_one_active
  ON projects.gfc_drawings (tenant_id, project_id, drawing_no)
  WHERE status = 'active';

ALTER TABLE projects.gfc_drawings ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.gfc_drawings FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects.gfc_drawings AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON projects.gfc_drawings AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
REVOKE ALL ON projects.gfc_drawings FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON projects.gfc_drawings TO app_runtime;

COMMENT ON TABLE projects.gfc_drawings IS
  'Good-for-construction drawings. The file lives in workflow.documents; there '
  'is no URL column, so there is nothing to invent a URL into (GFC-01) and no '
  'column to base64 a PDF into (GFC-02). One active revision per drawing '
  'number per project, enforced by a partial unique index.';

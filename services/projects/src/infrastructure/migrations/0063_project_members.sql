-- Who is on a project.
--
-- `project_team` has been one of the seventeen modules in the role model since
-- migration `0024` — a screen a role can be granted, with no table behind it.
-- `docs/ports/design-build-and-work.md` recorded that as a real gap rather than
-- closing it, and this closes it.
--
-- It matters more than a membership list usually would, because it is the first
-- scope in this system NARROWER THAN A TENANT. Row-level security answers "may
-- this connection see this tenant's rows"; it has nothing to say about whether
-- a site engineer on the Sector 62 fitout may read the team of a project across
-- the city. That is an authorisation question, it is answered in the
-- application, and the isolation suite tests it as one — two principals in the
-- SAME tenant, where RLS contributes nothing at all.

CREATE TABLE projects.project_members (
  tenant_id    uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id           uuid NOT NULL DEFAULT gen_random_uuid(),

  project_id   uuid NOT NULL,
  principal_id uuid NOT NULL,

  -- What they do ON THIS PROJECT — "Site engineer", "Project manager".
  --
  -- NOT an authorisation role, and deliberately not drawn from
  -- `identity.role_catalog`. What somebody is permitted to do is a tenant-wide
  -- grant; what they are called on a particular job is a label a project
  -- manager types. Conflating the two is how a free-text field ends up being
  -- compared against a permission — the shape of `contact.role` before
  -- migration 0061 renamed it to `designation`.
  designation  text NOT NULL DEFAULT '',

  added_by     uuid,
  added_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT project_members_pkey PRIMARY KEY (tenant_id, id),

  -- COMPOSITE, both of them. Referential integrity is exempt from RLS, so a
  -- single-column FK would let one tenant attach a member to another tenant's
  -- project and confirm, by the insert succeeding, that the project exists.
  CONSTRAINT project_members_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT project_members_principal_fkey
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES identity.principals (tenant_id, id) ON DELETE CASCADE,

  -- Includes tenant_id, like every unique constraint here: without it the
  -- violation message leaks another tenant's principal and project ids through
  -- `DETAIL: Key (project_id, principal_id)=(...) already exists`.
  CONSTRAINT project_members_unique UNIQUE (tenant_id, project_id, principal_id),

  CONSTRAINT project_members_designation_check CHECK (length(designation) <= 80)
);

CREATE INDEX project_members_tenant_idx  ON projects.project_members (tenant_id);
CREATE INDEX project_members_project_idx ON projects.project_members (tenant_id, project_id);
-- The lookup the authorisation check makes on every project-scoped read:
-- "is this principal on this project".
CREATE INDEX project_members_principal_idx
  ON projects.project_members (tenant_id, principal_id);

ALTER TABLE projects.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.project_members FORCE  ROW LEVEL SECURITY;

-- The pair. One permissive policy is not isolation: policies are PERMISSIVE by
-- default and permissive policies are OR-ed, so a later `USING (true)` opens
-- the table while still satisfying "the table has a policy". The RESTRICTIVE
-- half is what makes that addition inert.
CREATE POLICY tenant_isolation ON projects.project_members AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON projects.project_members AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON projects.project_members FROM PUBLIC;
-- No TRUNCATE, ever: it is not subject to row-level security.
GRANT SELECT, INSERT, UPDATE, DELETE ON projects.project_members TO app_runtime;

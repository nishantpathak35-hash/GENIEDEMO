-- External principals: which vendor, or which project, a non-staff principal
-- is entitled to.
--
-- `identity.principals.kind` has carried 'vendor' and 'client' since 0003, so
-- the DISTINCTION has existed in the schema from the beginning. What has not
-- existed is anything that NARROWS such a principal to its own rows — which
-- means a vendor principal created today would see everything its tenant sees,
-- including every other vendor's pricing. M6 calls that "the central piece of
-- work in this milestone, and it is a policy problem, not a UI problem".
--
-- This table is that policy's data. It is deliberately not a column on
-- `principals`, because the relation is many-to-many in both directions: one
-- login may cover several of a group's vendor records, and a client contact may
-- follow more than one project.
--
-- ---------------------------------------------------------------------------
--
-- **There is no foreign key to `procurement.vendors` or `projects.projects`,
-- and that is a decision rather than an oversight.**
--
-- A cross-schema FK here would make `identity` structurally depend on two
-- services it must not know about — the boundary `eslint.config.mjs` enforces
-- in code would hold everywhere except in the schema. The trade-off is stated
-- rather than hidden:
--
--   * A dangling link **fails closed**. The scope query joins to the subject
--     table, so a link naming a vendor that no longer exists matches no rows
--     and the portal shows nothing. That is the safe direction.
--   * Ids are `gen_random_uuid()` and are never reused, so a dangling link
--     cannot come to point at a different vendor later.
--   * What is lost is `ON DELETE` cleanup: deleting a vendor leaves an inert
--     link row. Deleting a vendor is already refused while any purchase order
--     references it (`0033`), so this is a narrow case, and an inert row that
--     grants nothing is preferable to a boundary violation.
--
-- The service that OWNS the subject validates it at write time: provisioning a
-- vendor login reads the vendor through procurement first, and refuses if it is
-- not there.

CREATE TABLE identity.principal_links (
  tenant_id    uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id           uuid NOT NULL DEFAULT gen_random_uuid(),

  principal_id uuid NOT NULL,

  -- 'vendor' or 'client'. Matches the principal's own `kind`, and the CHECK
  -- below is the closed set — a link of an unknown kind grants nothing, but it
  -- should not be storable in the first place.
  subject_kind text NOT NULL,

  -- The vendor id, or the project id. Which one is decided by `subject_kind`.
  subject_id   uuid NOT NULL,

  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid,

  CONSTRAINT principal_links_pkey PRIMARY KEY (tenant_id, id),

  -- Composite, because referential integrity is EXEMPT from row-level
  -- security: a single-column FK would let tenant A reference tenant B's
  -- principal, and the insert succeeding would confirm that principal exists.
  CONSTRAINT principal_links_principal_fkey
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES identity.principals (tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT principal_links_kind_check
    CHECK (subject_kind IN ('vendor', 'client')),

  -- One link per (principal, kind, subject). Tenant-prefixed, so the duplicate
  -- error cannot confirm a link exists in another tenant.
  CONSTRAINT principal_links_unique
    UNIQUE (tenant_id, principal_id, subject_kind, subject_id)
);

CREATE INDEX principal_links_tenant_idx ON identity.principal_links (tenant_id);
CREATE INDEX principal_links_principal_idx
  ON identity.principal_links (tenant_id, principal_id);

ALTER TABLE identity.principal_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.principal_links FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON identity.principal_links AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON identity.principal_links AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON identity.principal_links FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON identity.principal_links TO app_runtime;

COMMENT ON TABLE identity.principal_links IS
  'What a non-staff principal is entitled to: a vendor, or a project. Read '
  'inside the tenant context by loadPrincipalScope; a principal with no link '
  'here is scoped to nothing, which is the correct default for a portal login.';

COMMENT ON COLUMN identity.principal_links.subject_id IS
  'A procurement.vendors id or a projects.projects id. Deliberately not a '
  'foreign key: identity must not depend on either service. A dangling link '
  'matches no rows and therefore grants nothing.';

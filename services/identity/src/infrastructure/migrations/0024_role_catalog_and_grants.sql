-- 0024 — the role model, as configuration.
--
-- Forward-only. Never edit this file.
--
-- **Why this exists at all.** PO-13 has blocked the entire approval chain since
-- M1: `ApprovalsView` refuses every decision, change-order approval, imprest
-- sanction, vendor edits and document deletion are all dead, and no role picker
-- is offered anywhere. The reason was that nobody had answered "what are the
-- roles". A second copy of the legacy app now answers it, and this migration is
-- that answer landed as **rows a director can edit** rather than as a constant.
--
-- **Why it is configuration and not an enum.** The repaired legacy tree does
-- not treat its role list as fixed either: `settings-admin.js:10-14` returns the
-- ten built-in roles MERGED WITH a `custom_roles` setting, so a deployment can
-- already add one. An enum here would be less capable than the system we are
-- replacing, and changing an enum is a migration.
--
-- **Why every seeded row is provisional.** These roles come from a tree whose
-- own handover says it is "a repair of the audited paths, not certification of
-- every module, tax rule, permission combination". So they are evidence of how
-- this company works, not a decision anybody signed. The same shape as
-- `projects.health_thresholds`: a status column the application surfaces, so a
-- director reading a permission screen can tell whether it was agreed or
-- inherited.
--
-- **What is deliberately absent: a value limit.** There is no amount threshold
-- anywhere in the repaired approval path — the stage table has no `min_amount`
-- or `max_amount` column. Adding one here "to be safe" would declare a field
-- nothing evaluates, which is exactly the APPR-03 defect we ported away from:
-- the legacy schema declares `min_approval_count` and never reads it, so an
-- administrator configuring "two approvers" silently gets one. A field that
-- cannot be evaluated is not declared.
--
-- **What is deliberately absent: role aliases.** The legacy canonicalises
-- `procurement` and `maker` onto `proc` (`settings-catalog.js:2`). Our
-- principals have never held either string — those exist only in legacy data,
-- and mapping them belongs to a data migration on the day that data arrives.
-- An alias column nothing reads is the same trap as the paragraph above.

-- ── The roles a tenant has ───────────────────────────────────────────────────

CREATE TABLE identity.role_catalog (
  tenant_id  uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id         uuid NOT NULL DEFAULT gen_random_uuid(),

  -- The string that appears in `identity.principals.roles`, and the string an
  -- approval stage names. Constrained in shape because a role key with a
  -- capital or a space compares unequal to the one stored on a principal, and
  -- the symptom of that is an approval refusing for no visible reason.
  role_key   text NOT NULL,
  label      text NOT NULL,

  -- 'provisional' until somebody with authority over the business confirms it.
  status     text NOT NULL DEFAULT 'provisional',
  set_by     text,
  set_on     date,
  note       text NOT NULL DEFAULT '',

  -- Retiring a role rather than deleting it. A deleted role would orphan the
  -- approval history that names it, and history is the only thing a dispute can
  -- be settled from.
  retired_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT role_catalog_pkey PRIMARY KEY (tenant_id, id),

  -- Tenant-prefixed, like every unique constraint here: without the tenant id a
  -- violation message would confirm that another company uses a given role key.
  CONSTRAINT role_catalog_key_unique UNIQUE (tenant_id, role_key),

  CONSTRAINT role_catalog_key_shape_check CHECK (role_key ~ '^[a-z][a-z0-9_]{1,30}$'),
  CONSTRAINT role_catalog_label_check CHECK (length(trim(label)) > 0),
  CONSTRAINT role_catalog_status_check CHECK (status IN ('provisional', 'confirmed')),

  -- A confirmed role must say who confirmed it and when. Without this the
  -- status column is a claim rather than a record — the same shape as
  -- `projects.health_thresholds`, deliberately.
  CONSTRAINT role_catalog_confirmed_evidence_check CHECK (
    status <> 'confirmed' OR (set_by IS NOT NULL AND set_on IS NOT NULL)
  )
);

CREATE INDEX role_catalog_tenant_idx ON identity.role_catalog (tenant_id);

-- ── What each role may reach ─────────────────────────────────────────────────

CREATE TABLE identity.role_grants (
  tenant_id  uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id         uuid NOT NULL DEFAULT gen_random_uuid(),

  role_key   text NOT NULL,

  -- TWO kinds, and keeping them apart is the point.
  --
  -- The legacy stores both in one flat array (`core.js:557-562`), where
  -- `payments` (a module) sits beside `approve_payment` (an action). The
  -- consequence is visible: `module-access.js:31` looks a method up and always
  -- gets a MODULE, so the action entries are consulted at exactly one site in
  -- the whole tree — `projects.js:282-302`, which gates a read, not a write,
  -- and re-implements the merge through a four-role allowlist that silently
  -- discards a grant the other implementation honours.
  --
  -- "What may this role approve" is PO-13's actual question, and in the legacy
  -- it lives in the half of the array that nothing enforces.
  grant_kind text NOT NULL,
  grant_key  text NOT NULL,

  status     text NOT NULL DEFAULT 'provisional',
  set_by     text,
  set_on     date,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT role_grants_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT role_grants_unique UNIQUE (tenant_id, role_key, grant_kind, grant_key),

  -- COMPOSITE: referential integrity is exempt from RLS, so a single-column FK
  -- would let one tenant grant against another tenant's role and confirm, by
  -- the insert succeeding, that the role exists.
  CONSTRAINT role_grants_role_fkey
    FOREIGN KEY (tenant_id, role_key)
    REFERENCES identity.role_catalog (tenant_id, role_key) ON DELETE CASCADE,

  CONSTRAINT role_grants_kind_check CHECK (grant_kind IN ('module', 'action')),

  -- The SHAPE is constrained here; the VOCABULARY is not. Which modules exist
  -- is a product fact that grows, and a CHECK listing them would mean a
  -- migration every time a screen is added. The list itself lives in
  -- `packages/contracts` and is validated at the write boundary, so a typo is
  -- refused with a message rather than stored as a grant that matches nothing.
  CONSTRAINT role_grants_key_shape_check CHECK (grant_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  CONSTRAINT role_grants_status_check CHECK (status IN ('provisional', 'confirmed')),
  CONSTRAINT role_grants_confirmed_evidence_check CHECK (
    status <> 'confirmed' OR (set_by IS NOT NULL AND set_on IS NOT NULL)
  )
);

CREATE INDEX role_grants_tenant_idx ON identity.role_grants (tenant_id);
CREATE INDEX role_grants_lookup_idx ON identity.role_grants (tenant_id, role_key, grant_kind);

-- ── Isolation ────────────────────────────────────────────────────────────────

ALTER TABLE identity.role_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.role_catalog FORCE  ROW LEVEL SECURITY;
ALTER TABLE identity.role_grants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.role_grants  FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON identity.role_catalog AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON identity.role_catalog AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

CREATE POLICY tenant_isolation ON identity.role_grants AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON identity.role_grants AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON identity.role_catalog FROM PUBLIC;
REVOKE ALL ON identity.role_grants  FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON identity.role_catalog TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON identity.role_grants  TO app_runtime;

COMMENT ON TABLE identity.role_catalog IS
  'The roles one tenant has. Seeded provisionally at provisioning time from the '
  'ten the repaired legacy tree carries, and editable from there. A role is '
  'retired, never deleted: the approval history names it.';

COMMENT ON TABLE identity.role_grants IS
  'What each role may reach. Two kinds kept apart on purpose — a module is a '
  'screen and its endpoints, an action is a named power such as approving a '
  'purchase order. The legacy stores both in one array and enforces only the '
  'first kind.';

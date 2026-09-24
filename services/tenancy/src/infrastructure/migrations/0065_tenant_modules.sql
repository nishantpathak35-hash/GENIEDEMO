-- Which optional modules this tenant has turned on.
--
-- THIS IS NOT THE ROLE MODEL, and the distinction is the whole point of the
-- table. `identity.role_grants` answers "may THIS PERSON use module X". This
-- answers "is module X turned on HERE AT ALL". A route must fail the second
-- before it asks the first: a module nobody enabled has no permission question
-- to answer, and asking one implies the feature exists.
--
-- The legacy app has a screen called Module Access
-- (`components/views/settings/ModuleAccessSettings.js`) and it is the FIRST
-- question, not this one — a role × module matrix, which migration 0024 already
-- built as `role_grants`. That screen is not ported; this table is the thing
-- that was missing.
--
-- Why it exists: the eleven design-build workflows came out of a feature tree
-- somebody wrote on top of the original app, not out of watching a business
-- run. Some of them describe a real process and some are a shape. Rather than
-- guess which, every one of them is a row here and every one of them starts
-- OFF. A tenant that wants warranty tracking switches it on; a tenant that
-- never does never sees it. Switchable off beats deleted later, and it beats
-- eleven half-used screens in a navigation bar.
--
-- **Turning a module off hides it. It does not delete anything.** There is no
-- ON DELETE anywhere in this file pointing at module data, and no write path
-- may add one. Off is a visibility state, so that switching a module on again
-- returns the work that was already done rather than an empty screen. A tenant
-- who reads "off" as "removed" and loses six weeks of joinery packages has been
-- lied to by the control.

CREATE TABLE tenancy.tenant_modules (
  tenant_id  uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id         uuid NOT NULL DEFAULT gen_random_uuid(),

  -- The module's stable key — `design_brief`, `warranty`. Deliberately NOT a
  -- closed CHECK list of the eleven: adding a twelfth optional module would
  -- then need a migration to say its name, and the authority on what is
  -- gateable is the catalogue in `application/modules.ts`, which the write path
  -- validates against. The constraint here is on SHAPE only, so a typo cannot
  -- become a row that silently gates nothing.
  module_key text NOT NULL,

  -- **Default false, and it is the whole design.** A module absent from this
  -- table is also off (see `moduleEnabled`), so a tenant provisioned before
  -- this migration, or one whose row was never written, gets the same answer as
  -- one explicitly switched off. Fail closed: the failure mode of a wrong
  -- default here is a feature somebody has to turn on, and the other direction
  -- is a feature nobody chose appearing in their navigation.
  enabled    boolean NOT NULL DEFAULT false,

  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tenant_modules_pkey PRIMARY KEY (tenant_id, id),

  -- Composite, because referential integrity is exempt from RLS and a
  -- single-column FK would confirm the existence of another tenant's principal
  -- by whether the insert succeeded.
  CONSTRAINT tenant_modules_changed_by_fkey
    FOREIGN KEY (tenant_id, changed_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,

  -- Includes tenant_id like every unique constraint here. One row per module
  -- per tenant is what makes the upsert in `setModuleEnabled` safe.
  CONSTRAINT tenant_modules_unique UNIQUE (tenant_id, module_key),

  CONSTRAINT tenant_modules_key_check
    CHECK (module_key ~ '^[a-z][a-z0-9_]{2,39}$')
);

CREATE INDEX tenant_modules_tenant_idx ON tenancy.tenant_modules (tenant_id);
-- The lookup every gated route makes, on every request.
CREATE INDEX tenant_modules_lookup_idx
  ON tenancy.tenant_modules (tenant_id, module_key) INCLUDE (enabled);

ALTER TABLE tenancy.tenant_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.tenant_modules FORCE  ROW LEVEL SECURITY;

-- The pair. Policies are PERMISSIVE by default and permissive policies are
-- OR-ed, so one alone would let a later `USING (true)` open the table while
-- still satisfying "the table has a policy". The RESTRICTIVE half makes that
-- addition inert.
CREATE POLICY tenant_isolation ON tenancy.tenant_modules AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON tenancy.tenant_modules AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON tenancy.tenant_modules FROM PUBLIC;
-- No TRUNCATE, ever: it is not subject to row-level security. UPDATE is granted
-- because switching a module on and off again is the entire feature.
GRANT SELECT, INSERT, UPDATE, DELETE ON tenancy.tenant_modules TO app_runtime;

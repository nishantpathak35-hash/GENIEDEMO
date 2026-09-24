-- 0102 — a person's preferences, kept on the server.
--
-- Forward-only. Never edit this file.
--
-- The design's shell remembers things about the PERSON, not the firm: which
-- columns they chose on each list, whether their sidebar is collapsed and
-- which of its sections they left open, the project they opened last, the views
-- and reports they starred, and whether single-key shortcuts are on (WCAG
-- 2.1.4). COMPONENT-MAP §6: none of it goes in the browser — it is theirs and
-- follows them to another computer — so it is a row here, one per person,
-- read once on sign-in and written once per change.
--
-- **In `services/workflow`** beside tasks, notifications and the document
-- vault: the cross-cutting record of a person's working state. It is not
-- identity — nothing here decides who somebody is or what they may do — and
-- putting it in `identity` would grow the one blast-radius service with a
-- table that carries no permission.
--
-- **One jsonb column, not one per preference.** The set grows with the
-- product (the next list that gets a column control adds a key, not a
-- migration), every key is a display choice and nothing here is queried
-- across people, so a document keyed by person is the honest shape. The
-- application merges a change into the document; the whole document is what
-- the shell reads.

CREATE TABLE workflow.person_preferences (
  tenant_id     uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  principal_id  uuid NOT NULL,

  -- {columns: {<list>: [..]}, sidebar: {collapsed, open: [..]}, lastProjectId,
  --  starredViews: [..], starredReports: [..], singleKeyShortcuts}
  preferences   jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT person_preferences_pkey PRIMARY KEY (tenant_id, id),
  -- one row per person; the tenant is in the key so a uniqueness error never
  -- names another tenant's row
  CONSTRAINT person_preferences_principal_key UNIQUE (tenant_id, principal_id),
  CONSTRAINT person_preferences_principal_fkey
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES identity.principals (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT person_preferences_shape_check CHECK (jsonb_typeof(preferences) = 'object')
);

CREATE INDEX person_preferences_tenant_idx ON workflow.person_preferences (tenant_id);

ALTER TABLE workflow.person_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow.person_preferences FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON workflow.person_preferences AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON workflow.person_preferences AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON workflow.person_preferences FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON workflow.person_preferences TO app_runtime;

COMMENT ON TABLE workflow.person_preferences IS
  'One document per person: the column choice per list, the sidebar''s collapse and open sections, the last '
  'project opened, starred views and reports, the single-key switch. Read once on sign-in, merged on '
  'every change; never stored in a browser.';

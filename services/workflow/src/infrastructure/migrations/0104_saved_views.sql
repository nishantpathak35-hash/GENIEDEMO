-- 0104 — saved views of a list: the firm's, and a person's own.
--
-- Forward-only. Never edit this file.
--
-- Under a list's title the design opens its saved views — the firm's first,
-- then yours, a star per favourite, "+ New view" with its criteria and
-- columns (03-navigation; 07-buying, the saved views under the title). This
-- is where `?project=` lives at the firm level: a pasted link with a project
-- filter keeps working because a view can carry it.
--
-- A view is the list's own filter keys and values as the address carries
-- them — `state`, `vendor`, `project`, `q`, `sort` — never a query. The
-- server that lists the records applies them exactly as it applies the same
-- keys from a URL, so a saved view can show nothing a URL could not.
--
-- `owner_id` NULL is the firm's view (creating one needs manage_settings —
-- checked by the route, since a permission is identity's and this table
-- carries none); a principal's id is that person's. A star is the PERSON's
-- and lives in their preferences, not here, so the firm's view can be starred
-- by one person and not another.

CREATE TABLE workflow.saved_views (
  tenant_id   uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id          uuid NOT NULL DEFAULT gen_random_uuid(),

  -- which list: the route's key, e.g. 'orders', 'bills', 'projects'
  list_key    text NOT NULL,
  name        text NOT NULL,
  owner_id    uuid,
  criteria    jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- NULL: the list's default columns
  columns     jsonb,
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT saved_views_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT saved_views_owner_fkey
    FOREIGN KEY (tenant_id, owner_id)
    REFERENCES identity.principals (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT saved_views_created_by_fkey
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT saved_views_list_check CHECK (list_key ~ '^[a-z][a-z0-9-]{0,59}$'),
  CONSTRAINT saved_views_name_check CHECK (length(trim(name)) > 0 AND length(name) <= 80),
  CONSTRAINT saved_views_criteria_check CHECK (jsonb_typeof(criteria) = 'object'),
  CONSTRAINT saved_views_columns_check CHECK (columns IS NULL OR jsonb_typeof(columns) = 'array')
);

CREATE INDEX saved_views_tenant_idx ON workflow.saved_views (tenant_id);
CREATE INDEX saved_views_list_idx ON workflow.saved_views (tenant_id, list_key, owner_id);
-- a name is unique among the firm's views of a list, and among one person's
CREATE UNIQUE INDEX saved_views_name_firm_key
  ON workflow.saved_views (tenant_id, list_key, lower(name)) WHERE owner_id IS NULL;
CREATE UNIQUE INDEX saved_views_name_person_key
  ON workflow.saved_views (tenant_id, list_key, owner_id, lower(name)) WHERE owner_id IS NOT NULL;

ALTER TABLE workflow.saved_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow.saved_views FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON workflow.saved_views AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON workflow.saved_views AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON workflow.saved_views FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON workflow.saved_views TO app_runtime;

COMMENT ON TABLE workflow.saved_views IS
  'A saved view of a list: its filter keys and values as the address carries them, its columns, and '
  'whose it is — the firm''s (owner NULL) or one person''s. Stars are the person''s, in their preferences.';

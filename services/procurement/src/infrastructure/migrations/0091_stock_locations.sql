-- 0091 — the stores and site stores an organisation keeps stock in.
--
-- Forward-only. Never edit this file.
--
-- Settings › Inventory is drawn as "Stock locations", and there was no record
-- of a location at all (DATA-12, inv-01): a movement names its warehouse as
-- free text, so the only list of stores was whatever strings had ever been
-- typed. This is the register — a named store at the office or yard, or a
-- site store tied to a project — that a receipt, an issue and a transfer
-- offer as their choices.
--
-- It does NOT constrain the ledger. `stock_movements.warehouse` stays text:
-- every row already written names a store as it was typed, and turning that
-- into a foreign key would either rewrite history or refuse it. A location
-- is retired rather than deleted, for the same reason — movements still name
-- it, and a store that disappears from the register would make them unread-
-- able as a list. So the grant withholds DELETE.

CREATE TABLE procurement.stock_locations (
  tenant_id   uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id          uuid NOT NULL DEFAULT gen_random_uuid(),

  name        text NOT NULL,
  kind        text NOT NULL DEFAULT 'store',
  -- A site store belongs to a project; a central store to nobody. Clearing
  -- ONLY this column when the project goes keeps the store and its name.
  project_id  uuid,

  retired_at  timestamptz,
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT stock_locations_pkey PRIMARY KEY (tenant_id, id),
  -- Tenant-prefixed, so a duplicate name cannot confirm another tenant's store.
  CONSTRAINT stock_locations_name_key UNIQUE (tenant_id, name),
  CONSTRAINT stock_locations_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT stock_locations_kind_check CHECK (kind IN ('store', 'site')),
  CONSTRAINT stock_locations_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE SET NULL (project_id)
);

CREATE INDEX stock_locations_tenant_idx ON procurement.stock_locations (tenant_id);

ALTER TABLE procurement.stock_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.stock_locations FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON procurement.stock_locations AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON procurement.stock_locations AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON procurement.stock_locations FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON procurement.stock_locations TO app_runtime;

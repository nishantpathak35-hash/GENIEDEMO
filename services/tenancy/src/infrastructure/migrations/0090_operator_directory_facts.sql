-- 0090 — what the operator console may know about an organisation: a plan,
-- whether its connector is alive, and when anybody last used it.
--
-- Forward-only. Never edit this file.
--
-- The console reads `tenancy.tenant_directory`, a projection holding only what
-- a platform account is entitled to know, because the console runs with no
-- tenant context and every tenant table denies it (0026). The operator table
-- is drawn with Plan, Tally and Last active, and the directory carried none of
-- the three (DATA-12, admin-01).
--
-- THE THREE TIMESTAMPS ARE WRITTEN BY THE TENANT, NOT READ FROM IT. Reading
-- `connector_instances` or the audit log across tenants would need a role that
-- bypasses row security, and no role this application uses may (0001). So a
-- tenant-side action reports its own moment through `note_tenant_activity`,
-- which takes the tenant from the session context — never an argument — and
-- can therefore only touch the calling tenant's own directory row, and only
-- these three columns. They carry instants and nothing else: no count, no
-- name, no amount. "Last active" is the last time a signed-in person loaded
-- the application; the two throttled kinds write at most once every five
-- minutes, so a busy tenant does not queue on its own directory row.
--
-- The plan is a label an operator sets — `Pilot`, `Standard` — through
-- `set_tenant_plan`, which requires a platform principal like `list_tenants`.
-- It is not a price and nothing gates on it.
--
-- Organisations with no activity since this migration read as never active,
-- which is the truth on file; nothing is backfilled from tenant tables.
--
-- And the directory's two readers lose their row caps. `list_tenants` ended in
-- `LIMIT 500` and `list_provisioning_events` in `LIMIT 200`, underneath a paged
-- route — so the 501st organisation was unreachable and the count stopped at
-- 500. The paging is the route's; the functions return the whole set.

ALTER TABLE tenancy.tenant_directory
  ADD COLUMN plan text,
  ADD COLUMN connector_last_seen_at timestamptz,
  ADD COLUMN last_posted_at timestamptz,
  ADD COLUMN last_active_at timestamptz,
  ADD CONSTRAINT tenant_directory_plan_check
    CHECK (plan IS NULL OR length(btrim(plan)) BETWEEN 1 AND 40);

-- ------------------------------------------------------------- reading ---

DROP FUNCTION tenancy.list_tenants(uuid);

CREATE FUNCTION tenancy.list_tenants(p_requested_by uuid)
  RETURNS TABLE (
    id uuid, slug text, legal_name text, app_origin text, created_at timestamptz,
    plan text, connector_last_seen_at timestamptz, last_posted_at timestamptz,
    last_active_at timestamptz
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = tenancy, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tenancy.platform_principals
     WHERE tenancy.platform_principals.id = p_requested_by AND disabled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'listing tenants requires a platform principal'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
    SELECT t.tenant_id, t.slug, t.legal_name, t.app_origin, t.created_at,
           t.plan, t.connector_last_seen_at, t.last_posted_at, t.last_active_at
      FROM tenancy.tenant_directory t
     ORDER BY t.created_at DESC;
END
$$;

ALTER FUNCTION tenancy.list_tenants(uuid) OWNER TO app_auth;
REVOKE ALL ON FUNCTION tenancy.list_tenants(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.list_tenants(uuid) TO app_runtime;

CREATE OR REPLACE FUNCTION tenancy.list_provisioning_events(p_requested_by uuid)
  RETURNS TABLE (
    id uuid, slug text, outcome text, tenant_id uuid, detail text, occurred_at timestamptz
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = tenancy, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tenancy.platform_principals
     WHERE tenancy.platform_principals.id = p_requested_by AND disabled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'reading provisioning events requires a platform principal'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
    SELECT e.id, e.slug, e.outcome, e.tenant_id, e.detail, e.occurred_at
      FROM tenancy.provisioning_events e
     ORDER BY e.occurred_at DESC;
END
$$;

-- ------------------------------------------------------------- writing ---

CREATE FUNCTION tenancy.note_tenant_activity(p_kind text)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = tenancy, pg_temp
AS $$
DECLARE
  v_tenant uuid := tenancy.current_tenant_id();
BEGIN
  -- No tenant context is no tenant to speak for: nothing is written.
  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  IF p_kind = 'active' THEN
    UPDATE tenancy.tenant_directory SET last_active_at = now()
     WHERE tenant_id = v_tenant
       AND (last_active_at IS NULL OR last_active_at < now() - interval '5 minutes');
  ELSIF p_kind = 'connector_seen' THEN
    UPDATE tenancy.tenant_directory SET connector_last_seen_at = now()
     WHERE tenant_id = v_tenant
       AND (connector_last_seen_at IS NULL OR connector_last_seen_at < now() - interval '5 minutes');
  ELSIF p_kind = 'posted' THEN
    UPDATE tenancy.tenant_directory SET last_posted_at = now()
     WHERE tenant_id = v_tenant;
  ELSE
    RAISE EXCEPTION 'unknown activity kind: %', p_kind
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
END
$$;

ALTER FUNCTION tenancy.note_tenant_activity(text) OWNER TO app_auth;
REVOKE ALL ON FUNCTION tenancy.note_tenant_activity(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.note_tenant_activity(text) TO app_runtime;

-- Returns whether the organisation exists, so a caller can answer not-found.
CREATE FUNCTION tenancy.set_tenant_plan(p_requested_by uuid, p_tenant uuid, p_plan text)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = tenancy, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tenancy.platform_principals
     WHERE tenancy.platform_principals.id = p_requested_by AND disabled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'setting a plan requires a platform principal'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE tenancy.tenant_directory SET plan = NULLIF(btrim(p_plan), '')
   WHERE tenant_id = p_tenant;
  RETURN FOUND;
END
$$;

ALTER FUNCTION tenancy.set_tenant_plan(uuid, uuid, text) OWNER TO app_auth;
REVOKE ALL ON FUNCTION tenancy.set_tenant_plan(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.set_tenant_plan(uuid, uuid, text) TO app_runtime;

-- 0003 — identity: principals, memberships and invites.
--
-- Forward-only. Never edit this file.
--
-- Lives in tenancy's migration sequence for now because there is one database
-- and one ordering; when services/identity gets its own drizzle-kit history
-- (M2's migration harness) this moves with its schema intact.
--
-- NOTE: no password hashes anywhere. The identity provider owns credentials
-- (ADR-0005); this service owns only the mapping from a provider identity to an
-- application principal, and the roles that principal holds.

-- ------------------------------------------------------------ principals ---

CREATE TABLE identity.principals (
  tenant_id   uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id          uuid NOT NULL,
  kind        text NOT NULL,
  -- The provider's id for this user. Null for a `system` principal.
  external_id text,
  email       text NOT NULL,
  roles       text[] NOT NULL DEFAULT '{}',
  disabled_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT principals_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT principals_kind_check CHECK (kind IN ('staff', 'vendor', 'client', 'connector', 'system')),
  -- Tenant-prefixed, so the error on a duplicate cannot confirm that an address
  -- exists in a DIFFERENT tenant. A bare UNIQUE (email) would leak exactly that
  -- through `Key (email)=(...) already exists`.
  CONSTRAINT principals_tenant_email_key UNIQUE (tenant_id, email)
);

ALTER TABLE identity.principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.principals FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON identity.principals AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON identity.principals AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

-- --------------------------------------------------------------- invites ---

CREATE TABLE identity.invites (
  tenant_id   uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id          uuid NOT NULL,
  email       text NOT NULL,
  roles       text[] NOT NULL DEFAULT '{}',
  -- Hashed, never stored in the clear: an invite token is a bearer credential
  -- and a leaked database dump must not be a set of working invitations.
  token_hash  bytea NOT NULL,
  -- The legacy invites table has no expiry at all, so a token minted once works
  -- forever.
  expires_at  timestamptz NOT NULL,
  accepted_at timestamptz,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT invites_pkey PRIMARY KEY (tenant_id, id)
);

CREATE INDEX invites_tenant_email_idx ON identity.invites (tenant_id, email);

ALTER TABLE identity.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.invites FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON identity.invites AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON identity.invites AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON identity.principals TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON identity.invites    TO app_runtime;

-- ------------------------------------------------- the bootstrap problem ---

-- A separate, app_auth-owned lookup table, exactly as connector_keys is.
--
-- Putting the bootstrap read on identity.principals itself would force a
-- choice between two bad options: scope the RESTRICTIVE policy `TO app_runtime`
-- so app_auth escapes it (which also makes views and definer functions running
-- as other roles silently return nothing), or drop FORCE (which lets the table
-- owner bypass its own policies). Neither is acceptable, so the bootstrap read
-- targets a table that holds ONLY what bootstrapping needs.
--
-- It contains no email, no name, no roles — three ids and nothing else. A dump
-- of it reveals which provider identities exist and which tenant they map to,
-- and nothing about the people.

-- app_auth owns the bootstrap table and the definer functions, so it needs
-- USAGE on the schemas they live in and reference. Without this the function
-- fails with "permission denied for schema identity" at call time rather than
-- at creation time — owning a table does not imply access to its schema.
GRANT USAGE ON SCHEMA identity, tenancy TO app_auth;

CREATE TABLE identity.principal_lookup (
  external_id  text PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  principal_id uuid NOT NULL
);

ALTER TABLE identity.principal_lookup OWNER TO app_auth;
ALTER TABLE identity.principal_lookup ENABLE ROW LEVEL SECURITY;
-- ENABLE without FORCE, deliberately: the owner (app_auth) is the only reader,
-- through the definer function below, and it has no tenant to predicate on.
-- app_runtime is granted nothing on this table, which the isolation suite
-- asserts — "we did not grant it" must be distinguishable from "we forgot".

-- Resolving a login to a tenant requires reading a mapping BEFORE any tenant is
-- set. Under RLS that returns zero rows, so nothing can ever authenticate —
-- the chicken-and-egg at the centre of every RLS design.
--
-- The wrong fixes are a BYPASSRLS role (which makes every policy decorative)
-- and granting app_runtime an unscoped read over every user in every tenant.
--
-- Instead: one SECURITY DEFINER function with a pinned search_path, returning
-- only the ids needed to build a context. It cannot enumerate — without an
-- exact external id it returns nothing.

CREATE FUNCTION identity.resolve_principal(p_external_id text)
  RETURNS TABLE (tenant_id uuid, principal_id uuid)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = identity, pg_temp
AS $$
  SELECT l.tenant_id, l.principal_id
    FROM identity.principal_lookup l
   WHERE l.external_id = p_external_id
   LIMIT 1
$$;

ALTER FUNCTION identity.resolve_principal(text) OWNER TO app_auth;
REVOKE ALL ON FUNCTION identity.resolve_principal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.resolve_principal(text) TO app_runtime;

COMMENT ON FUNCTION identity.resolve_principal(text) IS
  'Bootstrap only: maps a provider identity to (tenant, principal) so a tenant '
  'context can be built. SECURITY DEFINER because the caller has no tenant yet. '
  'Returns two ids and nothing else - no email, no roles, no list.';

-- Registering a mapping is the write half, and it is scoped to the caller's own
-- tenant: app_runtime may only add a lookup row for the tenant it is currently
-- acting as, which it cannot forge because the value comes from the session
-- setting rather than from an argument.

CREATE FUNCTION identity.register_principal(p_external_id text, p_principal_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = identity, tenancy, pg_temp
AS $$
DECLARE
  v_tenant uuid := tenancy.current_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'register_principal requires a tenant context';
  END IF;
  INSERT INTO identity.principal_lookup (external_id, tenant_id, principal_id)
  VALUES (p_external_id, v_tenant, p_principal_id)
  ON CONFLICT (external_id) DO NOTHING;
END
$$;

ALTER FUNCTION identity.register_principal(text, uuid) OWNER TO app_auth;
REVOKE ALL ON FUNCTION identity.register_principal(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.register_principal(text, uuid) TO app_runtime;

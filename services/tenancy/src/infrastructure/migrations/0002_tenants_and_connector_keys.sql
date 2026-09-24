-- 0002 — tenants, connector keys, connector instances.
--
-- Forward-only. Never edit this file.

-- --------------------------------------------------------------- tenants ---
-- The one table with no tenant_id, because it *is* the tenant list. It still
-- carries RLS: a tenant may read its own row and no other.

CREATE TABLE tenancy.tenants (
  id           uuid PRIMARY KEY,
  slug         text NOT NULL,
  legal_name   text NOT NULL,
  -- Where this tenant's app lives. The legacy app hardcodes a single demo
  -- domain as the invite URL (auth.js:253); a compiled-in domain cannot serve
  -- a multi-tenant product, so it is per-tenant configuration and lives here.
  app_origin   text NOT NULL,
  status       text NOT NULL DEFAULT 'active',
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tenants_slug_key UNIQUE (slug),
  CONSTRAINT tenants_status_check CHECK (status IN ('active', 'suspended', 'closed'))
);

ALTER TABLE tenancy.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.tenants FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenancy.tenants AS RESTRICTIVE FOR ALL
  USING      (id = tenancy.current_tenant_id())
  WITH CHECK (id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON tenancy.tenants AS PERMISSIVE FOR ALL
  USING      (id = tenancy.current_tenant_id())
  WITH CHECK (id = tenancy.current_tenant_id());

-- -------------------------------------------------------- connector keys ---
-- Authenticates the on-prem Tally connector. The key identifies the tenant;
-- the connector never sends a tenant id.
--
-- Owned by app_auth, NOT app_migrator, and app_runtime gets no grant: this
-- table has to be readable before any tenant is known, and "readable before a
-- tenant is known" must not mean "readable by the role that serves untrusted
-- requests".
--
-- MULTIPLE ROWS PER TENANT MAY BE ACTIVE AT ONCE. Rotation without an overlap
-- window is an outage on every customer machine until someone visits the site:
-- admin mints key 2, the customer installs it, key 1 is then revoked or lapses.

CREATE TABLE tenancy.connector_keys (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  -- Greppable, identifiable without a lookup, and safe to log.
  key_prefix  text NOT NULL,
  -- These are 256-bit random secrets, not passwords: SHA-256 is correct and
  -- bcrypt would be theatre. The plaintext is shown once, at mint time.
  key_hash    bytea NOT NULL,
  label       text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,
  revoked_at  timestamptz,

  CONSTRAINT connector_keys_prefix_key UNIQUE (key_prefix)
);

CREATE INDEX connector_keys_tenant_idx ON tenancy.connector_keys (tenant_id);

ALTER TABLE tenancy.connector_keys OWNER TO app_auth;
ALTER TABLE tenancy.connector_keys ENABLE ROW LEVEL SECURITY;

-- Deliberately ENABLE without FORCE, which is the one place in this schema that
-- is true, and it needs stating or a reviewer will read it as the mistake the
-- tenant-table skill warns about.
--
-- This table has to be read BEFORE a tenant is known — resolving a bearer key
-- to a tenant is what establishes the context — so a tenant predicate cannot
-- apply to it. Under FORCE with no policy, even the owner is denied, and the
-- SECURITY DEFINER function that verifies the key would return nothing.
--
-- What protects it instead is privilege, which is stronger here than a policy:
-- it is owned by app_auth, app_runtime has NO GRANT ON IT AT ALL, and RLS
-- enabled means any role that is later granted access still sees nothing
-- without an explicit policy. The only path in is a SECURITY DEFINER function
-- that verifies the secret internally and returns (tenant_id, principal_id).
--
-- The isolation suite asserts the absence of that grant, because "we did not
-- grant it" is otherwise indistinguishable from "we forgot to".

-- ---------------------------------------------------- connector instances --
-- One row per customer machine, registered on first sight.
--
-- This is what makes "the connector is down" a diagnosable support category
-- rather than a guess, and it is how a single lost machine is disabled without
-- moving to per-machine keys and doubling the customer's IT burden.

CREATE TABLE tenancy.connector_instances (
  tenant_id     uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id            uuid NOT NULL,
  hostname      text NOT NULL DEFAULT '',
  version       text NOT NULL DEFAULT '',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  disabled_at   timestamptz,

  -- tenant_id leads the primary key on every tenant-scoped table, so that the
  -- only foreign key shape that compiles is the composite one below.
  CONSTRAINT connector_instances_pkey PRIMARY KEY (tenant_id, id)
);

ALTER TABLE tenancy.connector_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.connector_instances FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenancy.connector_instances AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON tenancy.connector_instances AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

-- ---------------------------------------------------------------- grants ---
-- SELECT, INSERT, UPDATE, DELETE — and never TRUNCATE, which is NOT subject to
-- row-level security. A granted TRUNCATE lets one tenant's request wipe every
-- tenant's rows.

GRANT SELECT, INSERT, UPDATE, DELETE ON tenancy.tenants              TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenancy.connector_instances  TO app_runtime;

-- A temp table is not subject to RLS. One left behind on a pooled connection is
-- readable by whichever tenant is handed that connection next. REVOKE needs the
-- database by name, so it has to be built dynamically.
DO $$
BEGIN
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM app_runtime', current_database());
END
$$;

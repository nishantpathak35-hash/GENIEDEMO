-- 0001 — roles, schemas, and the one function every policy references.
--
-- Forward-only. Never edit this file; it has run somewhere.
--
-- This migration must run before any tenant-scoped table exists, because every
-- policy those tables carry references tenancy.current_tenant_id().

-- ---------------------------------------------------------------- roles ----
-- Three roles, none of which may bypass RLS. The posture stated to an auditor
-- is "no role the application uses can bypass row-level security", and that has
-- to be literally true, including for the migrator.

DO $$
BEGIN
  -- Owns the tables and runs migrations. Connects DIRECTLY to Postgres, never
  -- through PgBouncer: transaction-mode pooling breaks DDL that needs session
  -- state, and drizzle-kit's advisory locks do not survive connection reuse.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_migrator') THEN
    CREATE ROLE app_migrator NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;

  -- Every request. Owns nothing, creates nothing.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;

  -- Owns the bootstrap tables that must be readable BEFORE a tenant is known:
  -- connector keys and login credentials. app_runtime gets no grant on them at
  -- all; it reaches them only through SECURITY DEFINER functions that verify a
  -- secret internally and return only (tenant_id, principal_id).
  --
  -- Otherwise "global" would mean "every tenant's API keys and password
  -- hashes, readable by the role that serves untrusted requests".
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_auth') THEN
    CREATE ROLE app_auth NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

-- A long-open transaction pins a pooled server connection. Bound it in the
-- database as well as in PgBouncer, so neither alone is load-bearing.
ALTER ROLE app_runtime SET idle_in_transaction_session_timeout = '15s';
ALTER ROLE app_runtime SET statement_timeout = '30s';

-- -------------------------------------------------------------- schemas ----

CREATE SCHEMA IF NOT EXISTS tenancy  AUTHORIZATION app_migrator;
CREATE SCHEMA IF NOT EXISTS identity AUTHORIZATION app_migrator;

GRANT USAGE ON SCHEMA tenancy, identity TO app_runtime;

-- app_runtime creates nothing, anywhere. A temp table is not subject to RLS,
-- so one left on a pooled connection is readable by the next tenant to use it.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM app_runtime;

-- ------------------------------------------------- the tenant predicate ----
-- Every policy in the system calls this and nothing else.
--
-- NULLIF(..., '') is the part that matters. There are three states, not two:
--
--   fresh connection, placeholder never set   -> NULL   -> `= NULL` denies. Good.
--   warm connection, a LOCAL set has ended    -> ''     -> ''::uuid raises 22P02
--   malformed value                           -> junk   -> 22P02
--
-- Every production connection is warm, so without NULLIF an unwrapped query
-- returns a 500 in production while returning zero rows in a fresh test
-- session — the test would measure a state production is never in.
--
-- STABLE + SQL means the function inlines, so `tenant_id = current_tenant_id()`
-- remains a btree key on tenant_id rather than a per-row call.

CREATE OR REPLACE FUNCTION tenancy.current_tenant_id() RETURNS uuid
  LANGUAGE sql
  STABLE
  PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

ALTER FUNCTION tenancy.current_tenant_id() OWNER TO app_migrator;
GRANT EXECUTE ON FUNCTION tenancy.current_tenant_id() TO app_runtime, app_auth;

COMMENT ON FUNCTION tenancy.current_tenant_id() IS
  'The tenant of the current transaction, or NULL. Referenced by every RLS policy. '
  'NULL denies rather than matching: an unset context sees nothing, never everything.';

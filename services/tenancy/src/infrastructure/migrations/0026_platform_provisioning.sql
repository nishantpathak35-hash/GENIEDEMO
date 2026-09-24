-- Self-service tenant provisioning.
--
-- M6's done-when, from KICKOFF: *onboarding a tenant is self-service, with no
-- SQL run by hand*. Today it means exactly that —
-- `services/tenancy/scripts/seed.mjs` is how a tenant comes into existence, and
-- it is a development script connecting as the migration role.
--
-- ---------------------------------------------------------------------------
-- THE CHICKEN AND EGG, AND WHY THIS IS A SECURITY DEFINER FUNCTION
-- ---------------------------------------------------------------------------
--
-- `tenancy.tenants` is FORCE ROW LEVEL SECURITY, so even its owner is subject
-- to the policy — and the policy compares `tenant_id` to the session's tenant.
-- **Creating a tenant is therefore the one operation that cannot run inside
-- that tenant's context, because the context does not exist yet.**
--
-- The connector-key path already solved this shape, and this follows it rather
-- than inventing a second mechanism: a function owned by `app_auth`, granted
-- narrowly to `app_runtime`, doing the whole of the work in one transaction and
-- returning ids and nothing else.
--
-- **Provisioning is the highest-privilege operation in the product.** It
-- creates a tenant and its first administrator, so it is the one path where a
-- flaw yields somebody else's data rather than merely one's own. Hence:
--
--   * it is callable only by a PLATFORM principal, which is a different table
--     from `identity.principals` and carries no `tenant_id` at all — a
--     tenant-scoped principal cannot be escalated into one by setting a column;
--   * every attempt writes a `provisioning_events` row, successful or not;
--   * the function returns two ids. It does not return, and cannot be made to
--     return, anything about a tenant that already exists.

-- ------------------------------------------------------ platform accounts ---

-- Deliberately OUTSIDE `identity`, and with no `tenant_id`.
--
-- A platform account is not a member of any tenant, and modelling it as one
-- with a magic tenant id is how "the support tenant" becomes a tenant with
-- access to every other. There is no policy on this table because there is no
-- tenant predicate that could be written for it; instead `app_runtime` has no
-- grant on it at all, and it is read only through the SECURITY DEFINER function
-- below — the same shape as `identity.principal_lookup`.
CREATE TABLE tenancy.platform_principals (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  external_id text NOT NULL,
  email       text NOT NULL,
  disabled_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT platform_principals_pkey PRIMARY KEY (id),
  CONSTRAINT platform_principals_external_key UNIQUE (external_id)
);

ALTER TABLE tenancy.platform_principals OWNER TO app_auth;
REVOKE ALL ON tenancy.platform_principals FROM PUBLIC;
-- No grant to app_runtime. The runtime cannot read this table, list it, or
-- discover that an address is a platform account.

-- ------------------------------------------------------------- the audit ---

-- Append-only, and outside any tenant, because a provisioning event is not an
-- event *in* a tenant — it is the event that made one.
CREATE TABLE tenancy.provisioning_events (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  requested_by  uuid NOT NULL,
  slug          text NOT NULL,
  outcome       text NOT NULL,
  tenant_id     uuid,
  detail        text NOT NULL DEFAULT '',
  occurred_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT provisioning_events_pkey PRIMARY KEY (id),
  CONSTRAINT provisioning_events_outcome_check
    CHECK (outcome IN ('created', 'refused'))
);

CREATE INDEX provisioning_events_time_idx ON tenancy.provisioning_events (occurred_at DESC);

ALTER TABLE tenancy.provisioning_events OWNER TO app_auth;
REVOKE ALL ON tenancy.provisioning_events FROM PUBLIC;
-- NO grant to app_runtime, not even SELECT.
--
-- A direct grant was written first, and the isolation suite refused it: a table
-- outside the tenant model is only a legitimate exception if `app_runtime`
-- cannot read it, which is what stops "not tenant-scoped" from becoming "not
-- protected". The audit is read through `list_provisioning_events` below, which
-- checks for a platform principal — so the read carries the same authorisation
-- as the write rather than relying on the route to remember.

-- --------------------------------------------------------- the directory ---

-- What the console may see of the organisations that exist.
--
-- **Not a view over `tenancy.tenants`, and this is the part worth reading.**
-- `tenants` is FORCE ROW LEVEL SECURITY and its policy compares `tenant_id` to
-- the session's tenant, so a connection with no tenant context — which is
-- exactly what a platform account has — sees zero rows. That is correct and
-- must stay correct: "an unset context sees everything" is the hole the whole
-- design exists to avoid, and widening the policy to allow a NULL context would
-- open every tenant-scoped table in the system at once.
--
-- So the console reads a DIRECTORY instead: a projection carrying only what a
-- platform account is entitled to know — that an organisation exists, its slug,
-- its name and its origin. It cannot leak a tenant's data because it does not
-- contain any. It is written by `provision_tenant`, in the same transaction as
-- the tenant itself.
--
-- Organisations created before this migration are absent from it, deliberately:
-- backfilling would mean reading `tenants` from outside a tenant context, which
-- is the thing that cannot be done. They are reachable by their own users as
-- they always were.
CREATE TABLE tenancy.tenant_directory (
  tenant_id   uuid NOT NULL,
  slug        text NOT NULL,
  legal_name  text NOT NULL,
  app_origin  text,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tenant_directory_pkey PRIMARY KEY (tenant_id),
  CONSTRAINT tenant_directory_slug_key UNIQUE (slug)
);

ALTER TABLE tenancy.tenant_directory OWNER TO app_auth;
REVOKE ALL ON tenancy.tenant_directory FROM PUBLIC;
-- No grant to app_runtime: a tenant route that could read this would be able to
-- enumerate every customer of the deployment. It is read only through
-- `list_tenants`, which requires a platform principal.

-- ------------------------------------------------------------ resolution ---

-- Maps a credential to a platform principal. Returns one id and nothing else:
-- no email, no list, and nothing that distinguishes "not a platform account"
-- from "no such account at all".
CREATE FUNCTION tenancy.resolve_platform_principal(p_external_id text)
  RETURNS TABLE (principal_id uuid)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = tenancy, pg_temp
AS $$
  SELECT p.id
    FROM tenancy.platform_principals p
   WHERE p.external_id = p_external_id
     AND p.disabled_at IS NULL
   LIMIT 1
$$;

ALTER FUNCTION tenancy.resolve_platform_principal(text) OWNER TO app_auth;
REVOKE ALL ON FUNCTION tenancy.resolve_platform_principal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.resolve_platform_principal(text) TO app_runtime;

-- ---------------------------------------------------------- provisioning ---

-- Creates a tenant, its first administrator, and the lookup row that makes that
-- administrator resolvable — in ONE transaction.
--
-- Half a tenant is the failure case M6 names explicitly: "a duplicate slug, a
-- re-used email and a half-created tenant are the cases that produce a support
-- ticket, and each needs a stated outcome." A tenant row with no principal is
-- an organisation nobody can sign in to, and it holds the slug so the retry
-- fails too.
-- SECURITY DEFINER runs as the OWNER, so `app_auth` needs its own privileges on
-- everything the function touches. Being the definer is not being a superuser:
-- the first run failed with `permission denied for table tenants` because the
-- function had the right to exist and no right to write.
--
-- The grants are exactly what the function does and nothing more: it inserts a
-- tenant, a principal and a lookup row, and it reads `tenants` to check the
-- slug. It has no UPDATE and no DELETE on any of them.
GRANT SELECT, INSERT ON tenancy.tenants TO app_auth;
GRANT INSERT ON identity.principals TO app_auth;
GRANT INSERT ON identity.principal_lookup TO app_auth;

CREATE FUNCTION tenancy.provision_tenant(
  p_requested_by  uuid,
  p_slug          text,
  p_legal_name    text,
  p_app_origin    text,
  p_admin_email   text,
  p_admin_external_id text
)
  RETURNS TABLE (outcome text, tenant_id uuid, principal_id uuid, detail text)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = tenancy, identity, pg_temp
AS $$
DECLARE
  v_tenant    uuid := gen_random_uuid();
  v_principal uuid := gen_random_uuid();
  v_outcome   text := 'created';
  v_detail    text := '';
BEGIN
  -- The caller must be a platform account. This one RAISES, because it is not a
  -- business outcome: it is a caller who should not have reached the function
  -- at all, and the route refuses such a caller before this point. Checked here
  -- anyway because this function IS the privilege — anything that can execute
  -- it can create a tenant, so it verifies its own precondition.
  IF NOT EXISTS (
    SELECT 1 FROM tenancy.platform_principals
     WHERE id = p_requested_by AND disabled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'provision_tenant requires a platform principal'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ---------------------------------------------------------------------
  -- A REFUSAL RETURNS; IT DOES NOT RAISE.
  --
  -- Written as a RAISE first, and the audit row went with it: the whole
  -- function is one transaction, so raising rolled back the very
  -- `provisioning_events` insert that recorded why. An audit of a refusal that
  -- disappears when the refusal happens is not an audit.
  --
  -- The inner block is a subtransaction, so a unique violation inside it undoes
  -- the partial inserts and nothing else. The event row after it commits.
  -- ---------------------------------------------------------------------
  BEGIN
    -- Through the tenant context, not around it: `tenants` is FORCE RLS, so
    -- setting it LOCAL first is what makes WITH CHECK apply to the very first
    -- row a tenant ever has.
    PERFORM set_config('app.tenant_id', v_tenant::text, true);

    INSERT INTO tenancy.tenants (id, slug, legal_name, app_origin)
    VALUES (v_tenant, p_slug, p_legal_name, p_app_origin);

    INSERT INTO identity.principals (tenant_id, id, kind, external_id, email)
    VALUES (v_tenant, v_principal, 'staff', p_admin_external_id, p_admin_email);

    INSERT INTO identity.principal_lookup (external_id, tenant_id, principal_id)
    VALUES (p_admin_external_id, v_tenant, v_principal);

    -- The console's projection, in the same transaction as the tenant. There is
    -- no state in which the directory lists an organisation nobody can sign in
    -- to: if the principal insert above had failed, this rolls back with it.
    INSERT INTO tenancy.tenant_directory (tenant_id, slug, legal_name, app_origin)
    VALUES (v_tenant, p_slug, p_legal_name, p_app_origin);

  EXCEPTION WHEN unique_violation THEN
    v_outcome := 'refused';
    -- One message for both causes. Saying WHICH is taken tells a caller whether
    -- an address is already an administrator of some organisation on this
    -- deployment, which is a fact about somebody else's tenant.
    v_detail := 'that slug or administrator is already in use';
    v_tenant := NULL;
    v_principal := NULL;
  END;

  INSERT INTO tenancy.provisioning_events (requested_by, slug, outcome, tenant_id, detail)
  VALUES (p_requested_by, p_slug, v_outcome, v_tenant, v_detail);

  RETURN QUERY SELECT v_outcome, v_tenant, v_principal, v_detail;
END
$$;

ALTER FUNCTION tenancy.provision_tenant(uuid, text, text, text, text, text) OWNER TO app_auth;
REVOKE ALL ON FUNCTION tenancy.provision_tenant(uuid, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.provision_tenant(uuid, text, text, text, text, text)
  TO app_runtime;

COMMENT ON FUNCTION tenancy.provision_tenant(uuid, text, text, text, text, text) IS
  'Creates a tenant, its first administrator and the lookup row, in one '
  'transaction. Refuses a caller that is not a platform principal, and records '
  'every attempt. The highest-privilege operation in the product.';

-- ----------------------------------------------------------- the listing ---

-- What a platform account may see: the directory, which holds a slug, a name
-- and an origin and no tenant data at all. Not `tenancy.tenants`, which a
-- connection with no tenant context cannot read — and must not be able to.
CREATE FUNCTION tenancy.list_tenants(p_requested_by uuid)
  RETURNS TABLE (id uuid, slug text, legal_name text, app_origin text, created_at timestamptz)
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
    SELECT t.tenant_id, t.slug, t.legal_name, t.app_origin, t.created_at
      FROM tenancy.tenant_directory t
     ORDER BY t.created_at DESC
     LIMIT 500;
END
$$;

ALTER FUNCTION tenancy.list_tenants(uuid) OWNER TO app_auth;
REVOKE ALL ON FUNCTION tenancy.list_tenants(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.list_tenants(uuid) TO app_runtime;

-- Every provisioning attempt. Callable only by a platform principal, for the
-- same reason `list_tenants` is: the events name organisations.
CREATE FUNCTION tenancy.list_provisioning_events(p_requested_by uuid)
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
     ORDER BY e.occurred_at DESC
     LIMIT 200;
END
$$;

ALTER FUNCTION tenancy.list_provisioning_events(uuid) OWNER TO app_auth;
REVOKE ALL ON FUNCTION tenancy.list_provisioning_events(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.list_provisioning_events(uuid) TO app_runtime;

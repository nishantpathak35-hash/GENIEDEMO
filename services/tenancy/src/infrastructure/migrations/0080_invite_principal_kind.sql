-- 0080 — an invitation carries the KIND of principal it creates.
--
-- Forward-only. Never edit this file.
--
-- Until now `identity.invites` recorded an email and a role list, and nothing
-- redeemed one: `POST /invites` minted a token and there was no acceptance path
-- at all, for any kind. Every principal in the system was therefore created by
-- direct SQL — the platform provisioner for a tenant's first administrator
-- (0026), and `scripts/seed-demo.mjs` for the two portal logins. So "client
-- access cannot create a login" was true, and so was the same sentence with
-- `staff` or `vendor` in it.
--
-- The gap this closes is the kind. An invitation that says only "this address
-- may join" cannot mint a client principal, because `kind` is what
-- `requireStaff` and `requireKind` read to decide which application a login may
-- reach at all.

-- --------------------------------------------------------------- the kind ---

ALTER TABLE identity.invites
  -- DEFAULT 'staff' so the rows already here keep the only meaning they could
  -- have had. None of them is redeemable — there was no redemption path when
  -- they were minted — but defaulting to the least surprising value is better
  -- than a nullable column that every reader has to interpret.
  ADD COLUMN kind text NOT NULL DEFAULT 'staff';

ALTER TABLE identity.invites
  -- THREE KINDS, NOT FIVE. `identity.principals` allows `connector` and
  -- `system` as well; an invitation may create neither. A connector principal
  -- is the Tally agent's credential and is minted with a per-tenant key on its
  -- own prefix; a system principal acts for the platform. An invite link is a
  -- bearer token that arrives by email, and an email that can mint the
  -- connector's identity is the whole on-prem trust boundary in an inbox.
  ADD CONSTRAINT invites_kind_check CHECK (kind IN ('staff', 'vendor', 'client')),

  -- AN EXTERNAL PRINCIPAL HOLDS NO ROLE. THIS IS THE ESCALATION IT PREVENTS.
  --
  -- `roles` predates this column, and the obvious acceptance handler copies
  -- `invites.roles` into `principals.roles`. A client invitation carrying
  -- `roles: ['finance_manager']` would then mint a principal that is a `client`
  -- for the portal's scoping and a finance manager for `loadEntitlements` —
  -- one row that is external where that widens what it can see and internal
  -- where that widens what it can do.
  --
  -- `scripts/seed-demo.mjs:358` already states the rule — "roles stays EMPTY. A
  -- portal principal holds no role at all: what it may see comes from its
  -- link" — as a comment beside an INSERT. A comment binds the one INSERT it
  -- sits beside. This binds every write to the table.
  --
  -- What a client may see comes from `identity.principal_links`, granted
  -- afterwards on the client-access screen. A vendor's comes the same way.
  ADD CONSTRAINT invites_external_holds_no_role_check
    CHECK (kind = 'staff' OR cardinality(roles) = 0);

-- ------------------------------------------------------- the bootstrap read ---
--
-- Redeeming an invitation is the same chicken-and-egg as signing in, one step
-- earlier. The person holding the token has no principal yet, so no tenant can
-- be resolved from their credential, so `identity.invites` — FORCE RLS, like
-- every tenant table — returns zero rows to any query they could cause.
--
-- The answer is the one 0003 already established for `resolve_principal`: a
-- separate app_auth-owned lookup table holding ONLY what bootstrapping needs,
-- read through a SECURITY DEFINER function with a pinned search_path. Not a
-- BYPASSRLS role, which makes every policy decorative, and not a grant to
-- app_runtime over every invitation in every tenant.
--
-- This table holds a hash, a tenant and an invite id. No email, no kind, no
-- roles: a dump of it says that an unredeemed invitation exists for some tenant
-- and nothing about who it is for or what it would create. The kind is read
-- afterwards, from `identity.invites`, inside the tenant context — so the
-- policy applies to the read that actually decides what gets minted.

CREATE TABLE identity.invite_lookup (
  token_hash bytea PRIMARY KEY,
  tenant_id  uuid NOT NULL,
  invite_id  uuid NOT NULL
);

ALTER TABLE identity.invite_lookup OWNER TO app_auth;
ALTER TABLE identity.invite_lookup ENABLE ROW LEVEL SECURITY;
-- ENABLE without FORCE, for the reason 0003 gives for `principal_lookup`: the
-- owner is the only reader, through the definer function below, and it has no
-- tenant to predicate on. app_runtime is granted nothing here.

-- Deliberately NOT backfilled from `identity.invites`. Every invitation minted
-- before this migration was unredeemable when it was minted, so nothing is
-- lost by leaving it that way — and a backfill would have to read a FORCE-RLS
-- table with no tenant set, which returns nothing and would look like it had
-- worked.

CREATE FUNCTION identity.register_invite(p_token_hash bytea, p_invite_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = identity, tenancy, pg_temp
AS $$
DECLARE
  v_tenant uuid := tenancy.current_tenant_id();
BEGIN
  -- The tenant comes from the session setting, never from an argument, so the
  -- caller cannot register an invitation into somebody else's tenant. Same
  -- shape as `identity.register_principal`.
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'register_invite requires a tenant context';
  END IF;
  INSERT INTO identity.invite_lookup (token_hash, tenant_id, invite_id)
  VALUES (p_token_hash, v_tenant, p_invite_id)
  ON CONFLICT (token_hash) DO NOTHING;
END
$$;

ALTER FUNCTION identity.register_invite(bytea, uuid) OWNER TO app_auth;
REVOKE ALL ON FUNCTION identity.register_invite(bytea, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.register_invite(bytea, uuid) TO app_runtime;

CREATE FUNCTION identity.tenant_for_invite(p_token_hash bytea)
  RETURNS TABLE (tenant_id uuid, invite_id uuid)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = identity, pg_temp
AS $$
  SELECT l.tenant_id, l.invite_id
    FROM identity.invite_lookup l
   WHERE l.token_hash = p_token_hash
   LIMIT 1
$$;

ALTER FUNCTION identity.tenant_for_invite(bytea) OWNER TO app_auth;
REVOKE ALL ON FUNCTION identity.tenant_for_invite(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.tenant_for_invite(bytea) TO app_runtime;

COMMENT ON FUNCTION identity.tenant_for_invite(bytea) IS
  'Bootstrap only: maps an invite token HASH to (tenant, invite) so a context '
  'can be built to redeem it. SECURITY DEFINER because the redeemer has no '
  'principal yet. Returns two ids and nothing else - no email, no kind, no '
  'roles. It cannot enumerate: without the exact hash it returns nothing, and '
  'the hash is of a 256-bit token that is never stored in the clear.';

GRANT SELECT ON identity.invite_lookup TO app_auth;

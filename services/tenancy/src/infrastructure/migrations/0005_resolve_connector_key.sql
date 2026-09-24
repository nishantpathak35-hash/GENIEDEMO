-- 0005 — resolving a connector key to a tenant.
--
-- Forward-only. Never edit this file.
--
-- The same bootstrap problem as identity, and the same shape of answer: a
-- connector presents a bearer key and no tenant id, so the key must be read
-- BEFORE any tenant context exists. Under RLS a tenant-scoped read with no
-- tenant set returns zero rows, and nothing could ever authenticate.
--
-- `tenancy.connector_keys` is owned by app_auth and app_runtime holds no grant
-- on it — deliberately, because "readable before a tenant is known" must not
-- mean "every tenant's API keys readable by the role that serves untrusted
-- requests". This function is the only way in.

CREATE FUNCTION tenancy.resolve_connector_key(p_prefix text, p_hash bytea)
  RETURNS TABLE (tenant_id uuid, key_id uuid)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = tenancy, pg_temp
AS $$
  SELECT k.tenant_id, k.id
    FROM tenancy.connector_keys k
   WHERE k.key_prefix = p_prefix
     -- The hash comparison happens INSIDE the function, so the stored hash
     -- never enters the runtime session. The caller supplies a candidate and
     -- learns only whether it matched.
     AND k.key_hash = p_hash
     AND k.revoked_at IS NULL
     AND (k.expires_at IS NULL OR k.expires_at > now())
   LIMIT 1
$$;

ALTER FUNCTION tenancy.resolve_connector_key(text, bytea) OWNER TO app_auth;
REVOKE ALL ON FUNCTION tenancy.resolve_connector_key(text, bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.resolve_connector_key(text, bytea) TO app_runtime;

COMMENT ON FUNCTION tenancy.resolve_connector_key(text, bytea) IS
  'Bootstrap only: maps a presented connector key to (tenant, key) so a tenant '
  'context can be built. SECURITY DEFINER because the caller has no tenant yet. '
  'Returns two ids and nothing else. Revoked and expired keys return no row, so '
  'rotation with an overlap window works without the caller knowing which key '
  'of several matched.';

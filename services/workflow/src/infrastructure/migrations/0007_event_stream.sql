-- 0007 — the realtime event stream.
--
-- Forward-only. Never edit this file.
--
-- Replaces `broadcast_events`, which the legacy SSE endpoint **polls every two
-- seconds, per connected client** (STACK-MIGRATION defect 9). Twenty users on a
-- dashboard is 600 queries a minute against a table that is almost always
-- unchanged, and a change is still up to two seconds late.
--
-- Postgres already has the primitive: LISTEN/NOTIFY. A trigger publishes on
-- commit, so a subscriber is woken by the write rather than by a clock.

CREATE TABLE workflow.events (
  tenant_id   uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id          bigint GENERATED ALWAYS AS IDENTITY,

  entity_type text NOT NULL,
  entity_id   text NOT NULL,
  action      text NOT NULL,
  -- Ids only. See the NOTIFY payload note below.
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,

  occurred_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT events_pkey PRIMARY KEY (tenant_id, id)
);

CREATE INDEX events_tenant_seq_idx ON workflow.events (tenant_id, id DESC);

ALTER TABLE workflow.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow.events FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON workflow.events AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON workflow.events AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

GRANT SELECT, INSERT, DELETE ON workflow.events TO app_runtime;

-- Publish on commit.
--
-- **The NOTIFY payload carries the tenant id and the row id, and nothing else.**
-- Three reasons, in order of severity:
--
--   1. NOTIFY is NOT subject to row-level security. Anything put in the payload
--      is delivered to every listener on that channel regardless of tenant, so
--      putting entity data in it would undo the isolation the rest of this
--      schema enforces.
--   2. The payload has a hard 8000-byte limit; exceeding it raises at COMMIT
--      time and fails the whole transaction that made the change.
--   3. A subscriber must re-read the row through `withTenant` anyway, because
--      only that read is policy-checked.
--
-- The channel name is fixed rather than per-tenant: a per-tenant channel name
-- would leak the set of active tenant ids to anyone able to run
-- `pg_listening_channels()`, and the listener filters on the tenant id it is
-- scoped to.
CREATE FUNCTION workflow.publish_event() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = workflow, pg_temp
AS $$
BEGIN
  PERFORM pg_notify(
    'cog_events',
    json_build_object('tenantId', NEW.tenant_id, 'id', NEW.id)::text
  );
  RETURN NEW;
END
$$;

CREATE TRIGGER events_publish
  AFTER INSERT ON workflow.events
  FOR EACH ROW EXECUTE FUNCTION workflow.publish_event();

COMMENT ON TABLE workflow.events IS
  'Per-tenant event log for SSE. The NOTIFY payload carries only tenantId and '
  'id: NOTIFY is not subject to RLS, so anything in the payload reaches every '
  'listener. Subscribers re-read the row through withTenant, which is the only '
  'policy-checked path.';

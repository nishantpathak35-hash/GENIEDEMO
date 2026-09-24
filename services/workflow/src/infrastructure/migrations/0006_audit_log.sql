-- 0006 — the append-only audit log.
--
-- Forward-only. Never edit this file.
--
-- ENTERPRISE-READINESS lists this as design-in-from-milestone-1 and expensive
-- to retrofit: "append-only audit log on every mutation — actor, action, tenant,
-- timestamp, source IP". SOC 2 Type II needs 6–12 months of evidence, so the
-- log has to start early or the clock starts late.
--
-- The legacy `audit_logs` table is not this. It has five free-text columns
-- (`user`, `action_type`, `details`, `department`), no tenant, no entity
-- reference, no before/after, and nothing preventing an UPDATE or a DELETE —
-- and `logAudit` is called before the operation it describes succeeds, so a
-- failed delete still writes "PO Deleted".

CREATE SCHEMA IF NOT EXISTS workflow AUTHORIZATION app_migrator;
GRANT USAGE ON SCHEMA workflow TO app_runtime;

CREATE TABLE workflow.audit_events (
  tenant_id   uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id          uuid NOT NULL,

  -- WHO. Taken from the tenant context, never from a request body.
  actor_id    text NOT NULL,
  actor_kind  text NOT NULL,
  -- Present when a support engineer is acting as a customer's user. An
  -- impersonated action that looks identical to a real one is the finding a
  -- SOC 2 auditor opens with.
  impersonated_by text,

  -- WHAT.
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   text NOT NULL,

  -- The change itself. JSONB rather than the legacy free-text
  -- `"PO Value: "1000" -> "1200""`, which cannot be queried, diffed or
  -- reconciled.
  --
  -- MONEY INSIDE JSONB IS A STRING, ALWAYS. node-postgres parses jsonb with
  -- JSON.parse, so a bigint written as a number comes back as a float and a
  -- crore-scale figure loses precision on the way out of the audit trail —
  -- which is the one place that must not happen.
  before      jsonb,
  after       jsonb,

  -- WHEN and FROM WHERE.
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source_ip   inet,
  request_id  text,

  CONSTRAINT audit_events_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT audit_events_actor_kind_check
    CHECK (actor_kind IN ('staff', 'vendor', 'client', 'connector', 'system'))
);

CREATE INDEX audit_events_entity_idx
  ON workflow.audit_events (tenant_id, entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_events_actor_idx
  ON workflow.audit_events (tenant_id, actor_id, occurred_at DESC);

ALTER TABLE workflow.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow.audit_events FORCE  ROW LEVEL SECURITY;

-- Append-only is enforced by PRIVILEGE, not by convention.
--
-- Two separate policies rather than one FOR ALL: the runtime may insert and
-- read its own tenant's events and there is deliberately NO update or delete
-- policy. Combined with the grant below — which omits UPDATE and DELETE — a bug
-- that tries to rewrite history fails on privilege before it reaches a policy.
--
-- A `FOR ALL` policy plus a narrow grant would also work, but it would read as
-- though updating were merely unpolicied rather than forbidden.
CREATE POLICY tenant_isolation ON workflow.audit_events AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON workflow.audit_events AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

-- No UPDATE. No DELETE. No TRUNCATE (which is not subject to RLS at all).
GRANT SELECT, INSERT ON workflow.audit_events TO app_runtime;

COMMENT ON TABLE workflow.audit_events IS
  'Append-only. app_runtime holds SELECT and INSERT only, so rewriting history '
  'fails on privilege rather than on a policy. Money inside before/after is '
  'stored as a STRING: jsonb is parsed with JSON.parse, and a bigint written as '
  'a number would come back as a float.';

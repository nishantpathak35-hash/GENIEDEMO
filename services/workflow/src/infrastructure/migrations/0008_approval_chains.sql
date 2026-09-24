-- 0008 — approval chains, and the history that records them.
--
-- Forward-only. Never edit this file.
--
-- Replaces four separate mini-engines. The legacy has `ApprovalWorkflowService`
-- for payments and purchase orders, and then `approveChangeOrder`,
-- `approveSiteImprest` and `DPRService.updateDPR` each set a status string
-- directly without consulting it — so "who may approve what" has four different
-- answers in one codebase.

CREATE TABLE workflow.approval_chains (
  tenant_id   uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id          uuid NOT NULL,
  -- What this chain governs: 'purchase_order', 'payment_request',
  -- 'change_order', 'site_imprest'. Deliberately not a CHECK constraint — a new
  -- entity type is configuration, and a migration to add one would be a
  -- deployment for what should be an admin action.
  entity_type text NOT NULL,
  name        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT approval_chains_pkey PRIMARY KEY (tenant_id, id)
);

-- One active chain per entity type per tenant. Two active chains would order by
-- whatever the query returned, and the same request could take different routes
-- on different days.
CREATE UNIQUE INDEX approval_chains_one_active_idx
  ON workflow.approval_chains (tenant_id, entity_type)
  WHERE is_active;

CREATE TABLE workflow.approval_stages (
  tenant_id     uuid NOT NULL,
  chain_id      uuid NOT NULL,
  id            uuid NOT NULL,
  name          text NOT NULL,
  sequence      integer NOT NULL,
  approver_role text NOT NULL DEFAULT '',

  -- EVERY COLUMN HERE IS EVALUATED BY THE ENGINE.
  --
  -- The legacy `approval_workflow_stages` declares nine fields and evaluates
  -- one: min_approval_count, approval_type, specific_user, department,
  -- comments_mandatory, auto_approval, escalation_ready and skip_conditions are
  -- all accepted and ignored, so configuring "two approvers required" silently
  -- yields one (APPR-03). A column that cannot be honoured is not declared here.
  min_approvals integer NOT NULL DEFAULT 1,

  CONSTRAINT approval_stages_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT approval_stages_chain_fkey
    FOREIGN KEY (tenant_id, chain_id) REFERENCES workflow.approval_chains (tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT approval_stages_min_check CHECK (min_approvals >= 1),
  -- A quorum with no role named is almost certainly a misconfiguration.
  CONSTRAINT approval_stages_quorum_needs_role_check
    CHECK (min_approvals = 1 OR approver_role <> ''),
  -- Two stages claiming one position would order by whatever the database
  -- returned, which differs between environments.
  CONSTRAINT approval_stages_sequence_key UNIQUE (tenant_id, chain_id, sequence)
);

-- ------------------------------------------------------------- history -----
-- ONE audit trail, not three.
--
-- The legacy has `approval_history_v2` (insert-only), `po_approval_history`
-- (rewritten when a PO is renamed, deleted with the PO) and `audit_logs`
-- (queried by `details LIKE '%(ID: n)%'`). Three trails with opposite
-- durability guarantees, and the one a dispute would rely on is the one that
-- disappears (APPR-04).

CREATE TABLE workflow.approval_history (
  tenant_id     uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id            uuid NOT NULL,

  entity_type   text NOT NULL,
  entity_id     text NOT NULL,
  stage_name    text NOT NULL,
  decision      text NOT NULL,
  approver_id   text NOT NULL,
  -- Who the approval was FOR, so self-approval is answerable from the record
  -- rather than by re-deriving it.
  requester_id  text NOT NULL,
  remarks       text NOT NULL DEFAULT '',
  occurred_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT approval_history_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT approval_history_decision_check
    CHECK (decision IN ('approved', 'rejected', 'submitted', 'withdrawn')),
  -- An approver may satisfy a given stage of a given entity at most once, so a
  -- quorum cannot be met by one person twice. Enforced here as well as in the
  -- engine: the engine can be bypassed by a future code path, the constraint
  -- cannot.
  CONSTRAINT approval_history_one_per_stage_key
    UNIQUE (tenant_id, entity_type, entity_id, stage_name, approver_id)
);

CREATE INDEX approval_history_entity_idx
  ON workflow.approval_history (tenant_id, entity_type, entity_id, occurred_at);

ALTER TABLE workflow.approval_chains  ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow.approval_chains  FORCE  ROW LEVEL SECURITY;
ALTER TABLE workflow.approval_stages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow.approval_stages  FORCE  ROW LEVEL SECURITY;
ALTER TABLE workflow.approval_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow.approval_history FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON workflow.approval_chains AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON workflow.approval_chains AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

CREATE POLICY tenant_isolation ON workflow.approval_stages AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON workflow.approval_stages AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

CREATE POLICY tenant_isolation ON workflow.approval_history AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON workflow.approval_history AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON workflow.approval_chains TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON workflow.approval_stages TO app_runtime;

-- History is append-only, like the audit log. No UPDATE, no DELETE.
-- The legacy `po_approval_history` is rewritten when a PO is renamed and
-- deleted with the PO, so the record of who approved what disappears with the
-- thing it was approving.
GRANT SELECT, INSERT ON workflow.approval_history TO app_runtime;

COMMENT ON TABLE workflow.approval_history IS
  'Append-only, one trail for every entity type. The UNIQUE on '
  '(tenant, entity, stage, approver) is what stops one person satisfying a '
  'multi-approver stage twice — enforced in the database as well as the engine, '
  'because the engine can be bypassed by a future code path and the constraint '
  'cannot.';

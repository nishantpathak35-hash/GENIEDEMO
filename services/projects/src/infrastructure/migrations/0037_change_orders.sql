-- 0037 — Change orders (variations).
--
-- Forward-only. Never edit this file.
--
-- **The shape here follows `services/projects/src/domain/change-order.ts`,
-- which already exists and already decided these questions.** That module
-- records CO-01, CO-02 and CO-03 and fixes all three; this migration is the
-- table it was written against, and nothing below re-decides anything it
-- settled.
--
--   * `cost_impact` is **signed** — positive is an addition, negative an
--     omission — because that is what `contractValue()` sums.
--   * the states are `CO_STATES` exactly: draft, pending_client,
--     client_approved, client_rejected, withdrawn.
--
-- **A variation is a row. The contract value is never edited.** `0010` already
-- records why `projects.original_value` is "never overwritten":
-- `change-orders.js:82-84` does
-- `UPDATE client_boqs SET contract_value = contract_value + cost_impact` in
-- place, so after two variations nobody can say what was signed (CO-02).
--
-- **CO-04 (new): approving the same variation twice adds its cost twice.**
-- `approveChangeOrder` (`change-orders.js:62-94`) never checks the current
-- status before applying the increment. The domain's `TRANSITIONS` table
-- already makes that unrepresentable — `client_approved: []`, so an approved
-- variation has no outgoing transition and `decide()` refuses — and this
-- migration adds the storage-level half: the decision columns must agree with
-- the state.

CREATE TABLE projects.change_orders (
  tenant_id   uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id          uuid NOT NULL,
  project_id  uuid NOT NULL,

  number      text NOT NULL,
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',

  -- Signed paise. Positive raises the contract, negative lowers it — the
  -- representation `contractValue()` in the domain sums directly.
  cost_impact bigint NOT NULL,

  state       text NOT NULL DEFAULT 'draft',
  decided_by  text,
  decided_at  timestamptz,

  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  version     integer NOT NULL DEFAULT 1,

  CONSTRAINT change_orders_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT change_orders_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT change_orders_created_by_fkey
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT change_orders_number_key UNIQUE (tenant_id, project_id, number),
  CONSTRAINT change_orders_state_check CHECK (
    state IN ('draft', 'pending_client', 'client_approved', 'client_rejected', 'withdrawn')
  ),
  CONSTRAINT change_orders_version_check CHECK (version >= 1),

  -- A decided variation says who decided it and when; an undecided one says
  -- neither. `decided_by` is free text because the decision is the CLIENT's and
  -- a client is not a principal in this system — which is also why the legacy's
  -- `approveChangeOrderAsClient` is the function CO-03 is about.
  CONSTRAINT change_orders_decision_check CHECK (
    (state IN ('client_approved', 'client_rejected'))
      = (decided_by IS NOT NULL AND decided_at IS NOT NULL)
  ),
  -- A variation worth nothing cannot be sent for signature. `submitToClient`
  -- refuses it in the domain; this refuses it in the table.
  CONSTRAINT change_orders_nonzero_check CHECK (
    state = 'draft' OR cost_impact <> 0
  )
);

CREATE INDEX change_orders_project_idx
  ON projects.change_orders (tenant_id, project_id, state);

ALTER TABLE projects.change_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.change_orders FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects.change_orders AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON projects.change_orders AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
REVOKE ALL ON projects.change_orders FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON projects.change_orders TO app_runtime;

COMMENT ON TABLE projects.change_orders IS
  'Variations. The current contract value is projects.original_value plus the '
  'client_approved rows here, derived by contractValue() in the domain — the '
  'legacy adds cost_impact into the contract value in place (CO-02) and never '
  'checks the status before doing it, so approving twice pays twice (CO-04).';

COMMENT ON COLUMN projects.change_orders.decided_by IS
  'Who signed, as free text: the decision is the client''s and a client is not a '
  'principal here. approveChangeOrderAsClient treats anything that is not the '
  'literal string Reject as an approval, including an empty field (CO-03).';

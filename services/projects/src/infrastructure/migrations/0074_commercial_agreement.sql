-- Workflow 4 of eleven: the commercial agreement and its payment stages.
--
-- **Verdict: THIN.** `docs/ports/design-build-workflows.md` has the evidence.
-- The legacy version of this is CRUD, and the defaults are the tell:
-- `deposit_pct ?? 10` (`design-build.js:1053`), `validity_days ?? 30` (`:1054`),
-- `included_revisions ?? 2` (`:1058`), `included_site_visits ?? 6` (`:1059`).
-- Four commercial terms invented by the software, and **nothing reads any of
-- them** — no code refuses a third revision, raises a deposit invoice, or
-- expires a quotation.
--
-- **So none of those four columns exists here.** A thin verdict is not a reason
-- to skip a workflow; it is a reason to build the mechanism and leave the
-- invented numbers out. What remains is the part with a consequence: a contract
-- value, and the stages that release it.
--
-- The one rule this DOES enforce, which the legacy has no equivalent of:
-- **the payment stages have to add up to the whole contract.** A schedule whose
-- shares total 95% is a schedule that never bills the last 5%, and it looks
-- completely normal on the screen.
--
-- Money is `bigint` paise. The legacy's `contract_value` is a float that is
-- never compared with anything.
--
-- Off by default — `tenancy.tenant_modules`, migration 0065.

CREATE TABLE projects.commercial_agreements (
  tenant_id  uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,

  engagement_type text NOT NULL DEFAULT '',

  -- Paise, NULLABLE. A value still being negotiated is absent; zero is a
  -- contract worth nothing.
  contract_value_paise bigint,

  -- draft | issued | signed
  -- No `superseded`: a signed agreement is amended by a change order, which is
  -- a mechanism that already exists and already goes through approval.
  status     text NOT NULL DEFAULT 'draft',

  signed_on  date,
  notes      text NOT NULL DEFAULT '',

  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT commercial_agreements_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT commercial_agreements_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT commercial_agreements_updated_by_fkey
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,

  -- One per project. A second agreement for the same job is two contracts, and
  -- which one is being billed against becomes a question nobody can answer.
  CONSTRAINT commercial_agreements_project_key UNIQUE (tenant_id, project_id),

  CONSTRAINT commercial_agreements_status_check CHECK (status IN ('draft', 'issued', 'signed')),
  CONSTRAINT commercial_agreements_value_check CHECK (
    contract_value_paise IS NULL OR contract_value_paise >= 0
  ),
  -- A signed agreement has a value and a date. Signing something whose value is
  -- still blank is the state that produces an invoice nobody can raise.
  CONSTRAINT commercial_agreements_signed_check CHECK (
    status <> 'signed' OR (contract_value_paise IS NOT NULL AND signed_on IS NOT NULL)
  )
);

CREATE INDEX commercial_agreements_tenant_idx ON projects.commercial_agreements (tenant_id);

ALTER TABLE projects.commercial_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.commercial_agreements FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects.commercial_agreements AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON projects.commercial_agreements AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON projects.commercial_agreements FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON projects.commercial_agreements TO app_runtime;

-- ------------------------------------------------------------------------ --

-- What releases each part of the contract value.
CREATE TABLE projects.agreement_stages (
  tenant_id    uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL,

  position     integer NOT NULL,
  name         text NOT NULL,
  -- What has to have happened. Prose, because it is: "on completion of
  -- ceiling", "against delivery to site".
  trigger      text NOT NULL DEFAULT '',

  -- **Basis points of the contract value, never a percentage float.** The
  -- amount is computed from this by `packages/money`, which is the only module
  -- permitted to multiply money, and it is computed at read time rather than
  -- stored: a stored amount and a stored share go out of step the moment the
  -- contract value changes, and then two screens disagree about what is owed.
  share_bp     integer NOT NULL,

  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT agreement_stages_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT agreement_stages_agreement_fkey
    FOREIGN KEY (tenant_id, agreement_id)
    REFERENCES projects.commercial_agreements (tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT agreement_stages_position_key UNIQUE (tenant_id, agreement_id, position),
  CONSTRAINT agreement_stages_name_check CHECK (length(name) BETWEEN 1 AND 120),
  -- A stage worth nothing is not a stage, and one worth more than the whole
  -- contract is a typo that looks plausible on its own line.
  CONSTRAINT agreement_stages_share_check CHECK (share_bp > 0 AND share_bp <= 10000)
);

CREATE INDEX agreement_stages_agreement_idx
  ON projects.agreement_stages (tenant_id, agreement_id, position);

ALTER TABLE projects.agreement_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.agreement_stages FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects.agreement_stages AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON projects.agreement_stages AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON projects.agreement_stages FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON projects.agreement_stages TO app_runtime;

COMMENT ON TABLE projects.agreement_stages IS
  'Payment stages as basis points of the contract value. The set must total exactly 10000 before an agreement can be signed.';

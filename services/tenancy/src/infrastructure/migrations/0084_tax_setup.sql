-- 0084 — the two questions about the business, and when the tax review was read.
--
-- Forward-only. Never edit this file.
--
-- Settings › Tax asks two yes/no questions the design took from the way a
-- fit-out contractor is taxed: does this organisation's contract bundle
-- materials and labour under one contract (a works contract), and does it pay
-- transporters who have given it a PAN declaration. They are FLAGS, not
-- figures. No rate, threshold, section or effective date is stored here or
-- derived from here — every statutory value stays in `services/finance`,
-- verified by a named CA (ADR-0014, `docs/statutory/QUESTIONS-FOR-CA.md`).
-- What a flag changes — which rule applies — is the CA's answer to give, and
-- nothing reads these columns to compute anything until that answer lands.
--
-- Nullable, because "not yet answered" is a real state and `false` would be
-- an answer nobody gave. The review-completed pair records that somebody read
-- the screen and said so; it is a fact about the setup checklist and unlocks
-- nothing — the money path opens on verified rules, not on a tick.
--
-- DATA-12 in `docs/BACKLOG.md`.

CREATE TABLE tenancy.tax_setup (
  -- One row per tenant, like `company_profile`: the primary key IS the tenant.
  tenant_id                 uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,

  works_contract_bundling   boolean,
  transporter_pan_declared  boolean,
  answered_by               uuid,
  answered_at               timestamptz,

  review_completed_by       uuid,
  review_completed_at       timestamptz,

  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tax_setup_pkey PRIMARY KEY (tenant_id),
  CONSTRAINT tax_setup_answered_by_fkey
    FOREIGN KEY (tenant_id, answered_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT tax_setup_review_completed_by_fkey
    FOREIGN KEY (tenant_id, review_completed_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,
  -- An answer carries who and when, or is not an answer.
  CONSTRAINT tax_setup_answer_provenance_check CHECK (
    (works_contract_bundling IS NULL AND transporter_pan_declared IS NULL)
    OR (answered_by IS NOT NULL AND answered_at IS NOT NULL)
  ),
  -- The review cannot be complete while a question is unanswered.
  CONSTRAINT tax_setup_complete_needs_answers_check CHECK (
    review_completed_at IS NULL
    OR (works_contract_bundling IS NOT NULL AND transporter_pan_declared IS NOT NULL)
  ),
  CONSTRAINT tax_setup_completion_provenance_check CHECK (
    (review_completed_at IS NULL) = (review_completed_by IS NULL)
  )
);

ALTER TABLE tenancy.tax_setup ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.tax_setup FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenancy.tax_setup AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON tenancy.tax_setup AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON tenancy.tax_setup FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenancy.tax_setup TO app_runtime;

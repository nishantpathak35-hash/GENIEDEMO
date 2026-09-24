-- 0092 — Where each statutory value came from, and the thresholds beside the rates.
--
-- Forward-only. Never edit this file.
--
-- The owner decided on 2026-09-15 (ADR-0014, addendum) to build the money path
-- on PROVISIONAL values. Two sources feed them, and a reader of a rate has to be
-- able to tell them apart: an answer relayed from a call with the CA, and our
-- reading of statute text the CA has not answered. `source` records which. It
-- is not evidence either way — `status`, `verified_by` and `verified_on` are,
-- and 0004's CHECK still refuses a verified row without them.
--
-- A threshold is a statutory value exactly as a rate is, so it carries the same
-- provenance columns and the same CHECK. It is money, so it is bigint paise.
--
-- NOTHING IS INSERTED HERE. A tenant's values are written by the application,
-- from `services/finance/src/domain/statutory-catalogue.ts`, and only ever as
-- `provisional`. The migration audit that no migration seeds a rate still holds.

ALTER TABLE finance.tax_rates ADD COLUMN source text;

CREATE TABLE finance.tds_thresholds (
  tenant_id      uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id             uuid NOT NULL,

  -- '194C' | '194I' | '194J' | '194Q'. Open text rather than a CHECK: a section
  -- the CA adds is a row, not a migration.
  section        text NOT NULL,
  -- What the amount means — the sections do not share one shape:
  --   single_payment    nothing deducted up to this, in one payment
  --   annual_aggregate  nothing deducted while the year's total stays within it
  --   monthly           nothing deducted up to this, for a month or part of one
  --   annual_excess     only the part of the year's total above it is deducted on
  kind           text NOT NULL,
  -- Paise.
  amount         bigint NOT NULL,

  effective_from date NOT NULL,
  effective_to   date,

  status         text NOT NULL DEFAULT 'provisional',
  statute        text,
  source         text,
  verified_by    text,
  verified_on    date,
  question_ref   text,

  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tds_thresholds_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT tds_thresholds_kind_check
    CHECK (kind IN ('single_payment', 'annual_aggregate', 'monthly', 'annual_excess')),
  CONSTRAINT tds_thresholds_amount_check CHECK (amount > 0),
  CONSTRAINT tds_thresholds_status_check CHECK (status IN ('provisional', 'verified')),
  CONSTRAINT tds_thresholds_period_check
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  -- The same rule as a rate: a verified row carries its evidence or is a claim.
  CONSTRAINT tds_thresholds_verified_evidence_check CHECK (
    status <> 'verified'
    OR (verified_by IS NOT NULL AND verified_on IS NOT NULL AND statute IS NOT NULL)
  )
);

CREATE INDEX tds_thresholds_lookup_idx
  ON finance.tds_thresholds (tenant_id, section, kind, effective_from);

ALTER TABLE finance.tds_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.tds_thresholds FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON finance.tds_thresholds AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON finance.tds_thresholds AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON finance.tds_thresholds FROM PUBLIC;
-- No DELETE: a threshold that changes is closed with effective_to and a new row
-- opened, so a payment made under the old one can still be explained.
GRANT SELECT, INSERT, UPDATE ON finance.tds_thresholds TO app_runtime;

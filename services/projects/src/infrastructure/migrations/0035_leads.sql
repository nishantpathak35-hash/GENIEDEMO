-- 0035 — Leads.
--
-- Forward-only. Never edit this file.
--
-- Leads live in `services/projects` because a lead becomes a project:
-- `convertLeadToProject` (`crm.js:165`) is the only thing that makes the module
-- more than a list.
--
-- **Money is `bigint` paise, not `REAL`.** `leads.estimated_value REAL DEFAULT 0`
-- (`migrations.js:415`) is a float, and `CrmView.js:53` multiplies it by a
-- probability percentage in the browser to produce a weighted pipeline figure.
-- That is money arithmetic on a float in a client, which ADR-0012 and ADR-0014
-- each forbid separately.
--
-- **CRM-01: there are four different probability ladders for the same stages.**
--   * `CrmView.js:402-407` — Lead 20, Qualified 45, Proposal Shared 70, Negotiation 90, Won 100
--   * `crm.js:131-139`     — Lead 30, Qualified 50, Proposal Shared 75, Negotiation 90, Won 100, Unqualified 10, Rejected 0
--   * `migrations.js:416`  — column default 40
--   * `crm.js:41`          — read fallback 40
-- Creating a lead in the UI writes the first; changing its stage overwrites with
-- the second; a lead created any other way gets the third. The weighted pipeline
-- a director reads is therefore a mix of ladders nobody chose.
--
-- **The ladder is not ported.** It is a commercial judgement with four
-- conflicting values and no stated basis — the same category as PO-15 and PO-18.
-- `probability_pct` is stored, supplied by the caller, and NOT derived from the
-- stage. When someone with authority over the business names one ladder it
-- becomes per-tenant configuration; until then, inventing a fifth would be worse
-- than storing what was entered.

CREATE TABLE projects.leads (
  tenant_id       uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id              uuid NOT NULL,

  client_name     text NOT NULL,
  contact_name    text NOT NULL DEFAULT '',
  phone           text NOT NULL DEFAULT '',
  email           text NOT NULL DEFAULT '',

  stage           text NOT NULL DEFAULT 'lead',

  -- Paise. Never REAL: CrmView.js:53 multiplies this by a percentage.
  estimated_value bigint NOT NULL DEFAULT 0,
  -- Whole percent, stored as entered. Not derived from the stage — see CRM-01.
  probability_pct integer NOT NULL DEFAULT 0,

  project_type    text NOT NULL DEFAULT '',
  source          text NOT NULL DEFAULT '',
  city            text NOT NULL DEFAULT '',
  consultant      text NOT NULL DEFAULT '',

  -- Who owns it. A principal, not the legacy's display-name-or-'Sales Team'
  -- string (`crm.js:78`), which is not an identity and cannot be joined on.
  owner_id        uuid,

  expected_close  date,
  notes           text NOT NULL DEFAULT '',

  -- Set when the lead is converted. The lead is not deleted: losing the
  -- provenance of a project is losing the only record of where the work came
  -- from.
  converted_project_id uuid,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  version         integer NOT NULL DEFAULT 1,

  CONSTRAINT leads_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT leads_owner_fkey
    FOREIGN KEY (tenant_id, owner_id)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT leads_project_fkey
    FOREIGN KEY (tenant_id, converted_project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE SET NULL,
  -- Lower-case enum. The legacy's stage is free text compared with exact
  -- title-case strings in a dozen places, which is how 'Rejected' and
  -- 'rejected' become different stages.
  CONSTRAINT leads_stage_check CHECK (
    stage IN ('lead', 'qualified', 'proposal_shared', 'negotiation', 'won', 'unqualified', 'rejected')
  ),
  CONSTRAINT leads_value_check CHECK (estimated_value >= 0),
  CONSTRAINT leads_probability_check CHECK (probability_pct BETWEEN 0 AND 100),
  CONSTRAINT leads_version_check CHECK (version >= 1),
  -- A won lead names the project it became; nothing else does.
  CONSTRAINT leads_converted_check CHECK (
    converted_project_id IS NULL OR stage = 'won'
  )
);

CREATE INDEX leads_stage_idx ON projects.leads (tenant_id, stage);

ALTER TABLE projects.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.leads FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects.leads AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON projects.leads AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
REVOKE ALL ON projects.leads FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON projects.leads TO app_runtime;

COMMENT ON TABLE projects.leads IS
  'Sales pipeline. estimated_value is paise, never REAL — CrmView.js:53 '
  'multiplies the legacy float by a probability in the browser. probability_pct '
  'is stored as entered and NOT derived from the stage: the legacy has four '
  'conflicting stage-to-probability ladders and no basis for any of them '
  '(CRM-01).';

COMMENT ON COLUMN projects.leads.converted_project_id IS
  'The project this lead became, once won. The lead row is kept: it is the only '
  'record of where the work came from.';

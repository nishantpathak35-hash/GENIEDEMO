-- 0060 — what a lead accumulates while somebody works it.
--
-- Forward-only. Never edit this file.
--
-- Our CRM is one screen: a pipeline, and a form that edits a lead. The repaired
-- legacy tree has eight components and twenty-six API functions, and the gap is
-- not decoration — it is everything that happens between recording a lead and
-- winning it. Three things carry that weight and each is a table or a column
-- here:
--
--   * **contacts**, because a commercial fit-out lead has a facilities manager,
--     an architect and a procurement head, and `leads.contact_name` holds one
--     name;
--   * **a timeline**, because "what happened with this lead" is the question a
--     sales review asks and nothing could answer it;
--   * **a next follow-up date**, because a lead nobody has touched in a
--     fortnight is the one that goes cold, and that is a query rather than a
--     memory.
--
-- **What is deliberately NOT here: lead merging, proposals, and a duplicate
-- check that decides anything.** See the notes at the foot of this file.

-- ── Everyone at the client, not just the first person who answered ──────────

CREATE TABLE projects.lead_contacts (
  tenant_id  uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id    uuid NOT NULL,

  name       text NOT NULL,
  role       text NOT NULL DEFAULT '',
  phone      text NOT NULL DEFAULT '',
  email      text NOT NULL DEFAULT '',

  -- Exactly one primary per lead, or none. Enforced by a partial unique index
  -- rather than by application code, because "the primary contact" is who a
  -- proposal is addressed to and two of them is a question with no answer.
  is_primary boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lead_contacts_pkey PRIMARY KEY (tenant_id, id),

  -- COMPOSITE: referential integrity is exempt from RLS, so a single-column FK
  -- would let one tenant attach a contact to another tenant's lead and confirm,
  -- by the insert succeeding, that the lead exists.
  CONSTRAINT lead_contacts_lead_fkey
    FOREIGN KEY (tenant_id, lead_id)
    REFERENCES projects.leads (tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT lead_contacts_name_check CHECK (length(trim(name)) > 0)
);

CREATE INDEX lead_contacts_lead_idx ON projects.lead_contacts (tenant_id, lead_id);

CREATE UNIQUE INDEX lead_contacts_one_primary_idx
  ON projects.lead_contacts (tenant_id, lead_id)
  WHERE is_primary;

-- ── What happened, in order ─────────────────────────────────────────────────

CREATE TABLE projects.lead_activities (
  tenant_id  uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id    uuid NOT NULL,

  -- A closed vocabulary, because a timeline that can be filtered is worth more
  -- than one that accepts any string. 'stage_change' and 'lost' are written by
  -- the application rather than typed by a person: a stage moving is an event
  -- worth seeing next to the calls that caused it.
  kind       text NOT NULL,
  summary    text NOT NULL,
  detail     text NOT NULL DEFAULT '',

  -- When it HAPPENED, which is not when it was typed. A site visit recorded
  -- three days later is still a site visit on the day it happened, and a
  -- timeline ordered by entry time would put it in the wrong place.
  occurred_on date NOT NULL,

  recorded_by uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lead_activities_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT lead_activities_lead_fkey
    FOREIGN KEY (tenant_id, lead_id)
    REFERENCES projects.leads (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT lead_activities_by_fkey
    FOREIGN KEY (tenant_id, recorded_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT lead_activities_kind_check CHECK (
    kind IN ('call', 'meeting', 'email', 'site_visit', 'note', 'stage_change', 'lost')
  ),
  CONSTRAINT lead_activities_summary_check CHECK (length(trim(summary)) > 0)
);

CREATE INDEX lead_activities_lead_idx
  ON projects.lead_activities (tenant_id, lead_id, occurred_on DESC);

-- ── Two columns on the lead itself ──────────────────────────────────────────

ALTER TABLE projects.leads
  -- The next date somebody has committed to. Nullable: not every lead has a
  -- next step, and a NULL is a different and more useful answer than a date in
  -- the past.
  ADD COLUMN next_followup_on date,

  -- Why a lead was lost. The legacy asks for this in a modal
  -- (`CrmLostModal.js`) and it is the single most valuable field in a CRM,
  -- because it is the only one that changes what the company does next.
  ADD COLUMN lost_reason text NOT NULL DEFAULT '';

COMMENT ON COLUMN projects.leads.next_followup_on IS
  'The next date somebody committed to. NULL means no next step, which is a '
  'different answer from an overdue one and is worth being able to filter on.';

COMMENT ON COLUMN projects.leads.lost_reason IS
  'Why a lead was lost. Empty unless the stage is one of the closed-lost ones. '
  'A lost lead with no reason teaches nothing.';

-- A lead in a closed-lost stage carries a reason, and one that is not does not.
-- Written as a constraint rather than as a form validation because the form is
-- not the only way a row gets written.
ALTER TABLE projects.leads
  ADD CONSTRAINT leads_lost_reason_check CHECK (
    (stage IN ('unqualified', 'rejected')) OR length(trim(lost_reason)) = 0
  );

-- ── Isolation ───────────────────────────────────────────────────────────────

ALTER TABLE projects.lead_contacts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.lead_contacts   FORCE  ROW LEVEL SECURITY;
ALTER TABLE projects.lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.lead_activities FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects.lead_contacts AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON projects.lead_contacts AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

CREATE POLICY tenant_isolation ON projects.lead_activities AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON projects.lead_activities AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON projects.lead_contacts   FROM PUBLIC;
REVOKE ALL ON projects.lead_activities FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON projects.lead_contacts   TO app_runtime;

-- **No UPDATE and no DELETE on the timeline.** An activity is a record of
-- something that happened; correcting it means recording the correction, the
-- same shape as `workflow.audit_events`. A timeline somebody can edit is not
-- evidence of anything.
GRANT SELECT, INSERT ON projects.lead_activities TO app_runtime;

COMMENT ON TABLE projects.lead_contacts IS
  'Everyone at the client. A commercial fit-out lead has a facilities manager, '
  'an architect and a procurement head; leads.contact_name holds one name.';

COMMENT ON TABLE projects.lead_activities IS
  'What happened with a lead, in the order it happened. Append-only by '
  'privilege: app_runtime holds SELECT and INSERT and nothing else.';

-- ---------------------------------------------------------------------------
-- What was NOT ported, and why
-- ---------------------------------------------------------------------------
--
-- **Lead merging** (`crm.js:1417`). Merging moves records between leads and
-- then deletes one, which is destructive and irreversible. The legacy reaches
-- it from a duplicate check that matches on a fuzzy name, and this workspace's
-- standing warning is that identity by fuzzy string is the legacy's central
-- defect. A merge is worth building; it is worth building against explicit ids
-- chosen by a person, with the losing record retained rather than deleted, and
-- that is a piece of work rather than a column.
--
-- **Duplicate detection is a WARNING and nothing more.** A screen may say "two
-- other leads share this client name" and let somebody look. It must never
-- decide, block, or link on that basis.
--
-- **Proposals and generated proposal documents** (`crm.js:876`, `:939`). A
-- proposal carries a value, and a value on a document sent to a client is a
-- money path. It waits on the same gate as every other one.

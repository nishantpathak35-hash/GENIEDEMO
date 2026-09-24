-- 0086 — when a lead closed, and what kind of step comes next.
--
-- Forward-only. Never edit this file.
--
-- Sales draws "Won this quarter" and "Next site visit", and a lead carried
-- neither fact (DATA-09): its stage says it is won, not when; its
-- `next_followup_on` is a date with no kind, so a site visit and a phone
-- call look the same. Two columns, both stamped by the routes that already
-- change the stage and the follow-up, never typed by a caller.
--
-- `closed_on` is set on the day the stage becomes `won` or a closed-lost
-- stage and cleared if the lead is reopened; the quarter is the server's to
-- compute from it. Leads closed before this migration keep no date. `next_followup_kind` is one of the activity kinds a person
-- can actually do next — the same closed set as `lead_activities.kind`, minus
-- the two that record something that happened rather than something planned.

ALTER TABLE projects.leads
  ADD COLUMN closed_on date,
  ADD COLUMN next_followup_kind text,
  ADD CONSTRAINT leads_next_followup_kind_check CHECK (
    next_followup_kind IS NULL
    OR next_followup_kind IN ('call', 'meeting', 'email', 'site_visit', 'note')
  ),
  -- A kind without a date is a plan for no day.
  ADD CONSTRAINT leads_next_followup_pair_check CHECK (
    next_followup_kind IS NULL OR next_followup_on IS NOT NULL
  );

-- A closed date belongs only to a closed lead. The reverse is not enforced:
-- a lead closed before this column existed has no date on file, and "closed,
-- date not recorded" is the truthful state — a backfill from `updated_at`
-- would state a day nobody recorded, and could not run anyway under the
-- migrator role, which does not bypass the forced row policies. A quarter's
-- count therefore covers leads closed from this migration on.
ALTER TABLE projects.leads
  ADD CONSTRAINT leads_closed_on_check CHECK (
    closed_on IS NULL OR stage IN ('won', 'unqualified', 'rejected')
  );

COMMENT ON COLUMN projects.leads.closed_on IS
  'The day the stage became won or closed-lost. Stamped by the stage routes; '
  'NULL while the lead is open.';

COMMENT ON COLUMN projects.leads.next_followup_kind IS
  'What the next step IS — a call, a site visit — so a screen can ask for the '
  'next site visit rather than the next anything. Pairs with next_followup_on.';

CREATE INDEX leads_closed_on_idx ON projects.leads (tenant_id, closed_on) WHERE closed_on IS NOT NULL;

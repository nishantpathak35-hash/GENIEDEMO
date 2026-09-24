-- Merging two opportunities that are the same opportunity.
--
-- **The legacy's own lead merge is better than its project merge, and it still
-- has one defect worth the whole of this file.** `crm.js:1523` sets the losing
-- record's stage to `'Lost'` with a fabricated `lost_reason` of
-- "Merged Duplicate into <id>". A merged duplicate is then counted as a LOST
-- OPPORTUNITY in every pipeline figure: the win rate falls, the loss reasons
-- fill with a reason nobody gave, and the more diligent a team is about tidying
-- duplicates the worse their numbers look. A merge is not an outcome. It is a
-- correction to a record that should never have existed twice.
--
-- So `merged` is its own stage, outside won, lost and every other real result.
--
-- **What makes this reversible, or at minimum answerable.**
-- `crm.js:1440-1444` repoints five child tables with bare UPDATEs. After that
-- there is no way to tell which contacts arrived from the losing record — the
-- rows are indistinguishable from the ones that were always there — so the
-- merge cannot be undone even in principle, and the question "what did the
-- other record hold" has no answer beyond whatever survived on its own row.
--
-- Here every merge writes a row that carries:
--   * a snapshot of the losing record's own fields, as they were, and
--   * the identity of every child row that moved, by table and id.
--
-- That is the reversal plan. **There is deliberately no unmerge route.** An
-- automatic unmerge is a second write path over the same rows and a wrong one
-- silently splits a record in half; what is recorded here is enough for a
-- person to put it back, and enough to answer the question a client asks six
-- months later, which is the part that actually gets asked.
--
-- Nothing is deleted by a merge. The losing lead keeps its row, its history and
-- its own fields.

-- `merged` joins the stage vocabulary. Forward-only: the CHECK is dropped and
-- rewritten rather than edited in place, which is the only way to change one.
ALTER TABLE projects.leads DROP CONSTRAINT leads_stage_check;
ALTER TABLE projects.leads
  ADD CONSTRAINT leads_stage_check CHECK (
    stage IN (
      'lead', 'qualified', 'proposal_shared', 'negotiation',
      'won', 'unqualified', 'rejected',
      -- Not an outcome. A record that turned out to be another record.
      'merged'
    )
  );

ALTER TABLE projects.leads
  -- Where this record went. NULL for everything that was never merged.
  ADD COLUMN merged_into_id uuid,
  ADD CONSTRAINT leads_merged_into_fkey
    FOREIGN KEY (tenant_id, merged_into_id)
    REFERENCES projects.leads (tenant_id, id) ON DELETE SET NULL,
  -- A record cannot be merged into itself. The application refuses it first
  -- with a message; this is what makes the refusal true rather than customary.
  ADD CONSTRAINT leads_merged_into_self_check CHECK (merged_into_id IS DISTINCT FROM id);

CREATE INDEX leads_merged_into_idx
  ON projects.leads (tenant_id, merged_into_id)
  WHERE merged_into_id IS NOT NULL;

CREATE TABLE projects.lead_merges (
  tenant_id    uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id           uuid NOT NULL DEFAULT gen_random_uuid(),

  -- The record that survived, and the record that was folded into it.
  primary_id   uuid NOT NULL,
  secondary_id uuid NOT NULL,

  -- **The losing record's own fields, as they were at the moment of the merge.**
  --
  -- jsonb rather than a column per field, and this is the one place in this
  -- schema where that is the right answer: it is a SNAPSHOT, not live data. It
  -- is never queried by field, never joined, and never updated. Giving it
  -- columns would mean this table has to change every time `leads` does, and a
  -- snapshot that drifts from the shape it snapshotted is worse than no
  -- snapshot.
  losing_before jsonb NOT NULL,

  -- What the surviving record looked like BEFORE the merge filled its gaps.
  -- Without this, "the phone number came from the other record" is a guess.
  primary_before jsonb NOT NULL,

  -- Every child row that moved: `[{"table": "lead_contacts", "id": "..."}]`.
  -- This is what the legacy has no equivalent of and what makes the merge
  -- answerable — a repointed contact is otherwise indistinguishable from one
  -- that was always there.
  repointed    jsonb NOT NULL,

  merged_by    uuid,
  merged_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lead_merges_pkey PRIMARY KEY (tenant_id, id),

  -- Composite, all three. Referential integrity is exempt from RLS, so a
  -- single-column FK would confirm another tenant's lead exists by whether the
  -- insert succeeded.
  --
  -- **No ON DELETE CASCADE on either lead.** A merge record that disappears
  -- with the record it describes is not a record. Leads are not deleted here
  -- anyway; RESTRICT makes that a rule rather than a habit.
  CONSTRAINT lead_merges_primary_fkey
    FOREIGN KEY (tenant_id, primary_id)
    REFERENCES projects.leads (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT lead_merges_secondary_fkey
    FOREIGN KEY (tenant_id, secondary_id)
    REFERENCES projects.leads (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT lead_merges_by_fkey
    FOREIGN KEY (tenant_id, merged_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,

  CONSTRAINT lead_merges_distinct_check CHECK (primary_id <> secondary_id),
  -- One record can be merged away exactly once. A second merge of the same
  -- losing record would move rows that are no longer its own.
  CONSTRAINT lead_merges_secondary_key UNIQUE (tenant_id, secondary_id)
);

CREATE INDEX lead_merges_tenant_idx  ON projects.lead_merges (tenant_id);
-- "What was folded into this one" — the question the surviving record's screen
-- asks.
CREATE INDEX lead_merges_primary_idx ON projects.lead_merges (tenant_id, primary_id);

ALTER TABLE projects.lead_merges ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.lead_merges FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects.lead_merges AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON projects.lead_merges AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON projects.lead_merges FROM PUBLIC;
-- **No UPDATE and no DELETE.** This is evidence about a correction somebody
-- made, in the same way `workflow.audit_events` is evidence about what the
-- system did. A merge record that can be edited answers nothing.
GRANT SELECT, INSERT ON projects.lead_merges TO app_runtime;

COMMENT ON TABLE projects.lead_merges IS
  'One row per lead merge: what the losing record held, what the surviving record held before its gaps were filled, and every child row that moved. Append-only by grant.';

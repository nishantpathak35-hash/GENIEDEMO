-- 0103 — the records a person opened last.
--
-- Forward-only. Never edit this file.
--
-- The bar's clock opens "the last records this person opened, newest first,
-- with the project each is on" (03-navigation, recent history), and the
-- switcher's Recent group is the projects among them. Written when a record
-- page opens, read by the bar on every request. A person's own trail — the
-- list of what a colleague looked at is not a thing to hand out — so every
-- read is filtered to the caller, as `notifications` is.
--
-- **The record is a pointer plus the words to draw it.** `kind` and
-- `record_id` say what was opened; `title`, `subtitle` and `href` are what the
-- popover prints, written at the time so a renamed vendor does not rewrite
-- the trail and the bar never joins seven tables to draw five rows. No
-- foreign key to the record: it is one of a dozen tables in five schemas, and
-- a stale entry is harmless — its link answers not found, which is true.
--
-- One row per (person, kind, record): opening the same order twice moves it
-- up rather than listing it twice. The application keeps the trail short.

CREATE TABLE workflow.recent_history (
  tenant_id     uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  principal_id  uuid NOT NULL,

  kind          text NOT NULL,
  record_id     text NOT NULL,
  title         text NOT NULL,
  subtitle      text NOT NULL DEFAULT '',
  href          text NOT NULL,
  -- the project the record is on, for the switcher's Recent; the pointer is a
  -- bare uuid like the record's, and for the same reason
  project_id    uuid,
  opened_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT recent_history_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT recent_history_once_key UNIQUE (tenant_id, principal_id, kind, record_id),
  CONSTRAINT recent_history_principal_fkey
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES identity.principals (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT recent_history_kind_check CHECK (kind IN (
    'project', 'order', 'vendor', 'lead', 'bill', 'payment', 'invoice', 'holding',
    'document', 'report', 'task', 'boq-line', 'page'
  )),
  CONSTRAINT recent_history_title_check CHECK (length(trim(title)) > 0 AND length(title) <= 200),
  CONSTRAINT recent_history_href_check CHECK (href LIKE '/%' AND length(href) <= 500)
);

CREATE INDEX recent_history_tenant_idx ON workflow.recent_history (tenant_id);
CREATE INDEX recent_history_person_idx
  ON workflow.recent_history (tenant_id, principal_id, opened_at DESC);

ALTER TABLE workflow.recent_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow.recent_history FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON workflow.recent_history AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON workflow.recent_history AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON workflow.recent_history FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON workflow.recent_history TO app_runtime;

COMMENT ON TABLE workflow.recent_history IS
  'The last records a person opened: a pointer and the words to draw it, written on open. Every read '
  'is the caller''s own trail.';

-- 0015 — Tasks.
--
-- Forward-only. Never edit this file.
--
-- Prefix `0015` is `workflow`'s allocated block in `docs/plans/M6.md`. Tasks
-- live in `services/workflow` because workflow owns *things a person must act
-- on*: it already holds approval chains and history keyed by
-- `(entity_type, entity_id)`, and a task is the same shape without a decision
-- attached.
--
-- **The legacy `tasks` table is created outside the migration system.**
-- `ensureTasksTable()` (`tasks.js:16-48`) issues `CREATE TABLE IF NOT EXISTS`
-- at the top of all six task functions, wrapped in a `try/catch` that swallows
-- the error (`:45-47`). It is never recorded in `schema_migrations`, so nothing
-- knows whether it exists or what shape it has. That is TASK-01 — not a data
-- defect, but the reason no one can say what the schema is.
--
-- **Assignment is by principal id, not by email string.** The legacy stores a
-- lowercased email in `assigned_to` and matches with `LOWER(assigned_to) = ?`
-- (`tasks.js:138`, `:203`), with no foreign key to any user table. An email
-- changes; a person does not. `identity.principals` is the referent, and the FK
-- is composite so a task cannot be assigned to another tenant's user.

CREATE TABLE workflow.tasks (
  tenant_id     uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id            uuid NOT NULL,

  title         text NOT NULL,
  description   text NOT NULL DEFAULT '',

  -- What the task is about. Free text plus an id, deliberately not a foreign
  -- key: a task may point at a purchase order, a BOQ line or a lead, and a
  -- polymorphic FK is not a thing. The pair is for display and filtering, and
  -- nothing authorises anything from it.
  entity_type   text NOT NULL DEFAULT 'general',
  entity_id     text NOT NULL DEFAULT '',
  entity_name   text NOT NULL DEFAULT '',

  project_id    uuid,

  assigned_to   uuid NOT NULL,
  assigned_by   uuid NOT NULL,

  due_date      date,
  priority      text NOT NULL DEFAULT 'medium',
  status        text NOT NULL DEFAULT 'pending',

  completed_at  timestamptz,
  completed_by  uuid,
  notes         text NOT NULL DEFAULT '',

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  version       integer NOT NULL DEFAULT 1,

  CONSTRAINT tasks_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT tasks_assigned_to_fkey
    FOREIGN KEY (tenant_id, assigned_to)
    REFERENCES identity.principals (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT tasks_assigned_by_fkey
    FOREIGN KEY (tenant_id, assigned_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT tasks_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE SET NULL,

  -- Lower-case enums, not the legacy's title-case free text. `stage.includes('reject')`
  -- elsewhere in the legacy is what an unconstrained status column leads to.
  CONSTRAINT tasks_status_check CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  CONSTRAINT tasks_priority_check CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  CONSTRAINT tasks_version_check CHECK (version >= 1),

  -- **TASK-02.** `updateTask` (`tasks.js:247-248`) writes `completed_at = ?` and
  -- `completed_by = ?` with no COALESCE, so any status change to something other
  -- than Completed silently NULLs the completion record — and setting status to
  -- Completed through that path leaves them NULL too. Here the two must agree:
  -- completed means both are set, anything else means neither is.
  CONSTRAINT tasks_completion_check CHECK (
    (status = 'completed') = (completed_at IS NOT NULL AND completed_by IS NOT NULL)
  )
);

CREATE INDEX tasks_assigned_idx ON workflow.tasks (tenant_id, assigned_to, status);
CREATE INDEX tasks_project_idx ON workflow.tasks (tenant_id, project_id);

ALTER TABLE workflow.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow.tasks FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workflow.tasks AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON workflow.tasks AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
REVOKE ALL ON workflow.tasks FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON workflow.tasks TO app_runtime;

COMMENT ON TABLE workflow.tasks IS
  'Work assigned to a person. Assignment is by principal id with a composite FK '
  'to identity.principals, not by the lowercased email string the legacy '
  'matches on (tasks.js:138). The legacy table is created by ensureTasksTable() '
  'outside the migration system, inside a try/catch that swallows the error '
  '(TASK-01).';

COMMENT ON CONSTRAINT tasks_completion_check ON workflow.tasks IS
  'Completed means completed_at and completed_by are both set; any other status '
  'means neither is. updateTask (tasks.js:247) NULLs both on every edit with no '
  'COALESCE, so completion metadata is lost on the next status change (TASK-02).';

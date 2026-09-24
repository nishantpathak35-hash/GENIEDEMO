-- Workflows 10 and 11 of eleven.
--
-- ── 10. Design timesheets. Verdict: THIN ────────────────────────────────────
--
-- `logDesignTimesheet:1444` validates that hours are above zero and writes a
-- row keyed by `user_email` — a string, not a principal.
-- `getTeamDesignWorkload:1481` then has the defect that shows how little is
-- behind it: `WHERE role IN ('designer', 'lead_designer', 'architect') OR
-- is_active = 1`. The `OR` makes the role filter inert, so the "design team
-- workload" is the whole company's.
--
-- Built anyway, because hours booked against a job is a real thing people
-- record. Two changes: the person is a **principal**, and the duration is
-- **whole minutes**, not float hours. `hours_spent REAL` is how 7.5 becomes
-- 7.500000000000001 and a month's total ends in a long tail of nines.
--
-- ── 11. Client action items. Verdict: SOLID ─────────────────────────────────
--
-- `getClientActionItems:1729-1752` unions the three things a client is
-- blocking, and `recordExternalClientDecision:1776-1801` is the observation:
-- clients decide on WhatsApp, in a meeting, on the phone, and the system never
-- hears about it. That function records the decision **with the channel it
-- arrived through** and routes it to the same code the in-app decision uses
-- rather than writing a second path. Nobody sketches `channel: 'WhatsApp'`.
--
-- The union itself needs no table — it reads deliverables, selections and
-- change orders. What needs one is the channel, which is the part the legacy
-- gets right and has nowhere to put: it stuffs it into a feedback string as
-- `[External via WhatsApp] …`.
--
-- Both off by default — `tenancy.tenant_modules`, migration 0065.

CREATE TABLE projects.design_timesheets (
  tenant_id    uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL,

  -- A principal. The legacy keys this by email and then cannot join it to
  -- anything that knows whether the person still works here.
  principal_id uuid NOT NULL,

  work_date    date NOT NULL,

  -- **Whole minutes.** The legacy stores `hours_spent` as a float, so a
  -- fortnight of half-hours adds up to something ending in nines. Minutes are
  -- exact and divide by the things people actually book: 15, 30, 60.
  minutes      integer NOT NULL,

  stage        text NOT NULL DEFAULT '',
  deliverable_id uuid,
  description  text NOT NULL DEFAULT '',

  -- Whether this was work beyond what the fee covers. A flag, like workflow 2's
  -- `beyond_included_revisions`, and for the same reason: what it costs belongs
  -- on a change order.
  additional_service boolean NOT NULL DEFAULT false,

  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT design_timesheets_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT design_timesheets_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT design_timesheets_principal_fkey
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES identity.principals (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT design_timesheets_deliverable_fkey
    FOREIGN KEY (tenant_id, deliverable_id)
    REFERENCES projects.design_deliverables (tenant_id, id) ON DELETE SET NULL,

  -- Above zero, ported. And bounded above: a single booking of more than
  -- sixteen hours is a typo, and it is the typo that ruins a month's totals.
  CONSTRAINT design_timesheets_minutes_check CHECK (minutes > 0 AND minutes <= 960)
);

CREATE INDEX design_timesheets_tenant_idx ON projects.design_timesheets (tenant_id);
CREATE INDEX design_timesheets_project_idx
  ON projects.design_timesheets (tenant_id, project_id, work_date DESC);
CREATE INDEX design_timesheets_principal_idx
  ON projects.design_timesheets (tenant_id, principal_id, work_date DESC);

ALTER TABLE projects.design_timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.design_timesheets FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects.design_timesheets AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON projects.design_timesheets AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON projects.design_timesheets FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON projects.design_timesheets TO app_runtime;

-- ------------------------------------------------------------------------ --

-- A decision that arrived somewhere other than this system.
--
-- **The channel is the whole point.** A client says yes in a meeting, on
-- WhatsApp, on the phone; somebody records it here and the record says where it
-- came from. The legacy has the same idea and nowhere to put it, so it
-- concatenates `[External via WhatsApp]` onto a feedback string — which cannot
-- be filtered, counted, or asked about.
--
-- **Append-only by grant.** This is evidence about who said what, where, and
-- when. A row that can be edited afterwards answers nothing.
CREATE TABLE projects.client_decisions (
  tenant_id   uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL,

  -- What was decided about. A bare id with no foreign key, deliberately: the
  -- three kinds live in three tables and a polymorphic FK is not expressible.
  -- The same exception, for the same reason, as `workflow.record_comments`.
  subject_kind text NOT NULL,
  subject_id   uuid NOT NULL,

  decision    text NOT NULL,
  -- meeting | whatsapp | email | phone | letter
  channel     text NOT NULL,
  -- Who at the client's end said it. A name, because they have no login here.
  said_by     text NOT NULL DEFAULT '',
  note        text NOT NULL DEFAULT '',

  -- When they said it, which is not when it was typed. A decision taken on
  -- Friday and recorded on Monday belongs on Friday.
  decided_on  date NOT NULL,

  recorded_by uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT client_decisions_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT client_decisions_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT client_decisions_recorded_by_fkey
    FOREIGN KEY (tenant_id, recorded_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,

  CONSTRAINT client_decisions_subject_check
    CHECK (subject_kind IN ('deliverable', 'selection', 'change_order')),
  CONSTRAINT client_decisions_channel_check
    CHECK (channel IN ('meeting', 'whatsapp', 'email', 'phone', 'letter')),
  CONSTRAINT client_decisions_decision_check CHECK (length(decision) BETWEEN 1 AND 60),
  CONSTRAINT client_decisions_note_check CHECK (length(note) <= 4000)
);

CREATE INDEX client_decisions_tenant_idx ON projects.client_decisions (tenant_id);
CREATE INDEX client_decisions_subject_idx
  ON projects.client_decisions (tenant_id, subject_kind, subject_id);

ALTER TABLE projects.client_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.client_decisions FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects.client_decisions AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON projects.client_decisions AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON projects.client_decisions FROM PUBLIC;
GRANT SELECT, INSERT ON projects.client_decisions TO app_runtime;

COMMENT ON TABLE projects.client_decisions IS
  'A client decision that arrived by meeting, WhatsApp, email, phone or letter, with the channel recorded as a column rather than concatenated into a note.';

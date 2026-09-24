-- Workflow 2 of eleven: design deliverables and the review of them.
--
-- **Verdict: SOLID.** The rule is at `design-build.js:671-693`: revisions are
-- counted against an included limit, and the revision past the limit is flagged
-- for a charge rather than absorbed. The line that settles it is `:675` —
--   `const extraCharge = 0; // Variations must be authorized via change orders
--    rather than arbitrary fees`
-- Somebody thought about where the money goes and deliberately did not put it
-- here. A sketch does not contain that sentence.
--
-- **The one number that is NOT carried over is the limit itself.** The legacy
-- writes `included_revisions_limit ?? 2`. Two included revisions is a commercial
-- term in somebody's contract, not a fact about design, and a default of two
-- means every deliverable in the system starts charging on the third revision
-- because of a `??`. Here the column is **nullable and nothing fills it in**:
-- NULL means no limit was agreed, the rule does not fire, and the screen says
-- so. A number in it came from a person reading a contract.
--
-- Off by default, like all eleven — `tenancy.tenant_modules`, migration 0065.

CREATE TABLE projects.design_deliverables (
  tenant_id  uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,

  -- Which room it is for, when it is for one. Concept, layout and services
  -- drawings are for the whole floor.
  brief_room_id uuid,

  stage      text NOT NULL DEFAULT '',
  name       text NOT NULL,

  -- The person who owns it, as a PRINCIPAL. The legacy keys this by
  -- `owner_email` and then filters a "design team workload" with
  -- `WHERE role IN (...) OR is_active = 1`, where the OR makes the role filter
  -- inert and every active user matches.
  owner_id   uuid,
  due_date   date,

  -- What this revision is called, e.g. `v2.0`. A label, not a number: it is
  -- what appears in the corner of the drawing.
  version_label text NOT NULL DEFAULT 'v1.0',
  -- How many times it has been issued. Starts at 1, because issuing it once is
  -- the first revision.
  revision_count integer NOT NULL DEFAULT 1,

  -- **NULL means no limit was agreed.** Nothing writes a default.
  included_revisions_limit integer,

  -- draft | submitted | approved | revision_requested | rejected
  status     text NOT NULL DEFAULT 'draft',

  -- Set when the count passes the limit. It is a FLAG, not a charge: the amount
  -- belongs on a change order, which is where a variation gets authorised.
  beyond_included_revisions boolean NOT NULL DEFAULT false,

  file_url   text NOT NULL DEFAULT '',
  notes      text NOT NULL DEFAULT '',

  approved_at timestamptz,
  approved_by uuid,

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT design_deliverables_pkey PRIMARY KEY (tenant_id, id),

  CONSTRAINT design_deliverables_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT design_deliverables_room_fkey
    FOREIGN KEY (tenant_id, brief_room_id)
    REFERENCES projects.brief_rooms (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT design_deliverables_owner_fkey
    FOREIGN KEY (tenant_id, owner_id)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT design_deliverables_approved_by_fkey
    FOREIGN KEY (tenant_id, approved_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT design_deliverables_created_by_fkey
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,

  CONSTRAINT design_deliverables_name_check CHECK (length(name) BETWEEN 1 AND 200),
  CONSTRAINT design_deliverables_status_check CHECK (
    status IN ('draft', 'submitted', 'approved', 'revision_requested', 'rejected')
  ),
  CONSTRAINT design_deliverables_count_check CHECK (revision_count >= 1),
  CONSTRAINT design_deliverables_limit_check CHECK (
    included_revisions_limit IS NULL OR included_revisions_limit >= 1
  ),
  -- Approval carries who and when, like the brief's acknowledgement.
  CONSTRAINT design_deliverables_approved_check CHECK (
    status <> 'approved' OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)
  ),
  -- **The flag cannot be set without a limit to have passed.** Otherwise it is
  -- a charge indicator on a contract that agreed no revision limit at all.
  CONSTRAINT design_deliverables_beyond_check CHECK (
    NOT beyond_included_revisions OR included_revisions_limit IS NOT NULL
  )
);

CREATE INDEX design_deliverables_tenant_idx ON projects.design_deliverables (tenant_id);
CREATE INDEX design_deliverables_project_idx
  ON projects.design_deliverables (tenant_id, project_id, status);

ALTER TABLE projects.design_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.design_deliverables FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects.design_deliverables AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON projects.design_deliverables AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON projects.design_deliverables FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON projects.design_deliverables TO app_runtime;

-- ------------------------------------------------------------------------ --

-- Every review of a deliverable, by anybody.
--
-- **Append-only by grant**, like `workflow.audit_events`. A review is what
-- somebody said about a drawing on a day; it is the evidence behind a revision
-- count that can become a charge, and a table of them that can be edited is not
-- evidence.
CREATE TABLE projects.design_reviews (
  tenant_id      uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  deliverable_id uuid NOT NULL,

  -- The label the deliverable carried when it was reviewed. Copied, not joined:
  -- the deliverable's label moves on, and a review has to keep saying which
  -- revision it was about.
  version_label  text NOT NULL,

  -- internal | client. The legacy derives this from `session?.userType`; here
  -- it is the principal's kind, resolved by the caller.
  reviewer_kind  text NOT NULL,
  reviewer_id    uuid,

  decision       text NOT NULL,
  feedback       text NOT NULL DEFAULT '',

  reviewed_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT design_reviews_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT design_reviews_deliverable_fkey
    FOREIGN KEY (tenant_id, deliverable_id)
    REFERENCES projects.design_deliverables (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT design_reviews_reviewer_fkey
    FOREIGN KEY (tenant_id, reviewer_id)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,

  CONSTRAINT design_reviews_kind_check CHECK (reviewer_kind IN ('internal', 'client')),
  CONSTRAINT design_reviews_decision_check CHECK (
    decision IN ('approved', 'revision_requested', 'rejected')
  ),
  CONSTRAINT design_reviews_feedback_check CHECK (length(feedback) <= 4000)
);

CREATE INDEX design_reviews_deliverable_idx
  ON projects.design_reviews (tenant_id, deliverable_id, reviewed_at DESC);

ALTER TABLE projects.design_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.design_reviews FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects.design_reviews AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON projects.design_reviews AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON projects.design_reviews FROM PUBLIC;
GRANT SELECT, INSERT ON projects.design_reviews TO app_runtime;

COMMENT ON TABLE projects.design_deliverables IS
  'Drawings and views issued for review. Revisions are counted; the one past an AGREED limit is flagged, never priced here.';

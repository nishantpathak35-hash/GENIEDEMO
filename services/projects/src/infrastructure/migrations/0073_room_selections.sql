-- Workflow 3 of eleven: what goes in each room, and what happens when it cannot
-- be got.
--
-- **Verdict: SOLID**, and the third piece of evidence is the one that decides
-- it. `approveSelectionSubstitution:940-942` returns early when the
-- substitution is already approved, with the comment *"Idempotent: prevent
-- duplicate price inflation"*. Somebody applied a price delta twice, in
-- production, and came back and fixed it. The other two:
--
--   * approving a selection FREEZES it (`decideRoomSelection:872`), and a
--     rejection or an alternative request unfreezes it (`:880`, `:888`);
--   * a substitution is a separate record carrying a price delta and a
--     lead-time delta, and it needs approval before it takes effect.
--
-- **What is not carried over.** `unit_price = unit_price + ?` with a JavaScript
-- `Number` as the delta — money arithmetic on a float, inside SQL. Here both
-- sides are `bigint` paise and the addition is exact. And
-- `approveSelectionSubstitution` asks nobody for permission: it defaults the
-- actor's name to the string `'Authorized Lead'` and writes the price change.
-- A substitution with a price impact goes through the approval chain here.

CREATE TABLE projects.room_selections (
  tenant_id  uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,

  brief_room_id uuid,
  -- The room's name as it was chosen, so a selection still reads sensibly if
  -- the brief moves on. Not a substitute for the link above.
  room_label text NOT NULL DEFAULT '',

  category   text NOT NULL DEFAULT '',
  item_name  text NOT NULL,
  model_sku  text NOT NULL DEFAULT '',
  finish     text NOT NULL DEFAULT '',

  -- Paise per unit, NULLABLE. A selection proposed before the price is known is
  -- an ordinary state; zero is a price of nothing.
  unit_price_paise bigint,
  -- How many. Whole units — a room takes four chairs, not 4.0.
  quantity   integer,

  lead_time_weeks   integer,
  decision_deadline date,

  -- proposed | approved | rejected | alternative_requested
  status     text NOT NULL DEFAULT 'proposed',
  -- **Approval freezes it.** A frozen selection is what procurement orders
  -- against, and changing it after that is a substitution, not an edit.
  is_frozen  boolean NOT NULL DEFAULT false,

  decision_note text NOT NULL DEFAULT '',
  decided_at timestamptz,
  decided_by uuid,

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT room_selections_pkey PRIMARY KEY (tenant_id, id),

  CONSTRAINT room_selections_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT room_selections_room_fkey
    FOREIGN KEY (tenant_id, brief_room_id)
    REFERENCES projects.brief_rooms (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT room_selections_decided_by_fkey
    FOREIGN KEY (tenant_id, decided_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT room_selections_created_by_fkey
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,

  CONSTRAINT room_selections_item_check CHECK (length(item_name) BETWEEN 1 AND 200),
  CONSTRAINT room_selections_status_check CHECK (
    status IN ('proposed', 'approved', 'rejected', 'alternative_requested')
  ),
  CONSTRAINT room_selections_price_check CHECK (unit_price_paise IS NULL OR unit_price_paise >= 0),
  CONSTRAINT room_selections_quantity_check CHECK (quantity IS NULL OR quantity > 0),
  CONSTRAINT room_selections_lead_check CHECK (lead_time_weeks IS NULL OR lead_time_weeks >= 0),

  -- **Frozen and approved are the same state, both ways.** Two booleans that
  -- can disagree are two sources of truth, and the one procurement reads is
  -- whichever the last writer happened to set.
  CONSTRAINT room_selections_frozen_check CHECK (is_frozen = (status = 'approved')),
  CONSTRAINT room_selections_decided_check CHECK (
    status = 'proposed' OR (decided_at IS NOT NULL AND decided_by IS NOT NULL)
  )
);

CREATE INDEX room_selections_tenant_idx ON projects.room_selections (tenant_id);
CREATE INDEX room_selections_project_idx
  ON projects.room_selections (tenant_id, project_id, status);
-- The lead-time question workflow 5 asks: what is long-lead and not yet frozen.
CREATE INDEX room_selections_lead_idx
  ON projects.room_selections (tenant_id, project_id, lead_time_weeks DESC);

ALTER TABLE projects.room_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.room_selections FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects.room_selections AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON projects.room_selections AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON projects.room_selections FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON projects.room_selections TO app_runtime;

-- ------------------------------------------------------------------------ --

-- A proposal to put something else in, when the specified thing cannot be got.
CREATE TABLE projects.selection_substitutions (
  tenant_id    uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  selection_id uuid NOT NULL,

  -- What was specified, copied at the moment of proposing. The selection's own
  -- fields change when this is approved, so a live join would show the answer
  -- rather than the question.
  original_spec text NOT NULL,
  proposed_spec text NOT NULL,
  reason        text NOT NULL DEFAULT '',

  -- **Signed paise.** A substitution can be cheaper, and a cheaper alternative
  -- is the ordinary case when a lead time is the problem. Nullable is not
  -- offered: a proposal with no price impact states zero, deliberately.
  price_delta_paise    bigint NOT NULL DEFAULT 0,
  -- Signed days. Negative is sooner.
  lead_time_delta_days integer NOT NULL DEFAULT 0,

  -- pending | approved | rejected
  status       text NOT NULL DEFAULT 'pending',
  decided_at   timestamptz,
  decided_by   uuid,

  proposed_by  uuid,
  proposed_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT selection_substitutions_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT selection_substitutions_selection_fkey
    FOREIGN KEY (tenant_id, selection_id)
    REFERENCES projects.room_selections (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT selection_substitutions_decided_by_fkey
    FOREIGN KEY (tenant_id, decided_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT selection_substitutions_proposed_by_fkey
    FOREIGN KEY (tenant_id, proposed_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL,

  CONSTRAINT selection_substitutions_status_check CHECK (
    status IN ('pending', 'approved', 'rejected')
  ),
  CONSTRAINT selection_substitutions_spec_check CHECK (length(proposed_spec) BETWEEN 1 AND 500),
  CONSTRAINT selection_substitutions_decided_check CHECK (
    status = 'pending' OR (decided_at IS NOT NULL AND decided_by IS NOT NULL)
  )
);

CREATE INDEX selection_substitutions_selection_idx
  ON projects.selection_substitutions (tenant_id, selection_id, proposed_at DESC);

-- **At most one PENDING substitution per selection.**
--
-- Two pending proposals for the same item means two different people are about
-- to be told two different prices, and approving both applies both deltas. A
-- partial unique index rather than application code, because "did you check for
-- another pending one" is a question a reviewer should not have to ask.
CREATE UNIQUE INDEX selection_substitutions_one_pending_idx
  ON projects.selection_substitutions (tenant_id, selection_id)
  WHERE status = 'pending';

ALTER TABLE projects.selection_substitutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.selection_substitutions FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects.selection_substitutions AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON projects.selection_substitutions AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON projects.selection_substitutions FROM PUBLIC;
-- No DELETE. A substitution somebody proposed and had rejected is the record of
-- an alternative that was considered, which is exactly what gets asked about.
GRANT SELECT, INSERT, UPDATE ON projects.selection_substitutions TO app_runtime;

COMMENT ON TABLE projects.selection_substitutions IS
  'Alternatives proposed against a frozen selection, with their price and lead-time impact. Approving one applies its delta exactly once.';

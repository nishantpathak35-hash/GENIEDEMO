-- 0011 — Bill of quantities.
--
-- Forward-only. Never edit this file.
--
-- `BOQ-01` (STACK-MIGRATION): the legacy accepts `Number(realPayload.amount) ||
-- …`, so a client-supplied line amount wins over the computed one. That is the
-- same hole as `write.js:55`, and it is why there is **no `amount` column
-- here**. A line's value is quantity x rate, computed by `lineAmount` in
-- `services/projects/src/domain/boq.ts`, and there is deliberately nothing a
-- caller could assert a total into.
--
-- Cost rate is nullable and separate from the client rate. `TAKE-01` records
-- the legacy line
--   `it.clientRate || Math.round((it.costRate || 100) * 1.25)`
-- which is three inventions at once: a 25% markup with no basis, a bare `100`
-- standing in for an unknown cost, and `||` swallowing an explicit zero. A
-- missing rate is NULL here and stays NULL — the domain names the unpriced
-- items rather than totalling over the priced subset.

CREATE TABLE projects.boq_items (
  tenant_id   uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id          uuid NOT NULL,
  project_id  uuid NOT NULL,

  -- Ordering and grouping within the bill. A section is a label, not a table:
  -- BOQ hierarchies in this domain are one level deep in practice, and a
  -- self-referencing tree would be a second isolation surface for no gain.
  section     text NOT NULL DEFAULT '',
  item_no     integer NOT NULL,

  description text NOT NULL,
  uom         text NOT NULL,

  -- Scaled integer, whole units x 1,000,000. BOQ lines are genuinely
  -- fractional — 12.375 sqm — and a float here re-enters money through the back
  -- door, because the line value is quantity x rate.
  quantity_micros bigint NOT NULL,

  -- What the client is charged. Paise.
  rate        bigint NOT NULL,
  -- What it costs us. NULL means UNKNOWN, and must stay distinguishable from
  -- zero: `|| 100` in the legacy turns "we do not know" into a number.
  cost_rate   bigint,

  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT boq_items_pkey PRIMARY KEY (tenant_id, id),

  -- COMPOSITE. Referential integrity is exempt from RLS, so a single-column FK
  -- would let tenant A attach a BOQ line to tenant B's project: the insert
  -- succeeding confirms that project exists, and ON DELETE CASCADE would let
  -- B's delete remove A's line.
  CONSTRAINT boq_items_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT boq_items_no_key UNIQUE (tenant_id, project_id, section, item_no),
  CONSTRAINT boq_items_quantity_check CHECK (quantity_micros >= 0),
  CONSTRAINT boq_items_rate_check CHECK (rate >= 0),
  CONSTRAINT boq_items_cost_check CHECK (cost_rate IS NULL OR cost_rate >= 0)
);

CREATE INDEX boq_items_project_idx
  ON projects.boq_items (tenant_id, project_id, section, item_no);

ALTER TABLE projects.boq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.boq_items FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects.boq_items AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON projects.boq_items AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON projects.boq_items TO app_runtime;

COMMENT ON TABLE projects.boq_items IS
  'Bill-of-quantities lines. There is no amount column: a line value is '
  'quantity x rate computed server-side, because the legacy lets a '
  'client-supplied amount win (BOQ-01). cost_rate NULL means unknown and is '
  'never coerced to a number.';

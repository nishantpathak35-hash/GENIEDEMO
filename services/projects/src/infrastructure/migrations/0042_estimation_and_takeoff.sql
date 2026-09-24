-- 0042 — Estimation items and takeoff sheets.
--
-- Forward-only. Never edit this file.
--
-- **The tables `domain/rate-analysis.ts` and `domain/takeoff.ts` were written
-- against.** Both modules already exist and already decided the shape; nothing
-- below re-decides any of it. `rate-analysis.ts` records RATE-01, RATE-02 and
-- RATE-03 and fixes all three, and `takeoff.ts` records TAKE-01.
--
-- **The rate stored is PRE-TAX, and there is no GST column.**
-- `rate-analysis.ts:62` fixes RATE-03 "by omission: there is no GST here to
-- default to 18%", and migration `0022` says the same of a BOQ rate. The legacy
-- stores `base_rate` AND `final_rate_with_gst` (`migrations.js:145-146`), and
-- `boq.js:365` then imports the *tax-inclusive* one as a BOQ unit rate — which
-- is PO-16, still open.
--
-- **EST-01: the legacy rounds mid-formula, twice.**
-- `estimationCalculations.js:20-23` rounds `baseRate` to whole rupees, applies
-- GST to the rounded figure, and rounds again. `analyseRate` rounds each
-- component once at paise precision, which is why its answer and the legacy's
-- differ — and PO-17 is which of the legacy three answers the customer has been
-- quoting from.

CREATE TABLE projects.estimation_items (
  tenant_id      uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id             uuid NOT NULL,

  item_name      text NOT NULL,
  trade          text NOT NULL DEFAULT '',
  uom            text NOT NULL,

  -- The four factors. Paise.
  material_cost  bigint NOT NULL DEFAULT 0,
  labour_cost    bigint NOT NULL DEFAULT 0,
  equipment_cost bigint NOT NULL DEFAULT 0,

  -- Basis points, exact. The legacy stores these as REAL percentages.
  overhead_bp    integer NOT NULL DEFAULT 0,
  margin_bp      integer NOT NULL DEFAULT 0,

  -- Computed by `analyseRate`, stored so an estimate can be reproduced as it
  -- was made. **Pre-tax**: there is no final_rate_with_gst column, because
  -- whether a rate carries tax is PO-16 and open.
  base_rate      bigint NOT NULL,

  benchmark      text NOT NULL DEFAULT '',

  created_by     uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  version        integer NOT NULL DEFAULT 1,

  CONSTRAINT estimation_items_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT estimation_items_created_by_fkey
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT estimation_items_name_key UNIQUE (tenant_id, item_name, trade),
  CONSTRAINT estimation_items_cost_check CHECK (
    material_cost >= 0 AND labour_cost >= 0 AND equipment_cost >= 0
  ),
  CONSTRAINT estimation_items_rate_check CHECK (base_rate >= 0),
  -- The bound is generous on purpose: a margin above 100% of cost is real, and
  -- a constraint nobody can defend is worse than none. The sign is what matters.
  CONSTRAINT estimation_items_bp_check CHECK (
    overhead_bp >= 0 AND overhead_bp <= 100000
    AND margin_bp >= 0 AND margin_bp <= 100000
  ),
  CONSTRAINT estimation_items_version_check CHECK (version >= 1)
);

CREATE INDEX estimation_items_trade_idx ON projects.estimation_items (tenant_id, trade);

ALTER TABLE projects.estimation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.estimation_items FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects.estimation_items AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON projects.estimation_items AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
REVOKE ALL ON projects.estimation_items FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON projects.estimation_items TO app_runtime;

COMMENT ON COLUMN projects.estimation_items.base_rate IS
  'PRE-TAX, computed by analyseRate. There is deliberately no '
  'final_rate_with_gst column: the legacy stores one and boq.js:365 imports it '
  'as a BOQ unit rate with quantity 1, which is PO-16 and unanswered.';

-- ---------------------------------------------------------------------------

CREATE TABLE projects.takeoff_sheets (
  tenant_id    uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id           uuid NOT NULL,
  project_id   uuid NOT NULL,

  title        text NOT NULL,
  floor_name   text NOT NULL DEFAULT '',

  -- The drawing, in the vault. No URL column — GFC-01 and GFC-02 are the same
  -- mistake in the drawings table, and takeoff.js:78 stores a
  -- `drawing_url TEXT NOT NULL` that the view fills with an attachment path.
  document_id  uuid,

  -- Scale as an exact rational: `scale_px_num` pixels per `scale_px_den` units.
  -- The legacy stores `scale_px_per_unit REAL`, and every measured quantity on
  -- the sheet is divided by it.
  scale_px_num bigint,
  scale_px_den bigint,
  scale_unit   text NOT NULL DEFAULT 'ft',

  created_by   uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  version      integer NOT NULL DEFAULT 1,

  CONSTRAINT takeoff_sheets_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT takeoff_sheets_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT takeoff_sheets_created_by_fkey
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT takeoff_sheets_version_check CHECK (version >= 1),
  -- A scale is both halves or neither. Half a scale is worse than none, because
  -- it reads as calibrated.
  CONSTRAINT takeoff_sheets_scale_check CHECK (
    (scale_px_num IS NULL) = (scale_px_den IS NULL)
  ),
  CONSTRAINT takeoff_sheets_scale_positive_check CHECK (
    scale_px_den IS NULL OR (scale_px_den > 0 AND scale_px_num > 0)
  )
);

CREATE INDEX takeoff_sheets_project_idx ON projects.takeoff_sheets (tenant_id, project_id);

ALTER TABLE projects.takeoff_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.takeoff_sheets FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects.takeoff_sheets AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON projects.takeoff_sheets AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
REVOKE ALL ON projects.takeoff_sheets FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON projects.takeoff_sheets TO app_runtime;

COMMENT ON COLUMN projects.takeoff_sheets.scale_px_num IS
  'Scale as an exact rational with scale_px_den. The legacy stores '
  'scale_px_per_unit as REAL and divides every measured quantity by it, so the '
  'float enters every figure on the sheet.';

-- ---------------------------------------------------------------------------

CREATE TABLE projects.takeoff_items (
  tenant_id       uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id              uuid NOT NULL,
  sheet_id        uuid NOT NULL,

  description     text NOT NULL,
  category        text NOT NULL DEFAULT '',
  uom             text NOT NULL,

  -- Measured off the drawing. Millionths, matching `TakeoffItem`.
  measured_micros bigint NOT NULL,
  -- Wastage in basis points of the measured quantity. Explicit rather than
  -- folded into the measurement, so an ordered quantity can be explained.
  wastage_bp      integer NOT NULL DEFAULT 0,

  -- **TAKE-01: both are nullable and neither is derived.** takeoff.js:337
  -- invents a client rate as (costRate || 100) * 1.25 — a markup applied to a
  -- fallback cost of 100 that nobody chose.
  cost_rate       bigint,
  client_rate     bigint,

  geometry        jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT takeoff_items_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT takeoff_items_sheet_fkey
    FOREIGN KEY (tenant_id, sheet_id)
    REFERENCES projects.takeoff_sheets (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT takeoff_items_measured_check CHECK (measured_micros >= 0),
  CONSTRAINT takeoff_items_wastage_check CHECK (wastage_bp >= 0 AND wastage_bp <= 100000),
  CONSTRAINT takeoff_items_rate_check CHECK (
    (cost_rate IS NULL OR cost_rate >= 0) AND (client_rate IS NULL OR client_rate >= 0)
  )
);

CREATE INDEX takeoff_items_sheet_idx ON projects.takeoff_items (tenant_id, sheet_id);

ALTER TABLE projects.takeoff_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.takeoff_items FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects.takeoff_items AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON projects.takeoff_items AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
REVOKE ALL ON projects.takeoff_items FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON projects.takeoff_items TO app_runtime;

COMMENT ON COLUMN projects.takeoff_items.cost_rate IS
  'What it costs per unit, or NULL for uncosted. Never derived: takeoff.js:337 '
  'builds a client rate from (costRate || 100) * 1.25, so an uncosted item '
  'silently acquires a price resting on a fallback of 100 (TAKE-01).';

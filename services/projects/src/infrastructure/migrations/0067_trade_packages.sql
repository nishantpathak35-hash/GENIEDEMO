-- The trades this organisation works in.
--
-- `estimation_items.trade` has been free text since migration 0042 and
-- `boq_items.section` since 0011, which means "Electrical", "Electricals" and
-- "ELECTRICAL & LIGHTING" are three trades as far as any grouping is concerned.
-- This is the list they are supposed to come from.
--
-- **It ships EMPTY, and that is a decision.** The legacy seeds ten packages
-- (`migrations.js:789`) carrying a default margin per trade — 18%, 22%, 25% —
-- and a named preferred vendor for each: UltraTech, Asian Paints, Daikin,
-- Kohler. Those are somebody's demo data. A margin is a commercial position,
-- not a fact about masonry, and seeding one would put a number nobody agreed
-- into the rate of every item created under that trade. A new tenant types
-- their own trades in, or has none and keeps using free text.
--
-- **Two legacy columns are deliberately absent.**
--
--   `preferred_vendor` is a vendor's NAME, stored as a string. Name-keying is
--   the defect this whole rebuild exists to remove, and a "preferred vendor per
--   trade" belongs to procurement's rate contracts rather than to a label on an
--   estimating category. `services/projects` may not reference
--   `procurement.vendors` in any case (M1/D5).
--
--   `rc_number` points at a rate contract. There are no rate contracts here, so
--   the column would be a string referring to nothing.

CREATE TABLE projects.trade_packages (
  tenant_id   uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id          uuid NOT NULL DEFAULT gen_random_uuid(),

  -- The short form, e.g. `ELEC`. Uppercased by the application so that `elec`
  -- and `ELEC` cannot become two packages.
  code        text NOT NULL,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',

  -- The margin this trade is usually quoted at, in BASIS POINTS.
  --
  -- Integer basis points, never the legacy's `REAL default_margin_pct` — the
  -- estimation line it feeds already stores `margin_bp` as an integer, and a
  -- float here would round on its way into an exact field.
  --
  -- **NULL by default and nothing writes a value.** NULL means this
  -- organisation has not said, and the estimating screen then asks rather than
  -- filling a number in on somebody's behalf.
  default_margin_bp integer,

  sort_order  integer NOT NULL DEFAULT 0,

  -- Retired rather than deleted: an estimation line raised under a trade that
  -- was later dropped still says what it was costed as. Retiring takes it out
  -- of the pickers and leaves the history alone.
  is_active   boolean NOT NULL DEFAULT true,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT trade_packages_pkey PRIMARY KEY (tenant_id, id),

  -- Both include tenant_id. Without it the violation message leaks another
  -- tenant's trade list through `DETAIL: Key (code)=(ELEC) already exists`.
  CONSTRAINT trade_packages_code_key UNIQUE (tenant_id, code),
  CONSTRAINT trade_packages_name_key UNIQUE (tenant_id, name),

  CONSTRAINT trade_packages_code_check CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,15}$'),
  CONSTRAINT trade_packages_name_check CHECK (length(name) BETWEEN 1 AND 80),
  -- A margin is a fraction of a price. 100% is 10000 bp and anything at or past
  -- it is a cost basis of zero, which is not a margin, it is a mistake.
  CONSTRAINT trade_packages_margin_check
    CHECK (default_margin_bp IS NULL OR (default_margin_bp >= 0 AND default_margin_bp < 10000))
);

CREATE INDEX trade_packages_tenant_idx ON projects.trade_packages (tenant_id);
-- The picker's read: the active ones, in the order somebody arranged them.
CREATE INDEX trade_packages_order_idx
  ON projects.trade_packages (tenant_id, is_active, sort_order, name);

ALTER TABLE projects.trade_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.trade_packages FORCE  ROW LEVEL SECURITY;

-- The pair. One permissive policy is not isolation: permissive policies are
-- OR-ed, so a later `USING (true)` would open the table while still satisfying
-- "the table has a policy". The RESTRICTIVE half makes that addition inert.
CREATE POLICY tenant_isolation ON projects.trade_packages AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON projects.trade_packages AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON projects.trade_packages FROM PUBLIC;
-- No TRUNCATE, ever: it is not subject to row-level security.
GRANT SELECT, INSERT, UPDATE, DELETE ON projects.trade_packages TO app_runtime;

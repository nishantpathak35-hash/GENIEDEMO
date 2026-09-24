-- 0051 — what stock is worth.
--
-- Forward-only. Never edit this file.
--
-- **INV-03, answered provisionally.** `services/procurement/src/application/
-- inventory.ts` has carried "valuation is deliberately absent" since M5,
-- because `InventoryView.js:79` sums `quantity * unitPrice` in a browser
-- against a `unit_price` column that every goods receipt overwrites — the last
-- price paid, applied to stock bought at other prices. Reproducing that would
-- have put a meaningless figure on a screen with a rupee sign in front of it.
--
-- The repaired legacy tree answers it, and its answer is real code rather than
-- a claim: `app/lib/api/inventory.js:61` recomputes
--
--     (old_qty * old_unit_price + in_qty * in_unit_price) / (old_qty + in_qty)
--
-- on every receipt. That is a **moving weighted average**, and the surrounding
-- behaviour is consistent with it — an issue at `:297` changes quantity and
-- leaves the unit cost alone, and a transfer carries the dispatched item's own
-- cost to the destination (`:322-323`, `:337`). Adopted as OPEN-DECISIONS
-- INV-03, provisionally, because a costing method is an accounting policy a
-- finance director chooses and that tree is not one.
--
-- **Why the value lives on the movement and not on the item.**
--
-- `stock_items` deliberately stores no quantity: INV-01 records that a stored
-- running balance cannot say how it got there and cannot make a transfer
-- balance. Value has exactly the same property, and worse — a stored average
-- unit cost is the single mutable column whose history the legacy destroyed.
-- So each movement carries the value that moved with it, and what stock is
-- worth is the SUM. The average is derived on read and never stored.
--
-- **Why there is no unit-cost column anywhere.**
--
-- Unit cost is value divided by quantity, and dividing rounds. Storing the
-- quotient means the ledger no longer adds up: sum the rounded unit costs back
-- against the quantities and you get a different total from the one you
-- started with. Value and quantity are both exact integers, their sums are
-- exact, and the division happens once, at the moment somebody looks.

ALTER TABLE procurement.stock_movements
  -- Signed paise, carrying the same sign as `quantity_micros`: a receipt brings
  -- value in, an issue takes it out. NULLABLE on purpose — see below.
  ADD COLUMN value_paise bigint;

COMMENT ON COLUMN procurement.stock_movements.value_paise IS
  'The value that moved, in paise, signed like the quantity. NULL means this '
  'movement predates valuation and its value is unknown — which is a different '
  'answer from zero and must stay distinguishable from it.';

-- **NULL is not zero, and the constraint says so.**
--
-- A movement recorded before this migration has no value and no way to
-- recover one. Defaulting those to 0 would make a warehouse full of stock
-- valued at nothing, and the total would look like a real figure. The repaired
-- legacy makes the same call in the same situation and states it plainly:
-- `inventory.js:336` refuses to receive a transfer with no dispatch snapshot
-- rather than guessing, and the handover says existing notes "deliberately
-- reject ... until physical stock and the legacy entries are reconciled".
--
-- What this constraint enforces is only the sign, where a value is present.
ALTER TABLE procurement.stock_movements
  ADD CONSTRAINT stock_movements_value_sign_check CHECK (
    value_paise IS NULL
    OR (quantity_micros > 0 AND value_paise >= 0)
    OR (quantity_micros < 0 AND value_paise <= 0)
  );

-- ---------------------------------------------------------------------------

-- **The costing method is per tenant, and provisional until somebody says so.**
--
-- One row per tenant, or none — a tenant with no row gets the documented
-- provisional default from the domain and the API says it is provisional, the
-- same shape as `projects.health_thresholds`. Weighted average is what the
-- repaired legacy does; FIFO is what a different finance director may want, and
-- the point of the column is that changing the answer is a row rather than a
-- release.
CREATE TABLE procurement.costing_policy (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,

  method    text NOT NULL,

  status    text NOT NULL DEFAULT 'provisional',
  set_by    text,
  set_on    date,
  note      text NOT NULL DEFAULT '',

  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One row per tenant. The tenant IS the key.
  CONSTRAINT costing_policy_pkey PRIMARY KEY (tenant_id),

  -- Only what is implemented may be stored. A policy row naming a method the
  -- code cannot apply is a setting that appears to take effect and does not —
  -- and unlike a module key, there is no vocabulary here that grows without a
  -- matching implementation, so the CHECK costs nothing and catches a typo that
  -- would otherwise silently change how a company values its stock.
  CONSTRAINT costing_policy_method_check CHECK (method IN ('weighted_average')),
  CONSTRAINT costing_policy_status_check CHECK (status IN ('provisional', 'confirmed')),
  CONSTRAINT costing_policy_confirmed_evidence_check CHECK (
    status <> 'confirmed' OR (set_by IS NOT NULL AND set_on IS NOT NULL)
  )
);

ALTER TABLE procurement.costing_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.costing_policy FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON procurement.costing_policy AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON procurement.costing_policy AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON procurement.costing_policy FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON procurement.costing_policy TO app_runtime;

COMMENT ON TABLE procurement.costing_policy IS
  'How a tenant values stock. Ships with no rows: the domain default is '
  'weighted average, adopted from the repaired legacy at inventory.js:61 and '
  'marked provisional because a costing method is an accounting policy, not a '
  'code detail (INV-03).';

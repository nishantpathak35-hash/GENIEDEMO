-- 0009 — Purchase orders.
--
-- Forward-only. Never edit this file.
--
-- `services/procurement/src/api/routes.ts` has been selecting from
-- `procurement.purchase_orders` since M5, and **no migration created it**. The
-- only test covering that route mocks the pool, so it passed against a table
-- that has never existed — the exact shape of failure `docs/TOOLING-DEFECTS.md`
-- catalogues: a green result that proves nothing.
--
-- Money is `bigint` paise (ADR-0012). There is no `numeric` and no `real` here:
-- every monetary column in the legacy schema is `REAL`, which is the most
-- serious defect in that system because it is silently wrong today rather than
-- merely absent.

CREATE SCHEMA IF NOT EXISTS procurement AUTHORIZATION app_migrator;
GRANT USAGE ON SCHEMA procurement TO app_runtime;

CREATE TABLE procurement.purchase_orders (
  tenant_id  uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,

  -- An immutable surrogate id. The legacy makes `po_no` the primary key and
  -- then cascades edits to it across five tables with loose UPDATEs and no
  -- transaction, so renumbering a PO can half-succeed. Here the number is a
  -- display attribute, free to change without moving anything.
  id         uuid NOT NULL,
  number     text NOT NULL,

  vendor_id  uuid NOT NULL,

  state      text NOT NULL DEFAULT 'draft',

  -- Computed from the lines by `purchaseOrderTotals`, never supplied by a
  -- caller. `write.js:55` trusts a client-supplied `gst_amount` when present
  -- and `:157` trusts the line total itself; there is deliberately no column
  -- here that a client could assert a total into, because the server recomputes
  -- and overwrites on every write.
  taxable    bigint NOT NULL DEFAULT 0,
  gst        bigint NOT NULL DEFAULT 0,
  gross      bigint NOT NULL DEFAULT 0,

  -- Optimistic locking is REQUIRED, not opt-in. The legacy applies it only when
  -- the client chooses to send `expectedVersion`, which lets a caller disable
  -- concurrency control on its own write.
  version    integer NOT NULL DEFAULT 1,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT purchase_orders_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT purchase_orders_state_check CHECK (
    state IN ('draft', 'pending_approval', 'approved', 'cancelled')
  ),
  -- Tenant-prefixed. A bare UNIQUE (number) would let one tenant learn, from
  -- the violation message, that another tenant has issued a given PO number —
  -- and unique constraints are checked outside RLS, so the leak is real.
  CONSTRAINT purchase_orders_number_key UNIQUE (tenant_id, number),
  CONSTRAINT purchase_orders_money_check CHECK (taxable >= 0 AND gst >= 0 AND gross >= 0),
  CONSTRAINT purchase_orders_version_check CHECK (version >= 1)
);

CREATE INDEX purchase_orders_listing_idx
  ON procurement.purchase_orders (tenant_id, created_at DESC);

ALTER TABLE procurement.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.purchase_orders FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON procurement.purchase_orders AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON procurement.purchase_orders AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON procurement.purchase_orders TO app_runtime;

COMMENT ON TABLE procurement.purchase_orders IS
  'Purchase orders. Totals are computed server-side from the lines and there is '
  'no column a caller can assert one into. The number is a display attribute, '
  'not the key.';

-- ---------------------------------------------------------------- lines ----

CREATE TABLE procurement.purchase_order_lines (
  tenant_id          uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id                 uuid NOT NULL,
  purchase_order_id  uuid NOT NULL,

  line_no            integer NOT NULL,
  description        text NOT NULL,
  hsn_sac            text NOT NULL,

  -- Scaled integer: whole units times 1,000,000. BOQ lines are genuinely
  -- fractional (12.375 sqm) and a float here would re-enter money through the
  -- back door, since the line total is quantity x rate.
  quantity_micros    bigint NOT NULL,

  unit_rate          bigint NOT NULL,
  -- Basis points. 1 bp = 0.01%; 18% GST is 1800.
  gst_rate_bp        integer NOT NULL,

  CONSTRAINT purchase_order_lines_pkey PRIMARY KEY (tenant_id, id),

  -- COMPOSITE, and that is the whole point. Referential integrity is exempt
  -- from RLS, so with a single-column FK tenant A could insert a line
  -- referencing tenant B's purchase order: the insert succeeding confirms the
  -- row exists, and ON DELETE CASCADE then lets B's delete remove A's line.
  CONSTRAINT purchase_order_lines_po_fkey
    FOREIGN KEY (tenant_id, purchase_order_id)
    REFERENCES procurement.purchase_orders (tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT purchase_order_lines_no_key UNIQUE (tenant_id, purchase_order_id, line_no),
  CONSTRAINT purchase_order_lines_quantity_check CHECK (quantity_micros >= 0),
  CONSTRAINT purchase_order_lines_rate_check CHECK (unit_rate >= 0 AND gst_rate_bp >= 0)
);

CREATE INDEX purchase_order_lines_po_idx
  ON procurement.purchase_order_lines (tenant_id, purchase_order_id, line_no);

ALTER TABLE procurement.purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.purchase_order_lines FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON procurement.purchase_order_lines AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON procurement.purchase_order_lines AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON procurement.purchase_order_lines TO app_runtime;

COMMENT ON TABLE procurement.purchase_order_lines IS
  'Lines of a purchase order. The foreign key is composite (tenant_id, '
  'purchase_order_id) because referential integrity bypasses row-level '
  'security, so a single-column key would be a cross-tenant existence oracle.';

-- 0034 — Inventory: stock held as a ledger, not a running balance.
--
-- Forward-only. Never edit this file.
--
-- **The legacy holds stock as one mutable number.** `inventory_items.quantity_on_hand`
-- is `REAL DEFAULT 0` (`migrations.js:436`), and `recordGRN` (`inventory.js:70`)
-- and `issueMaterial` (`:126`) each read it, add or subtract in JavaScript, and
-- write the result back. There is no record of how it got there.
--
-- Three consequences, and the third is the reason this table is shaped
-- differently:
--
--   1. **A lost update is invisible.** Two concurrent issues both read 100,
--      both write 90, and 10 units have vanished with nothing to reconcile
--      against.
--   2. **`REAL` is a float.** Quantities are multiplied by a unit price for
--      valuation, so the same argument that makes money `bigint` paise applies
--      here (ADR-0012).
--   3. **INV-01: `createTransfer` (`inventory.js:143`) moves no stock at all.**
--      It inserts a row into `inventory_transfers` and never touches
--      `inventory_items` — so the source warehouse keeps its quantity and the
--      destination never gains it. It is the only inventory write the UI calls
--      (`InventoryView.js:51`), which means **every stock figure in the legacy
--      is whatever a GRN last set, and transfers have never affected it**.
--
-- A running balance cannot record a transfer, because a transfer is two
-- movements that must agree. So stock here is the **sum of a ledger** and the
-- balance is derived, never stored. That makes a transfer one transaction
-- containing an out-movement and an in-movement, and makes an unbalanced
-- transfer unrepresentable rather than merely wrong.

CREATE TABLE procurement.stock_items (
  tenant_id     uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id            uuid NOT NULL,

  name          text NOT NULL,
  category      text NOT NULL DEFAULT 'General',
  uom           text NOT NULL,

  -- Reorder threshold, in millionths of a unit like every other quantity here.
  reorder_level bigint NOT NULL DEFAULT 0,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  version       integer NOT NULL DEFAULT 1,

  CONSTRAINT stock_items_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT stock_items_name_key UNIQUE (tenant_id, name),
  CONSTRAINT stock_items_reorder_check CHECK (reorder_level >= 0),
  CONSTRAINT stock_items_version_check CHECK (version >= 1)
);

CREATE INDEX stock_items_tenant_idx ON procurement.stock_items (tenant_id);

ALTER TABLE procurement.stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.stock_items FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON procurement.stock_items AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON procurement.stock_items AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
REVOKE ALL ON procurement.stock_items FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON procurement.stock_items TO app_runtime;

COMMENT ON TABLE procurement.stock_items IS
  'What a material IS. How much of it exists is not here — that is the sum of '
  'stock_movements, because a stored running balance cannot record how it got '
  'there and cannot make a transfer balance (INV-01).';

-- ---------------------------------------------------------------------------

CREATE TABLE procurement.stock_movements (
  tenant_id      uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id             uuid NOT NULL,
  stock_item_id  uuid NOT NULL,

  warehouse      text NOT NULL,

  -- Signed, in millionths of a unit. Positive is in, negative is out. Never
  -- zero: a movement of nothing is a row that means nothing.
  quantity_micros bigint NOT NULL,

  -- 'receipt' | 'issue' | 'transfer'. A transfer writes TWO rows sharing a
  -- `transfer_id`, one negative and one positive.
  kind           text NOT NULL,
  transfer_id    uuid,

  -- Free text: a GRN number, a site, a person. Not a foreign key, because the
  -- things it refers to are not all modelled yet.
  reference      text NOT NULL DEFAULT '',
  moved_by       text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT stock_movements_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT stock_movements_item_fkey
    FOREIGN KEY (tenant_id, stock_item_id)
    REFERENCES procurement.stock_items (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT stock_movements_kind_check CHECK (kind IN ('receipt', 'issue', 'transfer')),
  CONSTRAINT stock_movements_nonzero_check CHECK (quantity_micros <> 0),
  -- A transfer row must carry its pairing id, and a non-transfer must not.
  CONSTRAINT stock_movements_transfer_check CHECK (
    (kind = 'transfer') = (transfer_id IS NOT NULL)
  ),
  -- A receipt is in, an issue is out. The sign is not a matter of opinion.
  CONSTRAINT stock_movements_sign_check CHECK (
    (kind = 'receipt' AND quantity_micros > 0)
    OR (kind = 'issue' AND quantity_micros < 0)
    OR kind = 'transfer'
  )
);

CREATE INDEX stock_movements_item_idx
  ON procurement.stock_movements (tenant_id, stock_item_id, warehouse);
CREATE INDEX stock_movements_transfer_idx
  ON procurement.stock_movements (tenant_id, transfer_id)
  WHERE transfer_id IS NOT NULL;

ALTER TABLE procurement.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.stock_movements FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON procurement.stock_movements AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON procurement.stock_movements AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
REVOKE ALL ON procurement.stock_movements FROM PUBLIC;
-- No DELETE: a ledger is append-only. A mistaken movement is corrected by a
-- reversing movement, which leaves both visible. Granting DELETE would make the
-- ledger's whole point optional.
GRANT SELECT, INSERT ON procurement.stock_movements TO app_runtime;

COMMENT ON TABLE procurement.stock_movements IS
  'Append-only stock ledger. Balance is SUM(quantity_micros) per item per '
  'warehouse, never a stored column. A transfer is two rows sharing '
  'transfer_id, so it cannot move stock out of one place without moving it into '
  'another — which is exactly what createTransfer fails to do (INV-01). '
  'app_runtime has no DELETE here on purpose.';

COMMENT ON COLUMN procurement.stock_movements.quantity_micros IS
  'Signed, whole units x 1,000,000. Integer rather than REAL: the legacy stores '
  'quantity_on_hand as REAL and multiplies it by a unit price for valuation, '
  'which puts a float on the money path.';

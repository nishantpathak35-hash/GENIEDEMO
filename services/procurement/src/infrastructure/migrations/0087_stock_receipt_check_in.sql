-- 0087 — a receipt arrives at the gate before it is counted into the store.
--
-- Forward-only. Never edit this file.
--
-- Stock drew "Received but not checked in" and a receipt posted straight to
-- the balance (DATA-11): the moment a delivery was recorded it was stock,
-- and the storekeeper's count — the step that catches a short delivery or a
-- damaged crate — had nowhere to be recorded. A receipt now carries whether
-- it has been checked in, and the balance counts only those that have.
--
-- Rows written before this migration default to checked in: they were
-- counted into the balance when they were posted, and pulling them back out
-- would change every store's figure overnight for a step nobody skipped on
-- purpose. A receipt posted from now on says which it is.

ALTER TABLE procurement.stock_movements
  ADD COLUMN checked_in_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN checked_in_by text;

-- From here on the default is "not yet": the column keeps a default so the
-- rows above got one, and the application writes the state explicitly.
ALTER TABLE procurement.stock_movements
  ALTER COLUMN checked_in_at DROP NOT NULL,
  ALTER COLUMN checked_in_at DROP DEFAULT;

-- Only a receipt waits to be checked in; an issue or a transfer is a decision
-- somebody has already made about counted stock.
ALTER TABLE procurement.stock_movements
  ADD CONSTRAINT stock_movements_check_in_kind_check CHECK (
    kind = 'receipt' OR checked_in_at IS NOT NULL
  );

CREATE INDEX stock_movements_awaiting_check_in_idx
  ON procurement.stock_movements (tenant_id, stock_item_id)
  WHERE kind = 'receipt' AND checked_in_at IS NULL;

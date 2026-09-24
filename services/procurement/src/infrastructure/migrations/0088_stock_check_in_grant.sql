-- 0088 — the one UPDATE the stock ledger allows: counting a gate receipt in.
--
-- Forward-only. Never edit this file.
--
-- `procurement.stock_movements` is append-only: 0034 grants `app_runtime`
-- SELECT and INSERT and nothing else, because a ledger whose rows can be
-- rewritten cannot say how a balance got where it is (INV-01). 0087 added a
-- receipt that waits at the gate until the storekeeper counts it in, and that
-- count has to land on the receipt row — so this grants UPDATE on exactly the
-- two check-in columns, and nothing else about a movement can change.
--
-- The TABLE-level UPDATE privilege stays withheld. The procurement isolation
-- walk reads table privileges and still expects 42501 for a cross-tenant
-- `UPDATE … SET tenant_id = tenant_id`, which a column grant on two other
-- columns does not permit — so that property is still asserted, unchanged.
--
-- The column grant says WHICH columns; the trigger says WHEN. A movement is
-- checked in once, only a receipt ever waits, and a check-in cannot be taken
-- back: the application's `WHERE checked_in_at IS NULL` is the ordinary path,
-- and this is what holds if anything else ever issues an UPDATE.

GRANT UPDATE (checked_in_at, checked_in_by) ON procurement.stock_movements TO app_runtime;

CREATE FUNCTION procurement.stock_movement_checked_in_once() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.kind <> 'receipt' OR OLD.checked_in_at IS NOT NULL OR NEW.checked_in_at IS NULL THEN
    RAISE EXCEPTION 'a stock movement is checked in once, and only a receipt waits to be'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stock_movements_checked_in_once
  BEFORE UPDATE ON procurement.stock_movements
  FOR EACH ROW EXECUTE FUNCTION procurement.stock_movement_checked_in_once();

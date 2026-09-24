-- 0033 — The foreign key `0009` could not have.
--
-- Forward-only. Never edit `0009_purchase_orders.sql`.
--
-- `procurement.purchase_orders.vendor_id` has been `uuid NOT NULL` with **no
-- foreign key** since `0009`, because `procurement.vendors` did not exist. An
-- order could name a vendor that was never created, and nothing objected —
-- including the isolation suite, which seeds `vendor_id` with `randomUUID()`.
--
-- Composite, like every FK here. Referential integrity is not subject to RLS,
-- so a single-column FK would let tenant A raise an order against tenant B's
-- vendor — and the insert succeeding is itself the disclosure that the vendor
-- exists.
--
-- `ON DELETE RESTRICT`: a vendor with orders against it cannot be deleted.
-- CASCADE would delete purchase orders because somebody tidied a vendor list.
-- The application turns the refusal into a 409 and suggests deactivating the
-- vendor instead, which is what the `status` column is for.
--
-- **This migration is destructive to bad data by design.** Any existing row
-- whose `vendor_id` names no vendor will fail the constraint. There is no such
-- data in any environment — no `vendors` table has ever existed to be
-- referenced — but on a database seeded by the isolation suite the fixture rows
-- must be created with real vendors from here on, which is why that suite's
-- seed now inserts one.

ALTER TABLE procurement.purchase_orders
  ADD CONSTRAINT purchase_orders_vendor_fkey
    FOREIGN KEY (tenant_id, vendor_id)
    REFERENCES procurement.vendors (tenant_id, id) ON DELETE RESTRICT;

CREATE INDEX purchase_orders_vendor_idx
  ON procurement.purchase_orders (tenant_id, vendor_id);

COMMENT ON COLUMN procurement.purchase_orders.vendor_id IS
  'The vendor this order is placed with. Composite FK to procurement.vendors, '
  'so it cannot name another tenant vendor and cannot name a vendor that does '
  'not exist — which it could between migrations 0009 and 0033.';

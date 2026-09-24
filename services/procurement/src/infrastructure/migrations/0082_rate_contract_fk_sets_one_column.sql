-- 0082 — a composite ON DELETE SET NULL must name the column it nulls.
--
-- Forward-only. Never edit this file, and note that this is why `0081` is not
-- edited either: it has been applied to test containers and a local database,
-- so correcting it in place would leave those unchanged and the file lying.
--
-- `0081` wrote:
--
--   FOREIGN KEY (tenant_id, rate_contract_item_id)
--     REFERENCES procurement.rate_contract_items (tenant_id, id) ON DELETE SET NULL
--
-- **`SET NULL` with no column list nulls the WHOLE key, `tenant_id` included.**
-- Postgres generates exactly that:
--
--   UPDATE ONLY "procurement"."purchase_order_lines"
--      SET "tenant_id" = NULL, "rate_contract_item_id" = NULL
--    WHERE ...
--
-- and `tenant_id` is NOT NULL, so the delete fails:
--
--   null value in column "tenant_id" of relation "purchase_order_lines"
--   violates not-null constraint
--
-- Found by the isolation suite on the FIRST edit of a rate contract — replacing
-- an item deletes the old row, which fired the cascade. So this was not a
-- theoretical sharp edge: the feature's own update path was broken by it.
--
-- **This is a hazard specific to composite foreign keys**, which this schema
-- uses everywhere by design: RI is exempt from RLS, so every FK carries
-- `tenant_id` to stop tenant A referencing tenant B's row. Every future
-- `ON DELETE SET NULL` in this codebase therefore has to name its column, and
-- the plain form is a bug rather than a shorthand.

ALTER TABLE procurement.purchase_order_lines
  DROP CONSTRAINT purchase_order_lines_rate_contract_item_fkey;

ALTER TABLE procurement.purchase_order_lines
  ADD CONSTRAINT purchase_order_lines_rate_contract_item_fkey
    FOREIGN KEY (tenant_id, rate_contract_item_id)
    REFERENCES procurement.rate_contract_items (tenant_id, id)
    -- The column list is the fix. `tenant_id` keeps its value; only the pointer
    -- is cleared, which is what "this contract item is gone" should mean.
    --
    -- `contracted_unit_rate` beside it is deliberately NOT nulled: it is the
    -- stamped evidence of what the order was measured against, and a deleted
    -- contract must not rewrite history. Same reasoning as `losing_before` on a
    -- lead merge.
    ON DELETE SET NULL (rate_contract_item_id);

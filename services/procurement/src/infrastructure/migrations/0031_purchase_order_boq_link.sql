-- 0031 — Link a purchase-order line to the BOQ line it was ordered against.
--
-- Forward-only. Never edit `0009_purchase_orders.sql`; this adds to it.
--
-- **The link goes on the PO line, pointing at the BOQ item — not the other way
-- round.** The legacy does the reverse: `boq_items.po_no` (`migrations.js:178`),
-- one PO number per BOQ line, written by `linkPOToBOQItems` (`boq.js:394`) as a
-- bulk UPDATE. Three reasons that shape is wrong here:
--
--   1. **A BOQ line can be ordered more than once.** Partial procurement is
--      normal — 500 sqm of tile across two vendors, or in two tranches. One
--      column on the BOQ line cannot represent it, so the legacy silently
--      overwrites: the second PO takes the field and the first is forgotten.
--   2. **The FK belongs in the service that owns the referencing row.**
--      `purchase_order_lines` already has a composite FK to `purchase_orders`;
--      this is one more of the same shape. The reverse direction would make
--      `projects` reference `procurement`, and `projects` references nothing
--      outside itself.
--   3. **It survives a BOQ edit.** The ordered quantity and rate are recorded on
--      the PO line, independently of what the BOQ line says later.
--
-- Nullable: most PO lines do not come from a BOQ.
--
-- **Composite, like every other FK here.** A single-column FK would let tenant A
-- reference tenant B's BOQ line, and the insert succeeding would confirm that
-- the row exists — referential integrity is not subject to RLS, which is the
-- whole reason M1/D3 mandates the composite form.
--
-- **ON DELETE RESTRICT, deliberately, and it is the interesting choice.**
--   * CASCADE would delete a purchase-order line because somebody tidied a BOQ.
--     A PO line is a record of something bought.
--   * SET NULL would keep the line and silently drop its provenance.
--   * RESTRICT means a BOQ line that has been ordered against cannot be deleted
--     until the order referencing it is gone. That is the answer an auditor
--     expects, and it turns a silent data-loss path into a refusal the caller
--     has to deal with.

ALTER TABLE procurement.purchase_order_lines
  ADD COLUMN boq_item_id uuid;

ALTER TABLE procurement.purchase_order_lines
  ADD CONSTRAINT purchase_order_lines_boq_fkey
    FOREIGN KEY (tenant_id, boq_item_id)
    REFERENCES projects.boq_items (tenant_id, id) ON DELETE RESTRICT;

CREATE INDEX purchase_order_lines_boq_idx
  ON procurement.purchase_order_lines (tenant_id, boq_item_id)
  WHERE boq_item_id IS NOT NULL;

COMMENT ON COLUMN procurement.purchase_order_lines.boq_item_id IS
  'The BOQ line this was ordered against, or NULL. Composite FK, so one tenant '
  'cannot reference another tenant BOQ line — referential integrity bypasses '
  'RLS, so a single-column FK would confirm the row exists. ON DELETE RESTRICT: '
  'a BOQ line that has been ordered against cannot be deleted while the order '
  'stands. The legacy holds the reverse link as boq_items.po_no, which cannot '
  'represent ordering one BOQ line twice (BOQ-05).';

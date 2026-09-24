-- 0030 — Optimistic locking on a BOQ line.
--
-- Forward-only. Never edit `0011_boq.sql`; this adds to it.
--
-- **BOQ-04.** `projects.boq_items` had no version column, so
-- `PATCH /projects/:projectId/boq/:itemId` had no lock: two people editing one
-- line meant last writer wins, silently. The previous slice named that rather
-- than half-solving it, because a lock invented in the application layer with
-- no column behind it looks like the purchase-order control while not being one.
--
-- This is the column, so now it can be one. Same shape as
-- `procurement.purchase_orders.version` and for the same reason — and, unlike
-- the legacy, the client cannot decline it: `updateBoqLineInput` requires
-- `expectedVersion`, exactly as `updatePurchaseOrderInput` does.
--
-- `DEFAULT 1` rather than NULL. `purchase_orders` in the legacy is the cautionary
-- case: `write.js:104` writes `COALESCE(version, 1) + 1` against a column that
-- does not exist at all, so every edit throws (PO-22). A version column that can
-- be NULL invites exactly that COALESCE, and a COALESCE in a lock predicate is a
-- lock that silently matches.

ALTER TABLE projects.boq_items
  ADD COLUMN version integer NOT NULL DEFAULT 1;

ALTER TABLE projects.boq_items
  ADD CONSTRAINT boq_items_version_check CHECK (version >= 1);

COMMENT ON COLUMN projects.boq_items.version IS
  'Incremented on every edit. The PATCH requires a matching expectedVersion, so '
  'a concurrent edit loses rather than overwriting silently (BOQ-04). Not '
  'nullable: a nullable version invites COALESCE in the lock predicate, which '
  'is a lock that always matches.';

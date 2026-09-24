-- 0036 — Attach a purchase order to a project.
--
-- Forward-only. Never edit `0009_purchase_orders.sql`.
--
-- **A purchase order has never been linked to a project in this schema.**
-- `0009` has no `project_id`, and the legacy joins on
-- `purchase_orders.project` — a **name string** written as free text
-- (`boq.js:174`), then matched with `LIKE '%…%'` (`dashboard.js:318`) and with
-- bidirectional `includes()` in the browser (`DashboardView.js:22-26`). Two
-- projects called "Tower A" and "Tower A Phase 2" each match the other.
--
-- Name-keying is what TOPOLOGY lists as blocking the rebuild, and a rollup that
-- groups spend by project is exactly where it does damage: the committed figure
-- a director reads is the sum over whatever the substring matched.
--
-- Nullable, because not every order belongs to a project — a general overhead
-- purchase does not. Composite, because referential integrity bypasses RLS.
-- `ON DELETE RESTRICT`: a project with purchase orders against it cannot be
-- deleted out from under them.

ALTER TABLE procurement.purchase_orders
  ADD COLUMN project_id uuid;

ALTER TABLE procurement.purchase_orders
  ADD CONSTRAINT purchase_orders_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects.projects (tenant_id, id) ON DELETE RESTRICT;

CREATE INDEX purchase_orders_project_idx
  ON procurement.purchase_orders (tenant_id, project_id)
  WHERE project_id IS NOT NULL;

COMMENT ON COLUMN procurement.purchase_orders.project_id IS
  'The project this order is for, or NULL for a general purchase. Composite FK '
  'to projects.projects. The legacy holds this as a project NAME matched with '
  'LIKE and includes(), so "Tower A" and "Tower A Phase 2" each match the '
  'other and a per-project spend total is the sum over whatever matched '
  '(PROJ-02).';

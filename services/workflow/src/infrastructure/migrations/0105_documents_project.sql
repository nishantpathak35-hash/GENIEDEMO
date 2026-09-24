-- 0105 — the project a document belongs to.
--
-- Forward-only. Never edit this file.
--
-- The vault is polymorphic (`entity_type`, `entity_id`): a document hangs off
-- a project, an order or a vendor, and nothing joins across that. The
-- project's own Documents twin (06-projects: "the vault, which is Design ▸
-- Drawings inside a project") needs one answer to "which project" for every
-- document that has one — the project itself, or the order's project, decided
-- by the composition root at registration and stamped here. NULL is honest:
-- a vendor's declaration belongs to no project.
--
-- No foreign key: `projects.projects` is another service's table and the two
-- schemas' migrations stay independent (M1/D5). The column is a stamped
-- pointer, like `trade_code` on a rate-contract item. Existing rows whose
-- record IS a project are back-filled from `entity_id`, which for that
-- entity type holds the project's uuid; anything else stays NULL until a
-- registration says otherwise.
--
-- The table already carries its restrictive + permissive policy pair and
-- FORCE ROW LEVEL SECURITY (0016); a new column changes neither. The index
-- leads with tenant_id so the policy's predicate and the twin's filter are
-- the same scan.

ALTER TABLE workflow.documents
  ADD COLUMN project_id uuid;

UPDATE workflow.documents
   SET project_id = entity_id::uuid
 WHERE entity_type = 'project'
   AND entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

CREATE INDEX documents_project_idx
  ON workflow.documents (tenant_id, project_id)
  WHERE project_id IS NOT NULL;

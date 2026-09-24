-- 0089 — a notification says who acted.
--
-- Forward-only. Never edit this file.
--
-- A notification carried a record — an entity type and an id — and no
-- person, so the feed drew every row with a square "record" avatar and a
-- sentence that could not say who submitted, decided or mentioned (DATA-04).
-- The actor is the principal whose action produced the row: the requester
-- who submitted an order, the approver who decided it, the author who
-- mentioned somebody.
--
-- Nullable, because rows written before this column have no actor on file and
-- a system-produced notification has none to name. The foreign key is
-- composite like every other here, and on the principal's deletion it clears
-- ONLY `actor_id` (`SET NULL (actor_id)`): clearing the whole key would null
-- `tenant_id` and fail, and the notification is still true of the moment it
-- records even after the person who acted is gone.

ALTER TABLE workflow.notifications
  ADD COLUMN actor_id uuid,
  ADD CONSTRAINT notifications_actor_fkey
    FOREIGN KEY (tenant_id, actor_id)
    REFERENCES identity.principals (tenant_id, id) ON DELETE SET NULL (actor_id);

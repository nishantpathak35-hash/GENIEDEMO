-- 0101 — A variation records when it was sent to the client.
--
-- Forward-only. Never edit this file.
--
-- Today's "Unsigned variations" panel says how long the oldest has waited for
-- a signature, and nothing recorded the moment a variation went to the
-- client: `state` moved to `pending_client` and only `updated_at` moved with
-- it. `submitted_at` is stamped by `submitChangeOrder` from here on.
--
-- A variation already with the client is backfilled from `updated_at` — the
-- last thing that touched it WAS the send, because nothing else can write to
-- a variation between its send and the client's decision. A variation already
-- decided is left NULL: its `updated_at` is the decision, not the send, and a
-- wait nobody dated is not a number.
--
-- No default. A draft has not been sent, and a NULL says so.
--
-- Migrations connect directly as the bootstrap role, not as app_runtime through
-- the pooler (docker-compose.yml), so the tenant policies do not narrow the
-- backfill (as 0099).

ALTER TABLE projects.change_orders
  ADD COLUMN submitted_at timestamptz;

UPDATE projects.change_orders
   SET submitted_at = updated_at
 WHERE state = 'pending_client' AND submitted_at IS NULL;

-- Pending means sent, and sent is dated. Only the pending state is held to it:
-- a decided variation from before this migration may honestly carry no date.
ALTER TABLE projects.change_orders
  ADD CONSTRAINT change_orders_submitted_check CHECK (
    state <> 'pending_client' OR submitted_at IS NOT NULL
  );

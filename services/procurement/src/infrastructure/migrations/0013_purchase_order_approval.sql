-- 0013 — Approval columns on purchase orders.
--
-- Forward-only. Never edit `0009_purchase_orders.sql`; this adds to it.
--
-- Two columns the approval engine needs, and neither can be derived:
--
--   * `created_by` — who raised the order. **APPR-02**: the legacy's only
--     creator comparison is client-side and gates loading a summary rather than
--     the approve action, so a caller can approve their own request by calling
--     the endpoint directly. The server compares against this column, which the
--     requester cannot supply.
--
--   * `approval_stage` — where the chain has reached. NULL until the order is
--     submitted. It is stored rather than derived from the history, because the
--     history is append-only evidence of what happened and the stage is current
--     state; deriving one from the other means a replay decides a live control.
--
-- `NULL` is deliberate for both on existing rows. There are none in any
-- environment yet, and a backfilled default requester would be a fabricated
-- attribution on an approval record — the same category of defect as
-- `tdsChallan281.js:54` inventing a TAN.

ALTER TABLE procurement.purchase_orders
  ADD COLUMN created_by     text,
  ADD COLUMN approval_stage text;

COMMENT ON COLUMN procurement.purchase_orders.created_by IS
  'The principal who raised this order. Read from here, never from the request '
  'body: it is what self-approval is refused against (APPR-02).';

COMMENT ON COLUMN procurement.purchase_orders.approval_stage IS
  'Current stage in the configured chain, NULL before submission. Current '
  'state, held separately from workflow.approval_history, which is append-only '
  'evidence rather than state.';

-- What a PERSON said about a record, and what a person needs to be told.
--
-- Neither existed. `workflow.audit_events` records what the SYSTEM did — it is
-- append-only by privilege and nobody's opinion is in it — and there was
-- nothing anywhere that recorded a human remark, or that told somebody an
-- approval was waiting for them. `docs/ports/design-build-and-work.md` named
-- both as real gaps found by comparing against the legacy's `work` module.
--
-- **Both live in `services/workflow`.** It already owns the cross-cutting
-- record-keeping — audit events, tasks, documents, the event stream — and a
-- comment on a purchase order must not make `procurement` import `projects`.
-- No service imports another; `services/host` composes them.

-- ---------------------------------------------------------------------------
-- THE POLYMORPHIC POINTER, AND WHY IT HAS NO FOREIGN KEY
-- ---------------------------------------------------------------------------
--
-- A comment attaches to a project, a purchase order, a change order or a BOQ
-- item. Those are four tables in three schemas, and no single foreign key can
-- reference four parents — so `entity_id` is a bare uuid with no FK, and that
-- is the ONE place in this schema where the composite-FK rule of `tenant-table`
-- is deliberately not met.
--
-- Being explicit because the rule exists for a real reason and this is the kind
-- of exception that gets copied without the reasoning:
--
--   * `entity_type` is a CLOSED set, enforced by CHECK. An unknown type cannot
--     be stored, so the pointer is at least always to a known KIND of thing.
--   * The row is still tenant-scoped by `tenant_id` under RLS, so a comment can
--     never be read across tenants regardless of where it points.
--   * What is genuinely lost is referential integrity WITHIN a tenant: deleting
--     a purchase order leaves its comments behind, orphaned. That is accepted
--     rather than solved, because the alternative — four nullable typed columns
--     with four composite FKs and a CHECK that exactly one is set — is the
--     shape that quietly grows a fifth column nobody adds the CHECK for.
--   * It is NOT a confidentiality hole: an orphaned comment is unreachable,
--     because every read goes through a route that resolves the parent first.

CREATE TABLE workflow.record_comments (
  tenant_id    uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id           uuid NOT NULL DEFAULT gen_random_uuid(),

  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,

  -- Threading, one level deep in practice and unbounded in the schema. A reply
  -- points at the comment it answers; a top-level comment points at nothing.
  parent_id    uuid,

  author_id    uuid NOT NULL,
  body         text NOT NULL,

  -- Edited in place rather than versioned. A comment is a remark, not a
  -- statutory record — `audit_events` is the thing that must never change.
  created_at   timestamptz NOT NULL DEFAULT now(),
  edited_at    timestamptz,

  CONSTRAINT record_comments_pkey PRIMARY KEY (tenant_id, id),

  CONSTRAINT record_comments_entity_check
    CHECK (entity_type IN ('project', 'purchase_order', 'change_order', 'boq_item')),
  CONSTRAINT record_comments_body_check
    CHECK (length(trim(body)) > 0 AND length(body) <= 4000),

  CONSTRAINT record_comments_author_fkey
    FOREIGN KEY (tenant_id, author_id)
    REFERENCES identity.principals (tenant_id, id) ON DELETE CASCADE,
  -- This one CAN be composite, and is: a reply and its parent are both here.
  CONSTRAINT record_comments_parent_fkey
    FOREIGN KEY (tenant_id, parent_id)
    REFERENCES workflow.record_comments (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX record_comments_tenant_idx ON workflow.record_comments (tenant_id);
CREATE INDEX record_comments_entity_idx
  ON workflow.record_comments (tenant_id, entity_type, entity_id, created_at);

ALTER TABLE workflow.record_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow.record_comments FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON workflow.record_comments AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON workflow.record_comments AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON workflow.record_comments FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON workflow.record_comments TO app_runtime;

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------------
--
-- **A row, and a read/unread state. No channel.**
--
-- Deliberately not email, push, digests or preferences. Those need a decision
-- about how this company talks to its people, and that decision has not been
-- made — whereas "an approval is waiting for you" is useful the moment it is
-- queryable. A notification nobody has delivered anywhere is the half that does
-- not need an answer first.
--
-- UPDATE is granted here, unlike `audit_events` and `lead_activities`, because
-- marking something read is the whole feature. Append-only-by-privilege is the
-- right shape for a record of what happened; it is the wrong shape for an inbox.

CREATE TABLE workflow.notifications (
  tenant_id    uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id           uuid NOT NULL DEFAULT gen_random_uuid(),

  -- Whose inbox. Every read is filtered to the caller: a notification names
  -- what somebody must act on, and the list of what a colleague has been asked
  -- to approve is not a thing to hand out.
  recipient_id uuid NOT NULL,

  kind         text NOT NULL,
  -- Written at the time, not resolved on read. A notification is a statement
  -- about a moment — "approval requested for PO-0018, ₹3,03,595.60" — and
  -- re-deriving it later would silently rewrite history when the order changes.
  summary      text NOT NULL,

  -- Same closed-set pointer as above, plus the entity types a notification can
  -- be about that a comment cannot.
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,

  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notifications_pkey PRIMARY KEY (tenant_id, id),

  CONSTRAINT notifications_kind_check
    CHECK (kind IN ('approval_requested', 'approval_decided', 'comment_mentioned')),
  CONSTRAINT notifications_entity_check
    CHECK (entity_type IN ('project', 'purchase_order', 'change_order', 'boq_item')),
  CONSTRAINT notifications_summary_check
    CHECK (length(trim(summary)) > 0 AND length(summary) <= 500),

  CONSTRAINT notifications_recipient_fkey
    FOREIGN KEY (tenant_id, recipient_id)
    REFERENCES identity.principals (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX notifications_tenant_idx ON workflow.notifications (tenant_id);
-- The only query that matters: this person's unread, newest first.
CREATE INDEX notifications_inbox_idx
  ON workflow.notifications (tenant_id, recipient_id, read_at, created_at DESC);

ALTER TABLE workflow.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow.notifications FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON workflow.notifications AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access    ON workflow.notifications AS PERMISSIVE  FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON workflow.notifications FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON workflow.notifications TO app_runtime;

-- RLS scopes these to a TENANT. Scoping them to a PERSON is the application's
-- job, in `listNotifications`, exactly as project membership is — the database
-- cannot tell one colleague from another and must not be asked to.

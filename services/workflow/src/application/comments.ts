import type { Page } from '@cog/contracts';
import { finishPage, keyset, type PageQuery } from '@cog/service-kit';
import type { TxLike } from './approve-in-transaction.js';

/**
 * Comments on a record, and the notifications they produce.
 *
 * `workflow.audit_events` records what the SYSTEM did. This records what a
 * PERSON said about it, and they are different tables on purpose: one is
 * append-only by privilege and is evidence, the other is a remark somebody can
 * correct.
 */

export const COMMENTABLE = ['project', 'purchase_order', 'change_order', 'boq_item'] as const;
export type EntityType = (typeof COMMENTABLE)[number];

export const NOTIFICATION_KINDS = [
  'approval_requested',
  'approval_decided',
  'comment_mentioned',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export class CommentError extends Error {
  override readonly name = 'CommentError';
}

export interface RecordComment {
  readonly id: string;
  readonly entityType: EntityType;
  readonly entityId: string;
  readonly parentId: string | null;
  readonly authorId: string;
  readonly authorEmail: string;
  readonly body: string;
  readonly createdAt: string;
  readonly editedAt: string | null;
}

export async function listComments(
  tx: TxLike,
  entityType: EntityType,
  entityId: string,
): Promise<readonly RecordComment[]> {
  const rows = await tx.query<{
    id: string;
    entity_type: string;
    entity_id: string;
    parent_id: string | null;
    author_id: string;
    author_email: string;
    body: string;
    created_at: string;
    edited_at: string | null;
  }>(
    `SELECT c.id, c.entity_type, c.entity_id, c.parent_id, c.author_id,
            p.email AS author_email, c.body,
            c.created_at::text AS created_at, c.edited_at::text AS edited_at
       FROM workflow.record_comments c
       JOIN identity.principals p ON p.tenant_id = c.tenant_id AND p.id = c.author_id
      WHERE c.entity_type = $1 AND c.entity_id = $2
      ORDER BY c.created_at`,
    [entityType, entityId],
  );
  return rows.map((r) => ({
    id: r.id,
    entityType: r.entity_type as EntityType,
    entityId: r.entity_id,
    parentId: r.parent_id,
    authorId: r.author_id,
    authorEmail: r.author_email,
    body: r.body,
    createdAt: r.created_at,
    editedAt: r.edited_at,
  }));
}


const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Of these ids, the ones that can actually be sent a notification.
 *
 * Two filters, and the second one exists because of a real failure. **A
 * notification must never be the reason an approval fails.**
 *
 * `notifications.recipient_id` is a uuid with a foreign key to
 * `identity.principals`. `purchase_orders.created_by` is TEXT with no
 * constraint at all, so it can hold something that is not a principal id and
 * not even a uuid — and it does, in imported and older rows. Addressing a
 * notification to that value took the whole approval down with a 500: the
 * control failing because a courtesy could not be delivered.
 *
 * Non-uuid strings are dropped before the query, because `= ANY($1::uuid[])`
 * raises `22P02` on one rather than returning no rows. Unknown and non-staff
 * ids are dropped silently: reporting which were rejected would make this a way
 * to test whether a principal id exists.
 */
export async function notifiableStaff(
  tx: TxLike,
  ids: readonly string[],
): Promise<readonly string[]> {
  const candidates = [...new Set(ids)].filter((id) => UUID.test(id));
  if (candidates.length === 0) return [];
  const rows = await tx.query<{ id: string }>(
    `SELECT id FROM identity.principals
      WHERE id = ANY($1::uuid[]) AND kind = 'staff'`,
    [candidates],
  );
  return rows.map((r) => r.id);
}

export interface AddCommentInput {
  readonly entityType: EntityType;
  readonly entityId: string;
  readonly body: string;
  readonly parentId?: string | undefined;
  /** Principals to notify. Resolved by the caller — workflow knows no emails. */
  readonly mentions?: readonly string[] | undefined;
}

/**
 * Add a comment, and notify anybody it names.
 *
 * The comment and its notifications are one statement. A mention that produced
 * no notification is a mention nobody saw, and retrying it later would
 * duplicate the comment — so they succeed or fail together, in the caller's
 * transaction.
 */
export async function addComment(
  tx: TxLike,
  tenantId: string,
  authorId: string,
  input: AddCommentInput,
): Promise<string> {
  const body = input.body.trim();
  if (body === '') throw new CommentError('a comment needs something in it');
  if (body.length > 4000) throw new CommentError('that comment is too long');

  // A reply must answer a comment on the SAME record. Without this a reply can
  // be threaded onto a comment belonging to another purchase order, which moves
  // it — and everything under it — onto a record its author never saw.
  if (input.parentId !== undefined) {
    const parent = await tx.query<{ entity_type: string; entity_id: string }>(
      `SELECT entity_type, entity_id FROM workflow.record_comments WHERE id = $1`,
      [input.parentId],
    );
    const found = parent[0];
    if (found === undefined) throw new CommentError('that comment no longer exists');
    if (found.entity_type !== input.entityType || found.entity_id !== input.entityId) {
      throw new CommentError('a reply must be on the same record as the comment it answers');
    }
  }

  const rows = await tx.query<{ id: string }>(
    `INSERT INTO workflow.record_comments
       (tenant_id, id, entity_type, entity_id, parent_id, author_id, body)
     VALUES ($1, gen_random_uuid(), $2, $3, $4, $5, $6)
     RETURNING id`,
    [tenantId, input.entityType, input.entityId, input.parentId ?? null, authorId, body],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new CommentError('that comment was not saved');

  // MENTIONS ARE FILTERED TO STAFF IN THIS TENANT, not trusted from the body.
  //
  // `mentions` is a list of principal ids chosen by the caller. Without this a
  // staff user could name a VENDOR or CLIENT portal principal and plant a
  // notification, carrying text they wrote, in an external party's row — the
  // portals do not read notifications today, so it would sit there invisible
  // until the day one does. RLS does not help: every id involved is in the same
  // tenant.
  //
  // The filter is here rather than in the route so it cannot be bypassed by a
  // second caller. Unknown and non-staff ids are dropped silently rather than
  // refused: reporting which ids were rejected would turn this into a way to
  // test whether a principal id exists.
  const wanted = [...new Set(input.mentions ?? [])].filter((id) => id !== authorId);
  for (const mentioned of await notifiableStaff(tx, wanted)) {
    await notify(tx, tenantId, {
      recipientId: mentioned,
      actorId: authorId,
      kind: 'comment_mentioned',
      // Truncated at the point of writing, not on read: a notification is a
      // statement about a moment and must not change when the comment is edited.
      summary: `You were mentioned: ${body.slice(0, 200)}`,
      entityType: input.entityType,
      entityId: input.entityId,
    });
  }
  return id;
}

// ─────────────────────────────────────────────────────────── notifications ──

export interface Notification {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly summary: string;
  readonly entityType: EntityType;
  readonly entityId: string;
  /** Whose action produced it; `null` when none is on file. */
  readonly actorId: string | null;
  readonly readAt: string | null;
  readonly createdAt: string;
}

export interface NotifyInput {
  readonly recipientId: string;
  /** Whose action produced this — the submitter, the approver, the author. `null` for none (0089). */
  readonly actorId: string | null;
  readonly kind: NotificationKind;
  readonly summary: string;
  readonly entityType: EntityType;
  readonly entityId: string;
}

/** Put one row in somebody's inbox. No channel, by design — see migration 0064. */
export async function notify(
  tx: TxLike,
  tenantId: string,
  input: NotifyInput,
): Promise<void> {
  await tx.query(
    `INSERT INTO workflow.notifications
       (tenant_id, id, recipient_id, kind, summary, entity_type, entity_id, actor_id)
     VALUES ($1, gen_random_uuid(), $2, $3, $4, $5, $6, $7)`,
    [
      tenantId,
      input.recipientId,
      input.kind,
      input.summary.slice(0, 500),
      input.entityType,
      input.entityId,
      input.actorId,
    ],
  );
}

/**
 * One person's inbox.
 *
 * **`recipient_id` is a required argument, not an option.** RLS scopes these
 * rows to a tenant and has nothing to say about which colleague they belong to;
 * the list of what somebody has been asked to approve is not a thing to hand
 * out. Making the filter a parameter rather than a default means a caller
 * cannot omit it and get everybody's.
 */
export async function listNotifications(
  tx: TxLike,
  recipientId: string,
  page: PageQuery,
  options: { readonly unreadOnly?: boolean } = {},
): Promise<Page<Notification>> {
  const k = keyset(page, 'created_at', 'id', 'timestamptz', true, 3);
  const rows = await tx.query<{
    id: string;
    kind: string;
    summary: string;
    entity_type: string;
    entity_id: string;
    actor_id: string | null;
    read_at: string | null;
    created_at: string;
  }>(
    `SELECT id, kind, summary, entity_type, entity_id, actor_id,
            read_at::text AS read_at, created_at::text AS created_at
       FROM workflow.notifications
      WHERE recipient_id = $1
        AND ($2::boolean IS NOT TRUE OR read_at IS NULL)
        AND ${k.where}
      ORDER BY ${k.orderBy}
      LIMIT $${3 + k.params.length}`,
    [recipientId, options.unreadOnly ?? false, ...k.params, page.limit + 1],
  );
  const [counted] = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM workflow.notifications
      WHERE recipient_id = $1 AND ($2::boolean IS NOT TRUE OR read_at IS NULL)`,
    [recipientId, options.unreadOnly ?? false],
  );
  const paged = finishPage(rows, page, (r) => ({ key: r.created_at, id: r.id }));
  return {
    items: paged.items.map((r) => ({
      id: r.id,
      kind: r.kind as NotificationKind,
      summary: r.summary,
      entityType: r.entity_type as EntityType,
      entityId: r.entity_id,
      actorId: r.actor_id,
      readAt: r.read_at,
      createdAt: r.created_at,
    })),
    nextCursor: paged.nextCursor,
    prevCursor: paged.prevCursor,
    count: counted?.n ?? 0,
  };
}

/**
 * Mark one as read.
 *
 * Scoped to the recipient in the WHERE clause, so marking somebody else's
 * notification read is not a thing this can be asked to do — and it returns
 * whether a row moved, so the caller can answer 404 rather than reporting
 * success for a notification that was never theirs.
 */
export async function markRead(
  tx: TxLike,
  recipientId: string,
  notificationId: string,
): Promise<boolean> {
  const rows = await tx.query<{ id: string }>(
    `UPDATE workflow.notifications
        SET read_at = now()
      WHERE id = $1 AND recipient_id = $2 AND read_at IS NULL
      RETURNING id`,
    [notificationId, recipientId],
  );
  return rows.length > 0;
}

/**
 * Mark every one of the caller's unread notifications read. Scoped to the
 * recipient like `markRead`, so "all" is all of MINE; returns how many moved.
 */
export async function markAllRead(tx: TxLike, recipientId: string): Promise<number> {
  const rows = await tx.query<{ id: string }>(
    `UPDATE workflow.notifications
        SET read_at = now()
      WHERE recipient_id = $1 AND read_at IS NULL
      RETURNING id`,
    [recipientId],
  );
  return rows.length;
}

export async function unreadCount(tx: TxLike, recipientId: string): Promise<number> {
  const rows = await tx.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM workflow.notifications
      WHERE recipient_id = $1 AND read_at IS NULL`,
    [recipientId],
  );
  return Number(rows[0]?.n ?? 0);
}

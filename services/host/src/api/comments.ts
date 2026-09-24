import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { HTTP_STATUS } from '@cog/contracts';
import { readPage, tenantOf, txOf } from '@cog/service-kit';
import { principalNames } from '@cog/identity';
import {
  addComment,
  listComments,
  listNotifications,
  markRead,
  markAllRead,
  unreadCount,
  CommentError,
  COMMENTABLE,
  type EntityType,
} from '@cog/workflow';

/**
 * Comments on a record, and the signed-in person's notifications.
 *
 * **Notifications are never listed for anyone but the caller.** There is no
 * route that takes a recipient id, and that absence is the control: the list of
 * what a colleague has been asked to approve says who is spending what, and
 * row-level security cannot tell one colleague from another.
 */

function requestId(c: Context): string {
  return c.req.header('x-request-id') ?? 'unknown';
}

const entityType = z.enum(COMMENTABLE);

const commentInput = z.object({
  body: z.string().min(1).max(4000),
  parentId: z.uuid().optional(),
  /** Principal ids to notify. The client resolves people; workflow knows ids. */
  mentions: z.array(z.uuid()).max(20).optional(),
});

export function commentRoutes(): Hono {
  const app = new Hono();

  app.get('/records/:entityType/:entityId/comments', async (c) => {
    const parsedType = entityType.safeParse(c.req.param('entityType'));
    const entityId = c.req.param('entityId');
    if (!parsedType.success || !z.uuid().safeParse(entityId).success) return notFound(c);

    const items = await listComments(txOf(c), parsedType.data as EntityType, entityId);
    return c.json({ items });
  });

  app.post('/records/:entityType/:entityId/comments', async (c) => {
    const parsedType = entityType.safeParse(c.req.param('entityType'));
    const entityId = c.req.param('entityId');
    if (!parsedType.success || !z.uuid().safeParse(entityId).success) return notFound(c);

    const parsed = commentInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error.issues[0]?.message);

    const ctx = tenantOf(c);
    const id = await addComment(txOf(c), ctx.tenantId, ctx.principal.id, {
      entityType: parsedType.data as EntityType,
      entityId,
      body: parsed.data.body,
      parentId: parsed.data.parentId,
      mentions: parsed.data.mentions,
    });
    return c.json({ id }, 201);
  });

  /** The caller's own inbox. No recipient parameter exists, deliberately. */
  app.get('/notifications', async (c) => {
    const page = readPage(c);
    if ('error' in page) return validationFailed(c, page.error);

    const ctx = tenantOf(c);
    const tx = txOf(c);
    const unreadOnly = c.req.query('unread') === 'true';
    const paged = await listNotifications(tx, ctx.principal.id, page, { unreadOnly });
    const unread = await unreadCount(tx, ctx.principal.id);
    // Who acted, named by identity: workflow stores the id, and a name is not
    // workflow's to know. An actor since removed reads as no actor.
    const names = await principalNames(
      tx,
      paged.items.flatMap((n) => (n.actorId === null ? [] : [n.actorId])),
    );
    return c.json({
      ...paged,
      items: paged.items.map(({ actorId, ...n }) => {
        const name = actorId === null ? undefined : names.get(actorId);
        return { ...n, actor: actorId === null || name === undefined ? null : { id: actorId, name } };
      }),
      unread,
    });
  });

  /** Everything unread in the caller's inbox, and only theirs. */
  app.post('/notifications/read-all', async (c) => {
    const marked = await markAllRead(txOf(c), tenantOf(c).principal.id);
    return c.json({ marked });
  });

  app.post('/notifications/:id/read', async (c) => {
    const id = c.req.param('id');
    if (!z.uuid().safeParse(id).success) return notFound(c);
    const ctx = tenantOf(c);
    // Scoped to the caller inside `markRead`, so somebody else's notification
    // is indistinguishable from one that does not exist.
    const moved = await markRead(txOf(c), ctx.principal.id, id);
    return moved ? c.body(null, 204) : notFound(c);
  });

  app.onError((error, c) => {
    if (error instanceof CommentError) {
      return validationFailed(c, error.message);
    }
    throw error;
  });

  return app;
}

function notFound(c: Context) {
  return c.json(
    { code: 'NOT_FOUND' as const, message: 'no such record', requestId: requestId(c) },
    HTTP_STATUS.NOT_FOUND as 404,
  );
}

function validationFailed(c: Context, message: string | undefined) {
  return c.json(
    {
      code: 'VALIDATION_FAILED' as const,
      message: message ?? 'That comment was not saved.',
      requestId: requestId(c),
    },
    HTTP_STATUS.VALIDATION_FAILED as 400,
  );
}

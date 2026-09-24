import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { HTTP_STATUS } from '@cog/contracts';
import { tenantOf, txOf } from '@cog/service-kit';
import { loadEntitlements, loadPrincipalRoles } from '@cog/identity';
import {
  addProjectMember,
  listProjectTeam,
  mayReadTeam,
  removeProjectMember,
  ProjectTeamError,
} from '@cog/projects';

/**
 * Who is on a project.
 *
 * **In the host because it is composition**, like `chains.ts`: membership lives
 * in `services/projects`, and whether the caller may see it is a question only
 * `services/identity` can answer. Neither may import the other (M1/D5).
 *
 * This is the first surface in the system with an authorisation scope narrower
 * than a tenant, so the refusal below is doing real work. Row-level security has
 * already decided the caller is in the right ORGANISATION; nothing in the
 * database has an opinion about whether they are on this particular PROJECT.
 */

function requestId(c: Context): string {
  return c.req.header('x-request-id') ?? 'unknown';
}

const memberInput = z.object({
  principalId: z.uuid(),
  designation: z.string().max(80).optional(),
});

export function teamRoutes(): Hono {
  const app = new Hono();

  /**
   * A project's team.
   *
   * Refused with **404, not 403**, for a project the caller is not on.
   *
   * A 403 is an answer: it confirms the project exists and that somebody else
   * is on it. Across a company running work for competing clients that is worth
   * knowing, and it is the same reason `loadApprovalSubject` cannot distinguish
   * another tenant's order from a missing one. Not-permitted and not-there look
   * identical from outside.
   */
  app.get('/projects/:projectId/team', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c);

    const ctx = tenantOf(c);
    const tx = txOf(c);
    const roles = await loadPrincipalRoles(tx, ctx.principal.id);
    const { actions } = await loadEntitlements(tx, roles);

    if (!(await mayReadTeam(tx, projectId, ctx.principal.id, actions))) return notFound(c);
    return c.json({ items: await listProjectTeam(tx, projectId) });
  });

  /**
   * Put somebody on a project.
   *
   * `manage_users` rather than membership: being on a project does not make you
   * able to add to it, or every member could add anybody and the scope would be
   * a suggestion. Changing who can see a project's commercials is an
   * administrative act.
   */
  app.post('/projects/:projectId/team', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c);

    const ctx = tenantOf(c);
    const tx = txOf(c);
    const roles = await loadPrincipalRoles(tx, ctx.principal.id);
    const { actions } = await loadEntitlements(tx, roles);
    if (!actions.includes('manage_users')) return forbidden(c, 'You cannot change project teams.');

    const parsed = memberInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        {
          code: 'VALIDATION_FAILED' as const,
          message: parsed.error.issues[0]?.message ?? 'That member was not saved.',
          requestId: requestId(c),
        },
        HTTP_STATUS.VALIDATION_FAILED as 400,
      );
    }

    const id = await addProjectMember(tx, ctx.tenantId, ctx.principal.id, {
      projectId,
      principalId: parsed.data.principalId,
      designation: parsed.data.designation,
    });
    return c.json({ id }, 201);
  });

  app.delete('/projects/:projectId/team/:principalId', async (c) => {
    const projectId = c.req.param('projectId');
    const principalId = c.req.param('principalId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c);
    if (!z.uuid().safeParse(principalId).success) return notFound(c);

    const ctx = tenantOf(c);
    const tx = txOf(c);
    const roles = await loadPrincipalRoles(tx, ctx.principal.id);
    const { actions } = await loadEntitlements(tx, roles);
    if (!actions.includes('manage_users')) return forbidden(c, 'You cannot change project teams.');

    const removed = await removeProjectMember(tx, projectId, principalId);
    // Reporting success for a removal that removed nothing tells an
    // administrator the access is gone when it is not.
    return removed ? c.body(null, 204) : notFound(c);
  });

  app.onError((error, c) => {
    if (error instanceof ProjectTeamError) {
      return c.json(
        { code: 'VALIDATION_FAILED' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.VALIDATION_FAILED as 400,
      );
    }
    throw error;
  });

  return app;
}

function notFound(c: Context) {
  return c.json(
    { code: 'NOT_FOUND' as const, message: 'no such project', requestId: requestId(c) },
    HTTP_STATUS.NOT_FOUND as 404,
  );
}

function forbidden(c: Context, message: string) {
  return c.json(
    { code: 'FORBIDDEN' as const, message, requestId: requestId(c) },
    HTTP_STATUS.FORBIDDEN as 403,
  );
}

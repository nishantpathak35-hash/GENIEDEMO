import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { HTTP_STATUS, grantClientProjectInput, grantVendorInput } from '@cog/contracts';
import { readPage, tenantOf, txOf } from '@cog/service-kit';
import {
  countActivePrincipalsOfKind,
  findPrincipalOfKind,
  linkPrincipal,
  linkedSubjects,
  loadEntitlements,
  loadPrincipalRoles,
  pagePrincipalsOfKind,
  unlinkPrincipal,
} from '@cog/identity';
import { projectMembershipsFor, projectNames, projectExists } from '@cog/projects';
import { vendorExists, vendorNames } from '@cog/procurement';

/**
 * People, and the client logins that see one project each.
 *
 * **In the host because it is composition**: who somebody is belongs to
 * `services/identity`, which projects they are on belongs to
 * `services/projects`, and neither may import the other (M1/D5).
 *
 * The legacy has three tabs here — Users, Staff Access, Client Portal — and
 * three things this does not port:
 *
 *   `SettingsUsersTab.js:42` creates a user with the default password
 *   `ChangeMe123!`, and `:47` assigns a fixed role set. A password chosen by
 *   the software is a credential nobody rotates.
 *
 *   `SettingsClientPortalTab.js:51` generates a client password in the BROWSER
 *   with a `Client@` prefix. A predictable prefix on a credential minted
 *   client-side is two failures in one line.
 *
 *   `StaffAccessSettings.js:16` maps legacy role names on load, 'procurement'
 *   to 'proc', with no reverse mapping — so a role saved through that screen is
 *   not the role that was read.
 *
 * There is no account creation on this surface at all. Access arrives through
 * an invite, whose token is shown once and stored only as a hash.
 */

function requestId(c: Context): string {
  return c.req.header('x-request-id') ?? 'unknown';
}

async function mayManageUsers(c: Context): Promise<boolean> {
  const tx = txOf(c);
  const roles = await loadPrincipalRoles(tx, tenantOf(c).principal.id);
  const { actions } = await loadEntitlements(tx, roles);
  return actions.includes('manage_users');
}

function forbidden(c: Context) {
  return c.json(
    {
      code: 'FORBIDDEN' as const,
      message: 'You cannot change who sees what.',
      requestId: requestId(c),
    },
    HTTP_STATUS.FORBIDDEN as 403,
  );
}

function notFound(c: Context, what: string) {
  return c.json(
    { code: 'NOT_FOUND' as const, message: `no such ${what}`, requestId: requestId(c) },
    HTTP_STATUS.NOT_FOUND as 404,
  );
}

function validationFailed(c: Context, message: string) {
  return c.json(
    { code: 'VALIDATION_FAILED' as const, message, requestId: requestId(c) },
    HTTP_STATUS.VALIDATION_FAILED as 400,
  );
}

export function peopleRoutes(): Hono {
  const app = new Hono();

  /**
   * Everybody, with their roles and their projects.
   *
   * Readable by any staff principal: a colleague list is not a secret from
   * colleagues, and the roles are already visible on the roles screen.
   */
  app.get('/settings/people', async (c) => {
    const page = readPage(c);
    if ('error' in page) return validationFailed(c, page.error);

    const tx = txOf(c);
    const [paged, active] = await Promise.all([
      pagePrincipalsOfKind(tx, 'staff', page),
      countActivePrincipalsOfKind(tx, 'staff'),
    ]);
    // ONE query for every membership rather than one per person: a thirty-person
    // page would otherwise make thirty round trips to render a table.
    const memberships = await projectMembershipsFor(
      tx,
      paged.items.map((p) => p.id),
    );

    return c.json({
      items: paged.items.map((principal) => ({
        id: principal.id,
        email: principal.email,
        displayName: principal.displayName,
        roles: principal.roles,
        disabled: principal.disabled,
        projects: memberships
          .filter((m) => m.principalId === principal.id)
          .map((m) => ({ id: m.projectId, name: m.projectName, designation: m.designation })),
      })),
      nextCursor: paged.nextCursor,
      prevCursor: paged.prevCursor,
      count: paged.count,
      summary: { active },
    });
  });

  /**
   * Client portal logins, and exactly what each one can see.
   *
   * `principal_links` is what the portal already reads: a client login sees the
   * projects listed here and answers not-found for anything else. This screen
   * makes that list visible and editable rather than inventing a second list
   * beside the one that is enforced.
   */
  app.get('/settings/client-accounts', async (c) => {
    const page = readPage(c);
    if ('error' in page) return validationFailed(c, page.error);

    const tx = txOf(c);
    const paged = await pagePrincipalsOfKind(tx, 'client', page);

    const items = [];
    for (const client of paged.items) {
      const ids = await linkedSubjects(tx, client.id, 'client');
      const names = await projectNames(tx, ids);
      items.push({
        id: client.id,
        email: client.email,
        disabled: client.disabled,
        // A link to a project that no longer exists is shown as the id rather
        // than dropped. A row that vanishes from an access list looks like
        // access that was revoked, and it was not.
        projects: ids.map((id) => ({ id, name: names.get(id) ?? id })),
      });
    }
    return c.json({ items, nextCursor: paged.nextCursor, prevCursor: paged.prevCursor, count: paged.count });
  });

  app.post('/settings/client-accounts/:principalId/projects', async (c) => {
    const principalId = c.req.param('principalId');
    if (!z.uuid().safeParse(principalId).success) return notFound(c, 'client account');
    if (!(await mayManageUsers(c))) return forbidden(c);

    const parsed = grantClientProjectInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        {
          code: 'VALIDATION_FAILED' as const,
          message: 'A project is required.',
          requestId: requestId(c),
        },
        HTTP_STATUS.VALIDATION_FAILED as 400,
      );
    }

    const tx = txOf(c);
    const ctx = tenantOf(c);

    // BOTH ends are checked, and both answer not-found rather than forbidden.
    //
    // `linkPrincipal` says in its own doc comment that the caller is
    // responsible for having checked the subject exists — `identity` cannot
    // read `projects`, so this is the layer where that check can happen at all.
    // Without it a link can be written to a project id that is not a project,
    // and the portal would then show a client an empty screen nobody can
    // explain.
    if ((await findPrincipalOfKind(tx, 'client', principalId)) === null) {
      return notFound(c, 'client account');
    }
    if (!(await projectExists(tx, parsed.data.projectId))) return notFound(c, 'project');

    await linkPrincipal(tx, ctx.tenantId, {
      principalId,
      subjectKind: 'client',
      subjectId: parsed.data.projectId,
      createdBy: ctx.principal.id,
    });
    return c.json({ ok: true });
  });

  app.delete('/settings/client-accounts/:principalId/projects/:projectId', async (c) => {
    const principalId = c.req.param('principalId');
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(principalId).success) return notFound(c, 'client account');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    if (!(await mayManageUsers(c))) return forbidden(c);

    // No existence check on the way out. Revoking access that was already gone
    // is the outcome the caller asked for, and refusing it would leave somebody
    // unsure whether the access is still there.
    await unlinkPrincipal(txOf(c), principalId, 'client', projectId);
    return c.json({ ok: true });
  });

  /**
   * Vendor portal logins, and exactly which suppliers each one represents.
   *
   * **The parity that was missing.** Everything above has a client counterpart
   * and, until this, no vendor one: an invitation could mint a vendor LOGIN —
   * `invites.principal_kind` has carried `'vendor'` since migration 0080 — and
   * then nothing in the product could attach that login to a vendor. The only
   * writer of a `subject_kind = 'vendor'` link was `scripts/seed-demo.mjs`,
   * by direct SQL, with a comment at the call site saying no route existed.
   *
   * So vendor onboarding was: invite them, then open a database console. M6
   * claims vendor self-service, and a step that requires psql is not that.
   *
   * The mechanism is the one the portal already enforces, not a second list
   * beside it. `services/vendor-portal` answers not-found for an order whose
   * vendor is not linked here, which is why the isolation tests for these
   * routes finish in the portal: granting a link and then reading an order is
   * the only thing that proves the grant did something.
   */
  app.get('/settings/vendor-accounts', async (c) => {
    const page = readPage(c);
    if ('error' in page) return validationFailed(c, page.error);

    const tx = txOf(c);
    const paged = await pagePrincipalsOfKind(tx, 'vendor', page);

    const items = [];
    for (const account of paged.items) {
      const ids = await linkedSubjects(tx, account.id, 'vendor');
      const names = await vendorNames(tx, ids);
      items.push({
        id: account.id,
        email: account.email,
        disabled: account.disabled,
        // A link to a vendor that no longer exists shows as the id rather than
        // being dropped, for the reason the client list gives: a row that
        // vanishes from an access list reads as access that was revoked.
        vendors: ids.map((id) => ({ id, name: names.get(id) ?? id })),
      });
    }
    return c.json({ items, nextCursor: paged.nextCursor, prevCursor: paged.prevCursor, count: paged.count });
  });

  app.post('/settings/vendor-accounts/:principalId/vendors', async (c) => {
    const principalId = c.req.param('principalId');
    if (!z.uuid().safeParse(principalId).success) return notFound(c, 'vendor account');
    if (!(await mayManageUsers(c))) return forbidden(c);

    const parsed = grantVendorInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        {
          code: 'VALIDATION_FAILED' as const,
          message: 'A vendor is required.',
          requestId: requestId(c),
        },
        HTTP_STATUS.VALIDATION_FAILED as 400,
      );
    }

    const tx = txOf(c);
    const ctx = tenantOf(c);

    // BOTH ends, both answering not-found, for the reason given above the
    // client version: `identity` cannot read `procurement`, so the composition
    // root is the only layer where the subject can be checked at all. Without
    // it a link can point at a uuid that is not a vendor, and the portal then
    // shows a supplier an empty screen nobody can explain.
    if ((await findPrincipalOfKind(tx, 'vendor', principalId)) === null) {
      return notFound(c, 'vendor account');
    }
    if (!(await vendorExists(tx, parsed.data.vendorId))) return notFound(c, 'vendor');

    await linkPrincipal(tx, ctx.tenantId, {
      principalId,
      subjectKind: 'vendor',
      subjectId: parsed.data.vendorId,
      createdBy: ctx.principal.id,
    });
    return c.json({ ok: true });
  });

  app.delete('/settings/vendor-accounts/:principalId/vendors/:vendorId', async (c) => {
    const principalId = c.req.param('principalId');
    const vendorId = c.req.param('vendorId');
    if (!z.uuid().safeParse(principalId).success) return notFound(c, 'vendor account');
    if (!z.uuid().safeParse(vendorId).success) return notFound(c, 'vendor');
    if (!(await mayManageUsers(c))) return forbidden(c);

    // No existence check on the way out, as on the client side: revoking access
    // that was already gone is the outcome the caller asked for.
    await unlinkPrincipal(txOf(c), principalId, 'vendor', vendorId);
    return c.json({ ok: true });
  });

  return app;
}

import { Hono, type Context } from 'hono';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HTTP_STATUS, type TenantId } from '@cog/contracts';
import { finishPage, keyset, readPage, tenantOf, txOf } from '@cog/service-kit';
import { InviteError, mintInvite } from '../application/invite.js';
import {
  RoleError,
  addRole,
  listRoles,
  loadEntitlements,
  retireRole,
  setRoleGrants,
} from '../application/authz.js';
import { loadPrincipalRoles } from '../application/roles.js';
import type { TenantConfigReader } from '../domain/ports.js';

/**
 * Identity HTTP surface — who is in this tenant, and inviting more of them.
 *
 * Mounted by `services/host` behind the tenant middleware. No query carries a
 * `WHERE tenant_id`; the RLS policy applies it.
 *
 * **Two things are deliberately never returned by any handler here:**
 *
 * 1. `external_id`. It is the provider's identifier and the credential the
 *    bootstrap lookup resolves; publishing it turns a list of colleagues into a
 *    list of things to authenticate as.
 * 2. An invite `token_hash`. The token itself is shown exactly once, at mint,
 *    in the response that creates it — an invite link is a bearer credential,
 *    and the legacy invites table has no expiry at all, so a token minted once
 *    works forever.
 */

type PrincipalRow = {
  id: string;
  kind: string;
  email: string;
  display_name: string | null;
  roles: string[];
  disabled_at: string | null;
};

type InviteRow = {
  id: string;
  email: string;
  display_name: string | null;
  kind: string;
  roles: string[];
  expires_at: string;
  accepted_at: string | null;
};

/**
 * `kind` decides which application the resulting login may reach at all —
 * `requireStaff` and `requireKind` read it — so it is stated at invitation
 * time and read back from the stored row at redemption. It is never taken from
 * whoever is redeeming.
 *
 * Three kinds, not five: `connector` and `system` exist in
 * `identity.principals` and may not be created by an invitation. An invite link
 * arrives by email, and an email that can mint the Tally agent's credential is
 * the on-prem trust boundary in an inbox. Migration 0080 carries the same
 * CHECK, so this schema is the courteous refusal and the constraint is the
 * real one.
 */
const createInviteInput = z
  .object({
    email: z.email().max(320),
    displayName: z.string().trim().min(1).max(120).optional(),
    kind: z.enum(['staff', 'vendor', 'client']).default('staff'),
    roles: z.array(z.string().min(1).max(40)).max(20).optional(),
  })
  .refine((v) => v.kind === 'staff' || (v.roles ?? []).length === 0, {
    // A 400 that says why, rather than a 500 from
    // `invites_external_holds_no_role_check`. The constraint is what makes it
    // true; this is what makes it legible.
    path: ['roles'],
    message:
      'a vendor or client invitation cannot carry roles — an external principal ' +
      'holds none, and what it may see comes from its project or vendor link',
  });

/**
 * Reads a tenant's configured origin from the database, inside the caller's
 * transaction — so the invite URL is the tenant's own.
 *
 * `auth.js:253` hardcodes a single demo domain as the invite URL. In a
 * multi-tenant product that sends every customer's staff to somebody else's
 * login page, and `mintInvite` refuses rather than defaulting when the origin
 * is missing.
 */
function configReaderFor(c: Context): TenantConfigReader {
  return {
    async appOrigin(_tenantId: TenantId): Promise<string | null> {
      const rows = await txOf(c).query<{ app_origin: string | null }>(
        `SELECT app_origin FROM tenancy.tenants LIMIT 1`,
      );
      return rows[0]?.app_origin ?? null;
    },
  };
}

/**
 * A permission screen sends the WHOLE set it is showing, so the write replaces
 * rather than merges. A merge would make removing a grant impossible through
 * the only interface that edits them.
 */
const setGrantsBody = z.object({
  modules: z.array(z.string()).max(100),
  actions: z.array(z.string()).max(100),
});

const addRoleBody = z.object({
  key: z.string().min(2).max(31),
  label: z.string().min(1).max(80),
});

export function identityRoutes(): Hono {
  const app = new Hono();

  app.get('/principals', async (c) => {
    const page = readPage(c);
    if ('error' in page) return pageRefused(c, page.error);
    // Alphabetical by email, ascending — a directory, not a feed.
    const k = keyset(page, 'email', 'id', 'text', false, 1);
    const rows = await txOf(c).query<PrincipalRow>(
      `SELECT id, kind, email, display_name, roles, disabled_at::text AS disabled_at
         FROM identity.principals
        WHERE ${k.where}
        ORDER BY ${k.orderBy}
        LIMIT $${1 + k.params.length}`,
      [...k.params, page.limit + 1],
    );
    const [counted] = await txOf(c).query<{ n: number }>(
      `SELECT count(*)::int AS n FROM identity.principals`,
    );
    const paged = finishPage(rows, page, (r) => ({ key: r.email, id: r.id }));
    return c.json({
      items: paged.items.map((r) => ({
        id: r.id,
        kind: r.kind,
        email: r.email,
        displayName: r.display_name,
        roles: r.roles,
        // A boolean, not the timestamp: when someone was disabled is an audit
        // question, and the audit log is where it is answered.
        disabled: r.disabled_at !== null,
      })),
      nextCursor: paged.nextCursor,
      prevCursor: paged.prevCursor,
      count: counted?.n ?? 0,
    });
  });

  app.get('/invites', async (c) => {
    const page = readPage(c);
    if ('error' in page) return pageRefused(c, page.error);
    const k = keyset(page, 'created_at', 'id', 'timestamptz', true, 1);
    const rows = await txOf(c).query<InviteRow & { created_at: string }>(
      `SELECT id, email, display_name, kind, roles, expires_at::text AS expires_at,
              accepted_at::text AS accepted_at, created_at::text AS created_at
         FROM identity.invites
        WHERE ${k.where}
        ORDER BY ${k.orderBy}
        LIMIT $${1 + k.params.length}`,
      [...k.params, page.limit + 1],
    );
    const [counted] = await txOf(c).query<{ n: number }>(`SELECT count(*)::int AS n FROM identity.invites`);
    const paged = finishPage(rows, page, (r) => ({ key: r.created_at, id: r.id }));
    return c.json({
      items: paged.items.map((r) => ({
        id: r.id,
        email: r.email,
        displayName: r.display_name,
        kind: r.kind,
        roles: r.roles,
        expiresAt: r.expires_at,
        accepted: r.accepted_at !== null,
      })),
      nextCursor: paged.nextCursor,
      prevCursor: paged.prevCursor,
      count: counted?.n ?? 0,
    });
  });

  app.post('/invites', async (c) => {
    const parsed = createInviteInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailedFrom(c, parsed.error);

    const ctx = tenantOf(c);
    const minted = await mintInvite(configReaderFor(c), {
      tenantId: ctx.tenantId,
      now: new Date(),
    });

    const inviteId = randomUUID();
    const tx = txOf(c);

    await tx.query(
      `INSERT INTO identity.invites
         (tenant_id, id, email, display_name, kind, roles, token_hash, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        ctx.tenantId,
        inviteId,
        parsed.data.email,
        parsed.data.displayName ?? null,
        parsed.data.kind,
        parsed.data.roles ?? [],
        minted.tokenHash,
        minted.expiresAt,
        ctx.principal.id,
      ],
    );

    // The bootstrap mapping, in the SAME transaction as the invitation. The
    // redeemer has no principal, so no tenant can be resolved from their
    // credential and `identity.invites` — FORCE RLS — returns them nothing.
    // `register_invite` takes the tenant from the session setting rather than
    // an argument, so this cannot register into somebody else's tenant.
    //
    // One transaction matters: an invitation whose lookup row failed to land
    // would be a link that is valid, unexpired, and permanently unredeemable.
    await tx.query('SELECT identity.register_invite($1, $2)', [minted.tokenHash, inviteId]);

    // The URL is returned ONCE, here, and never readable again — only its hash
    // is stored. Re-issuing means minting a new invite, which is the correct
    // shape for a bearer credential.
    return c.json(
      {
        email: parsed.data.email,
        kind: parsed.data.kind,
        url: minted.url,
        expiresAt: minted.expiresAt.toISOString(),
      },
      201,
    );
  });

  app.onError((error, c) => {
    if (error instanceof InviteError) {
      // A tenant with no configured origin is a configuration failure the
      // caller can act on, not a server fault.
      return c.json(
        { code: 'VALIDATION_FAILED' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.VALIDATION_FAILED as 400,
      );
    }
    throw error;
  });

  /**
   * What the signed-in person may do.
   *
   * **The one endpoint every app calls before rendering a control.** A screen
   * renders what the server said the user may do; it never derives a role.
   * `POsView.js:136-154` derives them client-side from an email address, which
   * means the control is a decoration and the check is a suggestion.
   *
   * Returns the resolved union across the caller's roles, so an app never has
   * to know that roles are additive, or which role carried which grant.
   */
  app.get('/me/entitlements', async (c) => {
    const ctx = tenantOf(c);
    const tx = txOf(c);
    const roles = await loadPrincipalRoles(tx, ctx.principal.id);
    const entitlements = await loadEntitlements(tx, roles);
    // Every screen of every application asks this once, so it is where "a
    // signed-in person used the product" happens. The operator directory is
    // told the instant (0090): throttled, the caller's own tenant, no detail.
    await tx.query(`SELECT tenancy.note_tenant_activity('active')`);
    return c.json(entitlements);
  });

  /**
   * The role catalog, with each role's grants.
   *
   * Readable by anyone signed in: knowing that a "Finance" role exists is not
   * sensitive, and a screen that shows who holds what needs the labels. Writing
   * is a different matter and is gated below.
   */
  app.get('/roles', async (c) => {
    const roles = await listRoles(txOf(c));
    return c.json({
      items: roles,
      // Surfaced so a settings screen can say WHICH answers were inherited
      // rather than agreed. Every seeded row is provisional until a human
      // confirms it, exactly like a project health threshold.
      provisional: roles.some((r) => r.status === 'provisional'),
    });
  });

  /**
   * Everything below changes who may do what, so it needs `manage_users`.
   *
   * Checked here rather than in a middleware over the whole file, because
   * reading the catalog must stay open — and a guard that has to be remembered
   * per route is exactly the shape that gets forgotten on the nineteenth one.
   * The narrow surface makes that acceptable: three routes, all in view.
   */
  async function mayManageUsers(c: Context): Promise<boolean> {
    const ctx = tenantOf(c);
    const tx = txOf(c);
    const roles = await loadPrincipalRoles(tx, ctx.principal.id);
    const entitlements = await loadEntitlements(tx, roles);
    return entitlements.actions.includes('manage_users');
  }

  function forbidden(c: Context) {
    return c.json(
      {
        code: 'FORBIDDEN' as const,
        message: 'Changing roles needs the "Manage people and roles" permission.',
        requestId: c.req.header('x-request-id') ?? 'unknown',
      },
      HTTP_STATUS.FORBIDDEN as 403,
    );
  }

  app.put('/roles/:roleKey/grants', async (c) => {
    if (!(await mayManageUsers(c))) return forbidden(c);

    const parsed = setGrantsBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailedFrom(c, parsed.error);

    await setRoleGrants(txOf(c), {
      roleKey: c.req.param('roleKey'),
      modules: parsed.data.modules,
      actions: parsed.data.actions,
      // Saving from the settings screen CONFIRMS the answer: a human looked at
      // it and pressed save, which is the whole difference between an inherited
      // value and an agreed one.
      confirmedBy: tenantOf(c).principal.id,
    });
    return c.json({ ok: true });
  });

  app.post('/roles', async (c) => {
    if (!(await mayManageUsers(c))) return forbidden(c);

    const parsed = addRoleBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailedFrom(c, parsed.error);

    await addRole(txOf(c), parsed.data.key, parsed.data.label);
    return c.json({ ok: true }, 201);
  });

  /**
   * Retire a role. Never delete one — `workflow.approval_history` names the
   * stage a role approved at, and that history is the only thing a dispute can
   * be settled from.
   */
  app.delete('/roles/:roleKey', async (c) => {
    if (!(await mayManageUsers(c))) return forbidden(c);
    await retireRole(txOf(c), c.req.param('roleKey'));
    return c.json({ ok: true });
  });

  app.onError((error, c) => {
    if (error instanceof RoleError) {
      return c.json(
        {
          code: 'VALIDATION_FAILED' as const,
          message: error.message,
          requestId: c.req.header('x-request-id') ?? 'unknown',
        },
        HTTP_STATUS.VALIDATION_FAILED as 400,
      );
    }
    throw error;
  });

  return app;
}

function requestId(c: Context): string {
  return c.req.header('x-request-id') ?? 'unknown';
}

/** A 400 for a cursor the list did not issue. */
function pageRefused(c: Context, message: string): Response {
  return c.json(
    { code: 'VALIDATION_FAILED' as const, message, requestId: tenantOf(c).requestId },
    HTTP_STATUS.VALIDATION_FAILED as 400,
  );
}

function validationFailedFrom(c: Context, error: z.ZodError): Response {
  return c.json(
    {
      code: 'VALIDATION_FAILED' as const,
      message: 'Some of the submitted values are not valid.',
      requestId: requestId(c),
      details: error.issues.map((i) => ({ path: i.path.join('.'), reason: i.message })),
    },
    HTTP_STATUS.VALIDATION_FAILED as 400,
  );
}

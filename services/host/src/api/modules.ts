import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { HTTP_STATUS } from '@cog/contracts';
import { tenantOf, txOf } from '@cog/service-kit';
import { loadEntitlements, loadPrincipalRoles } from '@cog/identity';
import {
  isOptionalModule,
  listModules,
  moduleEnabled,
  setModuleEnabled,
  type OptionalModuleKey,
} from '@cog/tenancy';

/**
 * The per-tenant module switch, and the gate that reads it.
 *
 * **In the host because it is composition.** Whether a module is on is
 * `services/tenancy`; whether the caller may change that is `services/identity`;
 * neither may import the other (M1/D5).
 *
 * Two questions, asked in this order, and getting the order wrong is the whole
 * bug this exists to avoid:
 *
 *   1. is this module turned on for this tenant   → `moduleGate`, 404
 *   2. may this principal use it                  → `role_grants`, 403
 *
 * The eleven design-build workflows are all gated and all start OFF. They came
 * out of a feature tree written on top of the original app rather than out of
 * watching a business run, so some describe a real process and some are a
 * shape. A switch is the honest answer to not knowing which.
 */

function requestId(c: Context): string {
  return c.req.header('x-request-id') ?? 'unknown';
}

function notFound(c: Context) {
  return c.json(
    { code: 'NOT_FOUND' as const, message: 'no such route', requestId: requestId(c) },
    HTTP_STATUS.NOT_FOUND as 404,
  );
}

/**
 * Refuse everything under this route unless the tenant has the module on.
 *
 * **404, and deliberately not 403.** A 403 is an answer: it says the feature
 * exists, is deployed, and is being withheld — which invites "who can turn it
 * on for me" for a module this tenant may have switched off on purpose, and
 * tells anybody probing the API exactly which unreleased features are present.
 * A module nobody enabled has no permission question to answer. This is the
 * same reasoning as `teamRoutes`, where not-a-member and no-such-project are
 * made to look identical.
 *
 * It runs BEFORE the entitlement check inside each route, so a disabled module
 * cannot be distinguished from a missing one by timing the two refusals apart.
 */
export function moduleGate(key: OptionalModuleKey): MiddlewareHandler {
  return async (c, next) => {
    if (!(await moduleEnabled(txOf(c), key))) return notFound(c);
    await next();
  };
}

/**
 * The gate for a write that lands in ANOTHER module.
 *
 * `recordExternalDecision` applies the decision through the same functions the
 * in-app path uses — that is the point of it, so a client's answer relayed by
 * WhatsApp counts exactly as one typed into the app. It also means a POST to
 * `client-actions` is a write to **design deliverables** or to **room
 * selections**, and `moduleGate` cannot see that: it gates a path prefix, and
 * the path says `client-actions`.
 *
 * Without this, a tenant with client actions on and design deliverables off
 * still moves a deliverable's revision count through the side door — and that
 * counter is the one that becomes a charge.
 *
 * Gating all three modules on the one route would be the wrong fix: it would
 * make the three switches move together, and moving them independently is the
 * entire reason there are switches.
 *
 * `c.req.json()` is cached by Hono, so the handler downstream parses the same
 * body rather than a consumed stream.
 */
const SUBJECT_MODULES: Readonly<Record<string, OptionalModuleKey | null>> = {
  deliverable: 'design_deliverables',
  selection: 'room_selections',
  // Recorded, never applied — it writes nothing outside this module. If a
  // change order is ever authorised from here, it needs its own entry.
  change_order: null,
};

export function externalDecisionGate(): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method === 'POST') {
      const body: unknown = await c.req.json().catch(() => null);
      const kind =
        body !== null && typeof body === 'object' && 'subjectKind' in body
          ? (body as { subjectKind: unknown }).subjectKind
          : undefined;

      if (typeof kind === 'string') {
        const key = SUBJECT_MODULES[kind];
        // An unrecognised kind falls through to the route's own validation,
        // which answers 400 and names the three. Refusing here would answer
        // 404 for a typo, which reads as "no such project".
        if (key !== undefined && key !== null && !(await moduleEnabled(txOf(c), key))) {
          return notFound(c);
        }
      }
    }
    await next();
  };
}

const toggleInput = z.object({ enabled: z.boolean() });

export function moduleRoutes(): Hono {
  const app = new Hono();

  /**
   * The catalogue and this tenant's answer against each.
   *
   * Readable by any staff principal. What a company has switched on is not a
   * secret from its own staff — they can see the navigation — and hiding the
   * list would only mean nobody knows what to ask for.
   */
  app.get('/settings/modules', async (c) => {
    return c.json({ items: await listModules(txOf(c)) });
  });

  /**
   * Turn one on or off.
   *
   * `manage_settings`, for the reason `chains.ts` gives about approval chains:
   * this changes what the organisation does, not what one person may do, and
   * the two are not the same grant. Switching a module off does not delete its
   * data — see migration 0065 — so this is reversible, which is why it is a
   * settings change rather than an administrative ceremony.
   */
  app.put('/settings/modules/:key', async (c) => {
    const key = c.req.param('key');
    // An unknown key is 404 rather than 400: the request names a module that
    // does not exist, and saying "not a valid module key" would enumerate the
    // ones that are.
    if (!isOptionalModule(key)) return notFound(c);

    const ctx = tenantOf(c);
    const tx = txOf(c);
    const roles = await loadPrincipalRoles(tx, ctx.principal.id);
    const { actions } = await loadEntitlements(tx, roles);
    if (!actions.includes('manage_settings')) {
      return c.json(
        {
          code: 'FORBIDDEN' as const,
          message: 'You cannot change which modules are switched on.',
          requestId: requestId(c),
        },
        HTTP_STATUS.FORBIDDEN as 403,
      );
    }

    const parsed = toggleInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        {
          code: 'VALIDATION_FAILED' as const,
          message: 'Say whether the module should be on or off.',
          requestId: requestId(c),
        },
        HTTP_STATUS.VALIDATION_FAILED as 400,
      );
    }

    await setModuleEnabled(tx, ctx.tenantId, key, parsed.data.enabled, ctx.principal.id);
    return c.json({ key, enabled: parsed.data.enabled });
  });

  return app;
}

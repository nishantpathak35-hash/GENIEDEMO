import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { HTTP_STATUS, tradePackageInput, updateTradePackageInput } from '@cog/contracts';
import { tenantOf, txOf } from '@cog/service-kit';
import { loadEntitlements, loadPrincipalRoles } from '@cog/identity';
import {
  addTradePackage,
  listTradePackages,
  updateTradePackage,
  TradePackageError,
} from '@cog/projects';

/**
 * The trade catalogue.
 *
 * **In the host because it is composition**: the catalogue is
 * `services/projects` and whether the caller may change it is
 * `services/identity` (M1/D5).
 *
 * Reading is open to staff because every estimating and BOQ screen needs it to
 * offer a picker; writing is `manage_settings`, because a trade list is a
 * statement about what the company does rather than about one person's work.
 */

function requestId(c: Context): string {
  return c.req.header('x-request-id') ?? 'unknown';
}

async function mayManage(c: Context): Promise<boolean> {
  const tx = txOf(c);
  const roles = await loadPrincipalRoles(tx, tenantOf(c).principal.id);
  const { actions } = await loadEntitlements(tx, roles);
  return actions.includes('manage_settings');
}

function forbidden(c: Context) {
  return c.json(
    {
      code: 'FORBIDDEN' as const,
      message: 'You cannot change the trade list.',
      requestId: requestId(c),
    },
    HTTP_STATUS.FORBIDDEN as 403,
  );
}

export function tradePackageRoutes(): Hono {
  const app = new Hono();

  app.get('/settings/trade-packages', async (c) => {
    // Retired trades are included. A picker asks for the active ones; this is
    // the settings surface, and hiding a retired trade from the screen that
    // retired it is how it becomes impossible to bring one back.
    return c.json({ items: await listTradePackages(txOf(c)) });
  });

  app.post('/settings/trade-packages', async (c) => {
    if (!(await mayManage(c))) return forbidden(c);
    const parsed = tradePackageInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        {
          code: 'VALIDATION_FAILED' as const,
          message: parsed.error.issues[0]?.message ?? 'That trade was not saved.',
          requestId: requestId(c),
        },
        HTTP_STATUS.VALIDATION_FAILED as 400,
      );
    }
    const id = await addTradePackage(txOf(c), tenantOf(c), parsed.data);
    return c.json({ id }, 201);
  });

  app.put('/settings/trade-packages/:tradePackageId', async (c) => {
    const id = c.req.param('tradePackageId');
    if (!z.uuid().safeParse(id).success) return notFound(c);
    if (!(await mayManage(c))) return forbidden(c);

    const parsed = updateTradePackageInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        {
          code: 'VALIDATION_FAILED' as const,
          message: parsed.error.issues[0]?.message ?? 'That trade was not saved.',
          requestId: requestId(c),
        },
        HTTP_STATUS.VALIDATION_FAILED as 400,
      );
    }

    // RLS scopes the UPDATE, so a trade belonging to another tenant matches no
    // row and answers not-found rather than forbidden.
    const changed = await updateTradePackage(txOf(c), id, parsed.data);
    return changed ? c.json({ ok: true }) : notFound(c);
  });

  app.onError((error, c) => {
    if (error instanceof TradePackageError) {
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
    { code: 'NOT_FOUND' as const, message: 'no such trade', requestId: requestId(c) },
    HTTP_STATUS.NOT_FOUND as 404,
  );
}

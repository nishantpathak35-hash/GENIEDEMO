import { Hono, type Context } from 'hono';
import { HTTP_STATUS, saveNumberSeriesInput } from '@cog/contracts';
import { tenantOf, txOf } from '@cog/service-kit';
import { loadEntitlements, loadPrincipalRoles } from '@cog/identity';
import {
  listSeries,
  saveSeriesFormat,
  NumberSeriesError,
  NUMBERED_MODULES,
  type NumberedModule,
} from '@cog/procurement';

/**
 * How documents are named.
 *
 * **In the host because it is composition**: the series lives in
 * `services/procurement` and whether the caller may change it is a question only
 * `services/identity` answers (M1/D5).
 *
 * What this surface deliberately cannot do is move a counter. The legacy tab
 * (`components/views/settings/SettingsNumberSeriesTab.js`) renders
 * `current_number` as an editable field with no constraint behind it, so an
 * administrator can set it back to 40 and re-issue `PO-0041` onto a second
 * order. There is no field for it here, no column in the write, and the
 * application function that performs the update names `last_number` nowhere.
 */

function requestId(c: Context): string {
  return c.req.header('x-request-id') ?? 'unknown';
}

function isNumbered(value: string): value is NumberedModule {
  return (NUMBERED_MODULES as readonly string[]).includes(value);
}

export function numberSeriesRoutes(): Hono {
  const app = new Hono();

  /** Readable by any staff principal: everybody sees these numbers all day. */
  app.get('/settings/number-series', async (c) => {
    return c.json({ items: await listSeries(txOf(c), tenantOf(c)) });
  });

  app.put('/settings/number-series/:moduleType', async (c) => {
    const moduleType = c.req.param('moduleType');
    // Unknown document type is 404 rather than 400 for the same reason the
    // module switch answers 404: a validation message listing the legal values
    // enumerates what exists.
    if (!isNumbered(moduleType)) {
      return c.json(
        { code: 'NOT_FOUND' as const, message: 'no such series', requestId: requestId(c) },
        HTTP_STATUS.NOT_FOUND as 404,
      );
    }

    const ctx = tenantOf(c);
    const tx = txOf(c);
    const roles = await loadPrincipalRoles(tx, ctx.principal.id);
    const { actions } = await loadEntitlements(tx, roles);
    if (!actions.includes('manage_settings')) {
      return c.json(
        {
          code: 'FORBIDDEN' as const,
          message: 'You cannot change how documents are numbered.',
          requestId: requestId(c),
        },
        HTTP_STATUS.FORBIDDEN as 403,
      );
    }

    const parsed = saveNumberSeriesInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        {
          code: 'VALIDATION_FAILED' as const,
          message: parsed.error.issues[0]?.message ?? 'That numbering format was not saved.',
          requestId: requestId(c),
        },
        HTTP_STATUS.VALIDATION_FAILED as 400,
      );
    }

    await saveSeriesFormat(tx, ctx, moduleType, parsed.data, ctx.principal.id);
    return c.json({ ok: true });
  });

  app.onError((error, c) => {
    if (error instanceof NumberSeriesError) {
      return c.json(
        { code: 'VALIDATION_FAILED' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.VALIDATION_FAILED as 400,
      );
    }
    throw error;
  });

  return app;
}

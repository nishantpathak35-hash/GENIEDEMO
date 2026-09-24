import { Hono } from 'hono';
import { HTTP_STATUS, recordTaxRateInput } from '@cog/contracts';
import { tenantOf, txOf } from '@cog/service-kit';
import {
  TaxRateError,
  listTaxRates,
  listTdsThresholds,
  recordTaxRate,
} from '../application/tax-rates.js';

/**
 * `services/finance`'s internal HTTP surface — the tax-rate table and the TDS
 * thresholds beside it.
 *
 * Every row read here is provisional until a person promotes it with a CA's
 * name and date (ADR-0014, addendum). The payment, challan, 26Q and invoice
 * routes that compute with these rows are composed in the host, because they
 * need procurement's bills and tenancy's registration beside finance's rules.
 *
 * The write path can only ever produce a `provisional` row. There is no route
 * that marks one verified, deliberately: promotion needs a statute, a name and
 * a date, the table's CHECK constraint enforces that, and a person supplies
 * them out of band.
 */
export function financeRoutes(): Hono {
  const app = new Hono();

  app.get('/tax-rates', async (c) => {
    return c.json({ items: await listTaxRates(txOf(c)) });
  });

  app.get('/tds-thresholds', async (c) => {
    return c.json({ items: await listTdsThresholds(txOf(c)) });
  });

  app.post('/tax-rates', async (c) => {
    const parsed = recordTaxRateInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        {
          code: 'VALIDATION_FAILED' as const,
          message: parsed.error.issues[0]?.message ?? 'That rate was not recorded.',
          requestId: c.req.header('x-request-id') ?? 'unknown',
        },
        HTTP_STATUS.VALIDATION_FAILED as 400,
      );
    }
    return c.json(await recordTaxRate(txOf(c), tenantOf(c), parsed.data), 201);
  });

  app.onError((error, c) => {
    if (error instanceof TaxRateError) {
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

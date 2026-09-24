import { Hono, type Context } from 'hono';
import {
  HTTP_STATUS,
  saveCompanyProfileInput,
  saveOperationalDefaultsInput,
  saveTaxSetupInput,
  saveTerminologyInput,
} from '@cog/contracts';
import { tenantOf, txOf } from '@cog/service-kit';
import { loadEntitlements, loadPrincipalRoles } from '@cog/identity';
import {
  TaxReviewRefused,
  TerminologyRefused,
  completeTaxReview,
  getCompanyProfile,
  getOperationalDefaults,
  getTaxSetup,
  getTerminology,
  saveCompanyProfile,
  saveOperationalDefaults,
  saveTaxSetup,
  saveTerminology,
} from '@cog/tenancy';
import { loadProvisionalCatalogue } from '@cog/finance';

/**
 * The organisation's own details.
 *
 * **In the host because it is composition**: the profile is `services/tenancy`
 * and whether the caller may change it is `services/identity` (M1/D5).
 *
 * This closes the defect the first survey found — a real GSTIN and PAN as
 * literals in `app/po/[poNo]/page.js` and `SettingsService.ts`. In a
 * multi-tenant product a compiled-in tax registration prints one customer's
 * registration on another customer's purchase order.
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

function forbidden(c: Context, what: string) {
  return c.json(
    { code: 'FORBIDDEN' as const, message: `You cannot change ${what}.`, requestId: requestId(c) },
    HTTP_STATUS.FORBIDDEN as 403,
  );
}

function invalid(c: Context, message: string) {
  return c.json(
    { code: 'VALIDATION_FAILED' as const, message, requestId: requestId(c) },
    HTTP_STATUS.VALIDATION_FAILED as 400,
  );
}

export function companyRoutes(): Hono {
  const app = new Hono();

  // Readable by any staff principal: this is what goes on the top of every
  // document they raise, so hiding it would only mean nobody can check it.
  app.get('/settings/company', async (c) => c.json(await getCompanyProfile(txOf(c))));

  app.put('/settings/company', async (c) => {
    if (!(await mayManage(c))) return forbidden(c, "the organisation's details");
    const parsed = saveCompanyProfileInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      // The message names the field, because "not a valid GSTIN" beside a form
      // with four registration numbers on it does not say which one.
      const issue = parsed.error.issues[0];
      return invalid(
        c,
        issue === undefined
          ? 'Those details were not saved.'
          : `${String(issue.path[0] ?? 'A field')}: ${issue.message}`,
      );
    }
    const ctx = tenantOf(c);
    await saveCompanyProfile(txOf(c), ctx.tenantId, parsed.data, ctx.principal.id);
    return c.json({ ok: true });
  });

  app.get('/settings/operational', async (c) => c.json(await getOperationalDefaults(txOf(c))));

  app.put('/settings/operational', async (c) => {
    if (!(await mayManage(c))) return forbidden(c, 'the operational defaults');
    const parsed = saveOperationalDefaultsInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return invalid(
        c,
        parsed.error.issues[0]?.message ?? 'Those defaults were not saved.',
      );
    }
    const ctx = tenantOf(c);
    await saveOperationalDefaults(txOf(c), ctx.tenantId, parsed.data, ctx.principal.id);
    return c.json({ ok: true });
  });

  /**
   * Settings › Terminology — the words this organisation uses. Readable by
   * any staff principal: every screen's labels read it, once per request.
   */
  app.get('/settings/terminology', async (c) => c.json(await getTerminology(txOf(c))));

  app.put('/settings/terminology', async (c) => {
    if (!(await mayManage(c))) return forbidden(c, 'the words this organisation uses');
    const parsed = saveTerminologyInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, 'Each pair takes one of its two words.');
    const ctx = tenantOf(c);
    try {
      return c.json(await saveTerminology(txOf(c), ctx.tenantId, parsed.data, ctx.principal.id));
    } catch (error) {
      if (error instanceof TerminologyRefused) return invalid(c, error.message);
      throw error;
    }
  });

  /**
   * Settings › Tax — the two business questions and the review's state.
   * Flags with provenance, never a rate (0084). Completing the review is a
   * recorded fact and unlocks nothing: the money path opens on rules a named
   * CA verified, which is `services/finance`'s to say.
   */
  app.get('/settings/tax-setup', async (c) => c.json(await getTaxSetup(txOf(c))));

  app.put('/settings/tax-setup', async (c) => {
    if (!(await mayManage(c))) return forbidden(c, 'the answers about your business');
    const parsed = saveTaxSetupInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, 'Both questions need a yes or a no.');
    const ctx = tenantOf(c);
    return c.json(await saveTaxSetup(txOf(c), ctx.tenantId, parsed.data, ctx.principal.id));
  });

  app.post('/settings/tax-setup/complete', async (c) => {
    if (!(await mayManage(c))) return forbidden(c, 'the tax review');
    try {
      return c.json(await completeTaxReview(txOf(c), tenantOf(c).principal.id));
    } catch (error) {
      if (error instanceof TaxReviewRefused) return invalid(c, error.message);
      throw error;
    }
  });

  /**
   * Load the provisional statutory values this organisation does not have.
   *
   * Finance writes them, always as provisional, from its catalogue; the host
   * only decides who may ask, because whether a person may manage settings is
   * identity's to answer and finance may not read it.
   */
  app.post('/settings/tax/statutory-values', async (c) => {
    if (!(await mayManage(c))) return forbidden(c, 'the statutory values');
    return c.json(await loadProvisionalCatalogue(txOf(c), tenantOf(c)));
  });

  return app;
}

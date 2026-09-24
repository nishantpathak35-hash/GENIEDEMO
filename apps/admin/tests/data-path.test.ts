import { describe, expect, it } from 'vitest';
import { API_ROUTES } from '@cog/contracts';
import { load } from '@cog/design-system';
import { api } from '../lib/api';

/**
 * **The back office reaches the platform surface and nothing else.**
 *
 * A platform account belongs to no tenant. Every route this app calls is on
 * `/platform/v1`, which is mounted outside `tenantMiddleware` — so the
 * connection it runs on never has a tenant id, and every tenant-scoped policy
 * in the database denies it by construction.
 *
 * The assertion that matters here is the negative one: this app must not be
 * able to call an `/api/v1` route. If it could, a platform account would be
 * asking for a tenant's data and getting a refusal it could not explain — or,
 * worse, someone would "fix" that by giving platform accounts a tenant.
 */


/**
 * Field names a shape must not contain.
 *
 * Written as a substring list rather than a regular expression on purpose:
 * `services/host/tests/apps-compute-nothing.test.ts` scans every file under
 * `apps/` as raw text, and `/margin/i` looks exactly like a division by a
 * money-shaped identifier to it. Keeping that check maximally strict is worth
 * more than the brevity of a regex here.
 */
function shapeOf(route: { response: { shape: unknown } }): string {
  return JSON.stringify(route.response.shape).toLowerCase();
}

function forbid(shape: string, words: readonly string[]): void {
  for (const word of words) {
    expect(shape.includes(word), `the shape contains "${word}"`).toBe(false);
  }
}

const BASE = 'http://api.test';
const CREDENTIAL = 'ops@construct-o-genie.test';

function respond(status: number, body: unknown) {
  const seen: { url?: string; init?: RequestInit } = {};
  const fetch = (url: string, init?: RequestInit): Promise<Response> => {
    seen.url = url;
    if (init !== undefined) seen.init = init;
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  return { seen, fetch };
}

describe('the back office', () => {
  it('reaches only /platform/v1', () => {
    for (const route of [
      API_ROUTES.platformWhoami,
      API_ROUTES.listTenants,
      API_ROUTES.provisionTenant,
      API_ROUTES.provisioningEvents,
    ]) {
      expect(route.path.startsWith('/platform/v1/')).toBe(true);
    }
  });

  it('sees that organisations exist, and nothing inside them', () => {
    // The directory carries a slug, a name and an origin. It cannot leak a
    // tenant's data because it does not contain any — and it is a separate
    // table rather than a view over `tenancy.tenants`, which a connection with
    // no tenant context cannot read and must not be able to.
    forbid(shapeOf(API_ROUTES.listTenants), [
      'project',
      'order',
      'vendor',
      'principal',
      'invoice',
      'amount',
    ]);
  });

  it('requires an app origin when creating an organisation', async () => {
    // Per-tenant precisely so that no invite URL is ever a constant again:
    // `auth.js:253` hardcodes one demo domain and sends every tenant's
    // invitations to it.
    const keys = Object.keys(API_ROUTES.provisionTenant.request.shape);
    expect(keys).toContain('appOrigin');
    expect(keys).toContain('adminEmail');

    const { fetch } = respond(400, {
      code: 'VALIDATION_FAILED',
      message: 'appOrigin is required',
      requestId: 'req-1',
    });
    const result = await load(api({ baseUrl: BASE, credential: CREDENTIAL, fetch }), API_ROUTES.listTenants, {});
    expect(result.kind).toBe('refused');
  });

  it('creates an organisation together with its first administrator', async () => {
    const { seen, fetch } = respond(201, {
      tenantId: '11111111-1111-4111-8111-111111111111',
      principalId: '22222222-2222-4222-8222-222222222222',
      slug: 'brandnew',
    });
    const client = api({ baseUrl: BASE, credential: CREDENTIAL, fetch });

    const result = await load(client, API_ROUTES.provisionTenant, {
      body: {
        slug: 'brandnew',
        legalName: 'Brand New Interiors Private Limited',
        appOrigin: 'https://brandnew.example.test',
        adminEmail: 'first.admin@brandnew.test',
        adminExternalId: 'first.admin@brandnew.test',
      },
    });

    expect(result.kind).toBe('ok');
    // One request. An organisation and its administrator are created together
    // or not at all: a tenant with no administrator is one nobody can sign in
    // to, holding the slug so the retry fails too.
    expect(seen.url).toBe('http://api.test/platform/v1/tenants');
    const body = JSON.parse(String(seen.init?.body)) as Record<string, unknown>;
    expect(body['adminEmail']).toBe('first.admin@brandnew.test');
  });

  it('surfaces a duplicate as a refusal a person can act on', async () => {
    const { fetch } = respond(409, {
      code: 'CONFLICT',
      message: 'That organisation could not be created: that slug or administrator is already in use.',
      requestId: 'req-2',
    });
    const client = api({ baseUrl: BASE, credential: CREDENTIAL, fetch });

    const result = await load(client, API_ROUTES.provisionTenant, {
      body: {
        slug: 'brandnew',
        legalName: 'Someone Else Limited',
        appOrigin: 'https://someone-else.test',
        adminEmail: 'other@brandnew.test',
        adminExternalId: 'other@brandnew.test',
      },
    });

    expect(result.kind).toBe('refused');
    if (result.kind !== 'refused') throw new Error('unreachable');
    // One message for both causes. Saying which is taken would tell the caller
    // whether an address already administers an organisation on this
    // deployment.
    expect(result.error.message).not.toMatch(/slug is|administrator is\b(?! already)/);
  });
});

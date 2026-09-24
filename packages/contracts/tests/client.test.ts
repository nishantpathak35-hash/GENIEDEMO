import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  API_ROUTES,
  ApiContractError,
  ApiTransportError,
  createClient,
  defineRoute,
} from '../src/index.js';

/**
 * The client is the only legal path from an app to a service.
 *
 * `eslint.config.mjs` forbids `apps -> services` and points at "the generated
 * client in packages/contracts". Until this existed the rule was enforceable
 * and unsatisfiable at once, which is why every one of the 88 legacy views was
 * blocked on it.
 */

function respondWith(body: unknown, init: ResponseInit = {}): typeof globalThis.fetch {
  return vi.fn(async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
      ...init,
    }),
  ) as unknown as typeof globalThis.fetch;
}

const VALID_DRAFT = {
  number: 'PO-2026-0001',
  vendorId: '11111111-1111-4111-8111-111111111111',
  lines: [
    {
      description: 'Vitrified tile 600x600',
      hsnSac: '6907',
      quantityWhole: 120,
      quantityMillionths: 375_000,
      unitRate: '84500',
      gstRate: 1800,
    },
  ],
};

describe('a successful call', () => {
  it('parses the response rather than casting it', async () => {
    const fetch = respondWith({ taxable: '10140000', gst: '1825200', gross: '11965200' });
    const client = createClient({ baseUrl: 'http://api.test', fetch });

    const result = await client.call(API_ROUTES.pricePurchaseOrder, { body: VALID_DRAFT });

    expect(result.ok).toBe(true);
    if (!result.ok) expect.unreachable();
    expect(result.data.gross).toBe('11965200');
  });

  it('sends the declared method, path and JSON body', async () => {
    const fetch = respondWith({ taxable: '1', gst: '0', gross: '1' });
    const client = createClient({ baseUrl: 'http://api.test/', fetch });

    await client.call(API_ROUTES.pricePurchaseOrder, { body: VALID_DRAFT });

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    // The trailing slash on baseUrl must not produce a double slash.
    expect(url).toBe('http://api.test/api/v1/purchase-orders/price');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ number: 'PO-2026-0001' });
  });

  it('returns money as a wire string, never a number', async () => {
    // ADR-0012. A client that helpfully turned this into a `number` would be
    // reintroducing the float defect at the last possible moment, in the layer
    // furthest from the tests that guard it.
    const fetch = respondWith({ taxable: '10140000', gst: '1825200', gross: '11965200' });
    const client = createClient({ baseUrl: 'http://api.test', fetch });

    const result = await client.call(API_ROUTES.pricePurchaseOrder, { body: VALID_DRAFT });
    if (!result.ok) expect.unreachable();
    expect(typeof result.data.gross).toBe('string');
  });
});

describe('a refusal is an outcome, not an exception', () => {
  it('surfaces TENANT_NOT_RESOLVED distinguishably', async () => {
    // The failure every tenant-scoped route answers with today, because no
    // identity provider is configured (M1/D6). A screen must be able to tell
    // this apart from an empty list: under RLS a query with no tenant set
    // returns zero rows rather than erroring, so a 200 with `[]` would be
    // indistinguishable from "the isolation layer refused".
    const fetch = respondWith(
      {
        code: 'TENANT_NOT_RESOLVED',
        message: 'No organisation could be determined for this request.',
        requestId: 'req_abc',
      },
      { status: 403 },
    );
    const client = createClient({ baseUrl: 'http://api.test', fetch });

    const result = await client.call(API_ROUTES.listPurchaseOrders, {});

    expect(result.ok).toBe(false);
    if (result.ok) expect.unreachable();
    expect(result.status).toBe(403);
    expect(result.error.code).toBe('TENANT_NOT_RESOLVED');
    expect(result.error.requestId).toBe('req_abc');
  });

  it('does not try to parse an error body against the success schema', async () => {
    // The trap this test exists for: parsing a 403 envelope against the success
    // shape turns the clearest failure in the system into an opaque Zod error.
    const fetch = respondWith(
      { code: 'FORBIDDEN', message: 'Not permitted.', requestId: 'r1' },
      { status: 403 },
    );
    const client = createClient({ baseUrl: 'http://api.test', fetch });

    await expect(client.call(API_ROUTES.listPurchaseOrders, {})).resolves.toMatchObject({
      ok: false,
    });
  });

  it('synthesises an envelope when the failure did not come from our handler', async () => {
    // A gateway timeout or a proxy error page never reaches the error handler,
    // so it carries no envelope. The client must still return something a
    // screen can branch on.
    const fetch = respondWith('<html>504 Gateway Timeout</html>', {
      status: 504,
      headers: { 'content-type': 'text/html' },
    });
    const client = createClient({ baseUrl: 'http://api.test', fetch });

    const result = await client.call(API_ROUTES.listPurchaseOrders, {});
    expect(result.ok).toBe(false);
    if (result.ok) expect.unreachable();
    expect(result.error.code).toBe('INTERNAL');
    expect(result.status).toBe(504);
  });
});

describe('a broken contract throws rather than returning', () => {
  it('throws ApiContractError when the response does not match', async () => {
    // Not a business outcome: it is version skew or a bug. Returned as an
    // ordinary error it would be rendered as "something went wrong" and never
    // investigated.
    const fetch = respondWith({ taxable: 10_140_000, gst: '1825200', gross: '11965200' });
    const client = createClient({ baseUrl: 'http://api.test', fetch });

    await expect(
      client.call(API_ROUTES.pricePurchaseOrder, { body: VALID_DRAFT }),
    ).rejects.toBeInstanceOf(ApiContractError);
  });

  it('throws on a non-JSON success body', async () => {
    const fetch = respondWith('not json at all', { status: 200 });
    const client = createClient({ baseUrl: 'http://api.test', fetch });

    await expect(client.call(API_ROUTES.listPurchaseOrders, {})).rejects.toBeInstanceOf(
      ApiContractError,
    );
  });

  it('wraps a transport failure', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof globalThis.fetch;
    const client = createClient({ baseUrl: 'http://api.test', fetch });

    await expect(client.call(API_ROUTES.listPurchaseOrders, {})).rejects.toBeInstanceOf(
      ApiTransportError,
    );
  });
});

describe('the request is validated before it is sent', () => {
  it('rejects a malformed body at the call site', async () => {
    const fetch = respondWith({ taxable: '0', gst: '0', gross: '0' });
    const client = createClient({ baseUrl: 'http://api.test', fetch });

    await expect(
      client.call(API_ROUTES.pricePurchaseOrder, {
        // A rupee amount with a decimal point — exactly what `paiseWire`
        // exists to refuse, and the shape a hand-written fetch would send.
        body: { ...VALID_DRAFT, lines: [{ ...VALID_DRAFT.lines[0]!, unitRate: '845.00' }] },
      }),
    ).rejects.toThrow();

    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});

describe('path parameters', () => {
  const parameterised = defineRoute({
    method: 'GET',
    path: '/api/v1/projects/:projectId/boq',
    request: undefined,
    response: z.object({ ok: z.boolean() }),
    summary: 'test route',
  });

  it('substitutes and encodes', async () => {
    const fetch = respondWith({ ok: true });
    const client = createClient({ baseUrl: 'http://api.test', fetch });

    await client.call(parameterised, { params: { projectId: 'a/b' } });

    const [url] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    // Encoded, so an id containing a slash cannot reach a different route.
    expect(url).toBe('http://api.test/api/v1/projects/a%2Fb/boq');
  });
});

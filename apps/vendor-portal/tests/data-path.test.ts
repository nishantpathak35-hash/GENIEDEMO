import { describe, expect, it } from 'vitest';
import { API_ROUTES } from '@cog/contracts';
import { load } from '@cog/design-system';
import { api } from '../lib/api';

/**
 * **The vendor portal's data path, driven through the real client.**
 *
 * The control that keeps one vendor out of another's orders lives on the
 * server, and `services/host/tests/isolation/tenant-routes.test.ts` proves it
 * against real Postgres. What THIS proves is the other half, which no
 * server-side test can: that the app's data path cannot ask for another
 * vendor's data even if it wanted to.
 *
 * Three properties, and each is a property of this app rather than of the API:
 *
 *   1. Every request carries the caller's credential and **no vendor id** —
 *      not in the path, not in a query string, not in a body. The legacy passes
 *      `vendorId` from the client (`VendorPortalView.js:22-27`), which makes
 *      the scoping an input rather than a control.
 *   2. Every route this app reaches is under `/api/v1/portal/vendor/`. A URL
 *      outside that prefix is a route a vendor credential is refused on, and an
 *      app that called one would show a refusal it could not explain.
 *   3. A refusal renders as a refusal. Under row-level security a query with no
 *      tenant context returns zero rows, so "you are not entitled" and "you
 *      have no orders" arrive looking identical unless something keeps them
 *      apart.
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
const CREDENTIAL = 'orders@steelworks.test';

function recorder(status: number, body: unknown) {
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

const ONE_ORDER = {
  items: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      number: 'PO-0001',
      state: 'draft',
      taxable: '100000',
      gst: '18000',
      gross: '118000',
      createdAt: '2026-09-01 10:00:00+00',
      acceptance: null,
    },
  ],
  nextCursor: null,
  prevCursor: null,
  count: 1,
};

describe('the vendor portal never names a vendor', () => {
  it('asks for "my orders" and identifies itself only by its credential', async () => {
    const { seen, fetch } = recorder(200, ONE_ORDER);
    const client = api({ baseUrl: BASE, credential: CREDENTIAL, fetch });

    await load(client, API_ROUTES.vendorPortalOrders, {});

    // No vendor id anywhere in the request. The server reads the entitlement
    // from `identity.principal_links`, inside the transaction, under RLS.
    expect(seen.url).toBe('http://api.test/api/v1/portal/vendor/orders');
    expect(seen.url?.includes('vendorId')).toBe(false);
    expect(seen.url?.includes('vendor_id')).toBe(false);
    expect(seen.init?.body).toBeUndefined();

    const headers = seen.init?.headers as Record<string, string>;
    expect(headers['authorization']).toBe(`Bearer ${CREDENTIAL}`);
  });

  it('submits a bill without naming a vendor', async () => {
    const { seen, fetch } = recorder(201, {
      id: '22222222-2222-4222-8222-222222222222',
      billNumber: 'RA-01',
    });
    const client = api({ baseUrl: BASE, credential: CREDENTIAL, fetch });

    await load(client, API_ROUTES.vendorPortalSubmitBill, {
      body: {
        purchaseOrderId: '11111111-1111-4111-8111-111111111111',
        billNumber: 'RA-01',
        amountClaimed: '117999',
      },
    });

    const body = JSON.parse(String(seen.init?.body)) as Record<string, unknown>;
    expect(Object.keys(body)).not.toContain('vendorId');
    // And the claim is sent exactly as it was parsed — a digit string of paise,
    // never a number that a JSON round trip could round.
    expect(body['amountClaimed']).toBe('117999');
  });

  it('reaches nothing outside the vendor portal prefix', () => {
    // Every route this app is allowed to know about. A vendor credential is
    // refused on the internal tree entirely, so a URL outside this list would
    // render a refusal the screen could not explain.
    const reachable = [
      API_ROUTES.vendorPortalOrders,
      API_ROUTES.vendorPortalOrderLines,
      API_ROUTES.vendorPortalAcceptOrder,
      API_ROUTES.vendorPortalBills,
      API_ROUTES.vendorPortalSubmitBill,
      API_ROUTES.vendorPortalPayments,
    ];
    for (const route of reachable) {
      expect(route.path.startsWith('/api/v1/portal/vendor/')).toBe(true);
    }
  });
});

describe('the vendor portal shows no figure nobody has verified', () => {
  it('has no TDS, retention or payable field in the shape it parses', () => {
    // Asserted against the CONTRACT, so a field added to the response would
    // have to be added here first — and this test is where somebody would have
    // to justify it. CA-01..CA-08 are unanswered.
    forbid(shapeOf(API_ROUTES.vendorPortalOrders), [
      'tds',
      'retention',
      'retained',
      'netpayable',
      'outstanding',
    ]);
  });

  it('distinguishes a refusal from an empty list', async () => {
    const { fetch } = recorder(403, {
      code: 'FORBIDDEN',
      message: 'This portal is for vendor accounts.',
      requestId: 'req-9',
    });
    const client = api({ baseUrl: BASE, credential: CREDENTIAL, fetch });

    const result = await load(client, API_ROUTES.vendorPortalOrders, {});

    expect(result.kind).toBe('refused');
    if (result.kind !== 'refused') throw new Error('unreachable');
    expect(result.error.code).toBe('FORBIDDEN');
  });

  it('reports an unreachable API as unreachable, not as "no orders"', async () => {
    const client = api({
      baseUrl: BASE,
      credential: CREDENTIAL,
      fetch: () => Promise.reject(new Error('ECONNREFUSED')),
    });
    expect((await load(client, API_ROUTES.vendorPortalOrders, {})).kind).toBe('unreachable');
  });
});

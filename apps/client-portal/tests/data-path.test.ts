import { describe, expect, it } from 'vitest';
import { API_ROUTES } from '@cog/contracts';
import { load } from '@cog/design-system';
import { api } from '../lib/api';

/**
 * **The client portal's data path.**
 *
 * TOPOLOGY states what a client may never reach: *vendor pricing, internal
 * margin, any other project*. The server enforces it and
 * `services/host/tests/isolation/tenant-routes.test.ts` proves that against
 * real Postgres, on the response's field names.
 *
 * This asserts the property one level up, where it is cheaper to keep true:
 * **the shapes this app parses have no field for any of them.** A response
 * carrying a margin would fail the contract before a screen could render it,
 * and adding one would have to be done here first — which is where somebody
 * would have to justify it.
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
const CREDENTIAL = 'facilities@aarambh-client.test';

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

describe('a client sees its project and nothing about the cost of it', () => {
  it('has no cost, margin, committed or vendor field in any shape it parses', () => {
    for (const route of [API_ROUTES.clientPortalProjects, API_ROUTES.clientPortalVariations]) {
      forbid(shapeOf(route), ['margin', 'committed', 'vendor', 'costrate', 'cost_rate']);
    }
  });

  it('has no billing percentage, and no billed or received figure', () => {
    // The legacy computes a billing percentage as billed over contract value
    // and caps it with `Math.min(100, …)`, so an over-billed project reads as
    // exactly complete. What has been billed is on the billing read, invoice by
    // invoice; a completion figure derived from money is still a money figure,
    // and it does not belong on the project.
    forbid(shapeOf(API_ROUTES.clientPortalProjects), [
      'percent',
      'progresspct',
      'billed',
      'received',
      'paid',
    ]);
  });

  it('carries the credential and names no project when listing', async () => {
    const { seen, fetch } = respond(200, { items: [] });
    const client = api({ baseUrl: BASE, credential: CREDENTIAL, fetch });

    await load(client, API_ROUTES.clientPortalProjects, {});

    expect(seen.url).toBe('http://api.test/api/v1/portal/client/projects');
    const headers = seen.init?.headers as Record<string, string>;
    expect(headers['authorization']).toBe(`Bearer ${CREDENTIAL}`);
  });

  it('reaches nothing outside the client portal prefix', () => {
    for (const route of [
      API_ROUTES.clientPortalProjects,
      API_ROUTES.clientPortalVariations,
      API_ROUTES.clientPortalDecideVariation,
      API_ROUTES.clientPortalBilling,
    ]) {
      expect(route.path.startsWith('/api/v1/portal/client/')).toBe(true);
    }
  });

  it('renders a refusal as a refusal, not as "no projects"', async () => {
    const { fetch } = respond(404, {
      code: 'NOT_FOUND',
      message: 'Not here.',
      requestId: 'req-3',
    });
    const client = api({ baseUrl: BASE, credential: CREDENTIAL, fetch });

    const result = await load(client, API_ROUTES.clientPortalVariations, {
      params: { projectId: '99999999-9999-4999-8999-999999999999' },
    });

    // A project this account is not linked to answers 404, not 403: asking
    // about somebody else's project reveals nothing about whether it exists.
    expect(result.kind).toBe('refused');
    if (result.kind !== 'refused') throw new Error('unreachable');
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('requires a signatory and a version to decide a variation', () => {
    // A decided variation with no signatory is not evidence that anyone decided
    // it, and without the version a second decision would silently apply — the
    // legacy adds the variation's cost to the contract value twice (CO-04).
    const keys = Object.keys(API_ROUTES.clientPortalDecideVariation.request.shape);
    expect(keys).toContain('signedBy');
    expect(keys).toContain('expectedVersion');
  });
});

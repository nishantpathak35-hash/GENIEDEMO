import { describe, expect, it } from 'vitest';
import { API_ROUTES } from '@cog/contracts';
import { formatIndianRupees } from '@cog/money';
import { api } from '../lib/api';
import { load } from '@cog/design-system';

/**
 * The app's data path, driven through the REAL client against a fake transport.
 *
 * `pnpm verify` typechecks and builds this app; it does not make an HTTP call
 * from it. Without these, "green" would mean "compiles" — and the two things
 * most worth knowing about an app's data path are whether it forwards the
 * caller's credential and whether it can tell a refusal from an empty list.
 * Neither is a compile-time property.
 */

const BASE = 'http://api.test';

function respondWith(
  status: number,
  body: unknown,
  seen: { url?: string; init?: RequestInit } = {},
): (url: string, init?: RequestInit) => Promise<Response> {
  return (url, init) => {
    seen.url = url;
    if (init !== undefined) seen.init = init;
    return Promise.resolve(
      new Response(body === undefined ? '' : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
}

describe('the credential', () => {
  it('is forwarded as a bearer token', async () => {
    const seen: { init?: RequestInit } = {};
    const client = api({
      baseUrl: BASE,
      credential: 'someone@example.test',
      fetch: respondWith(200, { items: [], nextCursor: null, prevCursor: null, count: 0 }, seen),
    });

    await client.call(API_ROUTES.listProjects, {});

    const headers = seen.init?.headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer someone@example.test');
  });

  it('is absent when there is none, rather than sent as an empty bearer', async () => {
    const seen: { init?: RequestInit } = {};
    const client = api({
      baseUrl: BASE,
      credential: null,
      fetch: respondWith(200, { items: [], nextCursor: null, prevCursor: null, count: 0 }, seen),
    });

    await client.call(API_ROUTES.listProjects, {});

    const headers = seen.init?.headers as Record<string, string>;
    // `Bearer ` with nothing after it is a credential the server has to parse
    // and reject. Sending no header at all is the honest shape of "anonymous".
    expect(headers['authorization']).toBeUndefined();
  });
});

describe('load', () => {
  it('reports a refusal as a refusal, not as an empty list', async () => {
    // The distinction this whole type exists for: under RLS a query with no
    // tenant context returns zero rows, so "refused" and "nothing here" arrive
    // looking identical unless something keeps them apart.
    const client = api({
      baseUrl: BASE,
      fetch: respondWith(403, {
        code: 'TENANT_NOT_RESOLVED',
        message: 'No organisation could be determined for this request.',
        requestId: 'req-1',
      }),
    });

    const result = await load(client, API_ROUTES.listProjects, {});

    expect(result.kind).toBe('refused');
    if (result.kind !== 'refused') throw new Error('unreachable');
    expect(result.error.code).toBe('TENANT_NOT_RESOLVED');
    expect(result.error.requestId).toBe('req-1');
  });

  it('reports an unreachable API as unreachable, not as a refusal', async () => {
    const client = api({
      baseUrl: BASE,
      fetch: () => Promise.reject(new Error('ECONNREFUSED')),
    });

    expect((await load(client, API_ROUTES.listProjects, {})).kind).toBe('unreachable');
  });

  it('rethrows a response that does not match its contract', async () => {
    // A version skew between a deployed app and a deployed API is a bug, not a
    // business outcome. Swallowing it into "something went wrong" is how it
    // never gets investigated.
    const client = api({ baseUrl: BASE, fetch: respondWith(200, { items: 'not an array' }) });

    await expect(load(client, API_ROUTES.listProjects, {})).rejects.toThrow(
      /did not match the contract/,
    );
  });

  it('substitutes a path parameter rather than sending a literal colon', async () => {
    const seen: { url?: string } = {};
    const client = api({
      baseUrl: BASE,
      fetch: respondWith(
        200,
        {
          id: '11111111-1111-4111-8111-111111111111',
          code: 'P-1',
          name: 'Tower fit-out',
          clientName: 'A client',
          state: 'in_progress',
          startedOn: '2026-09-01',
          handedOverOn: null,
          moves: ['handed_over', 'closed'],
          originalValue: null,
        },
        seen,
      ),
    });

    await load(client, API_ROUTES.getProject, {
      params: { projectId: '11111111-1111-4111-8111-111111111111' },
    });

    expect(seen.url).toBe(
      'http://api.test/api/v1/projects/11111111-1111-4111-8111-111111111111',
    );
  });
});

describe('money on the way through', () => {
  it('arrives as the wire string and is displayed by the formatter, untouched', async () => {
    const client = api({
      baseUrl: BASE,
      fetch: respondWith(200, {
        items: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            code: 'P-1',
            name: 'Tower fit-out',
            state: 'in_progress',
            contractValue: '123456789',
            committed: '98765432',
            orderCount: 3,
            health: 'at-risk',
            orderedPct: 80,
            billed: '0',
            billedPct: 0,
            meter: { trackPct: 100, fillPct: 80, thresholdPct: 85, overPct: 0 },
            margin: { status: 'no-boq', costBudget: null, committedApproved: '0', atRisk: null, unpricedLines: 0, coveredPct: null },
          },
        ],
        threshold: { atRiskPct: 85, provisional: true },
        unattached: { committed: '0', orderCount: 0 },
        orderedSoFar: '98765432',
        count: 1,
      }),
    });

    const result = await load(client, API_ROUTES.projectRollup, {});
    if (result.kind !== 'ok') throw new Error('expected an answer');

    const project = result.data.items[0];
    if (project === undefined) throw new Error('expected a project');

    // The value is still a string of paise. Nothing between the wire and the
    // screen turned it into a number.
    expect(project.contractValue).toBe('123456789');
    // Asserted on the digits, not the symbol: `eslint.config.mjs` bans the
    // rupee sign under `apps/` outright, and the symbol is already covered by
    // 44 cases in `packages/money`. What this file is for is proving the wire
    // string reached the formatter unchanged.
    expect(formatIndianRupees(project.contractValue ?? '0')).toContain('12,34,567.89');
    // And the band came from the server, not from comparing the two figures.
    expect(project.health).toBe('at-risk');
  });
});

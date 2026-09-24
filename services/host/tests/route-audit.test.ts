import { describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { RouteAuditError, TENANTLESS_ROUTES, auditRoutes, routesOf } from '@cog/service-kit';
import { TENANT_SCOPED_PREFIXES, createApp } from '../src/app.js';

/**
 * **Every route is tenant-scoped, or explicitly allowlisted with a reason.**
 *
 * This is the test the isolation review asked for and the one the rest of the
 * suite cannot substitute. Tests that call a handler with a hand-made context
 * prove the *wrapper* works; this proves the *wiring* — and the wiring is what
 * somebody gets wrong next year by mounting a route one line above the
 * middleware, where nothing would notice.
 */

const pool = {
  query: vi.fn(async () => ({ rows: [] })),
  connect: vi.fn(),
} as unknown as pg.Pool;

const resolver = { resolve: vi.fn(async () => null) };
const verify = vi.fn(async () => null);

/**
 * EVERY OPTIONAL MOUNT IS REGISTERED HERE, and that is the fix to a hole in
 * this test rather than a detail of it.
 *
 * `platform` and `invite` are optional in `AppOptions`, so an app built without
 * them registers none of their routes — and this audit examines what the router
 * registered. It was therefore structurally blind to `/platform/v1`: the one
 * check whose whole purpose is that a route cannot be added unnoticed could not
 * see the prefix where an unnoticed route matters most, because that prefix is
 * the back office and its principal belongs to no tenant.
 *
 * `connector` is deliberately still absent: it needs a queue and an
 * authenticator rather than a function, so mounting it here would mean building
 * two fakes to prove a path already covered by `TENANTLESS_ROUTES`. Named so the
 * omission is a decision rather than the same oversight one layer along.
 */
function app() {
  return createApp({
    pool,
    resolver,
    platform: { verify },
    invite: { verify },
  });
}

describe('route coverage', () => {
  it('SEES THE OPTIONAL PREFIXES, which it used to be blind to', () => {
    // Without this the audit above passes by examining a smaller app than the
    // one that runs — the same shape as the D8 drift checks that named their
    // schemas literally and silently stopped covering new ones (defect 6).
    const paths = routesOf(app()).map((r) => r.path);
    expect(paths.some((p) => p.startsWith('/platform/v1'))).toBe(true);
    expect(paths.some((p) => p.startsWith('/invite/v1'))).toBe(true);
  });

  it('every registered route is tenant-scoped or allowlisted', () => {
    const routes = routesOf(app());
    expect(routes.length).toBeGreaterThan(0);
    expect(() => auditRoutes(routes, [...TENANT_SCOPED_PREFIXES])).not.toThrow();
  });

  it('sees routes mounted through a nested sub-app', () => {
    // The audit reads what the router registered. If `app.route()` did not
    // surface a sub-app's paths in the form `routesOf` reads, the audit above
    // would pass by examining nothing — the same shape as the D8 drift checks
    // that named their schemas literally and silently stopped covering new
    // ones (docs/TOOLING-DEFECTS.md defect 6).
    //
    // So this names paths that only exist because `projectRoutes()` was
    // mounted, and fails if mounting a service's routes stops registering them.
    const paths = routesOf(app()).map((r) => `${r.method} ${r.path}`);
    expect(paths).toContain('GET /api/v1/projects');
    expect(paths).toContain('POST /api/v1/projects');
    expect(paths).toContain('GET /api/v1/projects/:projectId');
    expect(paths).toContain('GET /api/v1/projects/:projectId/boq');
    expect(paths).toContain('POST /api/v1/projects/:projectId/boq');
    expect(paths).toContain('PATCH /api/v1/projects/:projectId/boq/:itemId');
    expect(paths).toContain('DELETE /api/v1/projects/:projectId/boq/:itemId');
    expect(paths).toContain('GET /api/v1/purchase-orders');
    expect(paths).toContain('GET /api/v1/workflow/chains');
    expect(paths).toContain('GET /api/v1/workflow/history/:entityType/:entityId');
    expect(paths).toContain('GET /api/v1/workflow/audit');
    expect(paths).toContain('GET /api/v1/siteops/daily-reports');
    expect(paths).toContain('POST /api/v1/siteops/daily-reports');
    expect(paths).toContain('GET /api/v1/siteops/weekly/:projectId');
    expect(paths).toContain('GET /api/v1/identity/principals');
    expect(paths).toContain('POST /api/v1/identity/invites');
    expect(paths).toContain('GET /api/v1/tenancy/settings');
    expect(paths).toContain('POST /api/v1/purchase-orders/:id/approve');
    expect(paths).toContain('POST /api/v1/purchase-orders');
    expect(paths).toContain('PATCH /api/v1/purchase-orders/:id');
    expect(paths).toContain('PATCH /api/v1/purchase-orders/:id/number');
    expect(paths).toContain('GET /api/v1/purchase-orders/next-number');
    expect(paths).toContain('POST /api/v1/purchase-orders/from-boq');
    expect(paths).toContain('GET /api/v1/purchase-orders/vendors');
    expect(paths).toContain('POST /api/v1/purchase-orders/vendors');
    expect(paths).toContain('GET /api/v1/purchase-orders/vendors/:vendorId');
    expect(paths).toContain('PATCH /api/v1/purchase-orders/vendors/:vendorId');
    expect(paths).toContain('DELETE /api/v1/purchase-orders/vendors/:vendorId');
    expect(paths).toContain('GET /api/v1/purchase-orders/stock');
    expect(paths).toContain('POST /api/v1/purchase-orders/stock/items');
    expect(paths).toContain('POST /api/v1/purchase-orders/stock/receipts');
    expect(paths).toContain('POST /api/v1/purchase-orders/stock/issues');
    expect(paths).toContain('POST /api/v1/purchase-orders/stock/transfers');
    expect(paths).toContain('GET /api/v1/workflow/tasks');
    expect(paths).toContain('POST /api/v1/workflow/tasks');
    expect(paths).toContain('PATCH /api/v1/workflow/tasks/:taskId');
    expect(paths).toContain('DELETE /api/v1/workflow/tasks/:taskId');
    expect(paths).toContain('GET /api/v1/projects/leads');
    expect(paths).toContain('POST /api/v1/projects/leads');
    expect(paths).toContain('PATCH /api/v1/projects/leads/:leadId');
    expect(paths).toContain('POST /api/v1/projects/leads/:leadId/convert');
    expect(paths).toContain('DELETE /api/v1/projects/leads/:leadId');
    expect(paths).toContain('GET /api/v1/rollups/projects');
    expect(paths).toContain('GET /api/v1/projects/:projectId/change-orders');
    expect(paths).toContain('POST /api/v1/projects/:projectId/change-orders');
    expect(paths).toContain('POST /api/v1/projects/:projectId/change-orders/:changeOrderId/decide');
    expect(paths).toContain('POST /api/v1/siteops/imprest');
    expect(paths).toContain('POST /api/v1/siteops/imprest/:imprestId/sanction');
    expect(paths).toContain('POST /api/v1/siteops/measurements');
    expect(paths).toContain('GET /api/v1/purchase-orders/retention');
    expect(paths).toContain('POST /api/v1/purchase-orders/retention');
    expect(paths).toContain('POST /api/v1/siteops/recces');
    expect(paths).toContain('GET /api/v1/siteops/recces/:projectId');
    expect(paths).toContain('GET /api/v1/workflow/documents');
    expect(paths).toContain('POST /api/v1/workflow/documents');
    expect(paths).toContain('GET /api/v1/projects/:projectId/drawings');
    expect(paths).toContain('POST /api/v1/projects/:projectId/drawings');
    expect(paths).toContain('GET /api/v1/projects/estimation/items');
    expect(paths).toContain('POST /api/v1/projects/estimation/items');
    expect(paths).toContain('GET /api/v1/projects/:projectId/takeoff');
    expect(paths).toContain('PUT /api/v1/projects/:projectId/takeoff/:sheetId/items');
    expect(paths).toContain('GET /api/v1/projects/estimation/items');
    expect(paths).toContain('POST /api/v1/projects/estimation/items');
    expect(paths).toContain('GET /api/v1/projects/:projectId/takeoff');
    expect(paths).toContain('PUT /api/v1/projects/:projectId/takeoff/:sheetId/items');
  });

  it('names every tenantless route with a reason', () => {
    // An allowlist without reasons becomes a place to put anything awkward.
    for (const entry of TENANTLESS_ROUTES) {
      expect(entry.why.length, entry.path).toBeGreaterThan(30);
    }
  });

  it('FAILS when a route is mounted outside the middleware', () => {
    // The check must be seen to fail, or it is decoration. This is the mistake
    // it exists to catch, simulated.
    expect(() =>
      auditRoutes(
        [
          { method: 'GET', path: '/healthz' },
          { method: 'GET', path: '/api/v1/purchase-orders' },
          { method: 'GET', path: '/reports/everything' }, // mounted at the root
        ],
        [...TENANT_SCOPED_PREFIXES],
      ),
    ).toThrow(RouteAuditError);
  });

  it('the failure names the offending route', () => {
    try {
      auditRoutes([{ method: 'POST', path: '/danger' }], [...TENANT_SCOPED_PREFIXES]);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('POST /danger');
      expect((e as Error).message).toContain('TENANTLESS_ROUTES');
    }
  });
});

describe('the tenantless routes really are tenantless', () => {
  it('liveness answers without a principal', async () => {
    const res = await app().request('/healthz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // It must not have touched the database.
    expect((pool.connect as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});

describe('an unresolved principal is refused, and distinguishably', () => {
  it('answers TENANT_NOT_RESOLVED rather than an empty list', async () => {
    // The distinction is load-bearing: under RLS a query with no tenant set
    // returns ZERO ROWS rather than erroring, so "the isolation layer refused"
    // is otherwise indistinguishable from "the table is empty". A 200 with
    // `[]` here would be the worst possible answer.
    const res = await app().request('/api/v1/purchase-orders');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('TENANT_NOT_RESOLVED');
  });

  it('never reaches the handler', async () => {
    await app().request('/api/v1/purchase-orders');
    expect((pool.connect as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it('returns a requestId the logs are keyed by', async () => {
    const res = await app().request('/api/v1/purchase-orders', {
      headers: { 'x-request-id': 'req_abc' },
    });
    expect(((await res.json()) as { requestId: string }).requestId).toBe('req_abc');
  });
});

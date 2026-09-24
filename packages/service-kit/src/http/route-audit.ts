/**
 * Route coverage — proving every route is inside the tenant middleware.
 *
 * A test that calls a handler with a hand-made context proves the *wrapper*
 * works. It proves nothing about the *wiring*, and the wiring is what somebody
 * gets wrong next year by mounting a route one line above the middleware.
 *
 * So this enumerates what the router actually has and checks it against an
 * explicit allowlist. A new route is either tenant-scoped or it is named here
 * with a reason — there is no third option, and adding one requires editing a
 * file whose whole purpose is to be read.
 */

export interface RegisteredRoute {
  readonly method: string;
  readonly path: string;
}

/**
 * Routes that legitimately touch no tenant table.
 *
 * Three kinds, and each is a deliberate decision rather than an oversight:
 */
export const TENANTLESS_ROUTES: ReadonlyArray<{ path: string; why: string }> = [
  {
    path: '/healthz',
    why: 'Liveness. Must not touch a dependency: a liveness probe that checks Postgres restarts every container when Postgres blips.',
  },
  {
    path: '/readyz',
    why: 'Readiness. Checks dependencies and the runtime role, but reads no tenant data.',
  },
  {
    path: '/connector/v1/*',
    why: 'Resolves its tenant from a per-tenant bearer key rather than a user principal, and does so inside its own handler. A third case, not an exemption.',
  },
  {
    path: '/platform/v1/*',
    why: 'The back office, outside every tenant. A platform principal belongs to no organisation, so no tenant context is set — and because none is set, every tenant-scoped policy denies this connection by construction. It authenticates against tenancy.platform_principals through a SECURITY DEFINER function, and is mounted only when PLATFORM_CONSOLE=on.',
  },
  {
    path: '/invite/v1/*',
    why: 'Redeeming an invitation is the one request made by somebody who has no principal yet — the middleware would answer TENANT_NOT_RESOLVED to the very person it is meant to create. The tenant is resolved from the token hash by identity.tenant_for_invite, and every write then runs inside withTenant on a system context. It is NOT under /api/v1 precisely so this allowlist has to name it rather than TENANT_SCOPED_PREFIXES counting it as protected.',
  },
];

export class RouteAuditError extends Error {
  override readonly name = 'RouteAuditError';
}

function isAllowlisted(path: string): boolean {
  return TENANTLESS_ROUTES.some((r) =>
    r.path.endsWith('/*') ? path.startsWith(r.path.slice(0, -2)) : r.path === path,
  );
}

/**
 * Every route must be tenant-scoped or explicitly allowlisted.
 *
 * `tenantScopedPrefixes` are the mount points that sit behind the middleware.
 * Passing them in rather than inferring them keeps the check honest: inferring
 * would mean reading the same wiring the check exists to verify.
 */
export function auditRoutes(
  routes: readonly RegisteredRoute[],
  tenantScopedPrefixes: readonly string[],
): void {
  const unprotected = routes.filter(
    (r) =>
      !isAllowlisted(r.path) && !tenantScopedPrefixes.some((p) => r.path.startsWith(p)),
  );

  if (unprotected.length > 0) {
    throw new RouteAuditError(
      `these routes are neither tenant-scoped nor allowlisted:\n` +
        unprotected.map((r) => `  ${r.method} ${r.path}`).join('\n') +
        `\n\nAdd the route under a tenant-scoped prefix, or name it in ` +
        `TENANTLESS_ROUTES with the reason it touches no tenant data.`,
    );
  }
}

/** Extract the routes a Hono app has registered. */
export function routesOf(app: { routes: ReadonlyArray<{ method: string; path: string }> }): RegisteredRoute[] {
  const seen = new Set<string>();
  const out: RegisteredRoute[] = [];
  for (const r of app.routes) {
    // Hono lists middleware as `ALL` entries on the mount path; those are not
    // endpoints and counting them would make the audit pass for the wrong
    // reason.
    if (r.method === 'ALL') continue;
    const key = `${r.method} ${r.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ method: r.method, path: r.path });
  }
  return out;
}

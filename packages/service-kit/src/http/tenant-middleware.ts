import { randomUUID } from 'node:crypto';
import type { Context, MiddlewareHandler, Next } from 'hono';
import type { Pool } from 'pg';
import { HTTP_STATUS, type Principal, type TenantContext, type TenantId } from '@cog/contracts';
import { withTenant, type TenantTx } from '../tenant-context.js';
import { forRequest, type Logger } from '../logger.js';

/**
 * The tenant middleware — the seam between HTTP and the database.
 *
 * Every request that touches a tenant table passes through here, and this is
 * the only place a `TenantContext` is constructed. ADR-0006's rule is that the
 * context is resolved once, from the authenticated principal, and carried
 * explicitly — never read from a global, an ambient store, or a request body.
 *
 * The legacy is the argument for that rule: its RPC route dispatches
 * `api[method](...args, session)` with arguments padded but never truncated, so
 * a client-supplied argument binds to `session`, and seven modules accept a
 * payload object as the session when none was resolved. A context a caller can
 * *pass in* is not a context.
 */

/** Resolves a credential to a principal. Implemented by `services/identity`. */
export interface PrincipalResolver {
  resolve(
    request: Request,
  ): Promise<{ tenantId: TenantId; principal: Principal } | null>;
}

export interface TenantMiddlewareOptions {
  readonly pool: Pool;
  readonly resolver: PrincipalResolver;
  readonly logger: Logger;
}

/** Keys the middleware sets on the Hono context. */
export const CTX_TENANT = 'cog.tenantContext' as const;
export const CTX_TX = 'cog.tx' as const;
export const CTX_LOGGER = 'cog.logger' as const;

/**
 * Read the tenant context inside a handler.
 *
 * Throws rather than returning undefined: a handler that reached this point
 * without a context is mounted outside the middleware, and returning
 * `undefined` would let it run an unscoped query. Failing loudly is the only
 * safe behaviour, and the route-coverage test exists so it never happens in
 * production.
 */
export function tenantOf(c: Context): TenantContext {
  const ctx = c.get(CTX_TENANT) as TenantContext | undefined;
  if (ctx === undefined) {
    throw new Error('handler is mounted outside the tenant middleware');
  }
  return ctx;
}

export function txOf(c: Context): TenantTx {
  const tx = c.get(CTX_TX) as TenantTx | undefined;
  if (tx === undefined) {
    throw new Error('handler is mounted outside the tenant middleware');
  }
  return tx;
}

/**
 * Resolve the principal, open one transaction, run the handler inside it.
 *
 * **One `withTenant` per request, not per route group.** The transaction is a
 * unit of work: holding one open across an external call pins a pooled server
 * connection for its duration and turns a slow dependency into pool
 * exhaustion. This is the place that rule either holds or quietly stops
 * holding.
 */
export function tenantMiddleware(options: TenantMiddlewareOptions): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const requestId = c.req.header('x-request-id') ?? randomUUID();
    c.header('x-request-id', requestId);

    const resolved = await options.resolver.resolve(c.req.raw);

    if (resolved === null) {
      // TENANT_NOT_RESOLVED, not AUTH_INVALID.
      //
      // They are different failures and the distinction is load-bearing: under
      // RLS a query with no tenant set returns ZERO ROWS rather than erroring,
      // so "the isolation layer refused" is otherwise indistinguishable from
      // "the table is empty". This code is what makes that loud.
      return c.json(
        {
          code: 'TENANT_NOT_RESOLVED' as const,
          message: 'No organisation could be determined for this request.',
          requestId,
        },
        HTTP_STATUS.TENANT_NOT_RESOLVED as 403,
      );
    }

    const ctx: TenantContext = {
      tenantId: resolved.tenantId,
      principal: resolved.principal,
      requestId,
    };

    c.set(CTX_TENANT, ctx);
    c.set(CTX_LOGGER, forRequest(options.logger, ctx));

    await withTenant(options.pool, ctx, async (tx) => {
      c.set(CTX_TX, tx);
      await next();

      // A handler that failed must not commit. Hono records the status rather
      // than throwing, so without this a 500 from a handler would leave its
      // partial writes committed — which is exactly how the legacy leaves a
      // deleted PO's audit row behind when the delete fails.
      const status = c.res.status;
      if (status >= 500) {
        throw new HandlerFailed(status);
      }
    }).catch((error: unknown) => {
      if (error instanceof HandlerFailed) return; // response already set
      throw error;
    });
  };
}

class HandlerFailed extends Error {
  constructor(readonly status: number) {
    super(`handler responded ${status}; rolling back`);
  }
}

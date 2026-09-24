// Server entry point.
//
// The app itself is built in `app.ts`, separately from being started, so a test
// can drive the real router with the real middleware rather than a
// hand-assembled imitation of it. `tests/route-audit.test.ts` is that test.

import { serve } from '@hono/node-server';
import pg from 'pg';
import { createLogger } from '@cog/service-kit';
import { environmentFrom } from '@cog/finance';
import { createApp } from './app.js';
import { createPrincipalResolver } from './principal-resolver.js';
import { chooseVerify } from './verify.js';

const logger = createLogger();

// The pool lives here and is never exported. `withTenant` in service-kit is the
// only thing that acquires a connection from it: pg-pool does not roll back on
// release, so a handler that connects directly can return a client to the pool
// still inside another tenant's transaction.
const pool = new pg.Pool({
  connectionString: process.env['DATABASE_URL'] ?? '',
  // Small on purpose. PgBouncer is the multiplexer; a large per-process pool
  // just moves the queue and exhausts Postgres's connection limit.
  max: Number(process.env['PG_POOL_MAX'] ?? 10),
});

const verify = chooseVerify(process.env);

const app = createApp({
  pool,
  logger,
  // Statutory outputs from provisional rows are produced, as drafts, only when
  // STATUTORY_OUTPUTS=draft. Unset, or anything else, refuses them.
  ...(environmentFrom(process.env['STATUTORY_OUTPUTS']).draftStatutoryOutputs
    ? { statutoryOutputs: 'draft' as const }
    : {}),
  // The back office is mounted only when `PLATFORM_CONSOLE=on`. Absent means
  // `/platform/v1` does not exist on this deployment at all — an unmounted
  // route cannot be misconfigured, and provisioning is the one operation whose
  // flaw yields somebody else's data rather than merely one's own.
  ...(process.env['PLATFORM_CONSOLE'] === 'on' ? { platform: { verify } } : {}),
  // The SAME verifier the resolver uses. Redemption still requires a verified
  // provider identity — the token says which invitation, the credential says
  // who is redeeming it, and that identity is what the new principal
  // authenticates as from then on.
  invite: { verify },
  resolver: createPrincipalResolver({
    pool,
    // Chosen by AUTH_PROVIDER, with no fallback. Unset means every
    // tenant-scoped route answers TENANT_NOT_RESOLVED, which is the correct
    // behaviour for "authentication is not configured" — a permissive default
    // is how a silent fallback becomes an auth bypass.
    verify,
  }),
});

const port = Number(process.env['PORT'] ?? 4000);

serve({ fetch: app.fetch, port }, (info) => {
  logger.info({ port: info.port }, 'api listening');
});

export { app };

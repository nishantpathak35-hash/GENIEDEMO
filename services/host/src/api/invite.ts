import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import type pg from 'pg';
import { z } from 'zod';
import { HTTP_STATUS, type TenantId } from '@cog/contracts';
import { systemContext, withTenant } from '@cog/service-kit';
import { AcceptConflict, acceptInvite, hashInviteToken } from '@cog/identity';

/**
 * Redeeming an invitation — the one route a person reaches before they exist.
 *
 * **Mounted OUTSIDE `/api/v1`, and that is the point.** `tenantMiddleware`
 * resolves a principal from the credential and answers `TENANT_NOT_RESOLVED`
 * when it cannot; the whole premise here is that it cannot, because the
 * redeemer has no principal until this route creates one. Mounting it under
 * `/api/v1` would not merely fail at runtime — `TENANT_SCOPED_PREFIXES` is
 * `['/api/v1']`, so the route audit would count it as protected by prefix while
 * it sat there unprotected. A tenantless route belongs on a tenantless prefix,
 * named in `TENANTLESS_ROUTES` with its reason, next to `/connector/v1`.
 *
 * The tenant comes from the TOKEN, through `identity.tenant_for_invite` — the
 * same SECURITY DEFINER bootstrap shape as `resolve_principal`, returning two
 * ids and nothing else. Everything after that runs inside `withTenant`, so the
 * writes that decide what gets minted happen under RLS.
 *
 * No rate limit, unlike `/platform/v1`'s provisioning. That limit protects a
 * guessable surface; this one takes a 256-bit token compared by hash, and a
 * limit here would let anyone with a spare afternoon lock out the real invitee.
 */

const acceptInput = z.object({
  // 32 random bytes, base64url. Length is checked so an obviously malformed
  // token is refused before it costs a database round trip.
  token: z.string().min(32).max(256),
});

export interface InviteRoutesOptions {
  readonly pool: pg.Pool;
  /** The same verifier the principal resolver uses. Returns a provider id. */
  readonly verify: (request: Request) => Promise<{ externalId: string } | null>;
}

export function inviteRoutes(options: InviteRoutesOptions): Hono {
  const app = new Hono();

  /**
   * ONE REFUSAL FOR EVERY REASON.
   *
   * Unknown token, expired token, already redeemed, address taken, identity
   * already in use — all of it answers this. Distinguishing them tells whoever
   * is holding a token which of their guesses was once real, or confirms that a
   * particular colleague already has a login here. `checkInvite` makes the same
   * point about its own rejection type; this is where it is honoured.
   */
  const refuse = (c: Context, requestId: string): Response =>
    c.json(
      {
        code: 'VALIDATION_FAILED' as const,
        message: 'That invitation cannot be used. Ask for a new one.',
        requestId,
      },
      HTTP_STATUS.VALIDATION_FAILED as 400,
    );

  app.post('/accept', async (c) => {
    const requestId = c.req.header('x-request-id') ?? randomUUID();
    c.header('x-request-id', requestId);

    // The credential still has to verify. The token says which invitation; the
    // credential says who is redeeming it, and that identity is what the
    // principal will authenticate as forever afterwards. Accepting a token with
    // no verified identity would mint a login nobody can sign in to at best,
    // and one anybody can claim at worst.
    const verified = await options.verify(c.req.raw);
    if (verified === null) return refuse(c, requestId);

    const parsed = acceptInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return refuse(c, requestId);

    // The bootstrap read: no tenant is set, and this is one of the two queries
    // in the system entitled to run that way.
    const { rows } = await options.pool.query<{ tenant_id: string; invite_id: string }>(
      'SELECT * FROM identity.tenant_for_invite($1)',
      [hashInviteToken(parsed.data.token)],
    );
    const found = rows[0];
    if (found === undefined) return refuse(c, requestId);

    try {
      const result = await withTenant(
        options.pool,
        systemContext(found.tenant_id as TenantId, requestId),
        (tx) =>
          acceptInvite(tx, {
            tenantId: found.tenant_id,
            inviteId: found.invite_id,
            externalId: verified.externalId,
            now: new Date(),
          }),
      );

      if (!result.ok) return refuse(c, requestId);

      // What they became, and nothing more. No principal id: it is an internal
      // identifier, and the client learns everything it needs at first sign-in
      // from `/me/entitlements`.
      return c.json({ kind: result.principal.kind, email: result.principal.email }, 201);
    } catch (error) {
      // Thrown from inside the transaction precisely so the claim is rolled
      // back — see `AcceptConflict`. By the time it is caught here the
      // invitation is unaccepted again and still usable by the right person.
      if (error instanceof AcceptConflict) return refuse(c, requestId);
      throw error;
    }
  });

  return app;
}

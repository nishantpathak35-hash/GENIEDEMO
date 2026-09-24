import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { TenantId } from '@cog/contracts';
import type { TenantConfigReader } from '../domain/ports.js';

/**
 * Invitations.
 *
 * Three defects from the legacy implementation are fixed here, and each one is
 * a separate commit's worth of reasoning rather than a rewrite by taste:
 *
 *   1. `auth.js:253` hardcodes one demo domain as the invite URL. The origin is
 *      per-tenant configuration and is read through a port.
 *   2. The legacy `invites` table stores the token in the clear, in a column
 *      alongside `users.invite_token`. A database dump is therefore a set of
 *      working invitations. Only a hash is stored here.
 *   3. There is no expiry anywhere. A token minted once works forever.
 */

export class InviteError extends Error {
  override readonly name = 'InviteError';
}

/** Fourteen days. Long enough for a real onboarding, short enough to matter. */
export const DEFAULT_INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export interface MintedInvite {
  /** Emailed once. Never stored, never logged. */
  readonly token: string;
  readonly tokenHash: Buffer;
  readonly expiresAt: Date;
  readonly url: string;
}

export function hashInviteToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

export interface MintInviteInput {
  readonly tenantId: TenantId;
  readonly now: Date;
  readonly ttlMs?: number;
}

/**
 * Mint an invitation for a tenant.
 *
 * Fails loudly when the tenant has no configured origin. The alternative —
 * falling back to a default — is how a single hardcoded domain survives a
 * multi-tenant migration: it works in development, and in production it sends
 * every customer's staff to somebody else's login page.
 */
export async function mintInvite(
  config: TenantConfigReader,
  input: MintInviteInput,
): Promise<MintedInvite> {
  const origin = await config.appOrigin(input.tenantId);
  if (origin === null || origin.trim() === '') {
    throw new InviteError(
      'tenant has no app_origin configured; refusing to fall back to a default domain',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new InviteError('tenant app_origin is not a valid URL');
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
    // An invite link is a bearer credential in a query string. Over http it is
    // readable by anything on the path.
    throw new InviteError('tenant app_origin must be https (localhost excepted for development)');
  }

  const token = randomBytes(32).toString('base64url');
  const url = new URL(parsed.toString());
  url.searchParams.set('invite', token);

  return {
    token,
    tokenHash: hashInviteToken(token),
    expiresAt: new Date(input.now.getTime() + (input.ttlMs ?? DEFAULT_INVITE_TTL_MS)),
    url: url.toString(),
  };
}

export interface StoredInvite {
  readonly tokenHash: Buffer;
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;
}

/** Why an invite was refused. Never surfaced to the caller in this detail. */
export type InviteRejection = 'malformed' | 'unknown' | 'expired' | 'already-accepted';

/**
 * Check a presented token.
 *
 * The caller must map every rejection to one indistinguishable response.
 * Telling the difference between "unknown" and "expired" tells an attacker
 * which of their guesses was once a real token.
 */
export function checkInvite(
  presented: string,
  stored: StoredInvite | null,
  now: Date,
): { ok: true } | { ok: false; reason: InviteRejection } {
  if (typeof presented !== 'string' || presented.length < 32) {
    return { ok: false, reason: 'malformed' };
  }
  if (stored === null) return { ok: false, reason: 'unknown' };

  const candidate = hashInviteToken(presented);
  if (candidate.length !== stored.tokenHash.length) return { ok: false, reason: 'unknown' };
  if (!timingSafeEqual(candidate, stored.tokenHash)) return { ok: false, reason: 'unknown' };

  if (stored.acceptedAt !== null) return { ok: false, reason: 'already-accepted' };
  if (stored.expiresAt <= now) return { ok: false, reason: 'expired' };
  return { ok: true };
}

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Connector keys — the credential the on-prem Tally agent presents.
 *
 * The key identifies the tenant; the connector never sends a tenant id. That
 * makes this the second tenant-resolution path alongside the identity provider,
 * and it is why `principalKind` has a `connector` member.
 *
 * **SHA-256, not bcrypt.** These are 256 bits of `randomBytes`, not passwords.
 * A password hash is slow on purpose because passwords are low-entropy and
 * guessable; a 256-bit random secret is not, and making verification slow only
 * makes every connector poll slow. Deliberate, not an oversight.
 */

/** `cog_ck_<prefix>_<secret>` — greppable in a leak, identifiable without a DB hit. */
const KEY_RE = /^cog_ck_([A-Za-z0-9]{8})_([A-Za-z0-9_-]{43})$/;

export interface MintedKey {
  /** Shown to the customer exactly once, at mint time. Never stored. */
  readonly plaintext: string;
  /** Stored. Safe to log, safe to show in admin. */
  readonly prefix: string;
  /** Stored. */
  readonly hash: Buffer;
}

export function mintConnectorKey(): MintedKey {
  const prefix = randomBytes(6).toString('base64url').replace(/[_-]/g, '0').slice(0, 8);
  const secret = randomBytes(32).toString('base64url'); // 43 chars, no padding
  const plaintext = `cog_ck_${prefix}_${secret}`;
  return { plaintext, prefix, hash: hashConnectorKey(plaintext) };
}

export function hashConnectorKey(plaintext: string): Buffer {
  return createHash('sha256').update(plaintext, 'utf8').digest();
}

/** The prefix, for looking the row up before any secret is compared. */
export function prefixOf(plaintext: string): string | null {
  const m = KEY_RE.exec(plaintext);
  return m === null ? null : (m[1] as string);
}

/**
 * Constant-time verification.
 *
 * `Buffer.equals` and `===` both short-circuit on the first differing byte, so
 * the time they take leaks how much of the secret was correct. `timingSafeEqual`
 * does not — but it throws on a length mismatch, which would itself be a signal,
 * so length is checked first and both branches return the same way.
 */
export function verifyConnectorKey(plaintext: string, storedHash: Buffer): boolean {
  if (prefixOf(plaintext) === null) return false;
  const candidate = hashConnectorKey(plaintext);
  if (candidate.length !== storedHash.length) return false;
  return timingSafeEqual(candidate, storedHash);
}

/**
 * Whether a stored key row may still authenticate.
 *
 * Rotation deliberately allows MULTIPLE ACTIVE KEYS per tenant at once. A
 * rotation with no overlap window is an outage on every customer machine until
 * someone physically visits the site: admin mints key 2, the customer installs
 * it at their own pace, and only then is key 1 revoked or left to lapse.
 */
export function isKeyUsable(
  row: { readonly revokedAt: Date | null; readonly expiresAt: Date | null },
  now: Date,
): boolean {
  if (row.revokedAt !== null && row.revokedAt <= now) return false;
  if (row.expiresAt !== null && row.expiresAt <= now) return false;
  return true;
}

import { describe, expect, it } from 'vitest';
import {
  hashConnectorKey,
  isKeyUsable,
  mintConnectorKey,
  prefixOf,
  verifyConnectorKey,
} from '../src/index.js';

describe('mintConnectorKey', () => {
  it('produces a greppable, prefixed key', () => {
    const k = mintConnectorKey();
    expect(k.plaintext).toMatch(/^cog_ck_[A-Za-z0-9]{8}_[A-Za-z0-9_-]{43}$/);
    expect(prefixOf(k.plaintext)).toBe(k.prefix);
  });

  it('never repeats', () => {
    const seen = new Set(Array.from({ length: 200 }, () => mintConnectorKey().plaintext));
    expect(seen.size).toBe(200);
  });

  it('stores a hash, not the secret', () => {
    const k = mintConnectorKey();
    expect(k.hash.length).toBe(32);
    expect(k.hash.toString('hex')).not.toContain(k.plaintext);
    expect(k.hash).toEqual(hashConnectorKey(k.plaintext));
  });
});

describe('verifyConnectorKey', () => {
  it('accepts the real key', () => {
    const k = mintConnectorKey();
    expect(verifyConnectorKey(k.plaintext, k.hash)).toBe(true);
  });

  it('rejects a different key', () => {
    const a = mintConnectorKey();
    const b = mintConnectorKey();
    expect(verifyConnectorKey(b.plaintext, a.hash)).toBe(false);
  });

  it('rejects a malformed key without touching the hash', () => {
    const k = mintConnectorKey();
    for (const bad of ['', 'nope', 'cog_ck_short_x', k.plaintext.slice(0, -1)]) {
      expect(verifyConnectorKey(bad, k.hash)).toBe(false);
    }
  });

  it('does not throw on a length mismatch', () => {
    // timingSafeEqual throws on differing lengths, and a throw is itself a
    // signal. Both branches must return the same way.
    const k = mintConnectorKey();
    expect(() => verifyConnectorKey(k.plaintext, Buffer.alloc(16))).not.toThrow();
    expect(verifyConnectorKey(k.plaintext, Buffer.alloc(16))).toBe(false);
  });
});

describe('isKeyUsable — rotation needs an overlap window', () => {
  const now = new Date('2026-09-03T12:00:00Z');
  const past = new Date('2026-09-01T00:00:00Z');
  const future = new Date('2026-12-01T00:00:00Z');

  it('accepts a live key', () => {
    expect(isKeyUsable({ revokedAt: null, expiresAt: null }, now)).toBe(true);
    expect(isKeyUsable({ revokedAt: null, expiresAt: future }, now)).toBe(true);
  });

  it('rejects revoked and expired keys', () => {
    expect(isKeyUsable({ revokedAt: past, expiresAt: null }, now)).toBe(false);
    expect(isKeyUsable({ revokedAt: null, expiresAt: past }, now)).toBe(false);
  });

  it('lets two keys be live at once, so rotation is not an outage', () => {
    // Without an overlap window, rotating means every customer machine stops
    // working until someone visits the site to paste the new key.
    const old = { revokedAt: null, expiresAt: future };
    const fresh = { revokedAt: null, expiresAt: null };
    expect(isKeyUsable(old, now) && isKeyUsable(fresh, now)).toBe(true);
  });
});

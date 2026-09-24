import { describe, expect, it } from 'vitest';
import type { TenantId } from '@cog/contracts';
import {
  DEFAULT_INVITE_TTL_MS,
  InviteError,
  LocalIdentityProvider,
  WorkOsIdentityProvider,
  assertNotProduction,
  checkInvite,
  hashInviteToken,
  mintInvite,
  type TenantConfigReader,
} from '../src/index.js';

const TENANT = '11111111-1111-4111-8111-111111111111' as TenantId;
const NOW = new Date('2026-09-04T00:00:00Z');

const reader = (origin: string | null): TenantConfigReader => ({
  appOrigin: async () => origin,
});

describe('mintInvite — the auth.js:253 fix', () => {
  it('builds the URL from the tenant\'s own origin', async () => {
    const invite = await mintInvite(reader('https://acme.example'), { tenantId: TENANT, now: NOW });
    expect(invite.url).toMatch(/^https:\/\/acme\.example\/\?invite=/);
    expect(invite.url).not.toContain('lwa-iota.vercel.app');
  });

  it('gives two tenants different origins from the same code path', async () => {
    const a = await mintInvite(reader('https://acme.example'), { tenantId: TENANT, now: NOW });
    const b = await mintInvite(reader('https://beta.example'), { tenantId: TENANT, now: NOW });
    expect(new URL(a.url).origin).toBe('https://acme.example');
    expect(new URL(b.url).origin).toBe('https://beta.example');
  });

  it('refuses to fall back to a default domain', async () => {
    // Falling back is exactly how one hardcoded domain survives a multi-tenant
    // migration: it works in development and sends every customer's staff to
    // somebody else's login page in production.
    await expect(mintInvite(reader(null), { tenantId: TENANT, now: NOW })).rejects.toBeInstanceOf(
      InviteError,
    );
    await expect(mintInvite(reader('   '), { tenantId: TENANT, now: NOW })).rejects.toBeInstanceOf(
      InviteError,
    );
  });

  it('refuses a non-https origin, except localhost', async () => {
    // The token rides in a query string; over http it is readable in transit
    // and lands in every proxy log on the way.
    await expect(
      mintInvite(reader('http://acme.example'), { tenantId: TENANT, now: NOW }),
    ).rejects.toBeInstanceOf(InviteError);
    await expect(
      mintInvite(reader('http://localhost:3000'), { tenantId: TENANT, now: NOW }),
    ).resolves.toBeDefined();
  });

  it('refuses a malformed origin', async () => {
    await expect(
      mintInvite(reader('not a url'), { tenantId: TENANT, now: NOW }),
    ).rejects.toBeInstanceOf(InviteError);
  });
});

describe('the token is a bearer credential', () => {
  it('stores only a hash', async () => {
    // The legacy invites table stores the token in the clear, so a database
    // dump is a set of working invitations.
    const invite = await mintInvite(reader('https://acme.example'), { tenantId: TENANT, now: NOW });
    expect(invite.tokenHash).toEqual(hashInviteToken(invite.token));
    expect(invite.tokenHash.toString('hex')).not.toContain(invite.token);
  });

  it('never repeats', async () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      tokens.add((await mintInvite(reader('https://a.example'), { tenantId: TENANT, now: NOW })).token);
    }
    expect(tokens.size).toBe(100);
  });

  it('expires — the legacy table has no expiry at all', async () => {
    const invite = await mintInvite(reader('https://a.example'), { tenantId: TENANT, now: NOW });
    expect(invite.expiresAt.getTime()).toBe(NOW.getTime() + DEFAULT_INVITE_TTL_MS);
  });
});

describe('checkInvite', () => {
  const good = { tokenHash: hashInviteToken('x'.repeat(43)), expiresAt: new Date('2026-10-01'), acceptedAt: null };

  it('accepts a live invite', () => {
    expect(checkInvite('x'.repeat(43), good, NOW)).toEqual({ ok: true });
  });

  it('rejects an expired one', () => {
    const expired = { ...good, expiresAt: new Date('2026-08-01') };
    expect(checkInvite('x'.repeat(43), expired, NOW)).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a reused one', () => {
    const used = { ...good, acceptedAt: new Date('2026-08-20') };
    expect(checkInvite('x'.repeat(43), used, NOW)).toEqual({ ok: false, reason: 'already-accepted' });
  });

  it('rejects an unknown or malformed token', () => {
    expect(checkInvite('y'.repeat(43), good, NOW)).toEqual({ ok: false, reason: 'unknown' });
    expect(checkInvite('short', good, NOW)).toEqual({ ok: false, reason: 'malformed' });
    expect(checkInvite('x'.repeat(43), null, NOW)).toEqual({ ok: false, reason: 'unknown' });
  });
});

describe('identity providers', () => {
  it('the local adapter resolves a seeded user', async () => {
    const p = new LocalIdentityProvider([
      { externalId: 'u_1', email: 'ops@aarambh.example', externalOrgId: 'org_1' },
    ]);
    expect(await p.verify('ops@aarambh.example')).toMatchObject({ externalId: 'u_1' });
    expect(await p.verify('nobody@example.com')).toBeNull();
  });

  it('the local adapter refuses to exist in production', () => {
    // The legacy app silently falls back to a local SQLite file and generates
    // an in-memory JWT secret when configuration is missing. Both make a
    // misconfigured production look healthy.
    expect(() => assertNotProduction('production')).toThrow();
    expect(() => assertNotProduction('development')).not.toThrow();
  });

  it('the workos adapter refuses a user with no organisation', async () => {
    // No organisation means no tenant. Inventing a mapping here would attach a
    // real person to arbitrary data.
    const p = new WorkOsIdentityProvider({
      authenticateWithCode: async () => ({
        user: { id: 'u_1', email: 'a@b.c' },
        organizationId: null,
      }),
    });
    expect(await p.verify('code')).toBeNull();
  });

  it('the workos adapter maps an organisation to a tenant key', async () => {
    const p = new WorkOsIdentityProvider({
      authenticateWithCode: async () => ({
        user: { id: 'u_9', email: 'a@b.c' },
        organizationId: 'org_42',
      }),
    });
    expect(await p.verify('code')).toEqual({
      externalId: 'u_9',
      email: 'a@b.c',
      externalOrgId: 'org_42',
    });
  });
});

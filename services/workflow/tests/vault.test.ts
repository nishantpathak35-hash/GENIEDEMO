import { describe, expect, it } from 'vitest';
import type { TenantId } from '@cog/contracts';
import {
  MAX_DOCUMENT_BYTES,
  MAX_SIGNED_URL_TTL_SECONDS,
  VaultError,
  assertAcceptable,
  assertMaySign,
  objectKey,
  type DocumentRef,
} from '../src/domain/vault.js';

const A = '11111111-1111-4111-8111-111111111111' as TenantId;
const B = '22222222-2222-4222-8222-222222222222' as TenantId;

const ref = (over: Partial<DocumentRef> = {}): DocumentRef => ({
  tenantId: A,
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  entityType: 'contract',
  entityId: 'c_1',
  fileName: 'signed-contract.pdf',
  contentType: 'application/pdf',
  sizeBytes: 1024,
  checksum: 'a'.repeat(64),
  ...over,
});

describe('object keys are tenant-prefixed', () => {
  it('puts every document under its tenant', () => {
    // Object storage is outside Postgres, so the policies protecting everything
    // else do not apply. The prefix is the boundary a bucket policy can be
    // written against.
    expect(objectKey(ref())).toBe(`tenants/${A}/documents/${ref().id}`);
  });

  it('refuses an id that could escape the prefix', () => {
    // The object-storage equivalent of a missing WHERE tenant_id.
    for (const bad of ['../other', 'a/b', 'a\\b', '..', '.', '', '  ']) {
      expect(() => objectKey({ tenantId: A, id: bad }), bad).toThrow(VaultError);
    }
  });

  it('refuses a tenant id that could escape it too', () => {
    expect(() => objectKey({ tenantId: '../x' as TenantId, id: 'ok' })).toThrow(VaultError);
  });
});

describe('signed URLs are bearer credentials', () => {
  it('signs for the caller own tenant', () => {
    expect(() =>
      assertMaySign({ ref: ref(), ttlSeconds: 300, callerTenantId: A }),
    ).not.toThrow();
  });

  it('refuses to sign another tenant object', () => {
    // Once issued, a signed URL works for anyone holding it, for as long as it
    // lives, with no further authorisation. It cannot be undone by a later
    // policy.
    expect(() =>
      assertMaySign({ ref: ref({ tenantId: B }), ttlSeconds: 300, callerTenantId: A }),
    ).toThrow(/another tenant/);
  });

  it('caps the lifetime', () => {
    // A long-lived signed URL is an unauthenticated permanent link that has
    // been emailed, logged and cached by the time anyone notices.
    expect(() =>
      assertMaySign({ ref: ref(), ttlSeconds: MAX_SIGNED_URL_TTL_SECONDS + 1, callerTenantId: A }),
    ).toThrow(/may not live longer/);
    expect(MAX_SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(15 * 60);
  });

  it('refuses a zero, negative or fractional lifetime', () => {
    for (const ttl of [0, -1, 1.5]) {
      expect(() => assertMaySign({ ref: ref(), ttlSeconds: ttl, callerTenantId: A })).toThrow();
    }
  });
});

describe('what may enter the vault', () => {
  it('accepts the document types this product actually issues', () => {
    expect(() => assertAcceptable('application/pdf', 1024, 'po.pdf')).not.toThrow();
    expect(() => assertAcceptable('image/jpeg', 1024, 'site.jpg')).not.toThrow();
  });

  it('rejects anything not on the allowlist', () => {
    // The legacy accepts anything and serves it from a public directory, so an
    // uploaded .html becomes a page hosted on the product's own origin —
    // stored XSS against every user of that origin.
    for (const bad of ['text/html', 'image/svg+xml', 'application/javascript', 'application/x-msdownload']) {
      expect(() => assertAcceptable(bad, 1024, 'x'), bad).toThrow(/not accepted/);
    }
  });

  it('bounds the size', () => {
    expect(() => assertAcceptable('application/pdf', MAX_DOCUMENT_BYTES + 1, 'x.pdf')).toThrow();
    expect(() => assertAcceptable('application/pdf', 0, 'x.pdf')).toThrow();
  });

  it('refuses a file name containing a line break', () => {
    // The name is echoed in a Content-Disposition header, so a newline lets a
    // caller inject one.
    expect(() => assertAcceptable('application/pdf', 10, 'a\r\nX-Injected: 1')).toThrow(
      /line break/,
    );
  });
});

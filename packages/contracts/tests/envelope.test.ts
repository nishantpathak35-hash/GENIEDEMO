import { describe, expect, it } from 'vitest';
import {
  HTTP_STATUS,
  apiError,
  errorCode,
  pageOf,
  pageRequest,
  principalKind,
  tenantContextWire,
} from '../src/index.js';
import { z } from 'zod';

describe('errorCode / HTTP_STATUS', () => {
  it('maps every code to exactly one status', () => {
    // If a code is added without a status, one service invents its own and the
    // same failure means 403 in one place and 404 in another.
    for (const code of errorCode.options) {
      expect(HTTP_STATUS[code], `no HTTP status mapped for ${code}`).toBeTypeOf('number');
    }
    expect(Object.keys(HTTP_STATUS).sort()).toEqual([...errorCode.options].sort());
  });

  it('answers a stale connector with 426, never a silent failure', () => {
    expect(HTTP_STATUS.CONNECTOR_UPGRADE_REQUIRED).toBe(426);
  });

  it('separates "no tenant resolved" from "unauthenticated"', () => {
    // Under RLS a missing app.tenant_id yields zero rows rather than an error,
    // so this code is what makes the isolation layer refusing distinguishable
    // from an empty table.
    expect(errorCode.options).toContain('TENANT_NOT_RESOLVED');
    expect(HTTP_STATUS.TENANT_NOT_RESOLVED).not.toBe(HTTP_STATUS.AUTH_INVALID);
  });

  it('the status map is frozen', () => {
    expect(Object.isFrozen(HTTP_STATUS)).toBe(true);
  });
});

describe('apiError', () => {
  it('accepts a minimal envelope', () => {
    const parsed = apiError.parse({
      code: 'NOT_FOUND',
      message: 'Purchase order not found.',
      requestId: 'req_01HZ',
    });
    expect(parsed.code).toBe('NOT_FOUND');
  });

  it('carries field paths for validation failures', () => {
    const parsed = apiError.parse({
      code: 'VALIDATION_FAILED',
      message: 'Some fields are invalid.',
      requestId: 'req_01HZ',
      details: [{ path: 'items.0.rate', reason: 'must be a whole number of paise' }],
    });
    expect(parsed.details?.[0]?.path).toBe('items.0.rate');
  });

  it('has no field for the offending value', () => {
    // Echoing a rejected value back is how a vendor's bank account number ends
    // up in a browser console.
    const detail = apiError.shape.details;
    const rendered = JSON.stringify(z.toJSONSchema(detail as never, { io: 'input' }));
    expect(rendered).not.toContain('value');
  });

  it('rejects an unknown code rather than passing it through', () => {
    expect(
      apiError.safeParse({ code: 'KABOOM', message: 'x', requestId: 'r' }).success,
    ).toBe(false);
  });
});

describe('principalKind', () => {
  it('includes the connector as a first-class machine principal', () => {
    // The connector key is the second tenant-resolution path alongside the IdP.
    expect(principalKind.options).toContain('connector');
    expect(principalKind.options).toContain('system');
  });
});

describe('tenantContextWire', () => {
  it('validates the logging shape', () => {
    const ok = tenantContextWire.safeParse({
      tenantId: 't_1',
      principal: { kind: 'staff', id: 'u_1', roles: ['finance'] },
      requestId: 'req_1',
    });
    expect(ok.success).toBe(true);
  });

  it('rejects an unknown principal kind', () => {
    const bad = tenantContextWire.safeParse({
      tenantId: 't_1',
      principal: { kind: 'superuser', id: 'u_1', roles: [] },
      requestId: 'req_1',
    });
    expect(bad.success).toBe(false);
  });

  it('exports no parser that builds a TenantContext from input', async () => {
    // A context is derived from an authenticated principal, never parsed from
    // input. Offering a parser would make the unsafe path the convenient one —
    // which is precisely how the legacy session hole works.
    const mod = await import('../src/index.js');
    expect(Object.keys(mod)).not.toContain('parseTenantContext');
    expect(Object.keys(mod)).not.toContain('toTenantContext');
  });
});

describe('pageRequest', () => {
  it('defaults the limit', () => {
    expect(pageRequest.parse({}).limit).toBe(50);
  });

  it('caps the limit, because an uncapped one is a client-controlled DoS', () => {
    expect(pageRequest.safeParse({ limit: 5000 }).success).toBe(false);
    expect(pageRequest.safeParse({ limit: 200 }).success).toBe(true);
  });

  it('rejects a zero or negative limit', () => {
    expect(pageRequest.safeParse({ limit: 0 }).success).toBe(false);
    expect(pageRequest.safeParse({ limit: -1 }).success).toBe(false);
  });
});

describe('pageOf', () => {
  it('requires both cursors and the count to be present, even when the cursors are null', () => {
    const page = pageOf(z.string());
    expect(page.safeParse({ items: ['a'], nextCursor: null, prevCursor: null, count: 1 }).success).toBe(true);
    // Absent is not the same as "no more pages" — the client cannot tell an
    // exhausted list from a server that forgot to answer.
    expect(page.safeParse({ items: ['a'], prevCursor: null, count: 1 }).success).toBe(false);
    expect(page.safeParse({ items: ['a'], nextCursor: null, count: 1 }).success).toBe(false);
    // And a window without its count cannot say "of N": the pager would print a
    // range with nothing to measure it against.
    expect(page.safeParse({ items: ['a'], nextCursor: null, prevCursor: null }).success).toBe(false);
  });
});

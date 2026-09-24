import { describe, expect, it, vi } from 'vitest';
import type { TenantId, Voucher } from '@cog/contracts';
import { compareSemver, connectorRoutes, type ConnectorDeps } from '../src/api/connector.js';

const TENANT = '11111111-1111-4111-8111-111111111111' as TenantId;
const KEY = 'cog_ck_abcd1234_' + 'x'.repeat(43);

const VOUCHER: Voucher = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  kind: 'purchase',
  xml: '<ENVELOPE/>',
  createdAt: '2026-09-04T10:00:00+05:30',
  attempts: 0,
};

function build(over: Partial<ConnectorDeps> = {}) {
  const queue = {
    claim: vi.fn(async () => [VOUCHER]),
    report: vi.fn(async () => undefined),
    touchInstance: vi.fn(async () => undefined),
  };
  const auth = {
    authenticate: vi.fn(async (k: string) =>
      k === KEY ? { tenantId: TENANT, keyId: 'k_1' } : null,
    ),
  };
  const app = connectorRoutes({
    auth,
    queue,
    minConnectorVersion: '1.2.0',
    leaseSeconds: 300,
    now: () => new Date('2026-09-04T12:00:00Z'),
    ...over,
  });
  return { app, queue, auth };
}

const headers = (over: Record<string, string> = {}) => ({
  authorization: `Bearer ${KEY}`,
  'X-Connector-Version': '1.2.0',
  'X-Connector-Instance': '9f8e7d6c-5b4a-4231-8100-0f1e2d3c4b5a',
  ...over,
});

describe('authentication', () => {
  it('the key identifies the tenant — the connector never sends a tenant id', async () => {
    const { app, queue } = build();
    await app.request('/vouchers', { headers: headers() });
    expect(queue.claim).toHaveBeenCalledWith(TENANT, 50, expect.any(String), 300);
  });

  it('rejects a missing or unknown key with 401', async () => {
    const { app } = build();
    expect((await app.request('/vouchers')).status).toBe(401);
    expect(
      (await app.request('/vouchers', { headers: { authorization: 'Bearer nope' } })).status,
    ).toBe(401);
  });

  it('never reveals whether a key is unknown, revoked or expired', async () => {
    const { app } = build();
    const body = (await (
      await app.request('/vouchers', { headers: { authorization: 'Bearer nope' } })
    ).json()) as { message: string };
    expect(body.message).toBe('That connector key is not valid.');
  });
});

describe('GET /vouchers', () => {
  it('returns vouchers, serverTime and leaseSeconds', async () => {
    const { app } = build();
    const body = (await (
      await app.request('/vouchers', { headers: headers() })
    ).json()) as { vouchers: unknown[]; leaseSeconds: number; serverTime: string };
    expect(body.vouchers).toHaveLength(1);
    expect(body.leaseSeconds).toBe(300);
    expect(body.serverTime).toBe('2026-09-04T12:00:00.000Z');
  });

  it('clamps limit rather than trusting it', async () => {
    // An unbounded limit is a denial-of-service parameter the caller controls,
    // and under RLS every row costs a policy evaluation.
    const { app, queue } = build();
    await app.request('/vouchers?limit=100000', { headers: headers() });
    expect(queue.claim).toHaveBeenCalledWith(TENANT, 50, expect.any(String), 300);

    await app.request('/vouchers?limit=0', { headers: headers() });
    expect(queue.claim).toHaveBeenLastCalledWith(TENANT, 1, expect.any(String), 300);

    await app.request('/vouchers?limit=nonsense', { headers: headers() });
    expect(queue.claim).toHaveBeenLastCalledWith(TENANT, 50, expect.any(String), 300);
  });

  it('passes null for an instance-less connector — the frozen unleased path', async () => {
    // CONNECTOR-04: this carve-out re-opens the double-post hole and protects a
    // population of zero deployed builds. Implemented as frozen, not as
    // recommended.
    const { app, queue } = build();
    const h = headers();
    delete (h as Record<string, unknown>)['X-Connector-Instance'];
    await app.request('/vouchers', { headers: h });
    expect(queue.claim).toHaveBeenCalledWith(TENANT, 50, null, 300);
  });

  it('records that the instance was seen, so "is it running?" is answerable', async () => {
    const { app, queue } = build();
    await app.request('/vouchers', { headers: headers() });
    expect(queue.touchInstance).toHaveBeenCalled();
  });
});

describe('the version gate', () => {
  it('answers 426 for a connector below the minimum', async () => {
    const { app } = build();
    const res = await app.request('/vouchers', {
      headers: headers({ 'X-Connector-Version': '1.1.9' }),
    });
    expect(res.status).toBe(426);
    const body = (await res.json()) as {
      minConnectorVersion: string;
      currentVersion: string;
    };
    // The body must carry enough for an unattended upgrade decision.
    expect(body.minConnectorVersion).toBe('1.2.0');
    expect(body.currentVersion).toBe('1.1.9');
  });

  it('allows an equal or newer connector', async () => {
    const { app } = build();
    for (const v of ['1.2.0', '1.3.0', '2.0.0']) {
      const res = await app.request('/vouchers', { headers: headers({ 'X-Connector-Version': v }) });
      expect(res.status, `version ${v}`).toBe(200);
    }
  });

  it('does NOT gate /health — that is how a stale connector learns what to install', async () => {
    const { app } = build();
    const res = await app.request('/health', {
      headers: headers({ 'X-Connector-Version': '0.0.1' }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { minConnectorVersion: string }).minConnectorVersion).toBe('1.2.0');
  });

  it('does NOT gate the result endpoint', async () => {
    // A result is a fact about Tally, not a request for service. Refusing it
    // would strand a voucher that is already posted and cause the cloud to
    // re-offer it — turning an upgrade prompt into a duplicate in the books.
    const { app, queue } = build();
    const res = await app.request(`/vouchers/${VOUCHER.id}/result`, {
      method: 'POST',
      headers: { ...headers({ 'X-Connector-Version': '0.0.1' }), 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'posted' }),
    });
    expect(res.status).toBe(200);
    expect(queue.report).toHaveBeenCalled();
  });
});

describe('POST /vouchers/:id/result', () => {
  const post = (body: unknown) => ({
    method: 'POST',
    headers: { ...headers(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  it('accepts a posted result', async () => {
    const { app, queue } = build();
    const res = await app.request(`/vouchers/${VOUCHER.id}/result`, post({
      status: 'posted',
      tallyVoucherId: '12345',
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(queue.report).toHaveBeenCalledWith(TENANT, VOUCHER.id, {
      status: 'posted',
      tallyVoucherId: '12345',
    });
  });

  it('accepts a failure with an error', async () => {
    const { app } = build();
    const res = await app.request(`/vouchers/${VOUCHER.id}/result`, post({
      status: 'failed',
      error: { code: 'TALLY_UNREACHABLE', message: 'connection refused' },
    }));
    expect(res.status).toBe(200);
  });

  it('is idempotent — the same id may be reported more than once', async () => {
    const { app, queue } = build();
    await app.request(`/vouchers/${VOUCHER.id}/result`, post({ status: 'posted' }));
    await app.request(`/vouchers/${VOUCHER.id}/result`, post({ status: 'posted' }));
    expect(queue.report).toHaveBeenCalledTimes(2); // the repository absorbs the repeat
  });

  it('rejects a malformed payload', async () => {
    const { app } = build();
    expect((await app.request(`/vouchers/${VOUCHER.id}/result`, post({ status: 'maybe' }))).status)
      .toBe(400);
    expect((await app.request(`/vouchers/${VOUCHER.id}/result`, post({}))).status).toBe(400);
  });

  it('rejects "unknown" today — HUMAN(CONNECTOR-01), recorded not fixed', async () => {
    const { app } = build();
    expect((await app.request(`/vouchers/${VOUCHER.id}/result`, post({ status: 'unknown' }))).status)
      .toBe(400);
  });
});

describe('compareSemver', () => {
  it('compares numerically, not lexicographically', () => {
    // '1.10.0' < '1.9.0' as strings, which would gate the wrong builds.
    expect(compareSemver('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareSemver('1.2.0', '1.2.0')).toBe(0);
    expect(compareSemver('0.9.9', '1.0.0')).toBeLessThan(0);
  });

  it('returns NaN for an unparseable version, which the gate treats as too old', () => {
    expect(Number.isNaN(compareSemver('banana', '1.0.0'))).toBe(true);
  });
});

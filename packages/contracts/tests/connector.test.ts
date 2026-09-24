import { describe, expect, it } from 'vitest';
import {
  CONNECTOR_BASE_PATH,
  CONNECTOR_HEADERS,
  CONNECTOR_UPGRADE_REQUIRED_STATUS,
  VOUCHER_KINDS,
  healthResponse,
  voucher,
  voucherKind,
  voucherResultRequest,
  vouchersResponse,
} from '../src/index.js';

const VALID_VOUCHER = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  kind: 'purchase',
  xml: '<ENVELOPE>…</ENVELOPE>',
  createdAt: '2026-09-04T10:00:00+05:30',
  attempts: 0,
};

describe('voucher kind is OPEN on the wire', () => {
  it('accepts a kind the cloud has not shipped yet', () => {
    // The rule the connector must obey: never reject an unrecognised kind. A
    // closed union published here would become a closed union in the
    // connector's dated snapshot, and eighteen months later every deployed
    // agent would silently drop a new kind on the floor.
    expect(voucherKind.safeParse('master').success).toBe(true);
    expect(voucherKind.safeParse('credit-note').success).toBe(true);
    expect(voucher.safeParse({ ...VALID_VOUCHER, kind: 'not-invented-yet' }).success).toBe(true);
  });

  it('still names the kinds we currently emit', () => {
    expect(VOUCHER_KINDS).toEqual(['purchase', 'sales', 'payment', 'receipt', 'journal']);
    for (const k of VOUCHER_KINDS) expect(voucherKind.safeParse(k).success).toBe(true);
  });

  it('rejects only an empty kind', () => {
    expect(voucherKind.safeParse('').success).toBe(false);
  });
});

describe('voucher', () => {
  it('accepts the frozen shape', () => {
    expect(voucher.safeParse(VALID_VOUCHER).success).toBe(true);
  });

  it('requires a uuid id, so a voucher cannot be addressed by guesswork', () => {
    expect(voucher.safeParse({ ...VALID_VOUCHER, id: '42' }).success).toBe(false);
  });

  it('requires a timestamp carrying an offset', () => {
    // The connector runs on a customer machine whose clock may be wrong. An
    // offset-less timestamp would be interpreted in local time.
    expect(voucher.safeParse({ ...VALID_VOUCHER, createdAt: '2026-09-04T10:00:00' }).success).toBe(
      false,
    );
  });

  it('requires non-empty xml — escaping is ours, so emptiness is our bug', () => {
    expect(voucher.safeParse({ ...VALID_VOUCHER, xml: '' }).success).toBe(false);
  });
});

describe('vouchersResponse', () => {
  it('carries leaseSeconds, so the connector never derives expiry from serverTime', () => {
    const ok = vouchersResponse.safeParse({
      vouchers: [VALID_VOUCHER],
      serverTime: '2026-09-04T10:00:00+05:30',
      leaseSeconds: 300,
    });
    expect(ok.success).toBe(true);
  });

  it('rejects a missing or non-positive lease', () => {
    const base = { vouchers: [], serverTime: '2026-09-04T10:00:00+05:30' };
    expect(vouchersResponse.safeParse(base).success).toBe(false);
    expect(vouchersResponse.safeParse({ ...base, leaseSeconds: 0 }).success).toBe(false);
  });
});

describe('voucherResultRequest', () => {
  it('is idempotent-friendly: the same id may be reported more than once', () => {
    expect(voucherResultRequest.safeParse({ status: 'posted' }).success).toBe(true);
    expect(
      voucherResultRequest.safeParse({
        status: 'failed',
        error: { code: 'TALLY_UNREACHABLE', message: 'connection refused' },
      }).success,
    ).toBe(true);
  });

  it('HUMAN(CONNECTOR-01): does NOT yet accept "unknown" — recorded, not fixed', () => {
    // A POST that times out because Tally has a modal dialog open may still be
    // processed. With only posted|failed the connector must guess, and one
    // guess loses a voucher while the other duplicates it. Adding this value is
    // a wire change and needs session B's agreement, so the contract stays as
    // frozen and this test documents the gap rather than closing it.
    expect(voucherResultRequest.safeParse({ status: 'unknown' }).success).toBe(false);
  });

  it('caps the error message, so a Tally dump cannot become the payload', () => {
    expect(
      voucherResultRequest.safeParse({
        status: 'failed',
        error: { code: 'X', message: 'y'.repeat(5000) },
      }).success,
    ).toBe(false);
  });
});

describe('health and headers', () => {
  it('answers with the minimum supported connector version', () => {
    expect(healthResponse.safeParse({ ok: true, minConnectorVersion: '1.2.0' }).success).toBe(true);
  });

  it('426 is the upgrade signal — never a silent break', () => {
    // The connector runs on a machine we do not control (ADR-0004).
    expect(CONNECTOR_UPGRADE_REQUIRED_STATUS).toBe(426);
  });

  it('pins the base path and header names the connector depends on', () => {
    expect(CONNECTOR_BASE_PATH).toBe('/connector/v1');
    expect(CONNECTOR_HEADERS.version).toBe('X-Connector-Version');
    expect(CONNECTOR_HEADERS.instance).toBe('X-Connector-Instance');
  });
});

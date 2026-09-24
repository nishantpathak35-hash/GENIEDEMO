import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import type { TenantContext, TenantId } from '@cog/contracts';
import { createLogger, forRequest } from '../src/index.js';

/** Collect log lines as parsed JSON, the way a log shipper would. */
function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  return {
    stream,
    parsed: () => lines.map((l) => JSON.parse(l) as Record<string, unknown>),
    raw: () => lines.join(''),
  };
}

describe('money in logs', () => {
  it('writes a bigint as a quoted string, never a bare numeral', () => {
    // pino does not use JSON.stringify (which would throw on a bigint). Its
    // serialiser emits an unquoted numeric literal, and anything that parses
    // the line then gets a float.
    const sink = capture();
    const log = createLogger({ destination: sink.stream, level: 'info' });

    log.info({ amountPaise: 9_007_199_254_740_993n }, 'payment approved');

    expect(sink.raw()).toContain('"amountPaise":"9007199254740993"');
    expect(sink.raw()).not.toContain('"amountPaise":9007199254740993');
  });

  it('survives the round-trip a log shipper performs', () => {
    const sink = capture();
    const log = createLogger({ destination: sink.stream, level: 'info' });
    const exact = 9_007_199_254_740_993n;

    log.info({ amountPaise: exact }, 'tds deducted');

    const [line] = sink.parsed();
    expect(line?.['amountPaise']).toBe('9007199254740993');
    // The failure being prevented: as a JS number this value is unrepresentable.
    expect(String(Number('9007199254740993'))).not.toBe('9007199254740993');
  });

  it('converts bigints nested in objects and arrays', () => {
    const sink = capture();
    const log = createLogger({ destination: sink.stream, level: 'info' });

    log.info({ po: { lines: [{ amount: 500n }, { amount: 45n }] } }, 'po saved');

    const [line] = sink.parsed();
    const po = line?.['po'] as { lines: Array<{ amount: unknown }> };
    expect(po.lines[0]?.amount).toBe('500');
    expect(po.lines[1]?.amount).toBe('45');
  });
});

describe('redaction', () => {
  it.each([
    ['bank_account', { vendor: { bank_account: '50100123456789' } }],
    ['ifsc', { vendor: { ifsc: 'HDFC0001234' } }],
    ['pan', { vendor: { pan: 'AAAPZ1234C' } }],
    ['gstin', { vendor: { gstin: '07AAAPZ1234C1ZV' } }],
    ['connectorKey', { connectorKey: 'cog_ck_abcd_secret' }],
    ['authorization header', { req: { headers: { authorization: 'Bearer secret' } } }],
  ])('never writes %s', (_label, payload) => {
    const sink = capture();
    const log = createLogger({ destination: sink.stream, level: 'info' });

    log.info(payload, 'record touched');

    const raw = sink.raw();
    expect(raw).toContain('[redacted]');
    for (const secret of [
      '50100123456789',
      'HDFC0001234',
      'AAAPZ1234C',
      '07AAAPZ1234C1ZV',
      'cog_ck_abcd_secret',
      'Bearer secret',
    ]) {
      expect(raw).not.toContain(secret);
    }
  });
});

describe('forRequest correlation', () => {
  const context: TenantContext = {
    tenantId: 'tenant_a' as TenantId,
    principal: { kind: 'staff', id: 'user_1', roles: ['finance'] },
    requestId: 'req_01HZX',
  };

  it('stamps every line with tenant, principal and request', () => {
    const sink = capture();
    const log = forRequest(createLogger({ destination: sink.stream, level: 'info' }), context);

    log.info('approved');
    log.warn('retried');

    for (const line of sink.parsed()) {
      expect(line['tenantId']).toBe('tenant_a');
      expect(line['principalId']).toBe('user_1');
      expect(line['principalKind']).toBe('staff');
      expect(line['requestId']).toBe('req_01HZX');
    }
  });

  it('carries the same requestId a client sees in an ApiError', () => {
    // A support ticket quoting the request id must lead straight to the lines.
    const sink = capture();
    const log = forRequest(createLogger({ destination: sink.stream, level: 'info' }), context);
    log.error('failed');
    expect(sink.parsed()[0]?.['requestId']).toBe(context.requestId);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  ServiceError,
  databaseCheck,
  liveness,
  readiness,
  toErrorResponse,
} from '../src/index.js';

describe('liveness', () => {
  it('touches no dependency', () => {
    // A liveness probe that checks the database restarts every API container
    // when Postgres blips, turning a recoverable hiccup into a full outage.
    expect(liveness()).toEqual({ ok: true });
  });
});

describe('readiness', () => {
  const ok = { name: 'a', check: async () => undefined };
  const bad = {
    name: 'b',
    check: async () => {
      throw new Error('nope');
    },
  };

  it('reports ok when everything passes', async () => {
    const r = await readiness([ok]);
    expect(r.status).toBe('ok');
  });

  it('runs every check even after one fails', async () => {
    // Short-circuiting hides the second failure, which is often the one that
    // explains the first.
    const r = await readiness([bad, ok]);
    expect(r.status).toBe('degraded');
    expect(r.checks.map((c) => c.name)).toEqual(['b', 'a']);
    expect(r.checks[0]?.error).toBe('nope');
  });

  it('times out a hanging check rather than hanging the probe', async () => {
    const hang = { name: 'slow', check: () => new Promise<void>(() => undefined) };
    const r = await readiness([hang], 25);
    expect(r.status).toBe('degraded');
    expect(r.checks[0]?.error).toMatch(/timed out/);
  });
});

describe('databaseCheck', () => {
  const poolWith = (row: Record<string, unknown>) =>
    ({ query: vi.fn(async () => ({ rows: [row] })) }) as unknown as Pool;

  it('passes for the expected non-privileged role', async () => {
    const c = databaseCheck(poolWith({ role: 'app_runtime', bypass: false, superuser: false }));
    await expect(c.check()).resolves.toBeUndefined();
  });

  it('fails when connected as a superuser or a BYPASSRLS role', async () => {
    // `SELECT 1` would pass here — and every RLS policy would be inert.
    await expect(
      databaseCheck(poolWith({ role: 'app_runtime', bypass: true, superuser: false })).check(),
    ).rejects.toThrow(/bypass/i);
    await expect(
      databaseCheck(poolWith({ role: 'postgres', bypass: false, superuser: true })).check(),
    ).rejects.toThrow(/expected app_runtime/);
  });
});

describe('toErrorResponse', () => {
  it('never leaks the thrown message', () => {
    // The legacy handler returns error.message verbatim outside production, so
    // a database error becomes an API response.
    const r = toErrorResponse(new Error('relation "vendors" does not exist'), 'req_1');
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('vendors');
    expect(r.body.message).toBe('Something went wrong on our side.');
  });

  it('never leaks a Postgres detail, which carries the offending value', () => {
    const pgErr = Object.assign(new Error('duplicate key'), {
      code: '23505',
      detail: 'Key (gstin)=(27AAAAA0000A1Z5) already exists.',
      constraint: 'vendors_gstin_key',
    });
    const r = toErrorResponse(pgErr, 'req_2');
    expect(r.status).toBe(409);
    expect(JSON.stringify(r.body)).not.toContain('27AAAAA0000A1Z5');
  });

  it('maps an RLS refusal to 403, not 500', () => {
    const rls = Object.assign(new Error('new row violates row-level security policy'), {
      code: '42501',
    });
    expect(toErrorResponse(rls, 'r').status).toBe(403);
  });

  it('carries the requestId the logs are keyed by', () => {
    // The legacy reference id is Math.random() and is never logged, so it
    // correlates with nothing.
    expect(toErrorResponse(new Error('x'), 'req_abc').body.requestId).toBe('req_abc');
  });

  it('passes through a deliberate ServiceError with its field paths', () => {
    const e = new ServiceError('VALIDATION_FAILED', 'internal detail', [
      { path: 'items.0.rate', reason: 'must be a whole number of paise' },
    ]);
    const r = toErrorResponse(e, 'req_3');
    expect(r.status).toBe(400);
    expect(r.body.details?.[0]?.path).toBe('items.0.rate');
    expect(r.body.message).not.toBe('internal detail');
  });

  it('logs the real cause while returning the safe one', () => {
    const logger = { error: vi.fn() } as never;
    toErrorResponse(new Error('secret cause'), 'req_4', logger);
    expect((logger as unknown as { error: ReturnType<typeof vi.fn> }).error).toHaveBeenCalled();
  });
});

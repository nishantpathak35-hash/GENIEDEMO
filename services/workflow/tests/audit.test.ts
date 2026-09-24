import { describe, expect, it } from 'vitest';
import type { TenantContext, TenantId } from '@cog/contracts';
import { auditRecord, diff, forJsonb } from '../src/domain/audit.js';

const ctx: TenantContext = {
  tenantId: '11111111-1111-4111-8111-111111111111' as TenantId,
  principal: { kind: 'staff', id: 'u_1', roles: ['finance'] },
  requestId: 'req_01HZ',
};

describe('auditRecord', () => {
  it('takes the actor from the context, never from an argument', () => {
    // Accepting an actor id as a parameter would let a caller attribute its own
    // action to somebody else — evidence that is wrong rather than absent.
    const r = auditRecord(ctx, { action: 'po.approved', entityType: 'po', entityId: 'po_1' });
    expect(r.actorId).toBe('u_1');
    expect(r.actorKind).toBe('staff');
    expect(r.tenantId).toBe(ctx.tenantId);
  });

  it('carries the requestId, so a log line and an error response join up', () => {
    expect(auditRecord(ctx, { action: 'a', entityType: 'b', entityId: 'c' }).requestId).toBe(
      'req_01HZ',
    );
  });

  it('records impersonation separately from the actor', () => {
    // An impersonated action that looks identical to a real one is the finding
    // a SOC 2 auditor opens with.
    const r = auditRecord(ctx, { action: 'a', entityType: 'b', entityId: 'c' }, 'support_7');
    expect(r.actorId).toBe('u_1');
    expect(r.impersonatedBy).toBe('support_7');
  });

  it('refuses an event with no action or entity type', () => {
    expect(() => auditRecord(ctx, { action: '  ', entityType: 'po', entityId: '1' })).toThrow();
  });
});

describe('forJsonb — money must survive the round trip', () => {
  it('writes a bigint as a string', () => {
    // node-postgres parses jsonb with JSON.parse, so a bigint written as a
    // number comes back as a float and a crore-scale figure loses precision on
    // the way OUT of the audit trail.
    const out = forJsonb({ amountPaise: 9_007_199_254_740_993n }) as Record<string, unknown>;
    expect(out['amountPaise']).toBe('9007199254740993');
  });

  it('survives a real JSON round trip at a magnitude a float cannot hold', () => {
    const exact = '9007199254740993';
    const round = JSON.parse(JSON.stringify(forJsonb({ v: BigInt(exact) }))) as { v: string };
    expect(round.v).toBe(exact);
    expect(String(Number(exact))).not.toBe(exact); // the failure being avoided
  });

  it('converts bigints nested in arrays and objects', () => {
    const out = forJsonb({ lines: [{ amount: 500n }, { amount: 45n }] }) as {
      lines: Array<{ amount: unknown }>;
    };
    expect(out.lines[0]?.amount).toBe('500');
  });

  it('redacts what must never sit in a table kept for years', () => {
    const out = forJsonb({
      vendor: { legal_name: 'Acme', bank_account: '50100123456789', ifsc: 'HDFC0001234' },
    });
    const text = JSON.stringify(out);
    expect(text).not.toContain('50100123456789');
    expect(text).not.toContain('HDFC0001234');
    expect(text).toContain('Acme'); // the useful part survives
  });

  it('normalises a Date so a re-serialisation does not read as a change', () => {
    expect(forJsonb(new Date('2026-09-04T00:00:00Z'))).toBe('2026-09-04T00:00:00.000Z');
  });
});

describe('diff', () => {
  it('returns only what changed', () => {
    const d = diff(
      { number: 'PO-1', total: 100n, vendor: 'v1' },
      { number: 'PO-1', total: 120n, vendor: 'v1' },
    );
    expect(d).not.toBeNull();
    expect(Object.keys(d!.before)).toEqual(['total']);
    expect(d!.before['total']).toBe('100');
    expect(d!.after['total']).toBe('120');
  });

  it('returns null when nothing changed', () => {
    // The legacy writes 'No tracked field changes' as an audit entry, filling
    // the log with rows recording that nothing happened.
    expect(diff({ a: 1n }, { a: 1n })).toBeNull();
  });

  it('detects an added or removed field', () => {
    expect(diff({ a: 1 }, { a: 1, b: 2 })).not.toBeNull();
    expect(diff({ a: 1, b: 2 }, { a: 1 })).not.toBeNull();
  });

  it('does not report a bigint and its string form as a change', () => {
    // Otherwise every read-modify-write through the wire form would look like
    // an edit.
    expect(diff({ total: 100n }, { total: '100' })).toBeNull();
  });

  it('redacts inside the diff, not only at the top level', () => {
    const d = diff({ vendor: { ifsc: 'OLD0001' } }, { vendor: { ifsc: 'NEW0002' } });
    const text = JSON.stringify(d);
    expect(text).not.toContain('OLD0001');
    expect(text).not.toContain('NEW0002');
  });
});

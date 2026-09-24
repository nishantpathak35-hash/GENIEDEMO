import { describe, expect, it } from 'vitest';
import type { TenantId } from '@cog/contracts';
import {
  EVENT_CHANNEL,
  EventError,
  NOTIFY_PAYLOAD_LIMIT_BYTES,
  assertPublishable,
  isForTenant,
  notificationPayload,
  parseNotification,
} from '../src/domain/events.js';

const A = '11111111-1111-4111-8111-111111111111' as TenantId;
const B = '22222222-2222-4222-8222-222222222222' as TenantId;

describe('the notification carries ids and nothing else', () => {
  it('contains only tenantId and id', () => {
    // NOTIFY is NOT subject to row-level security: every listener on a channel
    // receives every payload. Entity data here would undo the isolation the
    // rest of the schema enforces, invisibly, on a side channel.
    const parsed = JSON.parse(notificationPayload(A, '42')) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(['id', 'tenantId']);
  });

  it('stays far below the NOTIFY limit', () => {
    // Exceeding it raises at COMMIT and fails the transaction that made the
    // change — so a payload mistake surfaces as an unrelated write failing.
    const size = Buffer.byteLength(notificationPayload(A, '42'), 'utf8');
    expect(size).toBeLessThan(NOTIFY_PAYLOAD_LIMIT_BYTES / 10);
  });

  it('uses one shared channel, not one per tenant', () => {
    // A per-tenant channel name would leak the set of active tenant ids to
    // anyone able to run pg_listening_channels().
    expect(EVENT_CHANNEL).toBe('cog_events');
    expect(EVENT_CHANNEL).not.toContain(A);
  });
});

describe('parseNotification', () => {
  it('reads a well-formed payload', () => {
    expect(parseNotification(notificationPayload(A, '42'))).toEqual({ tenantId: A, id: '42' });
  });

  it('accepts a numeric id, which is what bigint identity produces', () => {
    expect(parseNotification(JSON.stringify({ tenantId: A, id: 42 }))?.id).toBe('42');
  });

  it('returns null rather than throwing on anything malformed', () => {
    // A bad notification must not take down a listener serving many
    // subscribers. The payload is only a hint to go and read the row, so
    // dropping one is recoverable where crashing is not.
    for (const bad of ['', 'not json', '{}', '[]', JSON.stringify({ tenantId: 1, id: 2 })]) {
      expect(parseNotification(bad)).toBeNull();
    }
  });
});

describe('isForTenant', () => {
  it('lets a subscriber ignore another tenant notification', () => {
    // The channel is shared, so this is what stops a subscriber even ATTEMPTING
    // to read another tenant's row. RLS would refuse it anyway; this keeps the
    // attempt — and a confusing policy denial in the logs — from happening.
    const n = parseNotification(notificationPayload(A, '1'))!;
    expect(isForTenant(n, A)).toBe(true);
    expect(isForTenant(n, B)).toBe(false);
  });
});

describe('assertPublishable', () => {
  it('accepts a complete event', () => {
    expect(() =>
      assertPublishable({ entityType: 'po', entityId: 'po_1', action: 'approved' }),
    ).not.toThrow();
  });

  it('refuses an event missing its subject or its verb', () => {
    expect(() => assertPublishable({ entityType: '', entityId: 'x', action: 'a' })).toThrow(
      EventError,
    );
    expect(() => assertPublishable({ entityType: 'po', entityId: 'x', action: ' ' })).toThrow(
      EventError,
    );
    expect(() => assertPublishable({ entityType: 'po', entityId: '', action: 'a' })).toThrow(
      EventError,
    );
  });
});

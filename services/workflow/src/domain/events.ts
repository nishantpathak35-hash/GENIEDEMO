import type { TenantId } from '@cog/contracts';

/**
 * The realtime event stream.
 *
 * The legacy SSE endpoint polls `broadcast_events` **every two seconds, per
 * connected client** (STACK-MIGRATION defect 9). Twenty users on a dashboard is
 * 600 queries a minute against a table that is almost always unchanged, and a
 * change is still up to two seconds late. `LISTEN`/`NOTIFY` wakes a subscriber
 * on the write instead.
 *
 * This file owns the *shape* of an event and the rule about what may travel in
 * a notification. The socket handling belongs to the API host.
 */

/** What a NOTIFY payload may contain. Ids only — see `notificationPayload`. */
export interface EventNotification {
  readonly tenantId: TenantId;
  readonly id: string;
}

export interface DomainEvent {
  readonly entityType: string;
  readonly entityId: string;
  readonly action: string;
  /** Stored in the row, never in the notification. */
  readonly payload?: Readonly<Record<string, unknown>> | undefined;
}

export const EVENT_CHANNEL = 'cog_events';

/** Postgres refuses a NOTIFY payload above this, at COMMIT time. */
export const NOTIFY_PAYLOAD_LIMIT_BYTES = 8000;

export class EventError extends Error {
  override readonly name = 'EventError';
}

/**
 * Build the notification payload.
 *
 * **Ids only, deliberately.** `NOTIFY` is not subject to row-level security:
 * every listener on a channel receives every payload regardless of which tenant
 * it is scoped to. Putting entity data in it would undo the isolation the rest
 * of the schema enforces, and would do so invisibly, because the leak is on a
 * side channel rather than in a query result.
 *
 * The subscriber re-reads the row through `withTenant`, which is the only
 * policy-checked path.
 */
export function notificationPayload(tenantId: TenantId, id: string): string {
  const json = JSON.stringify({ tenantId, id });
  if (Buffer.byteLength(json, 'utf8') > NOTIFY_PAYLOAD_LIMIT_BYTES) {
    // Unreachable with two ids, and asserted anyway: exceeding the limit raises
    // at COMMIT and fails the transaction that made the change — so a payload
    // mistake would surface as an unrelated write failing.
    throw new EventError('notification payload exceeds the NOTIFY limit');
  }
  return json;
}

/**
 * Parse a notification received from Postgres.
 *
 * Returns null rather than throwing on anything unexpected. A malformed
 * notification must not take down a listener that is serving many subscribers —
 * and since the payload is only a hint to go and read the row, dropping one is
 * recoverable where crashing is not.
 */
export function parseNotification(raw: string): EventNotification | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const tenantId = parsed['tenantId'];
    const id = parsed['id'];
    if (typeof tenantId !== 'string' || (typeof id !== 'string' && typeof id !== 'number')) {
      return null;
    }
    return { tenantId: tenantId as TenantId, id: String(id) };
  } catch {
    return null;
  }
}

/**
 * Whether a subscriber scoped to one tenant should react to a notification.
 *
 * The channel is shared, so this check is what keeps a subscriber from even
 * attempting to read another tenant's row. RLS would refuse that read anyway —
 * this exists so the attempt is not made, and so a stray read never appears in
 * the logs as a policy denial that someone then investigates.
 */
export function isForTenant(notification: EventNotification, tenantId: TenantId): boolean {
  return notification.tenantId === tenantId;
}

/** Validate an event before it is written. */
export function assertPublishable(event: DomainEvent): void {
  if (event.entityType.trim() === '' || event.action.trim() === '') {
    throw new EventError('an event needs an entity type and an action');
  }
  if (event.entityId.trim() === '') {
    throw new EventError('an event needs an entity id');
  }
}

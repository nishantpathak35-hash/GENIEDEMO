import type { ReactNode } from 'react';
import type { Notification } from '@cog/contracts';
import { relabel, type NotificationItem, type Terms } from '@cog/design-system';
import { markNotificationRead } from './actions';

/**
 * A notification as the panel draws it — the same row on the bell's panel
 * and on the Notifications page. Three rules from `docs/design/COMPONENT-MAP.md`:
 * an event has an actor, a feed is grouped by day and not by elapsed time,
 * and a row offers the thing you would do about it. The server's
 * notification carries a record (an entity type and id) rather than a
 * person, so the actor is the RECORD — the square avatar — and the action
 * opens it. Day grouping and the clock time are date formatting on the
 * server, in one zone, so two people never see the same event on different days.
 */
interface EntityWords {
  readonly word: string;
  readonly initial: string;
  readonly href: (id: string) => string;
  readonly open: string;
}

const PROJECT: EntityWords = { word: 'Project', initial: 'P', href: (id) => `/projects/${id}`, open: 'Open the project' };

const ENTITY: Record<Notification['entityType'], EntityWords> = {
  project: PROJECT,
  purchase_order: { word: 'Order', initial: 'O', href: (id) => `/purchase-orders/${id}`, open: 'Open the order' },
  change_order: { word: 'Variation', initial: 'V', href: () => '/projects', open: 'Open the project' },
  boq_item: { word: 'BOQ line', initial: 'B', href: () => '/projects', open: 'Open the project' },
};

const KIND: Record<Notification['kind'], string> = {
  approval_requested: 'Waiting for your approval',
  approval_decided: 'A decision on what you submitted',
  comment_mentioned: 'A comment that names you',
};

export function toItem(n: Notification, now: Date, t?: Terms): NotificationItem {
  // `noUncheckedIndexedAccess`: the enum is closed, but the index is not proof.
  const base: EntityWords = ENTITY[n.entityType] ?? PROJECT;
  const entity: EntityWords = t === undefined ? base : { ...base, word: relabel(base.word, t) };
  // The person who acted when one is on file; the record otherwise — a
  // square avatar is the honest drawing for "no person to name".
  const actor =
    n.actor === null
      ? { initial: entity.initial, kind: 'record' as const }
      : { initial: n.actor.name.slice(0, 1).toUpperCase(), kind: 'person' as const };
  return {
    id: n.id,
    actor,
    sentence: n.actor === null ? n.summary : `${n.actor.name} — ${n.summary}`,
    context: `${KIND[n.kind]} · ${entity.word}`,
    at: clock(n.createdAt),
    day: dayOf(n.createdAt, now),
    unread: n.readAt === null,
    action: { label: entity.open, href: entity.href(n.entityId) },
    ...(n.readAt === null
      ? {
          markReadAction: (
            <form action={markNotificationRead.bind(null, n.id)} className="inline">
              <button type="submit" className="btn sm ghost">
                Mark read
              </button>
            </form>
          ),
        }
      : {}),
  };
}

const ZONE = 'Asia/Kolkata';

export function markAllReadForm(action: (form: FormData) => Promise<void>): ReactNode {
  return (
    <form action={action} className="inline">
      <button type="submit" className="link-btn">
        Mark all read
      </button>
    </form>
  );
}

function clock(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONE }).format(
    new Date(iso),
  );
}

/** "Today", "Yesterday", or the exact date — never elapsed time. */
function dayOf(iso: string, now: Date): string {
  const key = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE });
  const day = key.format(new Date(iso));
  if (day === key.format(now)) return 'Today';
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (day === key.format(yesterday)) return 'Yesterday';
  return new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: ZONE }).format(
    new Date(iso),
  );
}

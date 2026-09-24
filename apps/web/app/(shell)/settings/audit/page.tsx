import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../lib/api';
import { AbsentNotice, Empty, Notice, PageHeader, Pager, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { pageLinks, pageState } from '../../../../lib/paging';

/**
 * The same handful of entity types the approval chains name, for the events
 * this list shares with them. Audit covers every entity in the system, so
 * this map is necessarily partial — anything outside it falls back to the
 * raw type with underscores spaced out, which is readable without claiming
 * to be a word this screen invented.
 */
const ENTITY_TYPE_LABELS: Record<string, string> = {
  purchase_order: 'Purchase order',
  payment_request: 'Payment request',
  change_order: 'Change order',
  boq_schedule: 'BOQ schedule',
  site_imprest: 'Site imprest',
};

function entityTypeLabel(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType.replace(/_/g, ' ');
}

/** `action` is a free-text verb the writing service chose, not a closed set this screen owns. */
function actionLabel(action: string): string {
  return action.replace(/[._]/g, ' ');
}

/**
 * Bucket by the date portion of `occurredAt` (`YYYY-MM-DD`), preserving the
 * order the server returned — newest day first, since `auditSearch` orders
 * newest event first. Collates by key rather than only on adjacency change,
 * so this list stays correct even if the feed is ever interleaved.
 */
function groupByDay<T extends { occurredAt: string }>(items: readonly T[]): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const day = item.occurredAt.slice(0, 10);
    const bucket = groups.get(day);
    if (bucket === undefined) groups.set(day, [item]);
    else bucket.push(item);
  }
  return [...groups.entries()];
}

export const metadata = { title: 'Audit · Settings' };
export const dynamic = 'force-dynamic';

/** Settings › Activity log — the hub's card, opened. */
const HEADER = <PageHeader crumbs={[{ href: '/settings', label: 'Settings' }]} title="Activity log" sub="Every change, by whom, when." />;

/**
 * What the system did, and who asked it to.
 *
 * **Read-only, and there is no way to make it anything else.** `audit_events`
 * is append-only by privilege — the runtime role holds INSERT and SELECT on it
 * and nothing else — so there is no edit control here because there is no
 * statement behind one. The legacy version of this tab offers a CSV export and
 * a delete; the export is fine and the delete is the reason an audit log is
 * worth nothing.
 *
 * `impersonatedBy` is shown in its own column rather than folded into the
 * actor. A support engineer acting as a customer's user is the single most
 * important thing on this screen and it is the thing a "who did it" column
 * hides.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const paging = pageState(params);
  const events = await load(await apiAsCaller(), API_ROUTES.auditSearch, { query: paging.query });

  if (events.kind === 'unreachable') return <UnreachableState />;
  if (events.kind === 'refused') {
    return (
      <>
        {HEADER}
        <Section title="Activity log">
          <Refusal error={events.error} />
        </Section>
      </>
    );
  }

  const { summary } = events.data;

  function hrefFor(overrides: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    const merged: Record<string, string | undefined> = { ...params, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== '') next.set(key, value);
    }
    const qs = next.toString();
    return qs === '' ? '/settings/audit' : `/settings/audit?${qs}`;
  }
  const links = pageLinks(paging, events.data, hrefFor);

  return (
    <>
      {HEADER}
      <Section bare title={`Audit — ${events.data.count} events`}>
        <div className="card-b">
          {summary.impersonated > 0 ? (
            <Notice tone="warn" title={`${summary.impersonated} of these were performed while impersonating`}>
              That is legitimate and it is recorded; it is never hidden and cannot be suppressed
              from this list.
            </Notice>
          ) : null}

          {events.data.count === 0 ? (
            <Empty illustration="documents" title="Nothing has been recorded yet">
              An audit row is written by the system as a side effect of an action, in the same
              transaction, so an empty list means nothing auditable has happened here — not that
              recording is off.
            </Empty>
          ) : (
            <>
              {groupByDay(events.data.items).map(([day, dayEvents]) => (
                <div key={day}>
                  {/* The day heading — the one place capitals are allowed
                      (00-foundations.html), same rule the notifications
                      popover's `.day` heading follows. That class is scoped
                      to `.popover .notifs .day` in styles.css (position:
                      absolute, sized for a dropdown), so it is not reusable
                      here without dragging in popover positioning; this
                      renders the same exception in plain text instead. */}
                  <p className="muted u-mb0">
                    <strong>{day.toUpperCase()}</strong>
                  </p>
                  <ul className="list day">
                    {dayEvents.map((event) => (
                      <li key={event.id}>
                        <span className="kind" aria-hidden="true" />
                        <div>
                          {actionLabel(event.action)} — {entityTypeLabel(event.entityType)}{' '}
                          <code>{event.entityId}</code>
                          <small>
                            {event.actorId} <Pill tone="idle">{event.actorKind}</Pill>
                            {event.impersonatedBy === null ? null : (
                              <>
                                {' '}
                                <Pill tone="warn">acting as {event.impersonatedBy}</Pill>
                              </>
                            )}
                          </small>
                        </div>
                        <span className="when">{event.occurredAt.slice(11)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <Pager shown={links.shown} of={events.data.count} unit="events" next={links.next} prev={links.prev} />
            </>
          )}
        </div>
      </Section>

      <AbsentNotice title="No delete, and no filter that can hide a row">
        The previous system&rsquo;s audit tab filters by action type and department from a
        hardcoded list of eighteen actions and six departments, written into the component. A
        filter whose options are a literal list silently omits every action added since somebody
        last edited that list, which on an audit screen means a row that exists and is never
        looked at. This shows what happened, in order.
      </AbsentNotice>
    </>
  );
}

import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { Empty, NotificationPanel, PageHeader, Pager, Refusal, UnreachableState, load } from '@cog/design-system';
import { apiAsCaller } from '../../../lib/api';
import { terms } from '../../../lib/terms';
import { pageLinks, pageState } from '../../../lib/paging';
import { markAllNotificationsRead } from './actions';
import { markAllReadForm, toItem } from './items';

export const metadata = { title: 'Notifications · Construct-O-Genie' };
export const dynamic = 'force-dynamic';

/**
 * What is waiting for you — the feed the bell opens, as a page.
 *
 * Three rules from `docs/design/COMPONENT-MAP.md`: an event has an actor, a
 * feed is grouped by day and not by elapsed time, and a row offers the thing
 * you would do about it. The server's notification carries a record (an
 * entity type and id) rather than a person, so the actor is the RECORD —
 * the square avatar — and the action opens it.
 *
 * The rows are `toItem` in `items.tsx`, shared with the panel the bell
 * opens, so the two never drift.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const paging = pageState(params);
  const [inbox, t] = await Promise.all([load(await apiAsCaller(), API_ROUTES.notifications, { query: paging.query }), terms()]);

  if (inbox.kind === 'unreachable') return <UnreachableState />;
  if (inbox.kind === 'refused') return <Refusal error={inbox.error} />;

  const { items, unread, count } = inbox.data;
  const now = new Date();

  function hrefFor(overrides: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    const merged: Record<string, string | undefined> = { ...params, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== '') next.set(key, value);
    }
    const qs = next.toString();
    return qs === '' ? '/notifications' : `/notifications?${qs}`;
  }
  const links = pageLinks(paging, inbox.data, hrefFor);

  return (
    <>
      <PageHeader title="Notifications" sub={<>{unread === 0 ? 'You’re up to date' : `${unread} unread`} · everything that moved while you were away</>} />
      {count === 0 ? (
        <Empty illustration="notifications" title="You’re up to date">
          Anything that needs you appears here the moment it happens.
        </Empty>
      ) : (
        <>
          <NotificationPanel
            unread={unread}
            items={items.map((n) => toItem(n, now, t))}
            allHref="/notifications"
            {...(unread === 0 ? {} : { markAllReadAction: markAllReadForm(markAllNotificationsRead) })}
          />
          <Pager shown={links.shown} of={count} unit="notifications" next={links.next} prev={links.prev} />
        </>
      )}
    </>
  );
}

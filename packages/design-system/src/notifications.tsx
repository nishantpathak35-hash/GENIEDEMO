import { Fragment, type ReactNode } from 'react';
import { Icon } from './sprite.js';

/**
 * One event in the feed, and the three things the map says every one of them
 * carries: an actor, a day, and one thing to do about it.
 *
 * `at` is a string the CALLER formats — this package multiplies and divides
 * nothing and parses no clock either, and "09:42" versus "2026-09-13T09:42Z"
 * is a display decision, not one this component should own. `day` is likewise
 * the caller's word (`'Today'`, `'Yesterday'`, an exact date past that) rather
 * than a timestamp this component buckets itself, because "what counts as
 * today" is a server-clock question this package has no business answering.
 */
export interface NotificationItem {
  readonly id: string;
  readonly actor: {
    readonly initial: string;
    /** A person or an organisation gets the round avatar; a record gets the square one. */
    readonly kind: 'person' | 'organisation' | 'record';
  };
  readonly sentence: ReactNode;
  readonly context: ReactNode;
  /** Absolute clock time, already formatted by the caller. Never "3h ago". */
  readonly at: string;
  /** `'Today'`, `'Yesterday'`, or an exact date — never elapsed time. */
  readonly day: string;
  readonly unread: boolean;
  /** The one thing to do about this event, if there is one. */
  readonly action?: { readonly label: string; readonly href: string };
  /** The caller's own mark-read control (a form, a button) — this never fetches. */
  readonly markReadAction?: ReactNode;
}

/**
 * The bell with a count and the panel it opens: a feed grouped by day with a
 * sticky day heading, never by elapsed time, and a row that offers exactly one
 * inline action plus mark-read.
 *
 * Grouping is derived from `items[i].day` against the previous row, not
 * computed here from a timestamp — see `NotificationItem`. The caller is
 * expected to have already sorted `items` so equal `day`s are adjacent; this
 * renders a new heading exactly when `day` changes; it does not re-sort or
 * collate.
 *
 * Pure, like everything else in this package: read state, mark-all-read and
 * navigation are the caller's forms and links. Nothing here fetches.
 */
export function NotificationPanel({
  unread,
  items,
  allHref,
  markAllReadAction,
}: {
  unread: number;
  items: ReadonlyArray<NotificationItem>;
  allHref: string;
  markAllReadAction?: ReactNode;
}): ReactNode {
  return (
    <div className="popover" role="dialog" aria-label="Notifications">
      <div className="ph">
        <span>
          Notifications
          <b>{unread} unread</b>
        </span>
        {markAllReadAction}
      </div>
      <ol className="notifs">
        {items.map((item, index) => {
          const previous = items[index - 1];
          const isNewDay = index === 0 || previous?.day !== item.day;
          return (
            <Fragment key={item.id}>
              {isNewDay ? (
                <li className="day" role="presentation">
                  <span>{item.day}</span>
                </li>
              ) : null}
              <li className={item.unread ? 'n unread' : 'n'}>
                <span
                  className={item.actor.kind === 'record' ? 'avatar rec' : 'avatar'}
                  aria-hidden="true"
                >
                  {item.actor.initial}
                </span>
                <div className="b">
                  <p>{item.sentence}</p>
                  <small>{item.context}</small>
                  {item.action === undefined && item.markReadAction === undefined ? null : (
                    <div className="acts">
                      {item.action === undefined ? null : (
                        <a className="btn sm" href={item.action.href}>
                          {item.action.label}
                        </a>
                      )}
                      {item.markReadAction}
                    </div>
                  )}
                </div>
                <span className="when">
                  {item.at}
                  {item.unread ? <i className="dot" aria-label="Unread" /> : null}
                </span>
              </li>
            </Fragment>
          );
        })}
      </ol>
      <div className="pf">
        <a href={allHref}>All notifications</a>
      </div>
    </div>
  );
}

/**
 * The topbar bell: an icon, a count, and a name for what the count means.
 *
 * `href`, not a click handler — this component holds no state to open or
 * close a panel with, so it is a plain link to wherever the count leads
 * (typically the full notifications screen; a screen that also wants the
 * dropdown wraps this itself). The count is rendered even at zero: a bell
 * that silently drops its own badge at zero is a control whose accessible
 * name (`aria-label`) and visible label could then disagree.
 */
export function NotificationBell({ count, href }: { count: number; href: string }): ReactNode {
  return (
    <a className="btn icon ghost bell" href={href} aria-label={`Notifications, ${count} unread`}>
      <Icon name="bell" />
      <span className="dot" aria-hidden="true">
        {count}
      </span>
    </a>
  );
}

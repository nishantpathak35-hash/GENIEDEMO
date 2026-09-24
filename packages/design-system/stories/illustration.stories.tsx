import type { ReactNode } from 'react';
import { Sprite, Icon, Illustration, ICON_NAMES, ILLUSTRATION_NAMES } from '../src/sprite.js';
import { Empty } from '../src/empty.js';
import { NotificationPanel, NotificationBell, type NotificationItem } from '../src/notifications.js';

/**
 * One entry per component; one state per design state, named as the design
 * names it.
 *
 * Every state below that renders an `Icon` or an `Illustration` also mounts
 * `<Sprite />` itself. In an app the sprite is mounted once, in the root
 * layout body; a story previews one state at a time with no shared layout
 * around it, so each state that needs the symbol table brings its own copy —
 * that is a review-tool artefact, not a second way to use `Sprite` in product
 * code.
 *
 * Layout here reuses `.row` (`packages/design-system/src/styles.css`,
 * `display: grid; grid-template-columns: repeat(auto-fit, minmax(160px,
 * 1fr))`) rather than an inline style: this file is scanned by the same
 * literal gate as everything else under `packages/`, and a `style={{ gap }}`
 * would fail it exactly as it would in a component.
 */

const SYNTHETIC_NOTIFICATIONS: readonly NotificationItem[] = [
  {
    id: 'n1',
    day: 'Today',
    unread: true,
    actor: { initial: 'B', kind: 'organisation' },
    sentence: (
      <>
        <b>Brightmoor Interiors</b> accepted <span>PO-0091</span>
      </>
    ),
    context: 'Vendor portal · ₹2,18,000.00 before GST',
    at: '10:05',
    action: { label: 'Open the order', href: '#' },
    markReadAction: <button type="button">Mark read</button>,
  },
  {
    id: 'n2',
    day: 'Today',
    unread: true,
    actor: { initial: 'D', kind: 'record' },
    sentence: (
      <>
        <b>DSEL-04</b> moved to Watch closely
      </>
    ),
    context: '74% of the contract ordered, one trade still to buy',
    at: '09:20',
    action: { label: 'Open the project', href: '#' },
    markReadAction: <button type="button">Mark read</button>,
  },
  {
    id: 'n3',
    day: 'Yesterday',
    unread: false,
    actor: { initial: 'R', kind: 'person' },
    sentence: (
      <>
        <b>Ritu N.</b> filed the daily report for <span>WKST-02</span>
      </>
    ),
    context: 'Site · 34 on site, 5 lines of work',
    at: '18:40',
    action: { label: 'Open the report', href: '#' },
  },
  {
    id: 'n4',
    day: 'Wednesday 9 September',
    unread: false,
    actor: { initial: 'F', kind: 'organisation' },
    sentence: (
      <>
        <b>Fernhollow Joinery</b> has still not acknowledged <span>PO-0077</span>
      </>
    ),
    context: 'Buying · sent 9 days ago, no reply on the portal',
    at: '12:10',
    action: { label: 'Chase the vendor', href: '#' },
  },
];

export const stories: ReadonlyArray<{ component: string; states: Record<string, () => ReactNode> }> = [
  {
    component: 'Sprite',
    states: {
      'all 35 icons, named': () => (
        <>
          <Sprite />
          <div className="row">
            {ICON_NAMES.map((name) => (
              <div key={name}>
                <Icon name={name} />
                <div>{name}</div>
              </div>
            ))}
          </div>
        </>
      ),
      'all 14 illustrations, named': () => (
        <>
          <Sprite />
          <div className="row">
            {ILLUSTRATION_NAMES.map((name) => (
              <div key={name}>
                <Illustration name={name} />
                <div>{name}</div>
              </div>
            ))}
          </div>
        </>
      ),
    },
  },
  {
    component: 'Icon',
    states: {
      'sm, decorative': () => (
        <>
          <Sprite />
          <Icon name="search" size="sm" />
        </>
      ),
      'default size, decorative': () => (
        <>
          <Sprite />
          <Icon name="search" />
        </>
      ),
      'labelled — the icon alone carries the meaning': () => (
        <>
          <Sprite />
          <Icon name="alert" label="Needs attention" />
        </>
      ),
    },
  },
  {
    component: 'Empty',
    states: {
      'new, with an action': () => (
        <>
          <Sprite />
          <Empty
            illustration="orders"
            title="No orders yet"
            action={<a className="button primary" href="#">Raise an order</a>}
          >
            Raise the first one, or from any project&rsquo;s BOQ.
          </Empty>
        </>
      ),
      'new, without an action': () => (
        <>
          <Sprite />
          <Empty illustration="approvals" title="Nothing is waiting">
            Every order is either approved or not sent yet.
          </Empty>
        </>
      ),
      filtered: () => (
        <>
          <Sprite />
          <Empty illustration="search" title="No items match these filters" variant="filtered">
            Trade Joinery, vendor Fernhollow Joinery — widen either to see more.
          </Empty>
        </>
      ),
      'one per illustration, in a grid': () => (
        <>
          <Sprite />
          <div className="row">
            {ILLUSTRATION_NAMES.map((name) => (
              <Empty key={name} illustration={name} title={`No ${name} yet`}>
                Recorded here once the first one exists.
              </Empty>
            ))}
          </div>
        </>
      ),
    },
  },
  {
    component: 'NotificationPanel',
    states: {
      'three days, mixed read and unread': () => (
        <>
          <Sprite />
          <NotificationPanel
            unread={2}
            items={SYNTHETIC_NOTIFICATIONS}
            allHref="#"
            markAllReadAction={<button type="button">Mark all read</button>}
          />
        </>
      ),
    },
  },
  {
    component: 'NotificationBell',
    states: {
      '0 unread': () => (
        <>
          <Sprite />
          <NotificationBell count={0} href="#" />
        </>
      ),
      '3 unread': () => (
        <>
          <Sprite />
          <NotificationBell count={3} href="#" />
        </>
      ),
    },
  },
];

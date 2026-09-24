import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationPanel, NotificationBell, type NotificationItem } from '../src/notifications.js';

function item(overrides: Partial<NotificationItem> & { id: string; day: string }): NotificationItem {
  return {
    actor: { initial: 'A', kind: 'person' },
    sentence: 'did a thing',
    context: 'some context',
    at: '09:00',
    unread: false,
    ...overrides,
  };
}

/**
 * The three rules the component map draws out of this design: an event has
 * an actor, a feed is grouped by day and never by elapsed time, and a row
 * offers one inline action plus mark-read.
 */
describe('NotificationPanel', () => {
  it('is a labelled dialog', () => {
    render(<NotificationPanel unread={0} items={[]} allHref="/notifications" />);
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeDefined();
  });

  it('states the unread count in its header', () => {
    render(<NotificationPanel unread={3} items={[]} allHref="/notifications" />);
    expect(screen.getByText('3 unread')).toBeDefined();
  });

  it('groups consecutive same-day rows under one heading, and starts a new one when the day changes', () => {
    render(
      <NotificationPanel
        unread={0}
        items={[
          item({ id: '1', day: 'Today', sentence: 'first today' }),
          item({ id: '2', day: 'Today', sentence: 'second today' }),
          item({ id: '3', day: 'Yesterday', sentence: 'yesterday' }),
        ]}
        allHref="/notifications"
      />,
    );
    // Two rows share 'Today' — if grouping failed and a heading were emitted
    // per row instead of per run, this text would appear twice.
    expect(screen.getAllByText('Today').length).toBe(1);
    expect(screen.getAllByText('Yesterday').length).toBe(1);
  });

  it('gives a person or an organisation the round avatar, and a record the square one', () => {
    const { container } = render(
      <NotificationPanel
        unread={0}
        items={[
          item({ id: '1', day: 'Today', actor: { initial: 'A', kind: 'person' } }),
          item({ id: '2', day: 'Today', actor: { initial: 'M', kind: 'organisation' } }),
          item({ id: '3', day: 'Today', actor: { initial: 'K', kind: 'record' } }),
        ]}
        allHref="/notifications"
      />,
    );
    const avatars = container.querySelectorAll('.avatar');
    expect(avatars.length).toBe(3);
    expect(container.querySelectorAll('.avatar.rec').length).toBe(1);
  });

  it('marks an unread row with an accessible "Unread" dot, and a read row with none', () => {
    render(
      <NotificationPanel
        unread={1}
        items={[
          item({ id: '1', day: 'Today', unread: true, sentence: 'unread one' }),
          item({ id: '2', day: 'Today', unread: false, sentence: 'read one' }),
        ]}
        allHref="/notifications"
      />,
    );
    expect(screen.getAllByLabelText('Unread').length).toBe(1);
  });

  it('offers the row action as a link to its href', () => {
    render(
      <NotificationPanel
        unread={0}
        items={[
          item({
            id: '1',
            day: 'Today',
            sentence: 'Ashvale Interiors accepted PO-0044',
            action: { label: 'Open the order', href: '/orders/PO-0044' },
          }),
        ]}
        allHref="/notifications"
      />,
    );
    const action = screen.getByRole('link', { name: 'Open the order' });
    expect(action.getAttribute('href')).toBe('/orders/PO-0044');
  });

  it('renders the caller-supplied mark-read control beside the action, and neither when both are absent', () => {
    const { container: withMarkRead } = render(
      <NotificationPanel
        unread={0}
        items={[
          item({
            id: '1',
            day: 'Today',
            action: { label: 'Open the order', href: '/orders/PO-0044' },
            markReadAction: <button type="button">Mark read</button>,
          }),
        ]}
        allHref="/notifications"
      />,
    );
    expect(screen.getByRole('button', { name: 'Mark read' })).toBeDefined();
    expect(withMarkRead.querySelector('.acts')).not.toBeNull();

    const { container: withNeither } = render(
      <NotificationPanel unread={0} items={[item({ id: '2', day: 'Today' })]} allHref="/notifications" />,
    );
    expect(withNeither.querySelector('.acts')).toBeNull();
  });

  it('links its footer to allHref', () => {
    render(<NotificationPanel unread={0} items={[]} allHref="/notifications" />);
    expect(screen.getByRole('link', { name: 'All notifications' }).getAttribute('href')).toBe(
      '/notifications',
    );
  });

  it('renders the caller-supplied mark-all-read control when given', () => {
    render(
      <NotificationPanel
        unread={2}
        items={[]}
        allHref="/notifications"
        markAllReadAction={<button type="button">Mark all read</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDefined();
  });
});

describe('NotificationBell', () => {
  it('names itself with the unread count', () => {
    render(<NotificationBell count={3} href="/notifications" />);
    expect(screen.getByRole('link', { name: 'Notifications, 3 unread' })).toBeDefined();
  });

  it('shows the count in its badge, including zero', () => {
    render(<NotificationBell count={0} href="/notifications" />);
    expect(screen.getByRole('link', { name: 'Notifications, 0 unread' }).textContent).toContain('0');
  });

  it('links to the given href', () => {
    render(<NotificationBell count={1} href="/notifications" />);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/notifications');
  });
});

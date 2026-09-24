import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Empty } from '../src/empty.js';

/**
 * The design's gate rule for this component, made a test: one illustration,
 * one sentence, at most one action.
 *
 * The illustration is `aria-hidden` and carries no accessible name, so its
 * identity can only be checked structurally — the `<use>` it renders. That is
 * the one exception `form.test.tsx` also takes (`.notice` there), for the same
 * reason: a property with no other observable surface.
 */
describe('Empty', () => {
  it('shows the title and the one-sentence body', () => {
    render(
      <Empty illustration="projects" title="No projects yet">
        Create one to start recording orders and site activity against it.
      </Empty>,
    );
    expect(screen.getByText('No projects yet')).toBeDefined();
    expect(
      screen.getByText('Create one to start recording orders and site activity against it.'),
    ).toBeDefined();
  });

  it('renders no body when none is given', () => {
    const { container } = render(<Empty illustration="approvals" title="Nothing is waiting" />);
    expect(container.querySelector('p')).toBeNull();
  });

  it('renders the requested illustration', () => {
    const { container } = render(<Empty illustration="stock" title="Nothing in store yet" />);
    expect(container.querySelector('use')?.getAttribute('href')).toBe('#illo-stock');
  });

  it('renders at most one action, and none when omitted', () => {
    const { container: withoutAction } = render(
      <Empty illustration="tasks" title="Nothing to do" />,
    );
    expect(withoutAction.querySelector('.actions')).toBeNull();

    const { container: withAction } = render(
      <Empty
        illustration="tasks"
        title="Nothing to do"
        action={<a href="/tasks/new">New task</a>}
      >
        Tasks people give you appear here.
      </Empty>,
    );
    const links = withAction.querySelectorAll('.actions a, .actions button');
    expect(links.length).toBe(1);
  });

  it('filtered always shows the search illustration, regardless of the illustration prop', () => {
    const { container } = render(
      <Empty illustration="projects" title="No items match these filters" variant="filtered">
        Widen the trade, or drop the vendor from the filter above.
      </Empty>,
    );
    expect(container.querySelector('use')?.getAttribute('href')).toBe('#illo-search');
  });

  it('carries the smaller illustration size class only when filtered', () => {
    const { container: unfiltered } = render(
      <Empty illustration="projects" title="No projects yet" />,
    );
    expect(unfiltered.querySelector('.empty')?.classList.contains('filtered')).toBe(false);

    const { container: filtered } = render(
      <Empty illustration="search" title="No items match" variant="filtered" />,
    );
    expect(filtered.querySelector('.empty')?.classList.contains('filtered')).toBe(true);
  });
});

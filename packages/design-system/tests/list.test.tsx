import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BulkBar, FilterChips, ListFrame, Pager, Skeleton, SortableHeader, Toolbar } from '../src/list.js';
import { Stepper } from '../src/stepper.js';
import { useRowSelection } from '../src/row-selection.js';

/**
 * These assert behaviour and accessibility, never markup: the count text a
 * pager renders, the `aria-sort` a header carries, which links exist and
 * which do not, not a class name or an element order.
 */

describe('Toolbar', () => {
  it('renders what it is given, including a spacer', () => {
    render(
      <Toolbar>
        <input aria-label="Search vendors" type="search" />
        <Toolbar.Spacer />
        <button type="button">Add a vendor</button>
      </Toolbar>,
    );
    expect(screen.getByLabelText('Search vendors')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Add a vendor' })).toBeDefined();
  });
});

describe('FilterChips', () => {
  it('renders nothing when nothing is applied', () => {
    const { container } = render(<FilterChips applied={[]} clearAllHref="/vendors" />);
    expect(container.firstChild).toBeNull();
  });

  it('names each filter, offers to remove it, and to clear all of them', () => {
    render(
      <FilterChips
        applied={[
          { key: 'trade', label: 'Trade', value: 'Joinery', removeHref: '/vendors?a=1' },
          { key: 'vendor', label: 'Vendor', value: 'Eastmere Engineering', removeHref: '/vendors?a=2' },
        ]}
        clearAllHref="/vendors"
      />,
    );

    // Each removal is a real link, not a click handler — filtering is
    // server-side and the URL carries the state.
    const trade = screen.getByRole('link', { name: 'Trade Joinery, remove this filter' });
    expect(trade.getAttribute('href')).toBe('/vendors?a=1');
    const vendor = screen.getByRole('link', { name: 'Vendor Eastmere Engineering, remove this filter' });
    expect(vendor.getAttribute('href')).toBe('/vendors?a=2');

    const clearAll = screen.getByRole('link', { name: 'Clear all' });
    expect(clearAll.getAttribute('href')).toBe('/vendors');
  });

  it('states the count when the caller passes one', () => {
    render(
      <FilterChips
        applied={[{ key: 'trade', label: 'Trade', value: 'Joinery', removeHref: '/vendors' }]}
        clearAllHref="/vendors"
        count={{ shown: 1, of: 5 }}
      />,
    );
    expect(screen.getByText('Filtered by 1 of 5')).toBeDefined();
  });
});

describe('Pager', () => {
  it('reads a count of one in the singular', () => {
    const { container, unmount } = render(<Pager shown={{ from: 1, to: 1 }} of={1} unit="orders" />);
    expect(container.textContent).toContain('All 1 order');
    expect(container.textContent).not.toContain('orders');
    unmount();
    const entries = render(<Pager shown={{ from: 1, to: 1 }} of={1} unit="entries" />);
    expect(entries.container.textContent).toContain('All 1 entry');
  });

  it('states a range and pages between the ends', () => {
    const { container } = render(
      <Pager
        shown={{ from: 1, to: 12 }}
        of={83}
        unit="files"
        page={1}
        pages={7}
        hrefFor={(page) => `/documents?page=${page}`}
      />,
    );
    expect(container.textContent).toContain('Showing 1–12 of 83 files');

    // At the first page, "previous" has nowhere to go — not a link at all,
    // the same way a disabled control is not a control.
    expect(screen.queryByRole('link', { name: 'Previous page' })).toBeNull();
    const next = screen.getByRole('link', { name: 'Next page' });
    expect(next.getAttribute('href')).toBe('/documents?page=2');

    const current = screen.getByRole('link', { name: '1' });
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: '2' }).getAttribute('href')).toBe('/documents?page=2');
    expect(screen.getByRole('link', { name: '7' }).getAttribute('href')).toBe('/documents?page=7');
    // The far side of the gap is reachable, and the near side is not repeated.
    expect(screen.queryByRole('link', { name: '3' })).toBeNull();
  });

  it('names what a filter excluded, with no pages to turn', () => {
    const { container } = render(<Pager shown={{ from: 1, to: 3 }} of={3} filteredFrom={53} unit="items" />);
    expect(container.textContent).toContain('Showing 1–3 of 3 items filtered from 53');
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('says "No items", never a zero-built range', () => {
    const { container } = render(<Pager shown={{ from: 0, to: 0 }} of={0} filteredFrom={53} unit="items" />);
    expect(container.textContent).toContain('No items');
    expect(container.textContent).toContain('of 53 match');
    expect(container.textContent).not.toContain('0–0');
  });

  it('reads "All N …" when the server has already declared the list complete', () => {
    const { container } = render(<Pager shown={{ from: 1, to: 6 }} of={6} unit="vendors" />);
    expect(container.textContent).toContain('All 6 vendors');
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});

describe('BulkBar', () => {
  it('is hidden at zero', () => {
    const { container } = render(
      <BulkBar count={0} clearLabel="Clear selection">
        <button type="button">Delete</button>
      </BulkBar>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('states the count, carries its actions, and offers a way out', async () => {
    const onClear = vi.fn();
    render(
      <BulkBar count={3} clearLabel="Clear selection" onClear={onClear}>
        <button type="button">Move to trade…</button>
      </BulkBar>,
    );
    expect(screen.getByRole('region', { name: '3 selected' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Move to trade…' })).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('SortableHeader', () => {
  function head(current: { key: string; dir: 'asc' | 'desc' } | null) {
    return render(
      <table>
        <thead>
          <tr>
            <SortableHeader
              label="Agreed rate"
              sortKey="rate"
              current={current}
              hrefFor={(key, dir) => `/rates?sort=${key}&dir=${dir}`}
            />
          </tr>
        </thead>
      </table>,
    );
  }

  it('unsorted: aria-sort is none, and the link asks for ascending first', () => {
    head(null);
    const th = screen.getByRole('columnheader');
    expect(th.getAttribute('aria-sort')).toBe('none');
    expect(screen.getByRole('link').getAttribute('href')).toBe('/rates?sort=rate&dir=asc');
  });

  it('ascending: aria-sort says so, and the link asks for descending next', () => {
    head({ key: 'rate', dir: 'asc' });
    expect(screen.getByRole('columnheader').getAttribute('aria-sort')).toBe('ascending');
    expect(screen.getByRole('link').getAttribute('href')).toBe('/rates?sort=rate&dir=desc');
    expect(screen.getByText('↑')).toBeDefined();
  });

  it('descending: aria-sort says so, and the link asks for ascending next', () => {
    head({ key: 'rate', dir: 'desc' });
    expect(screen.getByRole('columnheader').getAttribute('aria-sort')).toBe('descending');
    expect(screen.getByRole('link').getAttribute('href')).toBe('/rates?sort=rate&dir=asc');
    expect(screen.getByText('↓')).toBeDefined();
  });

  it('a different column stays unsorted', () => {
    head({ key: 'other', dir: 'asc' });
    expect(screen.getByRole('columnheader').getAttribute('aria-sort')).toBe('none');
  });
});

describe('Skeleton', () => {
  it('is the table itself, marked busy, with a shimmer per cell', () => {
    render(
      <Skeleton
        rows={3}
        columns={[{ label: 'Order' }, { label: 'Vendor' }, { label: 'Raised', numeric: true }, { label: 'Amount', numeric: true }]}
      />,
    );

    const table = screen.getByRole('table');
    expect(table.getAttribute('aria-busy')).toBe('true');
    // The real column names, not placeholders.
    expect(screen.getByRole('columnheader', { name: 'Order' })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toBeDefined();
    // 4 columns × 3 rows of real cells.
    expect(screen.getAllByRole('row')).toHaveLength(4); // 1 header row + 3 body rows
    expect(screen.getAllByRole('cell')).toHaveLength(12);
    // A screen reader gets told it is loading even though nothing reads "Loading" visibly-once as a heading.
    expect(screen.getAllByText('Loading…').length).toBeGreaterThan(0);
  });
});

describe('ListFrame', () => {
  it('renders every part it is given', () => {
    render(
      <ListFrame>
        <Toolbar>
          <button type="button">Filter</button>
        </Toolbar>
        <table>
          <tbody>
            <tr>
              <td>a row</td>
            </tr>
          </tbody>
        </table>
        <BulkBar count={1} clearLabel="Clear selection">
          <button type="button">Delete</button>
        </BulkBar>
        <Pager shown={{ from: 1, to: 1 }} of={1} unit="vendors" />
      </ListFrame>,
    );
    expect(screen.getByRole('button', { name: 'Filter' })).toBeDefined();
    expect(screen.getByText('a row')).toBeDefined();
    expect(screen.getByRole('region', { name: '1 selected' })).toBeDefined();
  });
});

describe('Stepper', () => {
  it('marks the current step and reaches it as an ordered list', () => {
    render(
      <Stepper
        steps={[
          { label: 'Raised', note: 'Priya N. · 3 May', state: 'done' },
          { label: 'Site engineer', state: 'now' },
          { label: 'Finance', state: 'later' },
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[1]?.getAttribute('aria-current')).toBe('step');
    expect(items[0]?.getAttribute('aria-current')).toBeNull();
    expect(items[2]?.getAttribute('aria-current')).toBeNull();
    expect(screen.getByText('Priya N. · 3 May')).toBeDefined();
  });
});

/**
 * `useRowSelection` needs a real component to run inside — there is no hook
 * test runner in this package — so a minimal table stands in for the screen
 * that would otherwise own this state.
 */
function SelectableTable({ ids, onOpen }: { ids: string[]; onOpen?: (id: string) => void }) {
  const { selected, rowProps } = useRowSelection(ids, onOpen);
  return (
    <>
      <p>{selected.size} selected</p>
      <table>
        <tbody>
          {ids.map((id) => (
            <tr key={id} {...rowProps(id)}>
              <td>{id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

describe('useRowSelection', () => {
  it('Space toggles the row that has focus', async () => {
    render(<SelectableTable ids={['a', 'b', 'c']} />);
    const rows = screen.getAllByRole('row');
    rows[0]?.focus();

    await userEvent.keyboard(' ');
    expect(rows[0]?.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('1 selected')).toBeDefined();
  });

  it('↓ moves the roving focus to the next row without selecting it', async () => {
    render(<SelectableTable ids={['a', 'b', 'c']} />);
    const rows = screen.getAllByRole('row');
    rows[0]?.focus();

    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(rows[1]);
    expect(rows[1]?.getAttribute('aria-selected')).toBe('false');
  });

  it('Shift+↓ extends the selection from where it started', async () => {
    render(<SelectableTable ids={['a', 'b', 'c']} />);
    const rows = screen.getAllByRole('row');
    rows[0]?.focus();

    await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(rows[0]?.getAttribute('aria-selected')).toBe('true');
    expect(rows[1]?.getAttribute('aria-selected')).toBe('true');
    expect(rows[2]?.getAttribute('aria-selected')).toBe('false');
  });

  it('Ctrl+A selects every row it was given', async () => {
    render(<SelectableTable ids={['a', 'b', 'c']} />);
    const rows = screen.getAllByRole('row');
    rows[1]?.focus();

    await userEvent.keyboard('{Control>}a{/Control}');
    expect(screen.getByText('3 selected')).toBeDefined();
    for (const row of rows) expect(row.getAttribute('aria-selected')).toBe('true');
  });

  it('Escape clears the selection', async () => {
    render(<SelectableTable ids={['a', 'b', 'c']} />);
    const rows = screen.getAllByRole('row');
    rows[0]?.focus();
    await userEvent.keyboard('{Control>}a{/Control}');
    expect(screen.getByText('3 selected')).toBeDefined();

    await userEvent.keyboard('{Escape}');
    expect(screen.getByText('0 selected')).toBeDefined();
  });

  it('Enter opens the focused row', async () => {
    const onOpen = vi.fn();
    render(<SelectableTable ids={['a', 'b', 'c']} onOpen={onOpen} />);
    const rows = screen.getAllByRole('row');
    rows[2]?.focus();

    await userEvent.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith('c');
  });
});

describe('Pager over a cursor window', () => {
  it('states the range and the count and links both neighbours', () => {
    const { container } = render(
      <Pager shown={{ from: 51, to: 100 }} of={250} unit="projects" prev="/projects?cursor=a&dir=before&from=1" next="/projects?cursor=b&from=101" />,
    );
    expect(container.textContent).toContain('Showing 51–100 of 250 projects');
    expect(screen.getByRole('link', { name: 'Previous page' }).getAttribute('href')).toBe('/projects?cursor=a&dir=before&from=1');
    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe('/projects?cursor=b&from=101');
  });

  it('at the last window the next arrow is not a link, and a single window reads as the whole', () => {
    const last = render(<Pager shown={{ from: 201, to: 250 }} of={250} unit="projects" prev="/projects?cursor=z&dir=before&from=151" next={null} />);
    expect(last.container.textContent).toContain('Showing 201–250 of 250 projects');
    expect(screen.queryByRole('link', { name: 'Next page' })).toBeNull();
    last.unmount();
    const only = render(<Pager shown={{ from: 1, to: 6 }} of={6} unit="projects" prev={null} next={null} />);
    expect(only.container.textContent).toContain('All 6 projects');
    expect(only.container.querySelector('nav.pages')).toBeNull();
  });
});

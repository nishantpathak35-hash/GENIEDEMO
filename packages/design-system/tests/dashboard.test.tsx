import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  AbsentPanel,
  AgeBar,
  Card,
  CardAction,
  DashGrid,
  OweCard,
  OverdueStrip,
  PeriodPicker,
  RatioBar,
  ShortfallBar,
  Tile,
} from '../src/dashboard.js';
import { Columns, Lines, Parts } from '../src/chart-grammar.js';

/**
 * The dashboard kit, rendered in every state the design draws and asserted on
 * the thing that makes each state what it is — the same convention as
 * `figures.test.tsx`. Bars and charts are `aria-hidden` or `role="img"` by
 * contract (their figures print beside them), so their widths are read off
 * the custom properties the CSS draws from: those are the only inline styles
 * in the kit, and each is a datum the server computed.
 */

describe('the card', () => {
  it('wears one header — the disc first, the title with its help line, the action last', () => {
    const { container } = render(
      <DashGrid>
        <Card title="Margin at risk" help="Raise a variation before the next order goes out." span={3} disc={{ hue: 'yellow', icon: 'margin' }} action={<CardAction href="/purchase-orders">Orders</CardAction>}>
          body
        </Card>
      </DashGrid>,
    );
    const head = container.querySelector('.card-h');
    expect(head?.firstElementChild?.classList.contains('disc')).toBe(true);
    expect(screen.getByRole('heading', { name: /Margin at risk/ })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Raise a variation before the next order goes out.' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Orders' }).getAttribute('href')).toBe('/purchase-orders');
    expect(container.querySelector('.card')?.classList.contains('c3')).toBe(true);
  });

  it('a chart card carries no disc, and a module key for the gate', () => {
    const { container } = render(
      <Card title="Pipeline" help="What is coming." span={6} module="crm">
        body
      </Card>,
    );
    expect(container.querySelector('.disc')).toBeNull();
    expect(container.querySelector('.card')?.getAttribute('data-module')).toBe('crm');
  });

  it('the period picker is two links on the address, the current one marked', () => {
    render(<PeriodPicker value="q" label="Q2 2026-27" hrefFor={(p) => `/?period=${p}`} />);
    expect(screen.getByRole('link', { name: 'Financial year to date' }).getAttribute('href')).toBe('/?period=fy');
    const q = screen.getByRole('link', { name: 'This quarter to date' });
    expect(q.getAttribute('href')).toBe('/?period=q');
    expect(q.getAttribute('aria-current')).toBe('true');
  });
});

describe('the tile', () => {
  it('prints the figure, one line of meaning, a bar, the split and the action', () => {
    const { container } = render(
      <Tile
        title="Margin at risk"
        help="h"
        span={3}
        disc={{ hue: 'yellow', icon: 'margin' }}
        figure="₹3,68,500.00"
        meaning="approved past the cost budget on KRA-01"
        bar={<ShortfallBar coveredPct={90.9} label="the cost budget against what is approved" />}
        split={[
          { label: 'Cost budget', value: '₹1,00,000.00' },
          { label: 'Overdue', value: '₹500.00', overdue: true },
        ]}
        action={<CardAction href="/purchase-orders">Orders</CardAction>}
      />,
    );
    expect(screen.getByText('₹3,68,500.00')).toBeDefined();
    expect(screen.getByText(/approved past the cost budget/)).toBeDefined();
    const covered = container.querySelector('.owe-bar .cur') as HTMLElement | null;
    expect(covered?.style.getPropertyValue('--w')).toBe('90.9%');
    expect(container.querySelector('.owe-bar .over')).not.toBeNull();
    expect(container.querySelector('.owe-split .overdue dt')?.textContent).toBe('Overdue');
    expect(container.querySelector('.foot a')?.textContent).toContain('Orders');
  });

  it('a ratio bar covers its share over a track', () => {
    const { container } = render(<RatioBar pct={42.5} label="42% of the contract ordered" />);
    expect((container.querySelector('.cur') as HTMLElement).style.getPropertyValue('--w')).toBe('42.5%');
    expect(container.querySelector('.rest')).not.toBeNull();
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('42% of the contract ordered');
  });
});

describe('the money card', () => {
  it('draws current then the overdue buckets, skips an empty bucket, and labels the overdue ones', () => {
    const { container } = render(
      <OweCard
        title="Total receivables"
        help="h"
        span={6}
        disc={{ hue: 'green', icon: 'tray' }}
        total="₹87,280.00"
        current={{ value: '₹62,500.00', pct: 71.6 }}
        buckets={[
          { label: '1–30 days', value: '₹24,780.00', pct: 28.39 },
          { label: '31–60 days', value: '₹0.00', pct: 0 },
          { label: '60+ days', value: '₹0.00', pct: 0 },
        ]}
        overduePct="28.39"
        note="3 invoices unpaid"
      />,
    );
    const segments = [...container.querySelectorAll('.owe-bar > i')];
    expect(segments.map((s) => s.className)).toEqual(['cur', 'over']);
    expect(segments.map((s) => (s as HTMLElement).style.getPropertyValue('--w'))).toEqual(['71.6%', '28.39%']);
    expect(container.querySelectorAll('.owe-split .overdue')).toHaveLength(3);
    expect(screen.getByText('₹87,280.00')).toBeDefined();
    expect(screen.getByText('3 invoices unpaid')).toBeDefined();
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('28.39% overdue');
  });

  it('the overdue strip draws the three buckets as shares of the overdue part alone', () => {
    const { container } = render(
      <OverdueStrip buckets={[{ total: '', pct: 10 }, { total: '', pct: 0 }, { total: '', pct: 30 }]} label="overdue by age" />,
    );
    const segs = [...container.querySelectorAll('.owe-bar > i')] as HTMLElement[];
    expect(segs.map((s) => s.className)).toEqual(['over', 'over']);
    expect(segs.map((s) => s.style.getPropertyValue('--w'))).toEqual(['25%', '75%']);
  });

  it('with nothing owed the bar is an empty track', () => {
    const { container } = render(<AgeBar current={{ total: '0', pct: 0 }} overdue={[]} label="nothing owed" />);
    expect([...container.querySelectorAll('.owe-bar > i')].map((s) => s.className)).toEqual(['rest']);
  });
});

describe('an absent panel', () => {
  it('says why in product words and offers one action', () => {
    render(<AbsentPanel action={<a className="button" href="/settings/tally">Connect Tally</a>}>Cash position arrives from Tally once the connector is linked.</AbsentPanel>);
    expect(screen.getByText(/Cash position arrives from Tally/)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Connect Tally' })).toBeDefined();
  });
});

describe('the chart grammar', () => {
  it('columns: every bar at its index, the hovered one with its tooltip inside the plot, the table behind a toggle', () => {
    const { container } = render(
      <Columns
        label="On site, by day"
        labels={['Mon', 'Tue', 'Wed']}
        series={[{ name: 'On site', index: [8000, null, 10000], full: ['24 on site', '—', '30 on site'] }]}
        ticks={[{ index: 5000, label: '15' }, { index: 10000, label: '30' }]}
        hover={2}
        sr="On site by day: Mon 24, Tue no report, Wed 30."
      />,
    );
    const bars = [...container.querySelectorAll('.bars > li')];
    expect(bars.map((b) => (b as HTMLElement).style.getPropertyValue('--v'))).toEqual(['80%', '0%', '100%']);
    expect(bars[1]?.querySelector('i.gap')).not.toBeNull();
    // every column carries its tooltip; the stylesheet shows the hovered one, and `hover` pins the third
    expect(container.querySelectorAll('.plot .tooltip')).toHaveLength(3);
    expect(bars[2]?.classList.contains('is-hover')).toBe(true);
    expect(bars[2]?.querySelector('.tooltip')?.textContent).toContain('30 on site');
    expect(bars[2]?.hasAttribute('data-tall')).toBe(true);
    expect(screen.getByText('On site by day: Mon 24, Tue no report, Wed 30.')).toBeDefined();
    expect(container.querySelector('.chart-table table')).not.toBeNull();
    expect(container.querySelector('.legend')).toBeNull();
  });

  it('columns: plain counts scale against the top the caller names', () => {
    const { container } = render(
      <Columns
        label="On site"
        labels={['Mon', 'Tue']}
        series={[{ name: 'On site', values: [12, null], full: ['12', '—'] }]}
        ticks={[{ index: 10000, label: '24' }]}
        max={24}
        sr="s"
      />,
    );
    const bars = [...container.querySelectorAll('.bars > li')] as HTMLElement[];
    expect(bars.map((b) => b.style.getPropertyValue('--v'))).toEqual(['50%', '0%']);
    expect(bars[1]?.querySelector('i.gap')).not.toBeNull();
  });

  it('parts: the top five in order and the rest as Other with its count', () => {
    const { container } = render(
      <Parts
        label="Ordered by trade package"
        items={[
          { name: 'Electrical', value: '₹5.00', pct: 50 },
          { name: 'Civil', value: '₹3.00', pct: 30 },
        ]}
        rest={{ count: 3, value: '₹2.00', pct: 20 }}
        sr="Ordered by trade package: Electrical ₹5.00, Civil ₹3.00, Other ₹2.00."
      />,
    );
    const segs = [...container.querySelectorAll('.plot > i')];
    expect(segs.map((s) => s.className)).toEqual(['s1', 's2', 'other']);
    expect(segs.map((s) => (s as HTMLElement).style.getPropertyValue('--w'))).toEqual(['50%', '30%', '20%']);
    expect(container.querySelector('.legend')?.textContent).toContain('Other (3)');
  });

  it('parts: nothing past the top five draws no Other', () => {
    const { container } = render(
      <Parts label="l" items={[{ name: 'Civil', value: '₹3.00', pct: 100 }]} rest={{ count: 0, value: '₹0.00', pct: 0 }} sr="s" />,
    );
    expect([...container.querySelectorAll('.plot > i')].map((s) => s.className)).toEqual(['s1']);
  });

  it('lines: two series, a legend naming both, the crosshair and tooltip at the hovered month', () => {
    const { container } = render(
      <Lines
        label="Money in and out"
        labels={['Jul', 'Aug', 'Sep']}
        series={[
          { name: 'Collected', index: [0, 10000, 5000], full: ['₹0.00', '₹1,000.00', '₹500.00'] },
          { name: 'Paid out', index: [4000, 2500, 0], full: ['₹400.00', '₹250.00', '₹0.00'] },
        ]}
        ticks={[{ index: 5000, label: '₹500' }, { index: 10000, label: '₹1,000' }]}
        hover={1}
        sr="Money in and out by month."
      />,
    );
    expect(container.querySelectorAll('polyline.line')).toHaveLength(2);
    expect(container.querySelectorAll('polyline.line.s2')).toHaveLength(1);
    // one hit area per month over the plot, each with its crosshair, two marks and a tooltip; August pinned
    const hits = [...container.querySelectorAll('.hits > .hit')];
    expect(hits).toHaveLength(3);
    expect(hits[1]?.classList.contains('is-hover')).toBe(true);
    expect(hits[1]?.querySelector('.crosshair')).not.toBeNull();
    expect(hits[1]?.querySelectorAll('.mark')).toHaveLength(2);
    const tip = hits[1]?.querySelector('.tooltip');
    expect(tip?.textContent).toContain('Aug');
    expect(tip?.textContent).toContain('Collected ₹1,000.00');
    expect(tip?.textContent).toContain('Paid out ₹250.00');
    expect(container.querySelector('.legend')?.textContent).toContain('Collected');
    expect(container.querySelector('.legend')?.textContent).toContain('Paid out');
    expect(container.querySelectorAll('line.thr')).toHaveLength(2);
  });
});

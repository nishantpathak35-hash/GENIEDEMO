import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Stat, StatRow, type StatDelta } from '../src/stat.js';
import { Hero, type HeroBar, type HeroOwner } from '../src/hero.js';
import { Sparkline, Meter, MeterList, type MeterRow } from '../src/chart.js';
import { Absent } from '../src/ui.js';

/**
 * Every design state gets a test that renders it without throwing and asserts
 * the thing that makes that state that state — never markup or class names,
 * with two stated exceptions. `Sparkline` is `aria-hidden` by contract (the
 * figure it sits beside carries the meaning), so its threshold/band/marker
 * behaviour can only be observed through the SVG structure; `Meter`'s track,
 * fill, threshold tick and overrun band are the same kind of purely visual,
 * non-semantic mark. Both are read with `container.querySelector`, the same
 * pattern `tests/form.test.tsx` already uses to assert a notice is ABSENT.
 */

const UP: StatDelta = { direction: 'up', figure: '₹12,40,000.00', period: 'this week' };

describe('Stat', () => {
  it('a figure with an up delta reads direction, magnitude and period', () => {
    render(<Stat label="Ordered so far" value="₹10,44,61,700.00" delta={UP} />);
    expect(screen.getByText('Ordered so far')).toBeDefined();
    expect(screen.getByText('₹10,44,61,700.00')).toBeDefined();
    expect(screen.getByText(/↑\s*₹12,40,000.00/)).toBeDefined();
    expect(screen.getByText('this week')).toBeDefined();
  });

  it('a down delta and a flat delta both render, arrow only on up/down', () => {
    const { unmount } = render(
      <Stat label="Cash" value="-₹15,75,000.00" delta={{ direction: 'down', figure: '₹3,00,000.00', period: 'this week' }} />,
    );
    expect(screen.getByText(/↓\s*₹3,00,000.00/)).toBeDefined();
    unmount();

    render(<Stat label="Pipeline" value="₹9,78,10,000.00" delta={{ direction: 'flat', figure: '₹31,06,00,000.00', period: 'unweighted' }} />);
    // No arrow character for 'flat' — the figure text starts with the rupee sign itself.
    expect(screen.getByText('₹31,06,00,000.00').textContent?.startsWith('₹')).toBe(true);
  });

  it('watch is neutral, not a colour on small text — the caution signal is `next`, an amber pill', () => {
    render(
      <Stat
        label="Margin at risk"
        value="₹25,91,200.00"
        delta={{ direction: 'watch', figure: '2 projects', period: 'committed past budget' }}
        next="Renegotiate, or raise a variation"
      />,
    );
    expect(screen.getByText('Renegotiate, or raise a variation')).toBeDefined();
    expect(screen.getByText('2 projects')).toBeDefined();
  });

  it('note and next can both be present, independently of each other', () => {
    render(<Stat label="Reports you owe" value="1" note="not filed since Friday" next="Chase it" />);
    expect(screen.getByText('not filed since Friday')).toBeDefined();
    expect(screen.getByText('Chase it')).toBeDefined();
  });

  it('text renders the value in the text face, so a word never impersonates a number', () => {
    render(<Stat label="Money" text value="After setup" />);
    expect(screen.getByText('After setup')).toBeDefined();
  });

  it('Absent is a valid value — a dash with a reason, never a claimed zero', () => {
    render(<Stat label="Margin" value={<Absent why="Two lines have no cost rate yet" />} />);
    expect(screen.getByTitle('Two lines have no cost rate yet')).toBeDefined();
    expect(screen.getByText('—')).toBeDefined();
  });

  it('mini renders the same content in the compact, drawer variant', () => {
    render(<Stat label="Compact" value="₹18,40,600.00" mini />);
    expect(screen.getByText('Compact')).toBeDefined();
    expect(screen.getByText('₹18,40,600.00')).toBeDefined();
  });

  it('a sparkline slot renders whatever is passed to it', () => {
    render(<Stat label="Ordered so far" value="₹1" spark={<Sparkline values={[1, 2, 3]} />} />);
    expect(document.querySelector('svg.spark')).not.toBeNull();
  });
});

describe('StatRow', () => {
  it('of 3 renders all three children', () => {
    render(
      <StatRow n={3}>
        <Stat label="One" value="1" />
        <Stat label="Two" value="2" />
        <Stat label="Three" value="3" />
      </StatRow>,
    );
    expect(screen.getByText('One')).toBeDefined();
    expect(screen.getByText('Two')).toBeDefined();
    expect(screen.getByText('Three')).toBeDefined();
  });

  it('of 4 renders all four children', () => {
    render(
      <StatRow n={4}>
        <Stat label="One" value="1" />
        <Stat label="Two" value="2" />
        <Stat label="Three" value="3" />
        <Stat label="Four" value="4" />
      </StatRow>,
    );
    expect(screen.getAllByText(/^(One|Two|Three|Four)$/)).toHaveLength(4);
  });
});

describe('Hero', () => {
  it('is exactly one region, named by ariaLabel, holding the figure and the sentence', () => {
    render(
      <Hero
        eyebrow="This morning"
        value="₹36,85,000.00"
        sentence="Held by 3 approvals."
        actions={<button type="button">Open all 3</button>}
        ariaLabel="This morning · Monday 15 September"
      />,
    );
    const region = screen.getByRole('region', { name: 'This morning · Monday 15 September' });
    expect(region).toBeDefined();
    expect(screen.getByText('₹36,85,000.00')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Open all 3' })).toBeDefined();
  });

  it('an owners row names who is who, avatar initial included', () => {
    const owners: ReadonlyArray<HeroOwner> = [{ initial: 'R', name: 'Rahul', role: 'finance' }];
    render(
      <Hero
        eyebrow="This morning"
        value="₹1"
        sentence="…"
        actions={<button type="button">Go</button>}
        owners={owners}
        ariaLabel="Test hero"
      />,
    );
    expect(screen.getByText('Rahul')).toBeDefined();
    expect(screen.getByText('finance')).toBeDefined();
    expect(screen.getByText('R')).toBeDefined();
  });

  it('without a bar, no bar row is rendered at all', () => {
    const { container } = render(
      <Hero eyebrow="e" value="v" sentence="s" actions={<button type="button">Go</button>} ariaLabel="No bar" />,
    );
    expect(container.querySelector('.hbarwrap')).toBeNull();
  });

  it('a watch hero with a bar carries the fill, the threshold position and the labels', () => {
    const bar: HeroBar = {
      pct: 88,
      thresholdPct: 85,
      left: '₹3,74,00,000.00 ordered',
      right: '₹4,25,00,000.00 contract',
      thresholdLabel: '85% watch line',
    };
    const { container } = render(
      <Hero
        eyebrow="ARAV-01"
        value="88%"
        sentence="Ordered against contract."
        actions={<button type="button">Open</button>}
        bar={bar}
        ariaLabel="ARAV-01 progress"
      />,
    );
    expect(screen.getByText('85% watch line')).toBeDefined();
    expect(screen.getByText('₹3,74,00,000.00 ordered')).toBeDefined();
    const fill = container.querySelector('.hbar > i') as HTMLElement | null;
    const tick = container.querySelector('.hbar > b') as HTMLElement | null;
    expect(fill?.style.getPropertyValue('--w')).toBe('88%');
    expect(tick?.style.getPropertyValue('--x')).toBe('85%');
  });

  it('a bar over 100% draws the overrun band from the same crossing point', () => {
    const bar: HeroBar = {
      pct: 112,
      thresholdPct: 85,
      overPct: 12,
      left: 'ordered',
      right: 'contract',
      thresholdLabel: '85%',
    };
    const { container } = render(
      <Hero eyebrow="e" value="v" sentence="s" actions={<button type="button">Go</button>} bar={bar} ariaLabel="Over" />,
    );
    const band = container.querySelector('.hbar > em') as HTMLElement | null;
    expect(band).not.toBeNull();
    // Fill is capped at 100 — the overrun is drawn as the band, not as a fill wider than its track.
    const fill = container.querySelector('.hbar > i') as HTMLElement | null;
    expect(fill?.style.getPropertyValue('--w')).toBe('100%');
    expect(band?.style.getPropertyValue('--x')).toBe('100%');
    expect(band?.style.getPropertyValue('--o')).toBe('12%');
  });
});

describe('Sparkline', () => {
  it('with no threshold: only the area, the line and the end point — no band, no marker, no rule', () => {
    const { container } = render(<Sparkline values={[1, 2, 3, 4, 5, 6, 7, 8]} />);
    expect(container.querySelector('svg.spark')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.line')).not.toBeNull();
    expect(container.querySelector('.end')).not.toBeNull();
    expect(container.querySelector('.thr')).toBeNull();
    expect(container.querySelector('.band')).toBeNull();
    expect(container.querySelector('.cross')).toBeNull();
  });

  it('a threshold that is never crossed still draws the rule, but no band and no diamond', () => {
    const { container } = render(<Sparkline values={[1, 2, 3, 4, 5, 6, 7, 8]} threshold={20} />);
    expect(container.querySelector('.thr')).not.toBeNull();
    expect(container.querySelector('.band')).toBeNull();
    expect(container.querySelector('.cross')).toBeNull();
    // The end point is on the good side, so it keeps the plain ring-ended dot.
    expect(container.querySelector('.end')).not.toBeNull();
  });

  it('a threshold that is crossed draws the rule, the band and a diamond at the crossing', () => {
    const { container } = render(<Sparkline values={[1, 2, 8, 2, 9, 3, 10, 12]} threshold={5} />);
    expect(container.querySelector('.thr')).not.toBeNull();
    expect(container.querySelector('.band')).not.toBeNull();
    expect(container.querySelector('.cross')).not.toBeNull();
    // The series ends above the threshold (12 > 5): the end point's own marker becomes the
    // diamond (PointMarker's `bad` branch), so there is no separate ring-dot left for it.
    expect(container.querySelector('.end')).toBeNull();
  });

  it('`above: false` marks the floor side as out of tolerance instead of the ceiling', () => {
    const { container } = render(<Sparkline values={[10, 9, 2, 8, 3, 9, 4, 9]} threshold={5} above={false} />);
    expect(container.querySelector('.band')).not.toBeNull();
    expect(container.querySelector('.cross')).not.toBeNull();
    // Ends at 9, above the floor of 5 — not bad, so the end keeps its plain ring-dot even
    // though the line dipped below the floor (and was marked with a diamond) earlier.
    expect(container.querySelector('.end')).not.toBeNull();
  });
});

describe('Meter', () => {
  it('under threshold: a track, a fill, a threshold tick — no band, no point', () => {
    const { container } = render(<Meter pct={40} thresholdPct={70} />);
    expect(container.querySelector('.track')).not.toBeNull();
    expect((container.querySelector('.fill') as HTMLElement).style.getPropertyValue('--w')).toBe('40%');
    expect((container.querySelector('.thr') as HTMLElement).style.getPropertyValue('--x')).toBe('70%');
    expect(container.querySelector('.band')).toBeNull();
    expect(container.querySelector('.point')).toBeNull();
  });

  it('past threshold: the fill passes the tick, still no band or point', () => {
    const { container } = render(<Meter pct={90} thresholdPct={70} />);
    expect((container.querySelector('.fill') as HTMLElement).style.getPropertyValue('--w')).toBe('90%');
    expect(container.querySelector('.band')).toBeNull();
  });

  it('over contract: the fill caps at 100%, and the run past it is a band with a point at the crossing', () => {
    const { container } = render(<Meter pct={100} thresholdPct={70} overPct={15} />);
    expect((container.querySelector('.fill') as HTMLElement).style.getPropertyValue('--w')).toBe('100%');
    const band = container.querySelector('.band') as HTMLElement;
    const point = container.querySelector('.point') as HTMLElement;
    expect(band.style.getPropertyValue('--x')).toBe('100%');
    expect(band.style.getPropertyValue('--o')).toBe('15%');
    expect(point.style.getPropertyValue('--x')).toBe('100%');
  });

  it('no contract value: no threshold tick, fill at whatever was given', () => {
    const { container } = render(<Meter pct={0} />);
    expect(container.querySelector('.thr')).toBeNull();
    expect(container.querySelector('.band')).toBeNull();
    expect((container.querySelector('.fill') as HTMLElement).style.getPropertyValue('--w')).toBe('0%');
  });
});

describe('MeterList', () => {
  const legend: ReadonlyArray<{ key: 'contract' | 'ordered' | 'over' | 'crossed' | 'threshold'; label: string }> = [
    { key: 'contract', label: 'Contract' },
    { key: 'ordered', label: 'Ordered so far' },
    { key: 'over', label: 'Past the contract' },
    { key: 'crossed', label: 'where it crossed' },
    { key: 'threshold', label: '85% watch line' },
  ];

  const rows: ReadonlyArray<MeterRow> = [
    { id: 'NEEL-01', label: 'NEEL-01', pct: 73.5, thresholdPct: 85, value: '₹3,12,40,500.00' },
    { id: 'ARAV-01', label: 'ARAV-01', pct: 88.2, thresholdPct: 85, value: '₹1,58,72,300.00' },
    { id: 'VAYU-01', label: 'VAYU-01', pct: 100, thresholdPct: 85, overPct: 8, value: '₹43,18,900.00' },
    { id: 'ASTA-01', label: 'ASTA-01', pct: 0, thresholdPct: 85, value: '₹0.00' },
    { id: 'SURY-01', label: 'SURY-01', pct: 58.6, thresholdPct: 85, value: '₹5,04,25,000.00' },
    {
      id: 'TARA-01',
      label: 'TARA-01',
      pct: 0,
      value: <Absent why="No contract value entered yet" />,
      note: 'no contract value yet',
    },
  ];

  it('renders one row per project, plus the legend, plus a text summary for the whole chart', () => {
    render(
      <MeterList
        rows={rows}
        legend={legend}
        summary="NEEL-01: ₹3,12,40,500.00 ordered of ₹4,25,00,000.00."
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    for (const label of ['NEEL-01', 'ARAV-01', 'VAYU-01', 'ASTA-01', 'SURY-01', 'TARA-01']) {
      expect(screen.getByText(label)).toBeDefined();
    }
    for (const item of legend) {
      expect(screen.getByText(item.label)).toBeDefined();
    }
    // The summary is visually hidden (`.sr-only`), not absent from the accessible tree.
    expect(screen.getByText('NEEL-01: ₹3,12,40,500.00 ordered of ₹4,25,00,000.00.')).toBeDefined();
  });

  it('the over-contract row carries a band and a point; the no-contract row carries neither', () => {
    const { container } = render(<MeterList rows={rows} legend={legend} summary="…" />);
    const items = container.querySelectorAll('.meter-list > li');
    const vant = items[2] as HTMLElement;
    const harb = items[5] as HTMLElement;
    expect(vant.querySelector('.band')).not.toBeNull();
    expect(vant.querySelector('.point')).not.toBeNull();
    expect(harb.querySelector('.band')).toBeNull();
    expect(harb.querySelector('.thr')).toBeNull();
    expect(harb.textContent).toContain('no contract value yet');
  });
});

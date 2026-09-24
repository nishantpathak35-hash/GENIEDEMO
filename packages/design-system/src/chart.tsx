import type { CSSProperties, ReactNode } from 'react';

/**
 * Charts, drawn as inline SVG, and the one rule that governs every mark in
 * them.
 *
 * **A line is never coloured by condition.** A series carries identity in
 * `--series-1/2/3`, assigned in fixed order and never cycled — a lone series
 * is always `--series-1`. The exception is drawn, not recoloured: a
 * `--chart-band` fill over the out-of-tolerance region, a neutral dashed
 * `--chart-threshold` rule where the limit is, a `--chart-point-bad` DIAMOND
 * at the point it was crossed, and words. Three channels — area, dash, shape
 * — so the meaning survives without hue. Nothing in this file may reference
 * `--ok`, `--warn`, `--bad`, `--waiting`, `--accent` or an `-soft` fill —
 * `tests/chart-isolation.test.ts` asserts it by reading this file as text.
 *
 * The primitives below take numbers in the chart's own coordinate space —
 * nothing here scales a value, and nothing here is money. `Sparkline` and
 * `Meter` are built from them and are what a screen normally reaches for;
 * the primitives are exported so a screen can compose a chart the design
 * does not show, without re-deriving the geometry.
 */

export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

/** The series line itself. Colour is `--series-1` from CSS, never a prop. */
export function Line({ points }: { points: ReadonlyArray<ChartPoint> }): ReactNode {
  return <polyline className="line" points={pointsAttr(points)} />;
}

/**
 * The fill under the line, down to `baseline`. Renders nothing for fewer
 * than two points — an area under one point, or none, is not a shape.
 */
export function Area({
  points,
  baseline,
}: {
  points: ReadonlyArray<ChartPoint>;
  baseline: number;
}): ReactNode {
  const ends = firstAndLast(points);
  if (ends === undefined) return null;
  const { first, last } = ends;
  const d = `M${first.x},${baseline} L${points.map((p) => `${p.x},${p.y}`).join(' L')} L${last.x},${baseline} Z`;
  return <path className="area" d={d} />;
}

/**
 * The neutral dashed rule marking where a limit is. Spans the chart's full
 * width regardless of its coordinate space (`x1`/`x2` are percentages), so a
 * caller only ever supplies the one number that varies: where the limit
 * falls on the value axis.
 */
export function Threshold({ y }: { y: number }): ReactNode {
  return <line className="thr" x1="0%" x2="100%" y1={y} y2={y} />;
}

/** A fill over the region between `from` and `to` — the out-of-tolerance side. */
export function Band({ from, to }: { from: number; to: number }): ReactNode {
  return <rect className="band" x="0%" width="100%" y={Math.min(from, to)} height={Math.abs(to - from)} />;
}

/**
 * A point marker: the ring-ended dot a series line normally ends in, or —
 * when `bad` — the diamond that marks a genuine crossing. One or the other,
 * never both: a point that ends on the out-of-tolerance side gets the
 * diamond in place of its dot, because the diamond already says "this is
 * where it went wrong" and a second, differently-shaped mark at the same
 * coordinate would not add information, only clutter.
 */
export function PointMarker({ x, y, bad }: { x: number; y: number; bad?: boolean }): ReactNode {
  if (bad === true) {
    const half = 2.6;
    return (
      <rect
        className="cross"
        x={x - half}
        y={y - half}
        width={half * 2}
        height={half * 2}
        transform={`rotate(45 ${x} ${y})`}
      />
    );
  }
  return <circle className="end" cx={x} cy={y} r={3.2} />;
}

/** Text beside a point, in `--ink-soft` at `--font-size-body-small`. Never the only carrier of a fact. */
export function Annotation({ x, y, children }: { x: number; y: number; children: ReactNode }): ReactNode {
  return (
    <text className="annotation" x={x} y={y}>
      {children}
    </text>
  );
}

function pointsAttr(points: ReadonlyArray<ChartPoint>): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

function firstAndLast<T>(xs: ReadonlyArray<T>): { first: T; last: T } | undefined {
  const first = xs[0];
  const last = xs[xs.length - 1];
  return first === undefined || last === undefined ? undefined : { first, last };
}

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

const SPARK_WIDTH = 96;
const SPARK_HEIGHT = 36;
const PAD_X = 2;
const Y_TOP = 5;
const Y_BOTTOM = 35;

/**
 * Eight points, no axes, one tone — a trend, never a judgement.
 *
 * `values` are plain numbers **already scaled by the caller**: ratios,
 * counts, an index against a baseline — never money, and never a wire
 * string. A sparkline that took a `Money` prop would be a second place money
 * gets formatted, and this package has exactly one.
 *
 * Without `threshold` this draws only the area, the line and the end point —
 * no band, no marker, no rule, because there is nothing here to be out of
 * tolerance with. With `threshold`, the dashed rule always renders; the band
 * and the crossing diamonds render only once a value has actually been on
 * the out-of-tolerance side (a threshold shown but never touched draws the
 * rule alone, exactly as `00-foundations.html`'s "Margin at risk" sample
 * does). `above` names which side is out of tolerance — a ceiling that must
 * not be exceeded (the default) or a floor that must not be dropped below —
 * and the end point itself is marked `bad` when the series ends on that
 * side, independently of whether a mid-line crossing was also drawn.
 */
export function Sparkline({
  values,
  threshold,
  above = true,
}: {
  values: ReadonlyArray<number>;
  threshold?: number;
  above?: boolean;
}): ReactNode {
  const n = values.length;
  const xAt = (i: number): number =>
    n <= 1 ? SPARK_WIDTH / 2 : PAD_X + (i * (SPARK_WIDTH - 2 * PAD_X)) / (n - 1);

  const domain = threshold === undefined ? values : [...values, threshold];
  const domainMin = Math.min(...domain);
  const domainMax = Math.max(...domain);
  const span = domainMax - domainMin;
  const yAt = (v: number): number =>
    span === 0 ? (Y_TOP + Y_BOTTOM) / 2 : Y_BOTTOM - ((v - domainMin) / span) * (Y_BOTTOM - Y_TOP);

  const points = values.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
  const last = points[points.length - 1];
  const lastValue = values[values.length - 1];

  const svgProps = {
    className: 'spark',
    viewBox: `0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`,
    width: SPARK_WIDTH,
    height: SPARK_HEIGHT,
    'aria-hidden': 'true',
    focusable: 'false',
  } as const;

  if (last === undefined || lastValue === undefined) {
    // No values: nothing to draw, but still a well-formed (empty) figure.
    return <svg {...svgProps} />;
  }

  const isBad = (v: number): boolean => threshold !== undefined && (above ? v > threshold : v < threshold);
  const thresholdY = threshold === undefined ? undefined : yAt(threshold);
  const anyBad = threshold !== undefined && values.some(isBad);
  const crossings =
    threshold === undefined || thresholdY === undefined
      ? []
      : crossingPoints(values, points, threshold, isBad, thresholdY);

  return (
    <svg {...svgProps}>
      <Area points={points} baseline={Y_BOTTOM} />
      {anyBad && thresholdY !== undefined
        ? above
          ? <Band from={Y_TOP} to={thresholdY} />
          : <Band from={thresholdY} to={Y_BOTTOM} />
        : null}
      {thresholdY === undefined ? null : <Threshold y={thresholdY} />}
      {anyBad ? crossings.map((c, i) => <PointMarker key={i} x={c.x} y={c.y} bad />) : null}
      <Line points={points} />
      <PointMarker x={last.x} y={last.y} bad={isBad(lastValue)} />
    </svg>
  );
}

/** Where a polyline crosses the threshold value, by linear interpolation between the two points. */
function crossingPoints(
  values: ReadonlyArray<number>,
  points: ReadonlyArray<ChartPoint>,
  threshold: number,
  isBad: (v: number) => boolean,
  thresholdY: number,
): ReadonlyArray<ChartPoint> {
  const out: ChartPoint[] = [];
  for (let i = 1; i < values.length; i += 1) {
    const v0 = values[i - 1];
    const v1 = values[i];
    const p0 = points[i - 1];
    const p1 = points[i];
    if (v0 === undefined || v1 === undefined || p0 === undefined || p1 === undefined) continue;
    if (v1 === v0 || isBad(v0) === isBad(v1)) continue;
    const t = (threshold - v0) / (v1 - v0);
    out.push({ x: p0.x + t * (p1.x - p0.x), y: thresholdY });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Meter / MeterList
// ---------------------------------------------------------------------------

/**
 * A bar with a `--track`, a fill in `--series-1`, an optional threshold tick,
 * and — once the fill would exceed the track — the run past it as a
 * `--chart-band` segment with a `--chart-point-bad` diamond at the crossing.
 *
 * The numbers are already-computed percentages from the server, all in the
 * ROW's units: `pct` is the fill, `thresholdPct` the tick, `overPct` the extra
 * width of the run past the track, and `trackPct` the track itself — the
 * design's "ordered against contract by project" draws every contract to one
 * scale, so the biggest contract's track fills its row and a smaller one is
 * shorter, and the fills are comparable across rows. Left out, the track is
 * the whole row and `pct` is against it. This component divides nothing; a
 * caller that wants "no contract value yet" passes `pct={0}` and puts the
 * reason in the value it renders beside the bar (`Absent`), not in a prop
 * here.
 *
 * Widths are the only inline styles, and every one is a custom property
 * (`--w`, `--x`, `--o`) rather than a literal `width`/`left`, so the CSS —
 * not this file — owns every colour and dimension that is not a datum.
 */
export function Meter({
  pct,
  thresholdPct,
  overPct,
  trackPct,
}: {
  pct: number;
  thresholdPct?: number;
  overPct?: number;
  trackPct?: number;
}): ReactNode {
  const fillPct = Math.min(pct, trackPct ?? 100);
  return (
    <div className="meter">
      <div
        className="track"
        {...(trackPct === undefined ? {} : { style: { '--t': `${trackPct}%` } as CSSProperties })}
      />
      {thresholdPct === undefined ? null : (
        <div className="thr" style={{ '--x': `${thresholdPct}%` } as CSSProperties} />
      )}
      <div className="fill" style={{ '--w': `${fillPct}%` } as CSSProperties} />
      {overPct === undefined || overPct <= 0 ? null : (
        <>
          <div className="band" style={{ '--x': `${fillPct}%`, '--o': `${overPct}%` } as CSSProperties} />
          <div className="point" style={{ '--x': `${fillPct}%` } as CSSProperties} />
        </>
      )}
    </div>
  );
}

/** The keys the legend can name, mapped to the swatch classes `.chart .legend i` already carries. */
export type MeterLegendKey = 'ordered' | 'contract' | 'over' | 'crossed' | 'threshold';

const LEGEND_ICON: Record<MeterLegendKey, string | undefined> = {
  ordered: undefined,
  contract: 'track',
  over: 'over',
  crossed: 'point',
  threshold: 'thr',
};

export interface MeterRow {
  readonly id: string;
  readonly label: ReactNode;
  readonly sub?: string;
  readonly pct: number;
  readonly thresholdPct?: number;
  readonly overPct?: number;
  readonly trackPct?: number;
  readonly value: ReactNode;
  readonly note?: ReactNode;
}

/**
 * "Ordered against contract, by project" — a legend, a row of Meters, and a
 * visually-hidden `summary` sentence, so the chart has a text equivalent
 * rather than a picture nobody who cannot see it can act on.
 */
export function MeterList({
  rows,
  legend,
  summary,
}: {
  rows: ReadonlyArray<MeterRow>;
  legend: ReadonlyArray<{ key: MeterLegendKey; label: string }>;
  summary: string;
}): ReactNode {
  return (
    <div className="chart">
      <p className="sr-only">{summary}</p>
      <p className="legend">
        {legend.map((item) => {
          const iconClass = LEGEND_ICON[item.key];
          return (
            <span key={item.key}>
              <i className={iconClass} aria-hidden="true" />
              {item.label}
            </span>
          );
        })}
      </p>
      <ul className="meter-list">
        {rows.map((row) => (
          <li key={row.id}>
            <div className="who">
              <b>{row.label}</b>
              {row.sub === undefined ? null : <small title={row.sub}>{row.sub}</small>}
            </div>
            <Meter
              pct={row.pct}
              {...(row.thresholdPct === undefined ? {} : { thresholdPct: row.thresholdPct })}
              {...(row.overPct === undefined ? {} : { overPct: row.overPct })}
              {...(row.trackPct === undefined ? {} : { trackPct: row.trackPct })}
            />
            <div className="val num">
              {row.value}
              {row.note === undefined ? null : <small>{row.note}</small>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

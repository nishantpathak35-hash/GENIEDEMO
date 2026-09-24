import type { CSSProperties, ReactNode } from 'react';

/**
 * The chart grammar (19 September 2026): columns, part-to-whole, two lines
 * (`docs/design/build/charts.mjs`).
 *
 * One grammar for the dashboard's charts: every chart is the sentence for
 * whoever cannot see it, the plot, the x labels, a legend for two or more
 * series, and the same figures as a table behind a toggle. Every mark's
 * position is a number the server already scaled — an index in basis points
 * of the plot's largest value — so nothing here divides money, and every
 * colour is a series token from the chart set: `tests/chart-isolation.test.ts`
 * reads this file as text and holds it to that, the same as `chart.tsx`.
 */

/** The same figures as numbers, behind a toggle — the design's `tableView`. */
export function ChartTable({
  head,
  rows,
  label = 'Table view',
}: {
  head: ReadonlyArray<string>;
  rows: ReadonlyArray<ReadonlyArray<ReactNode>>;
  label?: string;
}): ReactNode {
  return (
    <details className="chart-table">
      <summary>{label}</summary>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={h} {...(i > 0 ? { className: 'num' } : {})}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci} {...(ci > 0 ? { className: 'num' } : {})}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export interface ColumnSeries {
  readonly name: string;
  /**
   * Each column's height as basis points of the plot's top, 0–10000; `null`
   * draws a gap. Given as `index` when the server scaled a money series, or
   * as plain `values` with the chart's `max` when the figures are counts —
   * head counts, days — which this component scales itself, because a count
   * is not money and a page hands over numbers, never arithmetic.
   */
  readonly index?: ReadonlyArray<number | null>;
  readonly values?: ReadonlyArray<number | null>;
  /** The full figure each column stands for, as the tooltip and the table print it. */
  readonly full: ReadonlyArray<ReactNode>;
}

const pct = (index: number | null | undefined): string => `${String((index ?? 0) / 100)}%`;

/** A series' index at `i`, from the server's index or from a count against `max`. */
function indexAt(s: ColumnSeries, i: number, max: number | undefined): number | null {
  if (s.index !== undefined) return s.index[i] ?? null;
  const v = s.values?.[i];
  if (v === null || v === undefined) return null;
  if (max === undefined || max <= 0 || v <= 0) return 0;
  return Math.min(10000, Math.floor((v * 10000) / max));
}

/**
 * Columns on one axis: one series, or two grouped. `ticks` are the axis
 * lines, each at its index with the label it prints. Every column carries its
 * tooltip, inside the plot, shown under the pointer by the stylesheet alone —
 * a server-rendered page needs no script for it — and `hover` pins one open,
 * for a specimen. `short` halves the plot's height for a panel that carries a
 * list beneath.
 */
export function Columns({
  label,
  labels,
  series,
  ticks,
  max,
  hover,
  short,
  sr,
}: {
  label: string;
  labels: ReadonlyArray<string>;
  series: ReadonlyArray<ColumnSeries>;
  ticks: ReadonlyArray<{ readonly index: number; readonly label: string }>;
  /** The plot's top for a series given as `values`. */
  max?: number;
  hover?: number;
  short?: boolean;
  /** The sentence for whoever cannot see it. */
  sr: string;
}): ReactNode {
  return (
    <figure className={short === true ? 'chart bars short' : 'chart bars'}>
      <p className="sr-only">{sr}</p>
      <div className="plot" aria-hidden="true">
        <div className="grid">
          {ticks.map((t) => (
            <span key={t.index} style={{ '--v': pct(t.index) } as CSSProperties}>
              <b>{t.label}</b>
            </span>
          ))}
          <span className="axis" style={{ '--v': '0%' } as CSSProperties}>
            <b>0</b>
          </span>
        </div>
        <ol className="bars">
          {labels.map((l, i) => {
            const top = Math.max(...series.map((s) => indexAt(s, i, max) ?? 0));
            const hovered = hover === i;
            return (
              <li
                key={l}
                {...(hovered ? { className: 'is-hover' } : {})}
                {...(top > 7200 ? { 'data-tall': '' } : {})}
                style={{ '--v': pct(top) } as CSSProperties}
              >
                {series.map((s, k) => {
                  const v = indexAt(s, i, max);
                  return v === null ? (
                    <i key={s.name} className="gap" />
                  ) : (
                    <i key={s.name} className={k === 0 ? 's1' : 's2'} style={{ '--v': pct(v) } as CSSProperties} />
                  );
                })}
                <span className="tooltip" role="tooltip">
                  {l}
                  {series.map((s) => (
                    <span key={s.name}>
                      {' · '}
                      {series.length > 1 ? `${s.name} ` : ''}
                      {s.full[i]}
                    </span>
                  ))}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <ol className="x" aria-hidden="true">
        {labels.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ol>
      {series.length > 1 ? (
        <p className="legend">
          {series.map((s, k) => (
            <span key={s.name}>
              <i className={k === 0 ? 's1' : 's2'} aria-hidden="true" />
              {s.name}
            </span>
          ))}
        </p>
      ) : null}
      <ChartTable
        head={[label, ...series.map((s) => s.name)]}
        rows={labels.map((l, i) => [l, ...series.map((s) => s.full[i] ?? '—')])}
      />
    </figure>
  );
}

/**
 * Part-to-whole: one horizontal bar of segments — the top five and the rest
 * — the values in the legend. Each segment's width is the server's share.
 */
export function Parts({
  label,
  items,
  rest,
  sr,
}: {
  label: string;
  items: ReadonlyArray<{ readonly name: string; readonly value: ReactNode; readonly pct: number }>;
  /** Everything past the top five as one; `count` is how many it folds. */
  rest?: { readonly count: number; readonly value: ReactNode; readonly pct: number };
  sr: string;
}): ReactNode {
  const all = [
    ...items.map((it, i) => ({ ...it, cls: `s${String(i + 1)}`, count: 0 })),
    ...(rest !== undefined && rest.count > 0
      ? [{ name: 'Other', value: rest.value, pct: rest.pct, cls: 'other', count: rest.count }]
      : []),
  ];
  return (
    <figure className="chart parts">
      <p className="sr-only">{sr}</p>
      <div className="plot" aria-hidden="true">
        {all.map((s) => (
          <i key={s.name} className={s.cls} style={{ '--w': `${String(s.pct)}%` } as CSSProperties} />
        ))}
      </div>
      <ul className="legend list" aria-hidden="true">
        {all.map((s) => (
          <li key={s.name}>
            <span>
              <i className={s.cls} />
              {s.name}
              {s.count > 0 ? <small> ({s.count})</small> : null}
            </span>
            <b>{s.value}</b>
          </li>
        ))}
      </ul>
      <ChartTable head={[label, 'Value', 'Share']} rows={all.map((s) => [s.name, s.value, `${String(s.pct)}%`])} />
    </figure>
  );
}

const LINES_W = 520;
const LINES_H = 140;

export interface LineSeries {
  readonly name: string;
  /** Each point as basis points of the plot's top, 0–10000. */
  readonly index: ReadonlyArray<number>;
  /** The full figure at each point, as the tooltip and the table print it. */
  readonly full: ReadonlyArray<ReactNode>;
}

/**
 * Two series on one line chart, by month: a line each in the categorical
 * order, a marker per point with the surface ring, no area, a legend naming
 * both, and the crosshair through the hovered month with both figures in the
 * tooltip. `ticks` are the axis, each at its index. The months are hit areas
 * over the plot, each carrying its crosshair and tooltip for the stylesheet
 * to show under the pointer; `hover` pins one open, for a specimen.
 */
export function Lines({
  label,
  labels,
  series,
  ticks,
  hover,
  sr,
}: {
  label: string;
  labels: ReadonlyArray<string>;
  series: ReadonlyArray<LineSeries>;
  ticks: ReadonlyArray<{ readonly index: number; readonly label: string }>;
  hover?: number;
  sr: string;
}): ReactNode {
  const n = labels.length;
  const x = (i: number): number => (n <= 1 ? LINES_W / 2 : (i / (n - 1)) * (LINES_W - 4) + 2);
  const y = (index: number): number => LINES_H - 3 - (index / 10000) * (LINES_H - 8);
  const cls = (k: number): string => (k === 0 ? 's1' : 's2');
  // the tooltip for month i: at the higher of its two points, hung from the
  // point's side in the outer thirds and under it near the top, as the design
  const tip = (i: number): { x: number; y: number; edge: string } => {
    const px = x(i);
    const py = Math.min(...series.map((s) => y(s.index[i] ?? 0)));
    const edge = `${px < LINES_W * 0.3 ? ' first' : px > LINES_W * 0.7 ? ' last' : ''}${py < LINES_H * 0.3 ? ' below' : ''}`;
    return { x: px, y: py, edge };
  };
  return (
    <figure className="chart lines">
      <p className="sr-only">{sr}</p>
      <div className="plot">
        <svg
          className="spark lines"
          viewBox={`0 0 ${String(LINES_W)} ${String(LINES_H)}`}
          aria-hidden="true"
          focusable="false"
        >
          {ticks.map((t) => (
            <line key={t.index} className="thr" x1="0" x2={LINES_W} y1={y(t.index)} y2={y(t.index)} />
          ))}
          {series.map((s, k) => (
            <g key={s.name}>
              <polyline
                className={`line ${cls(k)}`}
                points={s.index.map((v, i) => `${String(x(i))},${String(y(v))}`).join(' ')}
              />
              {s.index.map((v, i) => (
                <circle key={i} className={`dot ${cls(k)}`} cx={x(i)} cy={y(v)} r={4} />
              ))}
            </g>
          ))}
        </svg>
        <ol className="hits" aria-hidden="true">
          {labels.map((l, i) => {
            const t = tip(i);
            return (
              <li
                key={l}
                {...(hover === i ? { className: 'hit is-hover' } : { className: 'hit' })}
                style={{ '--x': `${String((t.x / LINES_W) * 100)}%` } as CSSProperties}
              >
                <i className="crosshair" />
                {series.map((s, k) => (
                  <i
                    key={s.name}
                    className={`mark ${cls(k)}`}
                    style={{ '--y': `${String((y(s.index[i] ?? 0) / LINES_H) * 100)}%` } as CSSProperties}
                  />
                ))}
                <span
                  className={`tooltip${t.edge}`}
                  role="tooltip"
                  style={{ '--y': `${String((t.y / LINES_H) * 100)}%` } as CSSProperties}
                >
                  {l}
                  {series.map((s) => (
                    <span key={s.name}>
                      {' · '}
                      {s.name} {s.full[i]}
                    </span>
                  ))}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <ol className="x" aria-hidden="true">
        {labels.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ol>
      <p className="legend">
        {series.map((s, k) => (
          <span key={s.name}>
            <i className={`line ${cls(k)}`} aria-hidden="true" />
            {s.name}
          </span>
        ))}
      </p>
      <ChartTable
        head={[label, ...series.map((s) => s.name)]}
        rows={labels.map((l, i) => [l, ...series.map((s) => s.full[i] ?? '—')])}
      />
    </figure>
  );
}

/**
 * The progress bar — `build/charts.mjs` progress: the one 6px bar in a cell,
 * a setup card or a row. `pct` is the server's whole percent; `done` paints
 * it in the confirmation tone, `low` in amber; `text` is the words beside it.
 */
export function Progress({ pct, label, text, done = false, low = false }: { pct: number; label?: string; text?: string; done?: boolean; low?: boolean }): ReactNode {
  const w = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div
      className={`chart progress${done ? ' done' : ''}${low ? ' low' : ''}`}
      {...(label === undefined ? {} : { role: 'progressbar' as const, 'aria-valuenow': w, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': label })}
    >
      <div className="bar">
        <i style={{ '--w': `${String(w)}%` } as CSSProperties} />
      </div>
      {text === undefined ? null : <small>{text}</small>}
    </div>
  );
}

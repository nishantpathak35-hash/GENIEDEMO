// css-charts.mjs — the chart grammar (19 September 2026, charts): one class system for every chart the set draws.
//
// Every chart is `.chart` with its kind — spark · owe · meters · bars · stack · parts · line · ring · progress — and
// the same parts inside: the card's header carries the title, a help icon and a period picker or one action; then
// `.plot`; `.x` labels; a `.legend` when there are two or more series and none for one; a table view behind a toggle
// (`details.chart-table`); a tooltip (the published `.tooltip`) on the mark under the pointer, whose hit target is the whole column
// or bar. Marks: a bar at most 24px thick with a 4px rounded data-end and a square baseline; a 2px line with round
// joins; a marker at least 8px with a 2px surface ring; the area under a line at 10% of its hue; a hairline gridline
// one step off the surface; a 2px surface gap between stacked segments and touching bars; never a border around a
// mark. Colour by job: `.seq` (one hue, light → dark) is the default; `.emph` keeps one series in the brand and the
// rest in the chart neutral; `.cat` takes the fixed order 1–8, never cycled and never re-assigned after a filter;
// a status series takes the status chart colours and nothing else does. Text wears text tokens, never a series
// colour; money direction stays green in, orange out. One y-axis, never two; ticks in compact rupees, the full figure
// in the tooltip and the table. Dark is selected, not flipped: the categorical set was run through the dataviz
// validator against both surfaces (CHANGES). Empty, loading and reduced-motion states are drawn once on 01-components.
//
// Until this pass the same marks lived under five roots — .spark, .owe-bar, .meter, .chart.stack/.bars, and three
// names for one progress bar (.progress, .prog, .rate-bar) — plus the hero's own .hbar. The mark classes the gates
// read are kept (.meter .band, .spark .line, .owe-bar .over …); the roots are one.
export const CHARTS = `
/* ================================================================ charts — one grammar ---- */
.chart { position: relative; margin: 0; min-width: 0; }
.chart .plot { position: relative; }
.chart .x { display: flex; justify-content: space-between; gap: var(--space-050); list-style: none; margin: var(--space-075) 0 0; padding: 0; font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-faint); font-variant-numeric: tabular-nums; }
.chart .x li { flex: 1 1 0; min-width: 0; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chart .chart-note { margin: var(--space-100) 0 0; font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-soft); }
/* the legend: two or more series, never one; a swatch is its mark — the same token, the same treatment */
.chart .legend { display: flex; flex-wrap: wrap; gap: var(--space-100) var(--space-250); list-style: none; margin: var(--space-150) 0 0; padding: 0; font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-soft); }
.chart .legend > * { display: inline-flex; align-items: center; gap: var(--space-075); }
.chart .legend b { color: var(--ink); font-weight: var(--font-weight-semibold); font-variant-numeric: tabular-nums; }
.chart .legend i { display: inline-block; width: 12px; height: 8px; border-radius: var(--radius-xsmall); background: var(--series-1); flex: none; }
.chart .legend i.track { background: var(--track); box-shadow: inset 0 0 0 1px var(--line-strong); }
.chart .legend i.over { background: var(--chart-amber); }
.chart .legend i.point { width: 9px; height: 9px; border-radius: var(--radius-small); transform: rotate(45deg); background: var(--chart-point-bad); }
.chart .legend i.thr { width: 0; height: 12px; background: none; border-radius: 0; border-left: 2px dashed var(--chart-threshold); }
.chart .legend i.line { width: 14px; height: 0; border-radius: 0; background: none; border-top: 2px solid var(--series-1); }
.chart .legend i.line.s3 { border-top-color: var(--series-3); }
.chart .legend i.neutral { background: var(--chart-neutral); }
.chart .legend i.s1 { background: var(--series-1); } .chart .legend i.s2 { background: var(--series-2); } .chart .legend i.s3 { background: var(--series-3); } .chart .legend i.s4 { background: var(--series-4); }
.chart .legend i.s5 { background: var(--series-5); } .chart .legend i.s6 { background: var(--series-6); } .chart .legend i.s7 { background: var(--series-7); } .chart .legend i.s8 { background: var(--series-8); }
.chart .legend i.other { background: var(--chart-neutral); }
/* series colour by job */
.chart .s1 { --mark: var(--series-1); } .chart .s2 { --mark: var(--series-2); } .chart .s3 { --mark: var(--series-3); } .chart .s4 { --mark: var(--series-4); }
.chart .s5 { --mark: var(--series-5); } .chart .s6 { --mark: var(--series-6); } .chart .s7 { --mark: var(--series-7); } .chart .s8 { --mark: var(--series-8); }
.chart .other, .chart.emph .mark:not(.s1), .chart.emph .legend i:not(.s1):not(.over):not(.thr):not(.point):not(.track) { --mark: var(--chart-neutral); background: var(--chart-neutral); }
/* the tooltip on the mark under the pointer; the hit target is the column or the bar, never the mark alone */
/* the chart's tooltip is the published .tooltip; a column is narrow, so the tooltip sizes to its words, not to the column */
.chart .tooltip { width: max-content; max-width: 180px; white-space: normal; text-align: left; }
/* the table view behind a toggle: the figures the chart draws, as a table, for whoever wants them exact */
.chart .chart-table { margin: var(--space-150) 0 0; }
.chart .chart-table > summary { display: inline-flex; align-items: center; gap: var(--space-050); cursor: pointer; list-style: none; font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--link); font-weight: var(--font-weight-medium); }
.chart .chart-table > summary::-webkit-details-marker { display: none; }
.chart .chart-table > summary::before { content: '▸'; font-size: var(--font-size-body-small); }
.chart .chart-table[open] > summary::before { content: '▾'; }
.chart .chart-table .tbl { margin-top: var(--space-100); }
/* states, drawn once on 01-components: loading keeps the plot's shape; empty says why; reduced motion is the tokens' */
.chart.is-loading .plot, .chart.is-loading .legend { position: relative; color: transparent; }
.chart.is-loading .plot::after { content: ''; position: absolute; inset: 0; border-radius: var(--radius-small); background: var(--skeleton); animation: var(--motion-skeleton-shimmer); }
.chart.is-loading .plot > * { visibility: hidden; }
.chart.is-empty .plot { display: grid; place-items: center; min-height: var(--space-800); border: var(--border-width) dashed var(--line-strong); border-radius: var(--radius-medium); color: var(--ink-soft); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); text-align: center; padding: var(--space-150); }

/* ---- spark: a line with the area under it, the exception drawn rather than the line recoloured ---- */
.chart.spark { display: block; }
.chart.spark svg { display: block; overflow: visible; }
.spark { overflow: visible; }
.spark .area { fill: var(--chart-brand); fill-opacity: .1; }
.spark .line { fill: none; stroke: var(--chart-brand); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.spark .end { fill: var(--chart-brand); stroke: var(--panel); stroke-width: 2; }
/* The line never changes colour. A line that turns red says "everything is bad", which is almost never
   what the data means. The exception is drawn instead: a band over the out-of-tolerance region, a
   neutral dashed rule where the limit is, and a DIAMOND at the point it was crossed. Three channels —
   area, dash and shape — so the meaning survives without hue at all. */
.spark .band { fill: var(--chart-band); }
.spark .thr { stroke: var(--chart-threshold); stroke-width: 1; stroke-dasharray: 3 2.5; }
.spark .cross { fill: var(--chart-point-bad); stroke: var(--panel); stroke-width: 2; }
.spark .end.bad { fill: var(--chart-point-bad); }
.spark.filled .area { fill: var(--chart-area); fill-opacity: 1; }
.spark .dot { fill: var(--panel); stroke: var(--chart-brand); stroke-width: 2; }
/* two series on one line (the grid): the second series in categorical 2, no area under either */
.spark.lines .line.s2 { stroke: var(--series-2); } .spark.lines .dot.s2 { stroke: var(--series-2); } .spark.lines .dot.hover.s2 { fill: var(--series-2); stroke: var(--panel); }
.spark.lines .line.s1 { stroke: var(--series-1); } .spark.lines .dot.s1 { stroke: var(--series-1); } .spark.lines .dot.hover.s1 { fill: var(--series-1); stroke: var(--panel); }
.chart .legend i.line.s2 { border-top-color: var(--series-2); }
.stat .chart.spark { grid-row: 4; grid-column: 1 / -1; width: 96px; height: 32px; justify-self: end; align-self: end; margin-top: var(--space-100); }
.stat .chart.spark svg { width: 96px; height: 32px; }
.stat.mini .chart.spark, .stat.mini .chart.spark svg { width: 64px; height: 24px; margin-top: var(--space-050); }
.hero .chart.spark, .hero .chart.spark svg { width: 220px; max-width: 100%; height: auto; }

/* ---- line: a series by month, the area under it, a marker per point — the cash-flow card ---- */
.chart.line .plot { position: relative; }
.chart.line .plot svg { display: block; width: 100%; height: auto; }
/* the point under the pointer: a crosshair through it, the point filled and ringed with the surface, the tooltip above it */
.spark .crosshair { stroke: var(--chart-axis); stroke-width: 1; stroke-dasharray: 3 2.5; }
.spark .dot.hover { fill: var(--chart-brand); stroke: var(--panel); stroke-width: 2; }
.chart.line .tooltip { --tx: -50%; --ty: calc(-100% - var(--space-150)); left: var(--x); top: var(--y); transform: translate(var(--tx), var(--ty)); }
.chart.line .tooltip.first { --tx: 0; }
.chart.line .tooltip.last { --tx: -100%; }
.chart.line .tooltip.below { --ty: var(--space-150); }

/* ---- owe: a proportion bar — the part and the rest, a 2px surface gap between them ---- */
.chart.owe .owe-bar { display: flex; gap: var(--border-width-selected); height: var(--space-100); margin: var(--space-200) 0 var(--space-150); border-radius: var(--radius-small); overflow: hidden; background: var(--chart-gap); }
.chart.owe .owe-bar .over { flex: 0 0 var(--w); background: var(--owed-overdue); }
.chart.owe .owe-bar .cur { flex: 1 1 0; background: var(--owed-current); }
.chart.owe .owe-bar .cur[style] { flex: 0 0 var(--w); }             /* a ratio card names the covered part's width instead */
.chart.owe .owe-bar .rest { flex: 1 1 0; background: var(--track); }
.chart.owe .owe-bar .over:not([style]) { flex: 1 1 0; }              /* the shortfall takes what the covered part leaves */
.owe.fig .chart.owe .owe-bar { margin-top: var(--space-150); }

/* ---- meters: one contract per row, the watch line at the same place on every row, an overrun past the track ---- */
/* the meter list measures itself: a narrow chart stacks its rows whatever frame it sits in */
.chart.meters { container-type: inline-size; }
.chart.meters .legend { padding: var(--space-150) var(--space-250) var(--space-050); margin: 0; }
.chart.meters .meter-list { list-style: none; margin: 0; padding: var(--space-075) var(--space-250) var(--space-150); }
.chart.meters .meter-list li { display: grid; grid-template-columns: minmax(150px, 1fr) minmax(0, 2fr) auto; gap: var(--space-150); align-items: center; padding: var(--space-100) 0; }
.chart.meters .who b { display: block; font-size: var(--font-size-body); line-height: var(--line-height-body); }
.chart.meters .who small { display: block; font-size: var(--font-size-body-small); color: var(--ink-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: var(--line-height-body-small); }
.chart.meters .val { text-align: right; font-size: var(--font-size-body); line-height: var(--line-height-body); }
.chart.meters .val small { display: block; font-size: var(--font-size-body-small); color: var(--ink-faint); font-variant-numeric: tabular-nums; line-height: var(--line-height-body-small); }
.meter { position: relative; height: 10px; }
.meter .track { position: absolute; left: 0; top: 0; height: 10px; border-radius: var(--radius-medium); background: var(--track); box-shadow: inset 0 0 0 1px var(--line-strong); }
.meter .track.none { background: none; box-shadow: none; border: var(--border-width) dashed var(--line-strong); }   /* no contract value yet: a dashed track, nothing to measure against */
.meter .fill { position: absolute; left: 0; top: 0; height: 10px; border-radius: var(--radius-medium); background: var(--chart-brand); min-width: 4px; }
/* Over contract is not a recoloured bar. The bar keeps its identity; the run past the contract is a band in the fixed
   status amber — labelled-redundant, the overrun printed at the right — after a 2px surface gap, and the point it
   crossed carries a diamond. The row's own text says by how much. */
.meter .band { position: absolute; top: 0; height: 10px; width: calc(var(--w) - var(--border-width-selected)); min-width: 7px; margin-left: var(--border-width-selected); background: var(--chart-band); border-radius: 0 var(--radius-medium) var(--radius-medium) 0; }
.meter .point { position: absolute; top: 1px; width: 8px; height: 8px; margin-left: calc(var(--space-050) * -1); transform: rotate(45deg); background: var(--chart-point-bad); box-shadow: 0 0 0 var(--mark-ring) var(--panel); }
.meter .thr { position: absolute; top: -4px; width: 0; height: 18px; border-left: 2px dashed var(--chart-threshold); }
/* the same meter as a hero's own bar: the figure's share, its watch line, the labels beneath */
.chart.meter-one { margin-top: var(--space-250); }
.chart.meter-one .x { justify-content: space-between; align-items: baseline; gap: var(--space-200); margin-top: var(--space-100); }
.chart.meter-one .x li { flex: 0 1 auto; text-align: left; white-space: normal; }
.chart.meter-one .x b { color: var(--ink); font-weight: var(--font-weight-semibold); font-variant-numeric: tabular-nums; }
.chart.meter-one .x .thr { color: var(--ink-soft); font-weight: var(--font-weight-medium); white-space: nowrap; }
.hero .chart.meter-one { grid-area: b; }

/* ---- bars: columns on one axis — a gridline a step off the surface, ticks in compact rupees, grouped when two series ---- */
.chart.bars .plot { position: relative; height: 160px; margin: var(--space-200) 0 var(--space-300) var(--space-500); }
.chart.bars .grid span { position: absolute; left: 0; right: 0; bottom: calc(var(--v) / var(--max) * 100%); height: 0; border-top: var(--border-width) solid var(--chart-grid); }
.chart.bars .grid span.axis { border-top-color: var(--chart-axis); }
.chart.bars .grid span b { position: absolute; right: calc(100% + var(--space-100)); top: 50%; transform: translateY(-50%); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); font-weight: var(--font-weight-regular); color: var(--ink-soft); font-variant-numeric: tabular-nums; white-space: nowrap; }
.chart.bars .bars { position: absolute; inset: 0; display: flex; align-items: flex-end; gap: var(--space-100); margin: 0; padding: 0 var(--space-200); list-style: none; }
.chart.bars .bars li { position: relative; flex: 1 1 0; height: 100%; display: flex; align-items: flex-end; justify-content: center; gap: var(--border-width-selected); }
.chart.bars .bars i { display: block; flex: 0 1 60%; max-width: var(--space-300); height: calc(var(--v) / var(--max) * 100%); background: var(--mark, var(--chart-brand)); border-radius: var(--radius-xsmall) var(--radius-xsmall) 0 0; transition: var(--motion-listitem-hovered); }
.chart.bars .bars i.s1 { background: var(--series-1); } .chart.bars .bars i.s3 { background: var(--series-3); }
.chart.bars.emph .bars i:not(.emph-on) { background: var(--chart-neutral); }
.chart.bars .bars li:hover i, .chart.bars .bars li.is-hover i { filter: brightness(1.08); }
.chart.bars .bars .x { position: absolute; top: calc(100% + var(--space-050)); left: 0; right: 0; text-align: center; font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-soft); white-space: nowrap; }
.chart.bars .bars .tooltip { bottom: calc(var(--top) / var(--max) * 100% + var(--space-100)); left: 50%; transform: translateX(-50%); }
.chart.bars .bars li:first-child .tooltip { left: 0; transform: none; }
.chart.bars .bars li:last-child .tooltip { left: auto; right: 0; transform: none; }
.chart.bars .bars li[data-tall] .tooltip { bottom: auto; top: var(--space-050); }   /* a tall column's tooltip sits inside the plot, over the column's top */
.chart.bars.short .plot { height: 120px; }
.chart.bars .totals { display: flex; justify-content: space-between; gap: var(--space-200); margin: var(--space-100) 0 0; font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-soft); }
.chart.bars .totals b { color: var(--ink); font-weight: var(--font-weight-semibold); font-variant-numeric: tabular-nums; }

/* ---- stack: a status series as a 100% bar, the counts in the legend, a 2px surface gap between segments ---- */
.chart.stack .stack-bar { display: flex; gap: var(--border-width-selected); height: var(--space-150); margin-top: var(--space-150); border-radius: var(--radius-small); overflow: hidden; background: var(--chart-gap); }
.chart.stack .seg { display: block; flex: 0 0 var(--w); min-width: var(--space-050); }
.chart.stack .seg.bad, .chart.stack .sw.bad { background: var(--chart-bad); background-image: repeating-linear-gradient(135deg, transparent 0, transparent 3px, var(--chart-gap) 3px, var(--chart-gap) 4px); }
.chart.stack .seg.caution, .chart.stack .sw.caution { background: var(--chart-caution); }
.chart.stack .seg.done, .chart.stack .sw.done { background: var(--chart-done); }
.chart.stack .seg.paused, .chart.stack .sw.paused { background: var(--chart-paused); background-image: repeating-linear-gradient(45deg, transparent 0, transparent 2px, var(--chart-gap) 2px, var(--chart-gap) 3px); }
.chart .legend.counts .sw { width: var(--space-150); height: var(--space-150); border-radius: var(--radius-xsmall); box-shadow: none; }   /* the swatch is the mark: a segment carries no ring */

/* ---- parts: part-to-whole as one horizontal stacked bar — the top five and Other, the values in the legend ---- */
.chart.parts .plot { display: flex; gap: var(--border-width-selected); height: var(--space-200); border-radius: var(--radius-small); overflow: hidden; background: var(--chart-gap); }
.chart.parts .seg { display: block; flex: 0 0 var(--w); min-width: var(--space-050); background: var(--mark, var(--chart-neutral)); }
.chart.parts .legend { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--space-075) var(--space-200); }
.chart.parts .legend > * { justify-content: space-between; }
.chart.parts .legend > * > span { display: inline-flex; align-items: center; gap: var(--space-075); min-width: 0; }
.chart.parts .legend small { color: var(--ink-faint); }

/* ---- ring: a share as a ring — the fill in the brand, the track a lighter step of the same ramp, an overrun in the status amber with its figure printed ---- */
.chart.ring { display: inline-grid; place-items: center; width: var(--space-600); height: var(--space-600); }
.chart.ring svg { grid-area: 1 / 1; width: var(--space-600); height: var(--space-600); transform: rotate(-90deg); overflow: visible; }
.chart.ring circle { fill: none; stroke-width: 6; }
.chart.ring circle.track { stroke: var(--ring-track); }
.chart.ring circle.fill { stroke: var(--chart-brand); stroke-linecap: butt; }
.chart.ring.over circle.fill { stroke: var(--chart-amber); }
.chart.ring b { grid-area: 1 / 1; font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); font-weight: var(--font-weight-semibold); color: var(--ink); font-variant-numeric: tabular-nums; }
.ring-list { list-style: none; margin: 0; padding: var(--space-100) var(--space-250) var(--space-150); display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--space-150) var(--space-200); }
.ring-list li { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: var(--space-150); align-items: center; }
.ring-list li > div b { display: block; font-size: var(--font-size-body); line-height: var(--line-height-body); }
.ring-list li > div small { display: block; font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-faint); font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ring-list li > div small.over { color: var(--ink-soft); font-weight: var(--font-weight-medium); }

/* ---- progress: the 6px bar in a cell, a setup card or a row — the one bar under three names until this pass ---- */
.chart.progress .bar { position: relative; height: 6px; border-radius: var(--radius-full); background: var(--track); overflow: hidden; }
.chart.progress .bar > i { position: absolute; left: 0; top: 0; bottom: 0; width: var(--w); border-radius: var(--radius-full); background: var(--progress); transition: var(--motion-progress-fill); }
.chart.progress.done .bar > i { background: var(--toggle-on); }
.chart.progress.low .bar > i { background: var(--chart-amber); }
.prog-cell { display: flex; align-items: center; gap: var(--space-100); }
td.num .prog-cell { justify-content: flex-end; }
.prog-cell .chart.progress { width: 80px; flex: none; }
.prog-cell small { font-size: var(--font-size-body-small); color: var(--ink-faint); font-variant-numeric: tabular-nums; line-height: var(--line-height-body-small); }
.rate-bar { display: flex; align-items: center; gap: var(--space-100); }
.rate-bar .chart.progress { width: 90px; }
.rate-bar small { font-size: var(--font-size-body-small); color: var(--ink-faint); white-space: nowrap; font-variant-numeric: tabular-nums; line-height: var(--line-height-body-small); }
.setup .chart.progress { flex: 1 1 auto; }

@container (max-width: 520px) {
  .chart.meters .meter-list li { grid-template-columns: minmax(0, 1fr) auto; }
  .chart.meters .meter-list li .meter { grid-column: 1 / -1; grid-row: 2; }
  .chart.meters .meter-list li .val { text-align: right; }
}
`;

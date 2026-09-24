// charts.mjs — the chart grammar's builders (19 September 2026, charts). One module draws every chart the set has:
// the sparkline, the proportion bar, the meter list and the hero's single meter, columns (one series or two,
// grouped), the status stack, part-to-whole, the line with its area, the ring, and the progress bar. The rules are
// in css-charts.mjs; the page on 01-components draws each kind, each state, and the colour jobs, and every screen
// references it. The data-visualisation guidance it follows, read 17 September 2026: title color.text · tick label
// color.text.subtle · gridline color.border · axis color.border.bold · one colour when one is enough · a status
// series in the status chart colours, never a status text token · a surface gap between adjacent chart colours ·
// no text on a chart colour · and the data in words as well, for whoever cannot see the chart.
import { esc, fmt } from './data.mjs';

// ---------------------------------------------------------------- figures --
// compact rupees for a tick: ₹8,500 · ₹40L · ₹2.4Cr — the full figure lives in the tooltip and the table
export const compact = (wire) => {
  const r = Number(BigInt(wire) / 100n);
  if (Math.abs(r) >= 1_00_00_000) { const c = r / 1_00_00_000; return `₹${(Math.round(c * 10) / 10).toString().replace(/\.0$/, '')}Cr`; }
  if (Math.abs(r) >= 1_00_000) { const l = r / 1_00_000; return `₹${(Math.round(l * 10) / 10).toString().replace(/\.0$/, '')}L`; }
  return fmt(String(BigInt(wire) / 100n * 100n)).replace(/\.00$/, '');
};
const pctOf = (part, whole) => (BigInt(whole) > 0n ? Number((BigInt(part) * 10000n) / BigInt(whole)) / 100 : 0);
const n2 = v => (typeof v === 'string' ? Number(BigInt(v) / 1000n) : v);   // paise → thousandths of a rupee, a number the SVG can hold

// ---------------------------------------------------------------- the anatomy --
// every chart: the sentence for whoever cannot see it, the plot, the x labels, a legend for two or more series, a
// table view behind a toggle, a note — and a state: loading keeps the plot's shape; empty says why
export const chart = (kind, { cls = '', sr = '', plot = '', x = '', legend = '', table = '', note = '', state = '', label = '' }) =>
  `<figure class="chart ${kind}${cls ? ' ' + cls : ''}${state ? ' is-' + state : ''}"${label ? ` aria-label="${esc(label)}"` : ''}>${sr ? `<p class="sr-only">${sr}</p>` : ''}${plot}${x}${legend}${table}${note ? `<p class="chart-note">${note}</p>` : ''}</figure>`;
export const xLabels = (labels) => `<ol class="x" aria-hidden="true">${labels.map(l => `<li>${esc(l)}</li>`).join('')}</ol>`;
export const legend = (items, cls = '') => `<ul class="legend${cls ? ' ' + cls : ''}" aria-hidden="true">${items.map(([sw, name, value]) => `<li><i class="${sw}"></i>${esc(name)}${value !== undefined ? `<b>${value}</b>` : ''}</li>`).join('')}</ul>`;
export const tableView = (head, rows, label = 'Table view') => `<details class="chart-table"><summary>${esc(label)}</summary><div class="tbl-wrap"><table class="tbl"><thead><tr>${head.map((h, i) => `<th${i ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
export const emptyPlot = (text) => `<div class="plot">${esc(text)}</div>`;

// ---------------------------------------------------------------- spark --
// a line with the area under it; the exception drawn — a band over the out-of-tolerance side, a dashed rule at the
// limit, a diamond where it was crossed — never the line recoloured
export function spark(values, { w = 96, h = 36, thr = null, limit = null, worse = 'above', cls = '' } = {}) {
  const dots = /\bdots\b/.test(cls);
  const nums = values.map(n2);
  const lim = limit === null ? null : n2(limit);
  const max = Math.max(...nums, lim ?? -Infinity, thr ? thr : 0) || 1, min = Math.min(...nums, lim ?? Infinity, 0);
  const x = i => (i / (nums.length - 1)) * (w - 4) + 2, y = v => h - 3 - ((v - min) / (max - min || 1)) * (h - 8);
  const pts = nums.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const area = `M${x(0).toFixed(1)},${(h - 1).toFixed(1)} L${pts.join(' L')} L${x(nums.length - 1).toFixed(1)},${(h - 1).toFixed(1)} Z`;
  const last = nums[nums.length - 1];
  let extra = '', endBad = false;
  // A bare threshold: the line the value is measured against, drawn on a series that sits wholly on one
  // side of it. No band, because a band over the whole plot names nothing, and no diamond, because the
  // crossing happened before this window opened.
  if (thr !== null && lim === null) {
    const ty = y(n2(thr));
    extra += `<line class="thr" x1="0" x2="${w}" y1="${ty.toFixed(1)}" y2="${ty.toFixed(1)}"/>`;
  }
  if (lim !== null) {
    const ly = y(lim);
    const out = v => (worse === 'above' ? v > lim : v < lim);
    endBad = out(last);
    // the band covers the whole out-of-tolerance side of the limit, so the region is named by area
    extra += worse === 'above'
      ? `<rect class="band" x="0" y="0" width="${w}" height="${Math.max(0, ly).toFixed(1)}"/>`
      : `<rect class="band" x="0" y="${ly.toFixed(1)}" width="${w}" height="${Math.max(0, h - ly).toFixed(1)}"/>`;
    extra += `<line class="thr" x1="0" x2="${w}" y1="${ly.toFixed(1)}" y2="${ly.toFixed(1)}"/>`;
    // a diamond wherever the series crosses INTO the bad side — the moment, not the whole line
    for (let i = 1; i < nums.length; i++) {
      if (out(nums[i]) && !out(nums[i - 1])) {
        const t = (lim - nums[i - 1]) / ((nums[i] - nums[i - 1]) || 1);
        const cx = x(i - 1) + t * (x(i) - x(i - 1));
        extra += `<rect class="cross" x="${(cx - 2.6).toFixed(1)}" y="${(ly - 2.6).toFixed(1)}" width="5.2" height="5.2" transform="rotate(45 ${cx.toFixed(1)} ${ly.toFixed(1)})"/>`;
      }
    }
  }
  const svg = `<svg class="spark ${cls}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" focusable="false"><path class="area" d="${area}"/>${extra}<polyline class="line" points="${pts.join(' ')}"/>${dots ? nums.slice(0, -1).map((v, i) => `<circle class="dot" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4"/>`).join('') : ''}<circle class="end${endBad ? ' bad' : ''}" cx="${x(nums.length - 1).toFixed(1)}" cy="${y(last).toFixed(1)}" r="4"/></svg>`;
  return `<div class="chart spark">${svg}</div>`;
}

// ---------------------------------------------------------------- owe: a proportion bar --
// `short`: the covered part neutral and the shortfall in the status amber (labelled-redundant — its figures sit
// beneath); `ratio`: the part over a track. A 2px surface gap between the two. The bar is an image; its label says it.
export const oweBar = ({ kind = 'ratio', pct, label, overFirst = false }) => {
  const w = Math.max(0, Math.min(100, pct)).toFixed(1);
  const body = kind === 'short'
    ? `<i class="cur" style="--w:${w}%"></i><i class="over"></i>`
    : kind === 'overdue'
      ? `<i class="over" style="--w:${w}%"></i><i class="cur"></i>`
      : `<i class="cur" style="--w:${w}%"></i><i class="rest"></i>`;
  return `<div class="chart owe"><div class="owe-bar" role="img" aria-label="${esc(label)}">${overFirst ? body : body}</div></div>`;
};

// (19 September, the grid) the same bar in ageing buckets: the current part first, then each overdue bucket in the
// status amber (labelled-redundant — the buckets are printed beneath), a 2px surface gap between segments. A bucket
// with nothing in it draws no segment; its figure still prints as ₹0.00.
export const ageBar = ({ current, buckets, total, label }) => {
  const T = BigInt(total); const w = (v) => (T > 0n ? Number((BigInt(v) * 10000n) / T) / 100 : 0);
  const segs = [['cur', current], ...buckets.map(v => ['over', v])].filter(([, v]) => BigInt(v) > 0n).map(([c, v]) => `<i class="${c}" style="--w:${w(v).toFixed(2)}%"></i>`).join('');
  return `<div class="chart owe age"><div class="owe-bar" role="img" aria-label="${esc(label)}">${segs || '<i class="rest"></i>'}</div></div>`;
};

// ---------------------------------------------------------------- meters: one contract per row --
// Each meter is its own contract: the track is 0–100% of that contract at a fixed width, so the 85% watch line sits
// at the same place on every row and an overrun is drawn past the track's end. Rows sort by ordered share, the
// projects with no contract value last on a dashed track.
export const TRACK = 80;   // the track's share of the meter, in percent; the remaining fifth is where an overrun shows
export function meters({ rows, legendItems, sr, watchPct = 85 }) {
  const lis = rows.map(r => {
    const has = r.contract !== null; const sh = r.share;
    const over = has && BigInt(r.committed) > BigInt(r.contract);
    const overBy = over ? String(BigInt(r.committed) - BigInt(r.contract)) : null;
    const fw = has ? Math.min(sh, 100) * TRACK / 100 : 0;
    const bw = over ? Math.min(100 - TRACK, (sh - 100) * TRACK / 100) : 0;
    return `<li><div class="who"><b>${esc(r.code)}</b><small title="${esc(r.name)}">${esc(r.name)}</small></div><div class="meter">${has ? `<div class="track" style="width:${TRACK}%"></div><div class="thr" style="left:${(TRACK * watchPct / 100).toFixed(2)}%" title="${watchPct}% — watch closely from here"></div>${fw > 0 ? `<div class="fill" style="width:${fw.toFixed(2)}%"></div>` : ''}${over ? `<div class="band" style="left:${TRACK}%;--w:${bw.toFixed(2)}%" title="Past the contract by ${esc(fmt(overBy))}"></div><i class="point" style="left:${TRACK}%" title="${esc(fmt(r.contract))} — the contract"></i>` : ''}` : `<div class="track none" style="width:${TRACK}%" title="No contract value yet"></div>`}</div><span class="val num">${fmt(r.committed)}${has ? `<small>${sh.toFixed(0)}%${over ? ` · ${fmt(overBy)} over` : ''}</small>` : '<small>no contract value yet</small>'}</span></li>`;
  }).join('');
  return chart('meters', { sr, legend: legend(legendItems), plot: `<ul class="meter-list">${lis}</ul>` });
}
// the same meter as a hero's own bar: the figure's share, the watch line, the labels beneath. Within the contract the
// track is the whole bar; past it the track is the list's four fifths and the overrun runs past it as the amber band,
// the diamond on the contract line — the hero's own text carries both figures
export const meterOne = ({ w, x, label, thrLabel }) => {
  const over = w > 100; const T = over ? TRACK : 100;
  const fw = Math.min(w, 100) * T / 100; const bw = over ? Math.min(100 - T, (w - 100) * T / 100) : 0;
  return `<div class="chart meter-one"><div class="meter" role="img" aria-label="${esc(label)}"><div class="track" style="width:${T}%"></div>${x != null ? `<div class="thr" style="left:${(x * T / 100).toFixed(2)}%"></div>` : ''}<div class="fill" style="width:${fw.toFixed(2)}%"></div>${over ? `<div class="band" style="left:${T}%;--w:${bw.toFixed(2)}%"></div><i class="point" style="left:${T}%"></i>` : ''}</div><ol class="x" aria-hidden="true"><li><b>${label}</b></li>${thrLabel ? `<li class="thr">${esc(thrLabel)}</li>` : ''}</ol></div>`;
};

// ---------------------------------------------------------------- bars: columns on one axis --
// one series, or two grouped (billed against collected): a gridline at each tick, ticks in compact rupees, the
// hovered column's tooltip with the full figure, totals beneath when there are two series
export function columns({ label, unit = '', labels, series, max, step, hover = -1, tick = v => String(v), full = v => String(v), totals = null, cls = '', sr: srText = null, caption = false, note = '' }) {
  const ticks = []; for (let v = step; v <= max; v += step) ticks.push(v);
  const many = series.length > 1;
  const words = labels.map((l, i) => `${l} ${series.map(s => `${s.name} ${full(s.values[i])}`).join(', ')}`).join('; ');
  const lis = labels.map((l, i) => {
    const top = Math.max(...series.map(s => s.values[i]));
    return `<li${i === hover ? ' class="is-hover"' : ''} style="--top:${top}"${i === hover && top / max > 0.72 ? ' data-tall' : ''}>${series.map(s => `<i class="${s.cls}" style="--v:${s.values[i]}" title="${esc(s.name)}: ${esc(full(s.values[i]))}"></i>`).join('')}<span class="x">${esc(l)}</span>${i === hover ? `<span class="tooltip" role="tooltip">${esc(l)}${series.map(s => ` · ${series.length > 1 ? esc(s.name) + ' ' : ''}${esc(full(s.values[i]))}`).join('')}</span>` : ''}</li>`;
  }).join('');
  const plot = `<div class="plot" style="--max:${max}" aria-hidden="true"><div class="grid">
${ticks.map(t => `<span style="--v:${t}"><b>${esc(tick(t))}</b></span>`).reverse().join('\n')}
<span class="axis" style="--v:0"><b>${esc(tick(0))}</b></span>
</div><ol class="bars">${lis}</ol></div>`;
  const lg = many ? legend(series.map(s => [s.cls, s.name, totals ? totals[s.name] : undefined])) : '';
  const table = tableView([label, ...series.map(s => s.name)], labels.map((l, i) => [esc(l), ...series.map(s => esc(full(s.values[i])))]));
  return chart('bars', { cls, sr: `${esc(label)}${unit ? `, in ${esc(unit)}` : ''}: ${esc(words)}.`, plot, legend: lg, table, note });
}
// the shape the older bar chart took: one series, the values in lakhs, the caption in the card's header now
export const barChart = ({ label, unit, labels, values, max, step, hover = -1, full = v => fmt(String(Math.round(v * 10000000))) }) =>
  columns({ label, unit, labels, series: [{ name: label, cls: 's1', values }], max, step, hover, tick: v => `₹${v}L`, full });

// ---------------------------------------------------------------- stack: a status series as one 100% bar --
// the four states, in the order the owner set them: off track, at risk, on track, paused
export const HEALTH = [['bad', 'Off track'], ['caution', 'At risk'], ['done', 'On track'], ['paused', 'Paused']];
export const stackedBar = ({ label, counts, unit = 'projects', note = '', caption = true }) => {
  const total = HEALTH.reduce((s, [k]) => s + (counts[k] || 0), 0);
  const words = HEALTH.map(([k, n]) => `${counts[k] || 0} ${n.toLowerCase()}`).join(', ');
  const segs = HEALTH.filter(([k]) => counts[k] > 0).map(([k, n]) => `<i class="seg ${k}" style="--w:${(100 * counts[k] / total).toFixed(2)}%" title="${esc(n)}: ${counts[k]}"></i>`).join('');
  const lg = `<ul class="legend counts" aria-hidden="true">${HEALTH.map(([k, n]) => `<li><i class="sw ${k}"></i>${esc(n)}<b>${counts[k] || 0}</b></li>`).join('')}</ul>`;
  return `<figure class="chart stack">${caption ? `<figcaption>${esc(label)}<span>${total} ${esc(unit)}</span></figcaption>` : ''}<p class="sr-only">${esc(label)}: ${words}.</p><div class="stack-bar" aria-hidden="true">${segs}</div>${lg}${note ? `<p class="chart-note">${note}</p>` : ''}</figure>`;
};

// ---------------------------------------------------------------- parts: part-to-whole --
// one horizontal stacked bar — the top five and Other — the values in the legend; a donut only if the slices are
// clearly unequal, never a pie for close values
export function parts({ label, items, top = 5, full = fmt, cls = 'cat' }) {
  const sorted = [...items].sort((a, b) => (BigInt(b[1]) > BigInt(a[1]) ? 1 : -1));
  const shown = sorted.slice(0, top); const rest = sorted.slice(top);
  const other = rest.reduce((s, [, v]) => s + BigInt(v), 0n);
  const all = [...shown.map(([n, v], i) => [n, v, `s${i + 1}`]), ...(other > 0n ? [['Other', String(other), 'other']] : [])];
  const total = all.reduce((s, [, v]) => s + BigInt(v), 0n);
  const segs = all.map(([n, v, c]) => `<i class="seg ${c}" style="--w:${pctOf(v, String(total)).toFixed(2)}%" title="${esc(n)}: ${esc(full(v))}"></i>`).join('');
  const lg = `<ul class="legend" aria-hidden="true">${all.map(([n, v, c]) => `<li><span><i class="${c}"></i>${esc(n)}${c === 'other' ? ` <small>(${rest.length})</small>` : ''}</span><b>${esc(full(v))}</b></li>`).join('')}</ul>`;
  const table = tableView([label, 'Value', 'Share'], all.map(([n, v]) => [esc(n), esc(full(v)), `${pctOf(v, String(total)).toFixed(0)}%`]));
  return chart('parts', { cls, sr: `${esc(label)}: ${all.map(([n, v]) => `${n} ${full(v)}`).join(', ')}.`, plot: `<div class="plot" aria-hidden="true">${segs}</div>`, legend: lg, table });
}

// ---------------------------------------------------------------- ring: a share --
// the fill in the brand, the track a lighter step of the same ramp; past the whole, the ring turns the status amber
// and the overrun is printed beside it (labelled-redundant)
export const ring = ({ pct, over = false, label, text }) => {
  const r = 18, c = 2 * Math.PI * r; const p = Math.max(0, Math.min(100, pct));
  return `<div class="chart ring${over ? ' over' : ''}" role="img" aria-label="${esc(label)}"><svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle class="track" cx="24" cy="24" r="${r}"/><circle class="fill" cx="24" cy="24" r="${r}" stroke-dasharray="${(c * p / 100).toFixed(2)} ${c.toFixed(2)}"/></svg><b>${text ?? `${Math.round(pct)}%`}</b></div>`;
};
export const ringList = (rows) => `<ul class="ring-list">${rows.map(r => `<li>${ring(r)}<div><b>${esc(r.code)}</b><small class="${r.over ? 'over' : ''}">${esc(r.sub)}</small></div></li>`).join('')}</ul>`;

// ---------------------------------------------------------------- line: a series by month --
// `hover` names the point under the pointer: a crosshair through it, the point ringed, the tooltip at it — the
// anatomy of a line or an area (a column takes a tooltip on the mark; a line takes the crosshair)
export function lineArea({ labels, series, w = 520, h = 140, hover = null, full = (v) => fmt(v) }) {
  const nums = series.map(s => Number(BigInt(s) / 100000n));
  let svg = spark(nums, { w, h, cls: 'filled dots' }).replace('<div class="chart spark">', '').replace(/<\/div>$/, '');
  let tip = '';
  if (hover !== null) {   // the same geometry spark() draws with
    const max = Math.max(...nums, 0) || 1, min = Math.min(...nums, 0);
    const x = i => (i / (nums.length - 1)) * (w - 4) + 2, y = v => h - 3 - ((v - min) / (max - min || 1)) * (h - 8);
    const hx = x(hover), hy = y(nums[hover]);
    svg = svg.replace('</svg>', `<line class="crosshair" x1="${hx.toFixed(1)}" x2="${hx.toFixed(1)}" y1="0" y2="${h}"/><circle class="dot hover" cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="5"/></svg>`);
    const edge = (hx < w * 0.3 ? ' first' : hx > w * 0.7 ? ' last' : '') + (hy < h * 0.3 ? ' below' : '');   // in the outer third the tooltip hangs from the point's side; near the top it goes under the point
    tip = `<span class="tooltip${edge}" role="tooltip" style="--x:${(hx / w * 100).toFixed(1)}%;--y:${(hy / h * 100).toFixed(1)}%">${esc(labels[hover])} · ${esc(full(series[hover]))}</span>`;
  }
  return `<div class="plot">${svg}${tip}</div>${xLabels(labels)}`;
}

// (19 September, the grid) two series on one line — money in against money out by month: a 2px line each in the
// categorical order (1 then 2), a marker per point with the surface ring, no area (an area is one series' own), a
// legend naming both, the crosshair through the hovered month with both figures in the tooltip
export function lines({ labels, series, w = 520, h = 140, hover = null, full = (v) => fmt(v) }) {
  const all = series.flatMap(s => s.values.map(v => Number(BigInt(v) / 100000n)));
  const max = Math.max(...all, 0) || 1, min = Math.min(...all, 0), n = labels.length;
  const x = i => (i / (n - 1)) * (w - 4) + 2, y = v => h - 3 - ((v - min) / (max - min || 1)) * (h - 8);
  const polys = series.map(s => { const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(Number(BigInt(v) / 100000n)).toFixed(1)}`);
    return `<polyline class="line ${s.cls}" points="${pts.join(' ')}"/>` + s.values.map((v, i) => `<circle class="dot ${s.cls}" cx="${x(i).toFixed(1)}" cy="${y(Number(BigInt(v) / 100000n)).toFixed(1)}" r="4"/>`).join(''); }).join('');
  let cross = '', tip = '';
  if (hover !== null) {
    const hx = x(hover); const ys = series.map(s => y(Number(BigInt(s.values[hover]) / 100000n)));
    cross = `<line class="crosshair" x1="${hx.toFixed(1)}" x2="${hx.toFixed(1)}" y1="0" y2="${h}"/>` + series.map((s, k) => `<circle class="dot hover ${s.cls}" cx="${hx.toFixed(1)}" cy="${ys[k].toFixed(1)}" r="5"/>`).join('');
    const hy = Math.min(...ys); const edge = (hx < w * 0.3 ? ' first' : hx > w * 0.7 ? ' last' : '') + (hy < h * 0.3 ? ' below' : '');
    tip = `<span class="tooltip${edge}" role="tooltip" style="--x:${(hx / w * 100).toFixed(1)}%;--y:${(hy / h * 100).toFixed(1)}%">${esc(labels[hover])}${series.map(s => ` · ${esc(s.name)} ${esc(full(s.values[hover]))}`).join('')}</span>`;
  }
  const svg = `<svg class="spark lines" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" focusable="false">${polys}${cross}</svg>`;
  return `<div class="plot">${svg}${tip}</div>${xLabels(labels)}${legend(series.map(s => [`line ${s.cls}`, s.name]))}`;
}

// ---------------------------------------------------------------- progress --
// the 6px bar: a share done, in a cell, a setup card or a row; `done` at the whole, `low` when the share is a warning
export const progress = (pct, { done = false, low = false, label = '', text = '' } = {}) =>
  `<div class="chart progress${done ? ' done' : ''}${low ? ' low' : ''}"${label ? ` role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(label)}"` : ''}><div class="bar"><i style="--w:${Math.max(0, Math.min(100, pct)).toFixed(0)}%"></i></div>${text ? `<small>${text}</small>` : ''}</div>`;

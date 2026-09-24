// tokens-candidates.mjs — the v4 colour system. ONE generator, three candidate palettes, one chosen.
// A palette is a parameter set (primary hue + chroma, the hue its neutrals lean toward, one secondary accent,
// a muted status set). Light and dark are the SAME parameters at two luminance levels — the generator proves it,
// because there is no second set of numbers to drift. Text tokens are snapped to WCAG at build time; every
// text/surface pair is printed in section 0; the build fails on any used pair under target and on any hex
// literal outside the token block.

// ---- colour math ---------------------------------------------------------------------------------------
const clamp01 = x => Math.min(1, Math.max(0, x));
export function oklchToRgb(L, C, h) {
  const a = C * Math.cos(h * Math.PI / 180), b = C * Math.sin(h * Math.PI / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
const gam = c => { c = clamp01(c); return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; };
export const hex = (L, C, h) => '#' + oklchToRgb(L, C, h).map(c => Math.round(gam(c) * 255).toString(16).padStart(2, '0')).join('');
const inGamut = (L, C, h) => oklchToRgb(L, C, h).every(c => c >= -0.0005 && c <= 1.0005);
export const rgbOf = hx => { const n = parseInt(hx.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
export function lum(hx) { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; const [r, g, b] = rgbOf(hx); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
export function contrast(a, b) { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
export const r2 = x => Math.round(x * 100) / 100;

// ---- colour-vision simulation, so the chart checks below are measured and not assumed ------------------
const _lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
export function oklab(hx) {
  const [r, g, b] = rgbOf(hx).map(_lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
export const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 100;
// the hue the pixel actually has, which is not always the hue that was asked for
export function hueOf(hx) { const [, A, B] = oklab(hx); let h = Math.atan2(B, A) * 180 / Math.PI; return h < 0 ? h + 360 : h; }
export function chromaOf(hx) { const [, A, B] = oklab(hx); return Math.hypot(A, B); }
export function dichromat(hx, kind) {
  let [r, g, b] = rgbOf(hx).map(_lin);
  const L = 0.31399022 * r + 0.63951294 * g + 0.04649755 * b;
  const M = 0.15537241 * r + 0.75789446 * g + 0.08670142 * b;
  const S = 0.01775239 * r + 0.10944209 * g + 0.87256922 * b;
  let L2 = L, M2 = M, S2 = S;
  if (kind === 'protan') L2 = 1.05118294 * M - 0.05116099 * S;
  if (kind === 'deutan') M2 = 0.9513092 * L + 0.04866992 * S;
  r = 5.47221206 * L2 - 4.6419601 * M2 + 0.16963708 * S2;
  g = -1.1252419 * L2 + 2.29317094 * M2 - 0.1678952 * S2;
  b = 0.02980165 * L2 - 0.19318073 * M2 + 1.16364789 * S2;
  return '#' + [r, g, b].map(c => Math.round(gam(c) * 255).toString(16).padStart(2, '0')).join('');
}
export const cvdGap = (a, b) => Math.min(...['protan', 'deutan'].map(k => dE(oklab(dichromat(a, k)), oklab(dichromat(b, k)))));

// ---- the three candidates ------------------------------------------------------------------------------
// hue: OKLCH hue of the primary. chroma: the primary's chroma in light (dark is desaturated by the generator).
// tint: how far the neutrals lean toward the hue (light / dark chroma of the page). accent2: the one secondary
// accent — decorative and sparing (eyebrows, illustrations, the marker on "this morning"). status: three muted hues.
export const PALETTES = [
  {
    key: 'verdigris', name: 'Verdigris', hue: 196, chroma: 0.105, tint: [0.003, 0.005],
    accent2: { hue: 72, chroma: 0.13 }, status: { ok: 150, warn: 52, bad: 10, waiting: 305 },
    why: 'The patina on brass and copper fittings — the colour interiors turn with age — and the green of a ledger that balances. Cool, sea-glass neutrals; marigold as the one warm note, the colour of every Indian site opening. It is not the blue of the template, and it does not compete with the status set.',
  },
  {
    key: 'ink', name: 'Ink & Brass', hue: 290, chroma: 0.12, tint: [0.010, 0.020],
    accent2: { hue: 85, chroma: 0.12 }, status: { ok: 150, warn: 60, bad: 20, waiting: 220 },
    why: 'Fountain-pen ink on a contract, brass hardware on the joinery. Warm mauve-grey neutrals; brass sparingly. It reads as finance software immediately — which is also its weakness: it sits in the same violet-blue band as Linear and Stripe.',
  },
  {
    key: 'laterite', name: 'Laterite', hue: 42, chroma: 0.11, tint: [0.010, 0.018],
    accent2: { hue: 200, chroma: 0.10 }, status: { ok: 140, warn: 88, bad: 0, waiting: 250 },
    why: 'Red earth and brick — the ground every Indian site is dug in — with warm stone neutrals and deep teal as the counterpoint. The most distinctive of the three; but a warm-red primary shares a neighbourhood with the error colour, so every destructive control has to lean on shape and words.',
  },
];
export const CHOSEN_KEY = 'verdigris';

// ---- the generator -------------------------------------------------------------------------------------
function build(p, mode) {
  const light = mode === 'light'; const H = p.hue; const [tl, td] = p.tint; const t = light ? tl : td;
  const A2 = p.accent2.hue, OK = p.status.ok, WA = p.status.warn, BA = p.status.bad, WT = p.status.waiting;
  // One CONTRAST for the whole semantic set, and then as much chroma as sRGB will give each hue at the
  // lightness that contrast implies. Constant chroma was the previous rule and it is what turned amber
  // into a brown: hue 52 reaches C 0.139 at L 0.535 and was being held to 0.082 because a teal cannot
  // do better. Contrast is the invariant because contrast is the requirement; chroma is a consequence.
  const AA = light ? 5.2 : 5.95;
  // the perceived-weight bound, set by looking at rendered swatches rather than by arithmetic:
  // at 0.15 amber and green are already at their sRGB ceiling and only red and violet are held back
  const WEIGHT = 0.150;
  const maxC = (L, h) => { let C = 0.30; while (C > 0 && !inGamut(L, C, h)) C -= 0.001; return r2(C * 1000) / 1000; };
  const S = light ? {
    ground: [0.962, t, H], panel: [0.992, t * 0.35, H], elevated: [1.0, 0, H], sunk: [0.972, t * 0.8, H],
    'accent-soft': [0.945, 0.045, H], 'ok-soft': [0.955, 0.040, OK], 'warn-soft': [0.958, 0.044, WA], 'bad-soft': [0.955, 0.036, BA], 'waiting-soft': [0.955, 0.040, WT], 'idle-soft': [0.950, t, H],
    select: [0.955, 0.028, H], 'track': [0.928, 0.040, H], skeleton: [0.925, t, H], 'skeleton-hi': [0.960, t * 0.6, H],
    illo: [0.652, 0.052, H], 'illo-deep': [0.552, 0.068, H],
  } : {
    ground: [0.200, t, H], panel: [0.245, t, H], elevated: [0.290, t, H], sunk: [0.222, t, H],
    'accent-soft': [0.320, 0.060, H], 'ok-soft': [0.302, 0.048, OK], 'warn-soft': [0.302, 0.048, WA], 'bad-soft': [0.302, 0.048, BA], 'waiting-soft': [0.302, 0.048, WT], 'idle-soft': [0.295, t * 0.7, H],
    select: [0.285, 0.036, H], 'track': [0.335, 0.048, H], skeleton: [0.300, t * 0.7, H], 'skeleton-hi': [0.340, t * 0.6, H],
    illo: [0.520, 0.052, H], 'illo-deep': [0.610, 0.068, H],
  };
  const NEUTRAL = ['ground', 'panel', 'elevated', 'sunk'];
  const TINTS = ['accent-soft', 'ok-soft', 'warn-soft', 'bad-soft', 'waiting-soft', 'idle-soft', 'select'];
  const T = light ? {
    ink:          { c: [0.245, 0.030, H], on: [...NEUTRAL, ...TINTS], min: 4.5, body: NEUTRAL },
    'ink-soft':   { c: [0.465, 0.030, H], on: [...NEUTRAL, ...TINTS], min: 4.5 },
    'ink-faint':  { c: [0.500, 0.026, H], on: [...NEUTRAL, ...TINTS], min: 4.5 },
    accent:       { c: [0.600, 0.300, H], on: [...NEUTRAL, ...TINTS], min: 4.5 },
    ok:           { c: [0.580, WEIGHT, OK], on: [...NEUTRAL, ...TINTS], min: 4.5, target: AA },
    warn:         { c: [0.580, WEIGHT, WA], on: [...NEUTRAL, ...TINTS], min: 4.5, target: AA },
    bad:          { c: [0.580, WEIGHT, BA], on: [...NEUTRAL, ...TINTS], min: 4.5, target: AA },
    waiting:      { c: [0.580, WEIGHT, WT], on: [...NEUTRAL, ...TINTS], min: 4.5, target: AA },
  } : {
    ink:          { c: [0.910, 0.010, H], on: [...NEUTRAL, ...TINTS], min: 4.5, body: NEUTRAL },
    'ink-soft':   { c: [0.745, 0.016, H], on: [...NEUTRAL, ...TINTS], min: 4.5 },
    'ink-faint':  { c: [0.690, 0.016, H], on: [...NEUTRAL, ...TINTS], min: 4.5 },
    accent:       { c: [0.720, 0.300, H], on: [...NEUTRAL, ...TINTS], min: 4.5 },
    ok:           { c: [0.680, WEIGHT, OK], on: [...NEUTRAL, ...TINTS], min: 4.5, target: AA },
    warn:         { c: [0.660, WEIGHT, WA], on: [...NEUTRAL, ...TINTS], min: 4.5, target: AA },
    bad:          { c: [0.700, WEIGHT, BA], on: [...NEUTRAL, ...TINTS], min: 4.5, target: AA },
    waiting:      { c: [0.680, WEIGHT, WT], on: [...NEUTRAL, ...TINTS], min: 4.5, target: AA },
  };
  const out = {}, oklch = {};
  for (const [k, v] of Object.entries(S)) { out[k] = hex(...v); oklch[k] = v.map((x, i) => i === 2 ? x : r2(x * 1000) / 1000); }
  for (const [k, tk] of Object.entries(T)) {
    let [L, C0, h] = tk.c; const dir = light ? -1 : 1; let guard = 0;
    const cAt = (x) => Math.min(C0, maxC(x, h));   // never ask sRGB for chroma it does not have
    const worst = (x) => Math.min(...tk.on.map(s => contrast(hex(x, cAt(x), h), out[s])));
    const pass = () => worst(L) >= tk.min && (!tk.body || tk.body.every(s => contrast(hex(L, cAt(L), h), out[s]) >= 7));
    while (!pass() && guard++ < 400) L += dir * 0.005;
    // Having cleared the floor, walk back toward the target contrast so every hue in a set sits at the
    // SAME contrast rather than the same chroma — then keep whatever chroma the gamut gives at that
    // lightness. This is what lets amber be amber and teal be teal in one coherent set.
    if (tk.target) { let best = L, bd = Math.abs(worst(L) - tk.target);
      for (let x = 0.30; x <= 0.90; x += 0.002) {
        if (worst(x) < tk.min) continue;
        if (tk.body && !tk.body.every(s => contrast(hex(x, cAt(x), h), out[s]) >= 7)) continue;
        const d = Math.abs(worst(x) - tk.target); if (d < bd) { bd = d; best = x; }
      }
      L = best; }
    const C = cAt(L); out[k] = hex(L, C, h); oklch[k] = [r2(L * 1000) / 1000, r2(C * 1000) / 1000, h];
  }
  { let L = light ? 0.62 : 0.52, C = 0.024; const dir = light ? -1 : 1; let g = 0; const hosts = [...NEUTRAL, ...TINTS, 'track'];
    while (!hosts.every(s => contrast(hex(L, C, H), out[s]) >= 3) && g++ < 100) L += dir * 0.005;
    out['line-strong'] = hex(L, C, H); oklch['line-strong'] = [r2(L * 1000) / 1000, C, H]; }
  const line = light ? [0.845, t + 0.004, H] : [0.365, t, H]; out.line = hex(...line); oklch.line = line;
  out['on-accent'] = light ? out.elevated : out.ground; oklch['on-accent'] = light ? oklch.elevated : oklch.ground;
  out['on-ok'] = out['on-accent']; oklch['on-ok'] = oklch['on-accent'];
  out.focus = out.accent; oklch.focus = oklch.accent;
  { const [al, ac] = oklch.accent; const L = light ? al - 0.06 : al + 0.06; const C = Math.min(ac, maxC(L, H));
    out['accent-hover'] = hex(L, C, H); oklch['accent-hover'] = [r2(L * 1000) / 1000, r2(C * 1000) / 1000, H]; }
  // Marigold survives in exactly one place — the accent inside the drawing sprite. It is not a brand
  // token in the UI and it is never a status; the containment gate fails the build if any element
  // outside symbol.illo-art computes to it. It must clear 3:1 against the panel (WCAG 1.4.11: a
  // graphic that carries meaning), which is darker than any colour text can sit on — and it is the
  // one token exempt from the brand-most-chromatic rule, because it also has to out-rank the two
  // illustration fills it sits between. That rank is measured, not assumed.
  const ia = light ? [0.660, Math.min(0.165, maxC(0.660, A2)), A2] : [0.780, Math.min(0.140, maxC(0.780, A2)), A2];
  out['illo-accent'] = hex(...ia); oklch['illo-accent'] = [r2(ia[0] * 1000) / 1000, r2(ia[1] * 1000) / 1000, ia[2]];
  // chart marks — inside the dataviz lightness band (light .43–.77, dark .48–.67), checked by the validator
  // the mark takes as much chroma as sRGB allows at its lightness (a teal cannot reach what a violet can)
  // ---- the chart set --------------------------------------------------------------------------------
  // Hues 196 / 254 / 94 solved jointly for both themes: ONE hue set, because colour follows the entity
  // and a series may not change identity when the theme does. The warm band 30–90 is excluded on
  // purpose — amber is the caution status and marigold the illustration accent, and a chart series is
  // neither; it also keeps the no-thin-amber-stroke rule intact. Crimson 12 is held back for the
  // failure point, so red never means "series 4".
  const SERIES = [H, 254, 94];
  // series-1 also fills a meter, so it has to clear 3:1 against the track it sits in, not only the panel
  const placeMark = (h, alsoOn = []) => {
    const band = light ? [0.43, 0.77] : [0.48, 0.67]; let best = null;
    for (let L = band[0]; L <= band[1]; L += 0.002) {
      const C = Math.min(0.19, maxC(L, h)); if (C < 0.10) continue;
      const c = hex(L, C, h); const ct = contrast(c, out.panel); if (ct < 3) continue;
      if (alsoOn.some(s => contrast(c, out[s]) < 3)) continue;
      const score = C + (ct >= 3.5 ? 0.02 : 0);
      if (!best || score > best.score) best = { score, v: [r2(L * 1000) / 1000, C, h] };
    }
    return best.v;
  };
  SERIES.forEach((h, i) => { const v = placeMark(h, i === 0 ? ['track'] : []); out[`series-${i + 1}`] = hex(...v); oklch[`series-${i + 1}`] = v; });
  { const v = placeMark(BA); out['chart-point-bad'] = hex(...v); oklch['chart-point-bad'] = v; }
  // the threshold is a neutral dashed rule: it states where a limit is, and a limit is not a status
  { let L = light ? 0.60 : 0.60, C = 0.010; const dir = light ? -1 : 1; let g = 0;
    while (contrast(hex(L, C, H), out.panel) < 3 && g++ < 200) L += dir * 0.005;
    const v = [r2(L * 1000) / 1000, C, H]; out['chart-threshold'] = hex(...v); oklch['chart-threshold'] = v; }
  // the band is an AREA, which is the one shape amber can hold at low contrast — emitted with alpha,
  // like --scrim, so it tints whatever it lies over instead of hiding it
  { const wa = light ? [0.700, Math.min(0.17, maxC(0.700, WA)), WA] : [0.700, Math.min(0.17, maxC(0.700, WA)), WA];
    out['chart-band'] = `rgba(${rgbOf(hex(...wa)).join(', ')}, ${light ? '.22' : '.26'})`; }


  // shadows carry the hue: a tinted page never gets a grey shadow
  const sh = light ? rgbOf(hex(0.32, 0.06, H)).join(', ') : '0, 0, 0';
  const shadows = light
    ? { 'shadow-1': `0 1px 2px rgba(${sh}, .06), 0 1px 3px rgba(${sh}, .05)`, 'shadow-2': `0 6px 16px rgba(${sh}, .10), 0 1px 3px rgba(${sh}, .06)`, 'shadow-3': `0 24px 56px rgba(${sh}, .18), 0 6px 16px rgba(${sh}, .08)`, glow: `0 0 0 4px ${hex(0.88, 0.06, H)}`, scrim: `rgba(${sh}, .42)` }
    : { 'shadow-1': `0 1px 2px rgba(${sh}, .40), 0 1px 3px rgba(${sh}, .30)`, 'shadow-2': `0 6px 16px rgba(${sh}, .50), 0 1px 3px rgba(${sh}, .35)`, 'shadow-3': `0 24px 56px rgba(${sh}, .60), 0 6px 16px rgba(${sh}, .40)`, glow: `0 0 0 4px ${hex(0.40, 0.07, H)}`, scrim: `rgba(${sh}, .62)` };
  return { key: p.key, name: p.name, mode, hex: out, oklch, shadows, text: Object.keys(T), surfaces: [...NEUTRAL, ...TINTS], neutral: NEUTRAL, body: T.ink.body, T, hue: H };
}
export const THEMES = Object.fromEntries(PALETTES.map(p => [p.key, { light: build(p, 'light'), dark: build(p, 'dark'), def: p }]));
export const CHOSEN = PALETTES.find(p => p.key === CHOSEN_KEY);
export const LIGHT = THEMES[CHOSEN_KEY].light;
export const DARK = THEMES[CHOSEN_KEY].dark;
export const BRAND_HUE = CHOSEN.hue;

// ---- checks used by the build --------------------------------------------------------------------------
export function verify(theme) {
  const problems = []; const m = `${theme.key}/${theme.mode}`;
  for (const k of theme.text) for (const s of theme.T[k].on) { const c = contrast(theme.hex[k], theme.hex[s]); if (c < 4.5) problems.push(`${m}: ${k} on ${s} ${r2(c)} < 4.5`); }
  for (const s of theme.body) { const c = contrast(theme.hex.ink, theme.hex[s]); if (c < 7) problems.push(`${m}: body ink on ${s} ${r2(c)} < 7 (AAA)`); }
  for (const s of theme.surfaces) { const c = contrast(theme.hex['line-strong'], theme.hex[s]); if (c < 3) problems.push(`${m}: line-strong on ${s} ${r2(c)} < 3`); }
  for (const [a, b] of [['on-accent', 'accent'], ['on-accent', 'accent-hover'], ['on-ok', 'ok']]) { const c = contrast(theme.hex[a], theme.hex[b]); if (c < 4.5) problems.push(`${m}: ${a} on ${b} ${r2(c)} < 4.5`); }
  // ---- the palette rules, as build failures rather than prose --------------------------------------
  // CONSTANT CONTRAST, not constant chroma. The accessibility requirement is the invariant; lightness
  // and chroma vary per hue as the sRGB gamut demands. Holding chroma constant instead is what rendered
  // amber as #935f3f, a brown, because a teal cannot reach the chroma an amber can.
  const worstOn = (k) => Math.min(...theme.surfaces.map(s => contrast(theme.hex[k], theme.hex[s])));
  const cs = SEMANTIC.map(worstOn);
  if (Math.max(...cs) - Math.min(...cs) > 0.15)
    problems.push(`${m}: semantic contrast is not constant (${r2(Math.min(...cs))}–${r2(Math.max(...cs))}:1)`);
  // The brand no longer has to out-saturate the status set — see the note above the WEIGHT constant.
  // What it must still out-saturate is CHROME: the surfaces the brand owns, where a status never appears.
  const CHROME = ['line', 'line-strong', 'ink', 'ink-soft', 'ink-faint', 'skeleton', 'skeleton-hi', 'track', 'idle-soft'];
  for (const k of CHROME) { const o = theme.oklch[k]; if (!o) continue;
    if (o[1] > theme.oklch.accent[1]) problems.push(`${m}: chrome token --${k} chroma ${o[1]} exceeds the brand's ${theme.oklch.accent[1]}`); }
  // No two semantic hues closer than 40 degrees — measured on the PAINTED hue, not the asked-for one.
  // 8-bit rounding put hue 12 at 12.7, which read as exactly 40 from bad to warn while painting 39.0.
  const hs = [...SEMANTIC.map(k => [k, hueOf(theme.hex[k])]), ['accent', hueOf(theme.hex.accent)]].sort((a, b) => a[1] - b[1]);
  for (let i = 0; i < hs.length; i++) { const a = hs[i], b = hs[(i + 1) % hs.length];
    let d = Math.abs(b[1] - a[1]); d = Math.min(d, 360 - d);
    if (d < 40) problems.push(`${m}: ${a[0]} and ${b[0]} paint ${r2(d)}° apart, under the 40° floor`); }
  // ---- the chart set, against the dataviz standard rather than the status one ---------------------
  // A chart line has no text beside it, so every pair is checked for discriminability WITH NO ADJACENT
  // TEXT: under normal vision, and under both dichromacies, which is the condition that actually breaks.
  for (const k of CHART_SET) {
    const o = theme.oklch[k];
    if (o[1] < 0.10) problems.push(`${m}: --${k} chroma ${o[1]} is under the dataviz floor of 0.10 — it reads grey`);
    const band = theme.mode === 'light' ? [0.43, 0.77] : [0.48, 0.67];
    if (o[0] < band[0] || o[0] > band[1]) problems.push(`${m}: --${k} lightness ${o[0]} is outside the dataviz band ${band[0]}–${band[1]}`);
    if (contrast(theme.hex[k], theme.hex.panel) < 3) problems.push(`${m}: --${k} on panel ${r2(contrast(theme.hex[k], theme.hex.panel))} < 3`);
  }
  for (const k of ['chart-threshold']) if (contrast(theme.hex[k], theme.hex.panel) < 3)
    problems.push(`${m}: --${k} on panel ${r2(contrast(theme.hex[k], theme.hex.panel))} < 3`);
  if (contrast(theme.hex['series-1'], theme.hex.track) < 3)
    problems.push(`${m}: --series-1 on its own track ${r2(contrast(theme.hex['series-1'], theme.hex.track))} < 3`);
  for (let i = 0; i < CHART_SET.length; i++) for (let j = i + 1; j < CHART_SET.length; j++) {
    const a = theme.hex[CHART_SET[i]], b = theme.hex[CHART_SET[j]];
    const g = cvdGap(a, b), n = dE(oklab(a), oklab(b));
    if (g < 8) problems.push(`${m}: --${CHART_SET[i]} and --${CHART_SET[j]} are CVD ΔE ${r2(g)} apart, under the floor of 8`);
    if (n < 15) problems.push(`${m}: --${CHART_SET[i]} and --${CHART_SET[j]} are ΔE ${r2(n)} apart to normal vision, under the floor of 15`);
  }

  // a declared OKLCH that the pixel does not have is a lie the token table would print
  for (const k of ORDER) { const o = theme.oklch[k]; if (!o) continue;
    if (hex(o[0], o[1], o[2]) !== theme.hex[k]) problems.push(`${m}: --${k} declared ${o[0]} ${o[1]} ${o[2]}° renders ${hex(o[0], o[1], o[2])}, not ${theme.hex[k]}`); }
  for (const s of ['panel', 'ground', 'elevated']) { const c = contrast(theme.hex.focus, theme.hex[s]); if (c < 3) problems.push(`${m}: focus ring on ${s} ${r2(c)} < 3`); }
  // every PRINTED cell must be AA too, so the table can never show a failing pair
  for (const k of theme.text) for (const s of theme.surfaces) { const c = contrast(theme.hex[k], theme.hex[s]); if (c < 4.5) problems.push(`${m}: printed pair ${k} on ${s} ${r2(c)} < 4.5`); }
  return problems;
}

// ---- CSS emission --------------------------------------------------------------------------------------
const ORDER = ['ground', 'panel', 'elevated', 'sunk', 'select', 'ink', 'ink-soft', 'ink-faint', 'line', 'line-strong', 'accent', 'accent-soft', 'accent-hover', 'on-accent', 'focus', 'ok', 'ok-soft', 'on-ok', 'warn', 'warn-soft', 'waiting', 'waiting-soft', 'bad', 'bad-soft', 'idle-soft', 'series-1', 'series-2', 'series-3', 'chart-point-bad', 'chart-threshold', 'chart-band', 'track', 'illo', 'illo-deep', 'illo-accent', 'skeleton', 'skeleton-hi'];
export const CHART_SET = ['series-1', 'series-2', 'series-3', 'chart-point-bad'];
// The semantic set, in the order a job moves through it. 'active' is deliberately absent: an in-progress
// state gets the neutral pill and a dot, and no hue at all — which is what gives green its meaning back.
export const SEMANTIC = ['ok', 'warn', 'waiting', 'bad'];
export const BRAND_TOKENS = ['accent', 'accent-soft', 'accent-hover', 'focus', 'mark', 'track', 'illo', 'illo-deep', 'select', 'idle-soft', 'skeleton', 'skeleton-hi', 'ground', 'panel', 'elevated', 'sunk', 'line', 'line-strong', 'ink', 'ink-soft', 'ink-faint'];
export function cssVars(theme) {
  return ORDER.map(k => `--${k}: ${theme.hex[k]};`).join(' ') + ' ' + Object.entries(theme.shadows).map(([k, v]) => `--${k}: ${v};`).join(' ');
}
// The type ramp as data. tokenCss() emits it, the specimen in section 0 renders it, and the two cannot
// disagree because there is only one list. Each step is a size AND its leading — the defect that produced
// 25 line-heights for 28 sizes was leading being chosen separately from size.
export const TYPE_STEPS = [
  ['micro', 11, 16, 'text', 400, 'a count on a badge, a keyboard hint'],
  ['meta', 12.5, 17, 'text', 400, 'a table cell, a caption, a sub-line'],
  ['label', 13, 18, 'text', 400, 'a field label and its hint'],
  ['body', 14, 20, 'text', 400, 'secondary text, and most of the product'],
  ['read', 15, 22, 'text', 400, 'body — the page default, and this document'],
  ['lead', 16, 24, 'text', 600, 'a card title'],
  ['quote', 18, 26, 'display', 600, 'a pulled sentence'],
  ['h3', 20, 28, 'display', 600, 'a section heading inside a screen'],
  ['h2', 22, 30, 'display', 600, 'a card title in a drawer'],
  ['h1', 30, 36, 'display', 600, 'a page title'],
  ['display', 40, 44, 'display', 600, 'the largest fixed size in the set'],
];
// Four fluid steps. A display number sizes itself from the box it is in, so it cannot sit on a fixed
// ramp — it is a range, and the range is the specification.
export const TYPE_FLUID = [
  ['hero', 'clamp(36px, 5.5cqw, 62px)', 'the one number on a screen'],
  ['fig', 'clamp(26px, 13cqw, 48px)', 'a figure inside a card'],
  ['stat', 'clamp(20px, 11.5cqw, 30px)', 'a stat value'],
  ['stat-sm', 'clamp(18px, 11cqw, 24px)', 'a stat value in a tight column'],
  ['title', 'clamp(21px, 2.9cqw, 30px)', 'a page title inside a frame'],
];

export function tokenCss() {
  const cand = '';
  return `:root {
  color-scheme: light;
  ${cssVars(LIGHT)}
  /* Spacing. Derived from the design rather than imposed on it: the census found 31 distinct values in
     use, which is a ruler, not a scale. A 2px step where the chrome is dense — chips, pills, the gap
     between an icon and its label — and a coarse step where blocks are placed. Nothing outside this set. */
  --s-1: 2px; --s-2: 4px; --s-3: 6px; --s-4: 8px; --s-5: 10px; --s-6: 12px; --s-7: 14px; --s-8: 16px;
  --s-9: 20px; --s-10: 24px; --s-11: 32px; --s-12: 40px; --s-13: 56px; --s-14: 80px; --s-15: 120px;
  /* Radius, motion and type. One easing, three durations. */
  --r-xs: 4px; --r-sm: 6px; --r-ctl: 8px; --r-card: 12px; --r-lg: 16px; --r-pill: 999px; --r-round: 50%;
  --ring: 2px;  /* the surface-coloured ring that separates one overlapping mark from another */
  --ease: cubic-bezier(.2, 0, 0, 1); --t-fast: 150ms; --t-base: 200ms; --t-slow: 250ms;
  /* Type. Eleven steps, each a size paired with its leading — leading chosen separately from
     size is what produced 25 line-heights for 28 sizes. Generated from TYPE_STEPS, which the specimen
     in section 0 also renders, so the document cannot advertise a size the system does not have. */
  ${TYPE_STEPS.map(([n, px, lh]) => `--fs-${n}: ${px}px; --lh-${n}: ${lh}px;`).join('\n  ')}
  ${TYPE_FLUID.map(([n, v]) => `--fs-${n}: ${v};`).join(' ')}
  --measure: 72ch; --measure-tight: 48ch;   /* one cap for running prose, one for centred copy */
  --ls-display: -.02em; --ls-heading: -.01em; --ls-caps: .07em;
  /* Control geometry. A button and a text input that sit in the same row are the same height, or the
     row is visibly out of true — they were 38 and 40. A checkbox is one size everywhere. */
  --h-ctl: 40px; --h-ctl-sm: 30px; --h-ctl-lg: 46px; --h-box: 18px;
  --avatar: 26px; --avatar-lg: 32px;   /* a person named in a row, and the person signed in */
  --lh-fluid: 1.12;   /* the leading for a display number that sizes itself from its container */
  --tr-ctl: background var(--t-fast) var(--ease), border-color var(--t-fast) var(--ease), box-shadow var(--t-fast) var(--ease), color var(--t-fast) var(--ease), transform var(--t-fast) var(--ease);
  --tr-card: box-shadow var(--t-base) var(--ease), transform var(--t-base) var(--ease), border-color var(--t-base) var(--ease);
  --illo-lg: 168px; --illo-sm: 120px;   /* an illustration filling an empty state, or set into a block */
  --focus-ring: 2px; --focus-offset: 2px;  /* one ring, one offset, everywhere in the set */
  --o-disabled: .5;     /* the only opacity in the system: a control that cannot be used */
  --font-text: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
  --font-display: 'Newsreader', Cambria, 'Palatino Linotype', 'Iowan Old Style', serif;
  --font-mono: ui-monospace, Consolas, 'SF Mono', Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme: dark; ${cssVars(DARK)} } }
:root[data-theme="dark"] { color-scheme: dark; ${cssVars(DARK)} }
${cand}`;
}

// ---- section-0 tables ----------------------------------------------------------------------------------
const ROLE = {
  ground: 'page', panel: 'card', elevated: 'drawer · menu · popover', sunk: 'group rows · kanban column · rail', select: 'selected row',
  ink: 'body text', 'ink-soft': 'secondary text', 'ink-faint': 'tertiary text', line: 'hairline', 'line-strong': 'control border (3:1)',
  accent: 'primary — action, links, active nav, focus', 'accent-soft': 'primary tint', 'accent-hover': 'the primary under the pointer — a token, not a filter', 'on-accent': 'text on the primary', focus: 'focus ring (glow)',
  ok: 'done · accepted · signed off · in force', 'ok-soft': 'done fill', 'on-ok': 'tick on done',
  warn: 'caution · watch this before it becomes a problem', 'warn-soft': 'caution fill',
  waiting: 'waiting on a named person — not a problem yet, just not yours', 'waiting-soft': 'waiting fill',
  bad: 'money going the wrong way · refused · failed · over', 'bad-soft': 'bad fill',
  'idle-soft': 'neutral pill fill — idle, and in-progress with a dot',
  'series-1': 'chart · the first series, and a lone series — the brand, because a line carries identity, not condition',
  'series-2': 'chart · the second series', 'series-3': 'chart · the third series',
  'chart-point-bad': 'chart · a POINT marking a genuine failure — never a line',
  'chart-threshold': 'chart · the neutral dashed rule saying where a limit is',
  'chart-band': 'chart · a caution FILL over an out-of-tolerance region — an area, which is the one shape amber can hold',
  'track': 'the unfilled part of any bar — meter, progress, setup. NOT a chart token; shared on purpose',
  illo: 'illustration · the near plane', 'illo-deep': 'illustration · the plane behind it, and the ground',
  'illo-accent': 'marigold, and the only marigold left — the accent inside the drawing sprite (3:1, both themes)',
  skeleton: 'loading', 'skeleton-hi': 'loading shimmer',
};
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
export function tokenTable(theme) {
  const rows = ORDER.map(k => { const o = theme.oklch[k]; return `<tr><td><code>--${k}</code></td><td>${esc(ROLE[k] || '')}</td><td><span class="dsx-chip is-specimen" style="background:${theme.hex[k]}" aria-hidden="true"></span><code>${theme.hex[k]}</code></td><td class="num">${o ? `${(o[0] * 100).toFixed(1)}% ${Number(o[1]).toFixed(3)} ${o[2]}°` : '—'}</td></tr>`; }).join('');
  return `<div class="tbl-wrap"><table class="dsx-t dsx-tok"><thead><tr><th>Token</th><th>Role</th><th>Value</th><th class="num">OKLCH L C h</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
export function pairTable(theme) {
  const cols = theme.surfaces;
  const head = `<tr><th>Text ↓ on surface →</th>${cols.map(s => `<th class="num"><code>${s}</code></th>`).join('')}</tr>`;
  const body = theme.text.map(k => `<tr><td><code>${k}</code></td>${cols.map(s => {
    const used = theme.T[k].on.includes(s); const c = contrast(theme.hex[k], theme.hex[s]); const isBody = theme.T[k].body?.includes(s);
    const grade = c >= 7 ? 'AAA' : c >= 4.5 ? 'AA' : c >= 3 ? 'large only' : 'fail';
    return `<td class="num ${used ? 'used' : 'unused'}" title="${used ? 'used in the stylesheet' : 'not used'}">${c.toFixed(2)}<small>${grade}${isBody ? ' · body' : ''}${used ? '' : ' · unused'}</small></td>`;
  }).join('')}</tr>`).join('');
  const extra = [['on-accent', 'accent'], ['on-ok', 'ok'], ...theme.surfaces.map(s => ['line-strong', s]), ['focus', 'panel'], ['focus', 'ground'], ['focus', 'elevated']].map(([a, b]) => { const c = contrast(theme.hex[a], theme.hex[b]); const target = a.startsWith('on-') ? 4.5 : 3; return `<tr><td><code>${a}</code> on <code>${b}</code></td><td class="num used">${c.toFixed(2)}<small>${c >= target ? (target === 3 ? '≥ 3 : 1' : 'AA') : 'fail'}</small></td></tr>`; }).join('');
  return `<div class="tbl-wrap"><table class="dsx-t dsx-pairs"><thead>${head}</thead><tbody>${body}</tbody></table></div>
<div class="tbl-wrap" style="margin-top:var(--s-5);max-width:520px"><table class="dsx-t dsx-pairs"><thead><tr><th>Non-text and inverse pairs</th><th class="num">Ratio</th></tr></thead><tbody>${extra}</tbody></table></div>`;
}
export function summary() {
  // The chosen palette's problems are fatal. The two candidates are checked by the same rules and their
  // failures are REPORTED rather than fixed — a candidate that cannot pass is an argument for the one
  // that was chosen, and hiding it would make the comparison in section 0 dishonest.
  const problems = [...verify(LIGHT), ...verify(DARK)];
  const candidateProblems = [];
  for (const p of PALETTES) { if (p.key === CHOSEN_KEY) continue;
    candidateProblems.push(...verify(THEMES[p.key].light), ...verify(THEMES[p.key].dark)); }
  return { brand: { hue: BRAND_HUE, name: CHOSEN.name, light: LIGHT.hex.accent, dark: DARK.hex.accent }, light: LIGHT.hex, dark: DARK.hex, problems, candidateProblems };
}

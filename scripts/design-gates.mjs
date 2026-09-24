#!/usr/bin/env node
// The design gates that can be checked without a browser.
//
// `docs/design/` is built under a gate that renders every file and measures
// the result. Its scripts are checked in under `docs/design/build/gates/`
// (since 19 September 2026; they were not before), and the checks are ported
// here as rules over the product's source, not run as those files. What a
// browser has to see — the alignment at four widths, that every list carries a
// count and every empty state an illustration, the dashboard grid — lives in
// `e2e/design-gates.spec.ts` and `e2e/dashboard-gates.spec.ts` and runs under
// `test:e2e`. This script is the static half, and `scripts/verify.mjs` runs it
// as the `design` step.
//
// Each gate is a function that returns faults; a fault is a file, a line and a
// sentence. The exit status is non-zero if any gate found one, and every gate
// runs even when an earlier one failed, for the same reason `verify.mjs` does.
//
// Six gates: `literals`, `charts`, `caution`, `contrast`, `ladder`, `traps`.
// The first four were each proven to fire before it was trusted — a planted literal, a `.spark` rule painting
// `--bad`, a `border-color: var(--warn)`, and an `--ink-faint` lightened to
// 2:1 — and each reported the plant and nothing else. The caution gate was
// amended on 19 September 2026 and proven again on two plants: a
// `border-color: var(--warn)` and a `.figure { background: var(--warn-soft) }`.
//
// ---------------------------------------------------------------------------
// literals — no value outside `styles.css`
// ---------------------------------------------------------------------------
//
// `packages/design-system/src/styles.css` is the only place a colour, a
// radius, a shadow, a space or a type size may be written as a value. Every
// other file references a token. The gate reads every `.css`, `.tsx`, `.ts`
// and `.mjs` under `apps/` and `packages/` and fails on:
//
//   - a colour written anywhere but the token block: a hex, an `rgb()`,
//     `hsl()` or `oklch()`, or a named CSS colour in a property value
//   - a `margin`, `padding`, `gap`, `border-radius`, `box-shadow`,
//     `font-size` or `line-height` carrying a pixel literal
//   - an inline `style={{ … }}` in JSX, except one that only sets a custom
//     property or a data-carrying dimension (a bar's width)
//
// Declared out of scope, exactly as the design's own gate declared them, so
// the check is not fighting false positives: a 1px hairline border, outline
// or ring; a container dimension (`width`, `height`, `min-`/`max-`,
// `grid-template-columns`, `flex-basis`); coordinates and geometry inside an
// SVG; and a value carrying a datum. The token block itself — `:root` and the
// two theme blocks — is where values live and is not scanned.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const REPO = process.cwd();
// Compared against `rel()`, which always yields forward slashes.
const TOKEN_FILE = 'packages/design-system/src/styles.css';

/** @typedef {{ file: string, line: number, gate: string, what: string }} Fault */

/**
 * @param {string} dir
 * @param {string[]} out
 * @returns {string[]}
 */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.next', '.e2e', '.turbo', 'fonts', 'coverage'].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(css|tsx|ts|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** @param {string} file */
function rel(file) {
  return relative(REPO, file).split(sep).join('/');
}

/**
 * Strip comments so a hex mentioned in prose is not a value. Block comments
 * are replaced by the same number of newlines, so line numbers survive.
 * @param {string} src
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, lead) => lead + ' '.repeat(m.length - lead.length));
}

const COLOUR = /#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})\b|\b(?:rgba?|hsla?|oklch|oklab)\(/i;
const NAMED_COLOUR =
  /(?:^|[\s;{])(?:color|background|background-color|border-color|fill|stroke|outline-color)\s*:\s*(?:white|black|red|green|blue|grey|gray|orange|yellow|purple|pink|silver|navy|teal|maroon|olive|lime|aqua|fuchsia)\b/i;
// A pixel literal on a property that has a token family. `0` is not a literal.
const SPACED_PROP =
  /(?:^|[\s;{])(margin|margin-(?:top|right|bottom|left|block|inline)|padding|padding-(?:top|right|bottom|left|block|inline)|gap|row-gap|column-gap|border-radius|box-shadow|font-size|line-height)\s*:\s*([^;}]*)/gi;
const PX = /(?<![\w.-])(?!0px)\d*\.?\d+px\b/;
// A ring or hairline: `inset 0 0 0 1px`, `0 0 0 2px`, or a bare `1px`.
const HAIRLINE = /^(?:inset\s+)?0\s+0\s+0\s+(?:1px|var\(--ring\)|var\(--focus-ring\))\s+var\(/;

/**
 * Split a stylesheet into the token blocks (not scanned) and the rest.
 *
 * Since the repaint (TOKEN-DIFF, `docs/design/tokens.css` at a45a9b4) a
 * token block is any rule whose selector is only theme roots — `:root`,
 * `[data-theme]`, `[data-theme="dark"]`, `.page-theme` and their descendant
 * combinations — and any `@keyframes`, wherever it sits, because the
 * published motion keyframes carry the travel they animate. A rule that
 * styles an element is never a token block, whatever its selector.
 * @param {string} css
 * @returns {string} the css with token blocks blanked, line count preserved
 */
function withoutTokenBlocks(css) {
  const TOKEN_SELECTOR =
    /^(?:\s*(?::root|\[data-theme(?:="(?:light|dark)")?\]|\.page-theme|\[data-motion="reduce"\])(?:\s*(?::root|\[data-theme(?:="(?:light|dark)")?\]|\.page-theme|:not\(\[data-theme="light"\]\)))*\s*,?)+\s*$/;
  let out = '';
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open === -1) {
      out += css.slice(i);
      break;
    }
    // the selector is what sits between the previous `;`, `{` or `}` and this `{`
    const start = Math.max(css.lastIndexOf('}', open - 1), css.lastIndexOf('{', open - 1), css.lastIndexOf(';', open - 1)) + 1;
    const selector = css.slice(start, open);
    const isBlock = TOKEN_SELECTOR.test(selector) || /^\s*@keyframes\s/.test(selector);
    if (!isBlock) {
      out += css.slice(i, open + 1);
      i = open + 1;
      continue;
    }
    let depth = 0;
    let j = open;
    for (; j < css.length; j += 1) {
      if (css[j] === '{') depth += 1;
      else if (css[j] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out += css.slice(i, start) + css.slice(start, j + 1).replace(/[^\n]/g, ' ');
    i = j + 1;
  }
  return out;
}

/**
 * @param {string} file
 * @param {string} src
 * @returns {Fault[]}
 */
function literalsInCss(file, src) {
  /** @type {Fault[]} */
  const faults = [];
  const scanned = file === TOKEN_FILE ? withoutTokenBlocks(stripComments(src)) : stripComments(src);
  const lines = scanned.split('\n');
  lines.forEach((text, index) => {
    const line = index + 1;
    if (COLOUR.test(text)) {
      faults.push({ file, line, gate: 'literals', what: `a colour outside the token block: ${text.trim()}` });
    }
    if (NAMED_COLOUR.test(text)) {
      faults.push({ file, line, gate: 'literals', what: `a named colour: ${text.trim()}` });
    }
    for (const match of text.matchAll(SPACED_PROP)) {
      const [, prop, value] = match;
      if (value === undefined || prop === undefined) continue;
      const v = value.trim();
      if (!PX.test(v)) continue;
      if (prop === 'box-shadow' && HAIRLINE.test(v)) continue;
      faults.push({ file, line, gate: 'literals', what: `\`${prop}: ${v}\` — a pixel literal where a token belongs` });
    }
  });
  return faults;
}

const INLINE_STYLE = /style=\{\{([^}]*)\}\}/g;
// Keys an inline style may set: a custom property, or a dimension that carries
// a datum — a bar's width or a marker's position.
const DATUM_KEY = /^(?:'--[\w-]+'|"--[\w-]+"|width|left|height|top)$/;

/**
 * @param {string} file
 * @param {string} src
 * @returns {Fault[]}
 */
function literalsInTsx(file, src) {
  /** @type {Fault[]} */
  const faults = [];
  const scanned = stripComments(src);
  const lines = scanned.split('\n');
  lines.forEach((text, index) => {
    const line = index + 1;
    // `href="#"` and `#${id}` anchors are not colours; only a hex with a digit run is.
    if (COLOUR.test(text) && !/href=|#\$\{|#\w+-/.test(text)) {
      faults.push({ file, line, gate: 'literals', what: `a colour in a component: ${text.trim()}` });
    }
  });
  for (const match of scanned.matchAll(INLINE_STYLE)) {
    const body = match[1] ?? '';
    const keys = body
      .split(',')
      .map((pair) => pair.split(':')[0]?.trim() ?? '')
      .filter((key) => key !== '');
    const offending = keys.filter((key) => !DATUM_KEY.test(key));
    if (offending.length > 0) {
      const line = scanned.slice(0, match.index).split('\n').length;
      faults.push({
        file,
        line,
        gate: 'literals',
        what: `inline style sets ${offending.join(', ')} — use a class that references a token`,
      });
    }
  }
  return faults;
}

/** @returns {Fault[]} */
function gateLiterals() {
  /** @type {Fault[]} */
  const faults = [];
  for (const root of ['apps', 'packages']) {
    for (const file of walk(join(REPO, root))) {
      const name = rel(file);
      const src = readFileSync(file, 'utf8');
      if (name.endsWith('.css')) faults.push(...literalsInCss(name, src));
      else faults.push(...literalsInTsx(name, src));
    }
  }
  return faults;
}

// ---------------------------------------------------------------------------
// charts — a chart mark carries identity, never a status colour
// ---------------------------------------------------------------------------
//
// A status pill has text beside it, so its colour is reinforcement; a chart
// line has none, so colour is its only channel. The chart token set
// (`--series-*`, `--chart-*`, `--track`) is a separate architecture, and no
// line is coloured by condition — the exception is a threshold, a band, a
// marker and words. So: every rule whose selector touches `.spark`, `.meter`,
// `.chart` or `.hbar`, and every line of `chart.tsx`, may reference no status
// token and no accent.

const CHART_SELECTOR = /\.(?:spark|meter|chart|hbar)\b/;
const STATUS_TOKEN = /var\(--(?:ok|warn|bad|waiting|accent)(?:-soft|-hover)?\)/g;

/** @returns {Fault[]} */
function gateCharts() {
  /** @type {Fault[]} */
  const faults = [];
  const css = stripComments(readFileSync(join(REPO, TOKEN_FILE), 'utf8'));
  let seen = 0;
  for (const match of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = match[1] ?? '';
    const body = match[2] ?? '';
    if (!CHART_SELECTOR.test(selector)) continue;
    seen += 1;
    for (const token of body.matchAll(STATUS_TOKEN)) {
      const line = css.slice(0, match.index ?? 0).split('\n').length;
      faults.push({ file: TOKEN_FILE, line, gate: 'charts', what: `${selector.trim()} paints ${token[0]}` });
    }
  }
  if (seen === 0) {
    faults.push({ file: TOKEN_FILE, line: 1, gate: 'charts', what: 'no chart rule found — a check with nothing to look for proves nothing' });
  }
  const chart = 'packages/design-system/src/chart.tsx';
  const src = stripComments(readFileSync(join(REPO, chart), 'utf8'));
  src.split('\n').forEach((text, index) => {
    for (const token of text.matchAll(STATUS_TOKEN)) {
      faults.push({ file: chart, line: index + 1, gate: 'charts', what: `a chart references ${token[0]}` });
    }
  });
  return faults;
}

// ---------------------------------------------------------------------------
// caution — amber is an ink, never a stroke or a border; its fill is for a
// lozenge or a section message only
// ---------------------------------------------------------------------------
//
// `--warn` is the INK and may appear only as `color`. Any other use — a
// border, a stroke, a fill of its own — fails. Caution as TEXT on a plain
// surface is allowed (amended 19 September 2026 with the design's own gate,
// `docs/design/build/gates/alignment.mjs` E3 — the owner's rule: no
// highlighter), and the contrast gate holds the pair `--warn` on every plain
// surface to 4.5:1. The caution FILL, `--warn-soft`, is for a lozenge and the
// published section message only — a pill, a notice, a due-today or a
// days-late lozenge — so a rule painting it under a figure, a label or a
// sentence is a highlighter and fails.
//
// Until 19 September the rule was the other way round — `--warn` only inside a
// rule that also painted `--warn-soft` — which kept every amber word on its
// own fill. The design set's overdue label (an amber small-capitals label over
// an ink figure, `04-today.html`) is what changed it.

/** The selectors a caution fill may sit under: a lozenge, or the published section message. */
const CAUTION_FILL_HOLDERS = /\.(pill|notice|next|late|due\.today|tag|flag|banner)\b/;

/** @returns {Fault[]} */
function gateCaution() {
  /** @type {Fault[]} */
  const faults = [];
  const css = stripComments(readFileSync(join(REPO, TOKEN_FILE), 'utf8'));
  const scanned = withoutTokenBlocks(css);
  let seen = 0;
  for (const match of scanned.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = (match[1] ?? '').trim();
    const body = match[2] ?? '';
    const line = scanned.slice(0, match.index ?? 0).split('\n').length;
    for (const decl of body.split(';')) {
      const [prop, value] = decl.split(':');
      if (prop === undefined || value === undefined) continue;
      if (/var\(--warn\)/.test(value)) {
        seen += 1;
        if (prop.trim() !== 'color') {
          faults.push({ file: TOKEN_FILE, line, gate: 'caution', what: `${selector} uses --warn as ${prop.trim()} — amber is an ink, never a ${prop.trim()}` });
        }
      }
      if (/var\(--warn-soft\)/.test(value) && /^\s*background(?:-color)?\s*$/.test(prop) && !CAUTION_FILL_HOLDERS.test(selector)) {
        faults.push({ file: TOKEN_FILE, line, gate: 'caution', what: `${selector} paints the caution fill under text — a highlighter; the fill is for a lozenge or a section message` });
      }
    }
  }
  if (seen === 0) {
    faults.push({ file: TOKEN_FILE, line: 1, gate: 'caution', what: 'no rule uses --warn — a check with nothing to look for proves nothing' });
  }
  // and in the components: nothing paints the caution ink directly
  for (const file of walk(join(REPO, 'packages', 'design-system', 'src'))) {
    if (!file.endsWith('.tsx')) continue;
    const src = stripComments(readFileSync(file, 'utf8'));
    src.split('\n').forEach((text, index) => {
      if (/var\(--warn\)/.test(text)) {
        faults.push({ file: rel(file), line: index + 1, gate: 'caution', what: 'a component paints --warn directly; the stylesheet owns that pair' });
      }
    });
  }
  return faults;
}

// ---------------------------------------------------------------------------
// contrast — every token pair actually used, both themes
// ---------------------------------------------------------------------------
//
// Text: AA (4.5:1) for every ink on every surface it sits on, AAA (7:1) for
// body ink on the neutral surfaces. Non-text (WCAG 1.4.11, 3:1): the control
// border and the focus ring on every surface, on-accent on accent, on-ok on
// ok, and every chart mark on the panel. Computed from the token block
// itself, so a value change that breaks a pair fails here before a screen is
// rendered. Both themes are read from the stylesheet, not retyped.

// Which ink sits on which surface in the repainted rules (TOKEN-DIFF, 20
// September 2026). The neutral inks, the link and the accent sit on every
// plain surface and on the selection fill; the lozenge inks on their own
// fills; the status inks on the section message's fills, with body ink beside
// them; caution as text on a plain surface (the overdue label over an ink
// figure); the inverse inks on the bold fills; the pill's and the tooltip's
// inverse ink on the inverse fill.
const USED_PAIRS = [
  ...['ground', 'panel', 'elevated', 'sunk', 'select', 'accent-soft'].flatMap((s) =>
    ['ink', 'ink-soft', 'ink-faint', 'accent', 'link', 'selected-ink'].map((i) => [i, s]),
  ),
  ['ink', 'idle-soft'],
  ['ink-soft', 'neutral'],
  ['lozenge-done-ink', 'lozenge-done'],
  ['lozenge-active-ink', 'lozenge-active'],
  ['lozenge-waiting-ink', 'lozenge-waiting'],
  ['lozenge-caution-ink', 'lozenge-caution'],
  ['lozenge-bad-ink', 'lozenge-bad'],
  ['lozenge-idle-ink', 'lozenge-idle'],
  ['tag-ink', 'tag-fill'],
  ['badge-ink', 'badge-fill'],
  ['badge-important-ink', 'badge-important'],
  ['island-important-ink', 'island-important'],
  ['ok', 'ok-soft'],
  ['warn', 'warn-soft'],
  ...['ground', 'panel', 'elevated', 'sunk'].map((s) => ['warn', s]),
  ['bad', 'bad-soft'],
  ['waiting', 'waiting-soft'],
  ['info', 'info-soft'],
  ['ink', 'ok-soft'],
  ['ink', 'warn-soft'],
  ['ink', 'bad-soft'],
  ['ink', 'waiting-soft'],
  ['ink', 'info-soft'],
  ['on-accent', 'accent'],
  ['on-accent', 'bad-bold'],
  ['on-warn-bold', 'warn-bold'],
  ['on-inverse', 'inverse-fill'],
  ['nav-current-ink', 'nav-current'],
  ['money-in', 'panel'],
  ['money-out', 'panel'],
  ['money-in', 'sunk'],
  ['money-out', 'sunk'],
  ['disabled-ink', 'disabled-fill'],
];
const NON_TEXT = [
  ...['ground', 'panel', 'elevated', 'sunk'].flatMap((s) => [['line-strong', s], ['focus', s]]),
  ['on-accent', 'accent'],
  ['on-ok', 'ok'],
  ['series-1', 'panel'],
  ['series-2', 'panel'],
  ['series-3', 'panel'],
  ['series-4', 'panel'],
  ['series-5', 'panel'],
  ['chart-point-bad', 'panel'],
  ['chart-threshold', 'panel'],
  ['chart-brand', 'panel'],
  // not `owed-overdue`: the overdue part of an owed bar is the fixed status
  // amber and labelled-redundant — its figure prints beneath it, which is what
  // the design's gate grants it by (README, labelled-redundant)
  ['owed-current', 'panel'],
  ['illo-line', 'panel'],
  ['check-on', 'panel'],
  ['selected-line', 'panel'],
  ...['blue', 'teal', 'green', 'purple', 'magenta', 'red', 'yellow', 'gray'].map((h) => [`disc-${h}-icon`, `disc-${h}`]),
];

/**
 * Every token of one theme, resolved to a colour.
 *
 * The block is three layers (`docs/design/tokens.css`): the published
 * primitives, the semantic tokens in light and dark, and this product's
 * component names, each a `var()` onto a semantic token. The light theme is
 * the `:root` rules; dark is the same names under `[data-theme="dark"]`. A
 * name is followed down its chain until a colour is reached; a value that is
 * not a colour (a shadow, a space) is left out. An 8-digit hex keeps its
 * alpha and is composited by `contrast` over the surface it sits on, which is
 * how the design's own gate reads the alpha neutrals.
 * @param {string} css
 * @param {'light' | 'dark'} theme
 * @returns {Map<string, string>}
 */
function tokensOf(css, theme) {
  /** @type {Map<string, string>} */
  const raw = new Map();
  const declare = (/** @type {string} */ block) => {
    for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      if (m[1] !== undefined && m[2] !== undefined) raw.set(m[1], m[2].trim());
    }
  };
  // every rule whose selector is a theme root, in source order; the dark
  // rules only for the dark theme, and the light-only rule only for light
  const RULE = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of stripComments(css).matchAll(RULE)) {
    const selector = (m[1] ?? '').trim();
    const body = m[2] ?? '';
    const isRoot = /^(?:\s*(?::root|\[data-theme(?:="[a-z]+")?\]|\.page-theme)[^,{]*,?)+$/.test(selector);
    if (!isRoot) continue;
    const dark = /"dark"/.test(selector) || /:not\(\[data-theme="light"\]\)/.test(selector);
    const light = /"light"/.test(selector);
    if (theme === 'light' && dark) continue;
    if (theme === 'dark' && light) continue;
    declare(body);
  }
  const map = new Map();
  const resolve = (/** @type {string} */ name, /** @type {number} */ depth) => {
    const v = raw.get(name);
    if (v === undefined || depth > 12) return undefined;
    const ref = /^var\(--([a-z0-9-]+)\)$/.exec(v);
    if (ref !== null && ref[1] !== undefined) return resolve(ref[1], depth + 1);
    return /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(v) ? v.toLowerCase() : undefined;
  };
  for (const name of raw.keys()) {
    const colour = resolve(name, 0);
    if (colour !== undefined) map.set(name, colour);
  }
  return map;
}

/** @param {string} hex a 6- or 8-digit hex @returns {[number, number, number, number]} */
function rgba(hex) {
  const n = (/** @type {number} */ at) => Number.parseInt(hex.slice(at, at + 2), 16);
  return [n(1), n(3), n(5), hex.length === 9 ? n(7) / 255 : 1];
}

/** `over` composited on `under` (both opaque after this), as a 6-digit hex. */
function composite(/** @type {string} */ over, /** @type {string} */ under) {
  const [r, g, b, a] = rgba(over);
  const [ur, ug, ub] = rgba(under);
  const mix = (/** @type {number} */ x, /** @type {number} */ y) => Math.round(x * a + y * (1 - a));
  return `#${[mix(r, ur), mix(g, ug), mix(b, ub)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** @param {string} hex a 6-digit hex */
function luminance(hex) {
  const channel = (/** @type {number} */ v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgba(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * The contrast of `a` over `b`. An alpha in either is composited first: the
 * surface over the theme's page, the ink over the surface — the way the eye
 * meets it.
 * @param {string} a @param {string} b @param {string} [page]
 */
function contrast(a, b, page = '#ffffff') {
  const surface = b.length === 9 ? composite(b, page) : b;
  const ink = a.length === 9 ? composite(a, surface) : a;
  const la = luminance(ink);
  const lb = luminance(surface);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** @returns {Fault[]} */
function gateContrast() {
  /** @type {Fault[]} */
  const faults = [];
  const css = readFileSync(join(REPO, TOKEN_FILE), 'utf8');
  for (const theme of /** @type {const} */ (['light', 'dark'])) {
    const t = tokensOf(css, theme);
    if (t.size < 30) {
      faults.push({ file: TOKEN_FILE, line: 1, gate: 'contrast', what: `only ${t.size} ${theme} tokens parsed — the block was not found` });
      continue;
    }
    const value = (/** @type {string} */ name) => {
      const v = t.get(name);
      if (v === undefined) throw new Error(`no token --${name} in the ${theme} block`);
      return v;
    };
    const page = value('ground');
    for (const [ink, surface] of USED_PAIRS) {
      if (ink === undefined || surface === undefined) continue;
      const ratio = contrast(value(ink), value(surface), page);
      // a disabled control is exempt from 1.4.3 — measured so it is seen, held to nothing
      if (ink === 'disabled-ink') continue;
      const floor = ink === 'ink' && ['ground', 'panel', 'elevated', 'sunk'].includes(surface) ? 7 : 4.5;
      if (ratio < floor) {
        faults.push({ file: TOKEN_FILE, line: 1, gate: 'contrast', what: `${theme}: --${ink} on --${surface} is ${ratio.toFixed(2)}:1, needs ${floor}:1` });
      }
    }
    for (const [mark, surface] of NON_TEXT) {
      if (mark === undefined || surface === undefined) continue;
      const ratio = contrast(value(mark), value(surface), page);
      if (ratio < 3) {
        faults.push({ file: TOKEN_FILE, line: 1, gate: 'contrast', what: `${theme}: --${mark} on --${surface} is ${ratio.toFixed(2)}:1, needs 3:1 (1.4.11)` });
      }
    }
  }
  return faults;
}

// ---------------------------------------------------------------------------
// ladder — a width query names only a rung of the declared ladder
// ---------------------------------------------------------------------------
//
// The stylesheet at 9be6735 keyed its folds to ten numbers on two bases:
// 1379, 1100, 1000, 999, 820, 760, 759, 640, 600 and 520, across `@media`
// (the window) and `@container` (`.app`, `.topbar`, `.main`). A layout keyed
// to the window and its neighbour keyed to the container folded at different
// moments, which is why screens differed from one another at one width. The
// ladder is now declared at the head of `styles.css`, one line per basis —
// the shell on `@media`, content on `@container` (the page's `main`, or the
// card the content sits in), the bar on `@container bar` — and this gate
// fails on any query naming a number off its basis's rungs, and on the
// `max-width:` / `min-width:` spelling, which is what let 999 and 1000 stand
// for the same fold. Proven on two plants (22 September 2026): a
// `@media (width < 777px)` and a `@container (max-width: 640px)`.

/**
 * The ladder as the stylesheet declares it, basis by basis.
 * @param {string} css
 * @returns {{ shell: number[], content: number[], bar: number[], side: number[] } | null}
 */
function ladderOf(css) {
  const head = css.slice(0, 4000);
  const rungs = (/** @type {string} */ basis) => {
    const m = new RegExp(`${basis}[^\\d\\n]*((?:\\d+ ?)+)`).exec(head);
    return m?.[1] === undefined ? null : m[1].trim().split(/ +/).map(Number);
  };
  const shell = rungs('shell @media');
  const content = rungs('content @container');
  const bar = rungs('bar @container bar');
  const side = rungs('side @container side');
  return shell === null || content === null || bar === null || side === null ? null : { shell, content, bar, side };
}

function gateLadder() {
  /** @type {Fault[]} */
  const faults = [];
  const css = readFileSync(join(REPO, TOKEN_FILE), 'utf8');
  const ladder = ladderOf(css);
  if (ladder === null) {
    faults.push({ file: TOKEN_FILE, line: 1, gate: 'ladder', what: 'the head of the stylesheet does not declare the ladder (shell @media … · content @container … · bar @container bar … · side @container side …)' });
    return faults;
  }
  const lines = css.split('\n');
  lines.forEach((text, i) => {
    const q = /^\s*@(media|container)\b([^{]*)\{/.exec(text);
    if (q === null || !/width/.test(q[2] ?? '')) return;
    const line = i + 1;
    const query = q[2] ?? '';
    if (/(max|min)-width\s*:/.test(query)) faults.push({ file: TOKEN_FILE, line, gate: 'ladder', what: `${text.trim()} — range syntax only: (width < Npx) or (width >= Npx)` });
    const basis = q[1] === 'media' ? 'shell' : /^\s*bar\b/.test(query) ? 'bar' : /^\s*side\b/.test(query) ? 'side' : 'content';
    for (const n of [...query.matchAll(/(\d+)px/g)].map((m) => Number(m[1]))) {
      if (!ladder[basis].includes(n)) faults.push({ file: TOKEN_FILE, line, gate: 'ladder', what: `${text.trim()} — ${String(n)} is not a rung of the ${basis} ladder (${ladder[basis].join(' ')})` });
    }
  });
  return faults;
}

// ---------------------------------------------------------------------------
// traps — a scrolling box with a max-height contains its overscroll
// ---------------------------------------------------------------------------
//
// A popover list that scrolls hands the wheel to the page behind it when it
// reaches its end, and the page scrolls away under the open list. Every rule
// that sets `overflow-y: auto` (or `overflow: auto`) together with a
// `max-height` must carry `overscroll-behavior: contain`; the declarations
// are gathered per selector across the file, so the three may sit in three
// blocks. Proven on a plant (22 September 2026): a `.plant-trap` with the two
// and not the third.

function gateTraps() {
  /** @type {Fault[]} */
  const faults = [];
  const css = stripComments(readFileSync(join(REPO, TOKEN_FILE), 'utf8'));
  /** @type {Map<string, { line: number, decl: string }>} */
  const rules = new Map();
  // every `selector { declarations }` block, at any nesting; the line is the block's first
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of css.matchAll(re)) {
    const selector = (m[1] ?? '').split('\n').pop()?.trim() ?? '';
    if (selector === '' || selector.startsWith('@')) continue;
    const line = css.slice(0, (m.index ?? 0) + (m[1] ?? '').lastIndexOf('\n') + 1).split('\n').length;
    const had = rules.get(selector);
    rules.set(selector, { line: had?.line ?? line, decl: `${had?.decl ?? ''};${m[2] ?? ''}` });
  }
  /** @type {Fault[]} */
  const found = [];
  for (const [selector, { line, decl }] of rules) {
    const scrolls = /overflow(?:-y)?\s*:\s*(?:[a-z]+\s+)?(?:auto|scroll)\b/.test(decl);
    const capped = /max-height\s*:\s*(?!none)/.test(decl);
    const contained = /overscroll-behavior(?:-y)?\s*:\s*(?:contain|none)/.test(decl);
    if (scrolls && capped && !contained) found.push({ file: TOKEN_FILE, line, gate: 'traps', what: `${selector} scrolls under a max-height without overscroll-behavior: contain` });
  }
  // the detector's baseline (e2e/alignment-baseline.json, rule j) holds the traps the product had
  // before the fix; a count within it is reported, not failed, until the file goes
  const held = baselineCount('styles.css · j');
  if (found.length > 0 && found.length <= held) {
    process.stdout.write(`  traps: ${String(found.length)} held by e2e/alignment-baseline.json\n`);
    for (const f of found) process.stdout.write(`    ${f.file}:${String(f.line)}  ${f.what}\n`);
    return faults;
  }
  return found;
}

/**
 * How many faults of a static rule the detector's baseline allows, or 0 without the file.
 * @param {string} key
 */
function baselineCount(key) {
  try {
    /** @type {Record<string, Record<string, number>>} */
    const baseline = JSON.parse(readFileSync(join(REPO, 'e2e', 'alignment-baseline.json'), 'utf8'));
    return baseline[key]?.['j'] ?? 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------

/** @type {{ name: string, run: () => Fault[] }[]} */
const GATES = [
  { name: 'literals', run: gateLiterals },
  { name: 'charts', run: gateCharts },
  { name: 'caution', run: gateCaution },
  { name: 'contrast', run: gateContrast },
  { name: 'ladder', run: gateLadder },
  { name: 'traps', run: gateTraps },
];

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
let total = 0;
for (const gate of GATES) {
  if (only.length > 0 && !only.includes(gate.name)) continue;
  const faults = gate.run();
  total += faults.length;
  process.stdout.write(`${gate.name.padEnd(18)} ${faults.length === 0 ? 'ok' : `${faults.length} fault(s)`}\n`);
  for (const f of faults) process.stdout.write(`  ${f.file}:${f.line}  ${f.what}\n`);
}
if (only.length > 0 && !GATES.some((g) => only.includes(g.name))) {
  process.stderr.write(`no such gate: ${only.join(', ')}\n`);
  process.exit(2);
}
process.stdout.write(total === 0 ? '\ndesign gates: zero faults\n' : `\ndesign gates: ${total} fault(s)\n`);
process.exit(total === 0 ? 0 : 1);

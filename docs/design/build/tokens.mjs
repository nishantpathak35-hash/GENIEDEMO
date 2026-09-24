// tokens.mjs — the token system, rebuilt on a published enterprise design system.
//
// Three layers, and every value in the first two is read from data fetched from the system's own
// documentation (ads/*.json, ads/*.js), never typed:
//   1. PRIMITIVES — the palette ramps, exactly as published: 150 values.
//   2. SEMANTIC   — the system's own token names (color.text.subtle → --color-text-subtle), each pointing at
//                   a primitive, once for light and once for dark; plus space, radius, border, type, motion.
//   3. COMPONENT  — this product's names (--ink, --panel, --accent, --ok …) and its geometry, each pointing
//                   at a semantic token. Nothing in this layer holds a colour of its own.
// Where a published value fails one of our gates it is replaced by the move recorded in adjust.mjs — and
// only there. verify() is the token gate: the same checks the pre-flight ran, over the emitted mapping.
import { readFileSync } from 'node:fs';
import { contrast, oklab, dE, hueOf, cvdGap } from './tokens-candidates.mjs';
import { ADJUST } from './adjust.mjs';
export { contrast, oklab, dE, hueOf, cvdGap };

const read = (f) => readFileSync(new URL(`./ads/${f}`, import.meta.url), 'utf8');
export const PRIM = JSON.parse(read('primitives.json'));
export const SEM = JSON.parse(read('semantic.json'));
const cssBlock = (src) => Object.fromEntries([...src.matchAll(/--ds-([a-z0-9-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].replace(/\\"/g, '"').trim()]));
const THEME_LIGHT = cssBlock(read('theme-light-17.0.0.js'));   // tokens-light.js was a byte-identical copy of this file; deleted 19 September
const TYPO = cssBlock(read('typography.js'));
// The published theme stylesheets of @atlaskit/tokens 17.0.0 — the same version the documentation values were
// cross-checked against. A token the documentation page does not list is read from here instead (none, on the
// 17 September read); and the motion theme is read from here: the component-level motion tokens and their keyframes.
const PKG = { light: cssBlock(read('theme-light-17.0.0.js')), dark: cssBlock(read('theme-dark-17.0.0.js')) };
const MOTION_CSS = read('motion-17.0.0.css');

export const READ_ON = '16 September 2026';
export const READ_AGAIN = '17 September 2026';
export const SOURCES = [
  ['Color palette', 'https://atlassian.design/foundations/color/color-palette', 'The 150 primitive values, read from the swatch styles on the page itself.'],
  ['All design tokens', 'https://atlassian.design/components/tokens/all-tokens', 'Every semantic token, with the palette name it takes in light and in dark — 591 tokens.'],
  ['Theme stylesheets, @atlaskit/tokens (resolved to 17.0.0)', 'https://cdn.jsdelivr.net/npm/@atlaskit/tokens/dist/esm/artifacts/themes/atlassian-light.js', 'A cross-check, with atlassian-dark.js beside it: 904 light and dark colour values compared with the documentation, and no difference. Also the source of the two opacity values.'],
  ['Typography stylesheet, same package', 'https://cdn.jsdelivr.net/npm/@atlaskit/tokens/dist/esm/artifacts/themes/atlassian-typography.js', 'The numeric weights — 400, 500, 600, 653 — which the documentation page names but does not print.'],
  ['Typography', 'https://atlassian.design/foundations/typography', 'The heading, body and metric scale: sizes, leadings and weights.'],
  ['Spacing', 'https://atlassian.design/foundations/spacing', 'The 8px base unit and the fourteen steps from 0 to 80px.'],
  ['Radius', 'https://atlassian.design/foundations/radius', 'Which radius goes on what, and that a focus ring sits 2px out with the component radius plus 2px.'],
  ['Border', 'https://atlassian.design/foundations/border', 'The three border widths, and the pairing of width and colour for selected and focused.'],
  ['Elevation', 'https://atlassian.design/foundations/elevation', 'Sunken, default, raised and overlay; and why dark surfaces lighten as they rise.'],
  ['Motion', 'https://atlassian.design/foundations/motion', 'The durations and the four easing curves.'],
  ['Data visualization color', 'https://atlassian.design/foundations/color/data-visualization-color', 'The categorical sequence, the status chart tokens, and the guidance on colour deficiency, separators and text on marks.'],
  ['Lozenge', 'https://atlassian.design/components/lozenge/usage', 'Semantic colour versus accent colour, and sentence case.'],
  ['Side navigation', 'https://atlassian.design/components/side-navigation/usage', 'Nesting kept to a minimum; a label that names the place, never the word navigation.'],
  ['Navigation system', 'https://atlassian.design/components/navigation-system/examples', 'Neutral selected states in navigation.'],
  ['Vertical navigation (Salesforce Lightning)', 'https://v1.lightningdesignsystem.com/components/vertical-navigation/', 'Grouping under a section title, and a toggle for the rest. Structure only — no value is taken from it.'],
  // read on 17 September, for the elements pass
  ['The component packages, @atlaskit/* on npm', 'https://cdn.jsdelivr.net/npm/@atlaskit/button@25.3.5/', 'Thirty-four packages — button, spinner, skeleton, progress-bar, progress-tracker, lozenge, tag, badge, avatar, avatar-group, flag, banner, section-message, inline-message, tooltip, popup, dropdown-menu, menu, modal-dialog, drawer, tabs, breadcrumbs, pagination, dynamic-table, empty-state, toggle, checkbox, radio, select, datetime-picker, inline-edit, textfield, form, motion — each read at its current version on 17 September 2026: the compiled stylesheet joined to its atomic class names, for every size, appearance and state drawn here. Each package declares Apache-2.0.'],
  ['Motion tokens, @atlaskit/tokens 17.0.0', 'https://cdn.jsdelivr.net/npm/@atlaskit/tokens@17.0.0/dist/esm/artifacts/themes/atlassian-motion.js', 'The 56 motion tokens — durations, curves, and the composed entrance, exit, hover and press motions of each component — and the 22 keyframes, emitted as they are.'],
  ['Iconography', 'https://atlassian.design/foundations/iconography', 'The grid the icons are drawn on: a 16px box, a 1.5px stroke, square caps, rounded joins; 12px for a chevron or a small mark. The drawings are this product’s own.'],
  ['Illustrations', 'https://atlassian.design/foundations/illustrations', 'The style the owner named and the finding that every published drawing is routed through galleries marked for the system’s own products; no drawing was viewed as a model.'],
  ['License', 'https://atlassian.design/license', 'Read for the elements pass; the finding is in the caveats below.'],
];
export const CAVEATS = [
  'The documentation says token values “are subject to change and should be used as an indication only”. These are the values on the read date.',
  'Three things it documents are behind feature flags on that date: the lozenge visual update, the motion tokens, and neutral selected states in navigation.',
  'The typeface the system names is its own and is not licensed for use here. Inter, under the SIL Open Font License, takes its place in every family; the icons are this product’s own.',
  'The licence, read 17 September 2026 (last updated 13 March 2025). Its grant (§1) is to use the system “in connection with creating” add-ons that interoperate with the system owner’s own products; its restrictions (§2) forbid modifying the system or making derivative works of it; §8 says the open-source licences on its code “may grant you additional rights to the OSS code itself and allow you to use the OSS outside of the ADS”. Every component package read here declares Apache-2.0 in its package.json and ships the Apache text. So: the tokens, the patterns and the component anatomy are followed as published values and measurements; no icon, no illustration, no logo and no typeface of the system is used, and none was viewed as a model — the icons and the drawings are this product’s own, drawn on the published grid and in the described style. Whether the site licence’s scope reaches the use of the tokens and anatomy outside an add-on is a question for the owner’s legal advice; this document flags it and does not settle it.',
];

// ---------------------------------------------------------------- 1. primitives
const FAMILIES = ['Neutral', 'DarkNeutral', 'Blue', 'Teal', 'Green', 'Lime', 'Yellow', 'Orange', 'Red', 'Magenta', 'Purple'];
export const primVar = (name) => {
  const m = /^([A-Za-z]+?)(-?)(\d+)(A?)$/.exec(name);
  if (!m) throw new Error(`not a palette name: ${name}`);
  const fam = m[1].replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  return `--${fam}-${m[2] ? 'minus-' : ''}${m[3]}${m[4] ? 'a' : ''}`;
};
const step = (n) => { const m = /(-?)(\d+)A?$/.exec(n); return (m[1] ? -1 : 1) * +m[2]; };
export const RAMPS = FAMILIES.map(f => [f, Object.keys(PRIM).filter(n => n.replace(/-?\d+A?$/, '') === f)
  .sort((a, b) => (a.endsWith('A') - b.endsWith('A')) || (step(a) - step(b)))]);

// ---------------------------------------------------------------- 2. semantic
// The families this product draws with. Everything else in the published list — accent colours for user
// content, product-specific tokens, keyframes — is left out, and the count says so.
const INCLUDE = [
  /^color\.text(\.(subtle|subtlest|inverse|selected|disabled|success|warning|danger|discovery|information|brand))?$/,
  /^color\.link(\.pressed)?$/,
  /^color\.icon(\.(subtle|subtlest|inverse|selected|success|warning|danger|discovery|information|brand))?$/,
  /^color\.border(\.(bold|input|selected|focused|inverse|disabled|success|warning|danger|discovery|information|brand))?$/,
  /^color\.background\.(brand\.(bold(\.hovered|\.pressed)?|subtlest)|selected(\.hovered|\.pressed)?|input(\.hovered|\.pressed)?|disabled|neutral(\.hovered|\.pressed)?|neutral\.subtle(\.hovered|\.pressed)?|neutral\.bold|(success|warning|danger|discovery|information)(\.hovered|\.pressed|\.bold(\.hovered|\.pressed)?)?)$/,
  /^color\.background\.(success|warning|danger|discovery|information)\.subtler(\.hovered|\.pressed)?$/,
  /^color\.text\.(success|warning|danger|discovery|information)\.bolder$/,
  /^color\.border\.(success|warning|danger|discovery|information)\.subtle$/,
  /^color\.(text|icon)\.warning\.inverse$/, /^color\.background\.inverse\.subtle(\.hovered|\.pressed)?$/,
  /^color\.background\.neutral\.bold\.(hovered|pressed)$/, /^color\.link\.visited$/,
  /^color\.background\.accent\.(blue|teal|green|lime|yellow|orange|red|magenta|purple|gray)\.(subtlest|subtler|subtle|bolder)$/,
  /^color\.(text|icon|border)\.accent\.(blue|teal|green|lime|yellow|orange|red|magenta|purple|gray)(\.bolder)?$/,
  /^color\.chart\.gray\.(bold|bolder|boldest)$/,
  /^color\.background\.selected\.bold(\.hovered|\.pressed)?$/, /^color\.icon\.disabled$/,
  /^color\.(skeleton(\.subtle)?|blanket)$/,
  /^color\.chart\.(brand(\.hovered)?|neutral|categorical\.[1-8]|(success|warning|danger|information|discovery)(\.bold)?)$/,
  /^elevation\.surface(\.(sunken|raised|overlay|hovered|pressed))?$/,
  /^elevation\.shadow\.(raised|overlay|overflow)$/,
];
// A token the documentation page did not list is read from the package and named by the palette step it resolves to,
// so it enters the semantic layer on the same terms as every other: a pointer at a primitive, per theme.
const revPrim = (hex, mode) => {
  const hits = Object.keys(PRIM).filter(n => PRIM[n].toUpperCase() === hex.toUpperCase());
  if (!hits.length) return hex;
  return hits.find(n => (mode === 'dark' ? !/^Neutral/.test(n) : !/^DarkNeutral/.test(n))) || hits[0];
};
const pkgVar = (name) => name.replace(/^color\./, '').replace(/^elevation\./, '').replace(/\./g, '-');
const STATUS_NAMES = ['success', 'warning', 'danger', 'discovery', 'information'];
export const ACCENT_NAMES = ['blue', 'teal', 'green', 'lime', 'yellow', 'orange', 'red', 'magenta', 'purple', 'gray'];
const WANTED = [
  ...STATUS_NAMES.flatMap(x => [`color.background.${x}.subtler`, `color.background.${x}.subtler.hovered`, `color.background.${x}.subtler.pressed`, `color.text.${x}.bolder`, `color.border.${x}.subtle`]),
  'color.text.warning.inverse', 'color.icon.warning.inverse', 'color.background.inverse.subtle', 'color.background.inverse.subtle.hovered', 'color.background.inverse.subtle.pressed',
  'color.background.neutral.bold.hovered', 'color.background.neutral.bold.pressed', 'color.link.visited',
  ...ACCENT_NAMES.flatMap(a => [`color.background.accent.${a}.subtlest`, `color.background.accent.${a}.subtler`, `color.background.accent.${a}.subtle`, `color.background.accent.${a}.bolder`, `color.text.accent.${a}`, `color.text.accent.${a}.bolder`, `color.icon.accent.${a}`, `color.border.accent.${a}`]),
  'color.chart.gray.bold', 'color.chart.gray.bolder', 'color.chart.gray.boldest', 'color.chart.brand', 'color.chart.brand.hovered', 'color.border.inverse',
];
export const FROM_PACKAGE = [];
for (const n of WANTED) {
  if (SEM[n]) continue;
  const v = pkgVar(n);
  if (PKG.light[v] && PKG.dark[v]) { SEM[n] = { light: revPrim(PKG.light[v], 'light'), dark: revPrim(PKG.dark[v], 'dark') }; FROM_PACKAGE.push(n); }
}
// motion: the component-level tokens (a duration, an easing and a keyframe, composed) and the keyframes themselves
export const MOTION_TOKENS = [...MOTION_CSS.matchAll(/--ds-([a-z0-9-]+):\s*([^;]+);/g)]
  .filter(([, n]) => !/^(duration|easing)-/.test(n) || n === 'easing-spring')
  .map(([, n, v]) => [n.startsWith('keyframe-') || n === 'easing-spring' ? `motion-${n}` : `motion-${n}`, v.trim()]);
// Motions the tokens package does not publish: the spinner's, the skeleton's, the tooltip's and the toggle's own, as
// their packages draw them, and three composed here from the published durations and curves.
export const EXTRA_MOTION = [
  ['motion-spinner-load-in', '1s ease-in-out spinner-load-in both'],
  ['motion-spinner-rotate', '0.86s cubic-bezier(0.4, 0.15, 0.6, 0.85) spinner-rotate infinite'],
  ['motion-skeleton-shimmer', '1.5s linear skeleton-shimmer infinite alternate'],
  ['motion-tooltip-enter', '150ms cubic-bezier(0.4, 1, 0.6, 1) FadeIn0to100 backwards'],
  ['motion-toggle-knob', 'transform var(--motion-duration-medium) var(--motion-easing-out-practical)'],
  ['motion-toggle-track', 'background-color var(--motion-duration-medium) var(--motion-easing-out-practical)'],
  ['motion-section-expand', 'grid-template-rows var(--motion-duration-medium) var(--motion-easing-inout-bold)'],
  ['motion-chevron', 'transform var(--motion-duration-short) var(--motion-easing-out-practical)'],
  ['motion-progress-fill', 'width var(--motion-duration-medium) var(--motion-easing-out-practical)'],
];
export const LOADING_MOTION = EXTRA_MOTION;
// Reduced motion — the owner's rule of 17 September: nothing travels, turns or scales. The published tokens have no
// reduced set, so this one is ours, built only from their durations, easings and fade keyframes:
//   an entrance or an exit    keeps its duration and easing and crossfades — its slide or scale is dropped
//   a transform transition    cuts (none) — a flag repositioning, an avatar lifting, a knob crossing, a section opening
//   a colour transition       stays — a colour changing in place moves nothing
//   the spinner               stops turning and breathes in opacity, so it still says it is working
//   the skeleton              stays — it changes colour in place
export const REDUCED_MOTION = (() => {
  const out = [];
  for (const [n, v] of [...MOTION_TOKENS, ...EXTRA_MOTION]) {
    if (n.startsWith('motion-keyframe-') || n === 'motion-easing-spring' || n === 'motion-skeleton-shimmer') continue;
    if (/^(transform|grid-template-rows|width|height) /.test(v)) { out.push([n, 'none']); continue; }   // a thing moving, growing or turning cuts
    if (/^(background|border|color|box-shadow)/.test(v)) continue;
    if (n === 'motion-spinner-rotate') { out.push([n, '0.86s ease-in-out spinner-breathe infinite alternate']); continue; }
    if (n === 'motion-spinner-load-in') { out.push([n, 'var(--motion-duration-long) linear FadeIn0to100 both']); continue; }
    const parts = []; { let d = 0, st = 0; for (let i = 0; i < v.length; i++) { if (v[i] === '(') d++; else if (v[i] === ')') d--; else if (v[i] === ',' && d === 0) { parts.push(v.slice(st, i).trim()); st = i + 1; } } parts.push(v.slice(st).trim()); }
    const fades = parts.filter(p => /Fade(In|Out)/.test(p));
    if (fades.length) { out.push([n, fades.join(', ')]); continue; }
    const m = parts[0].match(/^(\S+ (?:cubic-bezier\([^)]*\)|\S+)) (\S+)(.*)$/);
    const exit = /Out|exit/.test(parts[0]) || /exit/.test(n);
    out.push([n, `${m[1]} ${exit ? 'FadeOut100to0' : 'FadeIn0to100'}${m[3]}`]);
  }
  return out;
})();
export const KEYFRAMES = (() => { const out = []; let i = 0;
  while ((i = MOTION_CSS.indexOf('@keyframes', i)) >= 0) { let d = 0, j = MOTION_CSS.indexOf('{', i);
    for (let k = j; k < MOTION_CSS.length; k++) { if (MOTION_CSS[k] === '{') d++; else if (MOTION_CSS[k] === '}') { d--; if (d === 0) { out.push(MOTION_CSS.slice(i, k + 1).replace(/\s+/g, ' ')); i = k + 1; break; } } } }
  return out; })();
const OPACITY = { 'opacity.disabled': THEME_LIGHT['opacity-disabled'], 'opacity.loading': THEME_LIGHT['opacity-loading'] };
export const semVar = (name) => `--${name.replace(/@light$/, '-light').replace(/\./g, '-')}`;
export const adjusted = (name, mode) => ADJUST.find(a => a.token === name && a.mode === mode);
const valueOf = (name, mode) => { const a = adjusted(name, mode); return a ? a.to : SEM[name][mode]; };
const cssValue = (raw) => {
  if (PRIM[raw]) return `var(${primVar(raw)})`;
  if (/^rgba?\(|^\d|^#|^transparent$/.test(raw) && !/px .*rgba/.test(raw)) return raw;
  if (/rgba\(/.test(raw)) return raw.replace(/\)\s*(?=\d)/g, '), ');   // a shadow list, as published
  throw new Error(`unhandled value ${raw}`);
};
export const COLOR_TOKENS = Object.keys(SEM).filter(n => INCLUDE.some(r => r.test(n)));
// A semantic token can be asked for in the light set whatever the theme — `name@light`. The dark island (the top
// bar) resolves the dark set, and the dark set has no white and no bold red that carries white; a semantic element
// on the island — the bell's badge — takes the light set's bold fill and inverse ink, the way the quick-create
// square takes the light set's white plus. Emitted as `--<name>-light` in both themes, so it is still a pointer.
export const LIGHT_ALIASES = ['color.background.danger.bold', 'color.text.inverse'];
export const hexOf = (name, mode) => { const v = name.endsWith('@light') ? valueOf(name.slice(0, -6), 'light') : valueOf(name, mode); return PRIM[v] ?? v; };

const SPACE = Object.keys(SEM).filter(n => /^space\.(negative\.)?\d+$/.test(n));
const RADIUS = Object.keys(SEM).filter(n => /^radius\.(xsmall|small|medium|large|xlarge|xxlarge|full)$/.test(n));
const BORDER = Object.keys(SEM).filter(n => /^border\.width/.test(n));
const MOTION = Object.keys(SEM).filter(n => /^motion\.(duration|easing)\./.test(n));
// type: size, leading and weight for each published style, parsed from the published shorthand
export const TYPE = ['heading-xxlarge', 'heading-xlarge', 'heading-large', 'heading-medium', 'heading-small', 'heading-xsmall', 'heading-xxsmall', 'body-large', 'body', 'body-small', 'metric-large', 'metric-medium', 'metric-small']
  .map(k => { const m = /normal (\d+) ([\d.]+)rem\/([\d.]+)rem/.exec(TYPO[`font-${k}`]); if (!m) throw new Error(`type ${k}: ${TYPO[`font-${k}`]}`); return { key: k, weight: +m[1], size: +m[2] * 16, leading: +m[3] * 16 }; });
export const WEIGHTS = ['regular', 'medium', 'semibold', 'bold'].map(w => [w, +TYPO[`font-weight-${w}`]]);

// ---------------------------------------------------------------- 3. component
// This product's vocabulary, each a pointer into the semantic layer. The six states the product speaks in
// are here, and nowhere else: done, active, waiting, caution, bad, idle.
export const COMPONENT_COLOUR = [
  ['ground', 'elevation.surface.sunken', 'the page behind the cards'],
  ['panel', 'elevation.surface', 'a card, a table, a form — the default surface'],
  ['elevated', 'elevation.surface.overlay', 'a popover, a pane, a drawer, a sheet'],
  ['raised', 'elevation.surface.raised', 'the one raised surface on a screen: the hero, an open record'],
  ['sunk', 'elevation.surface.hovered', 'a hovered row, a group row'],
  ['select', 'color.background.selected', 'a selected row, an open record'],
  ['ink', 'color.text', 'body text'],
  ['ink-soft', 'color.text.subtle', 'secondary text, navigation, field labels'],
  ['ink-faint', 'color.text.subtlest', 'meta text, crumbs, placeholders, hints'],
  ['line', 'color.border', 'a hairline between rows and around cards'],
  ['line-strong', 'color.border.input', 'a control boundary — 3:1 on every surface'],
  ['accent', 'color.background.brand.bold', 'the primary action'],
  ['accent-hover', 'color.background.brand.bold.hovered', 'the primary action, hovered'],
  ['accent-soft', 'color.background.selected', 'a selected thing: the current page, an applied filter, the filled scope switcher'],
  ['selected-ink', 'color.text.selected', 'text and icons on a selected thing'],
  ['selected-line', 'color.border.selected', 'the bar or underline that marks a selected thing — 3:1'],
  ['input', 'color.background.input', 'the inside of a text field, a select, a text area'],
  ['input-hover', 'color.background.input.hovered', 'the same, hovered'],
  ['neutral', 'color.background.neutral', 'a default button'],
  ['neutral-hover', 'color.background.neutral.hovered', 'a default button, hovered'],
  ['neutral-pressed', 'color.background.neutral.pressed', 'a default button, pressed'],
  ['subtle-hover', 'color.background.neutral.subtle.hovered', 'a subtle button or a navigation item, hovered'],
  ['on-accent', 'color.text.inverse', 'text on the primary action'],
  ['link', 'color.link', 'a link'],
  ['focus', 'color.border.focused', 'the focus ring'],
  ['ok', 'color.text.success', 'done — ink'],
  ['ok-soft', 'color.background.success', 'done — fill'],
  ['on-ok', 'color.text.inverse', 'text on a bold done fill'],
  ['warn', 'color.text.warning', 'caution — ink, only ever on its fill'],
  ['warn-soft', 'color.background.warning', 'caution — fill'],
  ['waiting', 'color.text.discovery', 'waiting on someone — ink'],
  ['waiting-soft', 'color.background.discovery', 'waiting on someone — fill'],
  ['bad', 'color.text.danger', 'money going the wrong way, refused, failed — ink'],
  ['bad-soft', 'color.background.danger', 'the same — fill'],
  ['bad-bold', 'color.background.danger.bold', 'an action that refuses or destroys: Decline, Cancel the order'],
  ['bad-bold-hover', 'color.background.danger.bold.hovered', 'the same, hovered'],
  ['info', 'color.text.information', 'information — ink, inside an information notice only'],
  ['info-soft', 'color.background.information', 'information — the notice surface'],
  ['idle-soft', 'color.background.neutral', 'active and idle — the neutral fill; active adds a dot'],
  // colour where it carries meaning (18 September 2026): the accent tokens the plain retheme left unused
  ['nav-current', 'color.background.selected.bold', 'the current page in the sidebar — a solid pill'],
  // the shell the buyers know (19 September 2026): the top bar is a dark island and resolves the dark set in both
  // themes, so its tokens are read in the dark set — navy is the brand’s subtlest dark surface, Blue1000
  ['topbar', 'color.background.brand.subtlest', 'the top bar — read in the dark set: navy, the brand’s subtlest surface'],
  ['topbar-lift', 'color.background.neutral', 'the lifted fill on the top bar — read in the dark set: an alpha neutral, white at 7%, over the navy; the search and the switcher sit on it'],
  ['topbar-lift-hover', 'color.background.neutral.hovered', 'the lifted fill, hovered'],
  ['topbar-div', 'elevation.surface.sunken', 'the 1px divider on the top bar — read in the dark set: the darkest surface, darker than the bar'],
  ['new-sq', 'color.chart.brand', 'the quick-create square — read in the dark set: the brand’s mark colour, Blue500, under a white plus'],
  ['new-sq-hover', 'color.chart.brand.hovered', 'the square, hovered'],
  ['tenant-accent', 'color.background.accent.teal.bolder', 'the tenant’s accent — the avatar’s fill; a tenant setting one day'],
  ['side', 'elevation.surface.sunken', 'the sidebar — the cool grey the page sits on'],
  ['nav-open', 'color.background.accent.blue.subtlest', 'an open section’s tint in the sidebar — the reference’s, blue-100'],
  ['nav-current-ink', 'color.text.inverse', 'text, icon and count on the current page’s pill'],
  ['card-head', 'elevation.surface.sunken', 'a card’s header strip'],
  ['disc-blue', 'color.background.accent.blue.subtlest', 'the tinted disc behind a stat’s icon — blue'],
  ['disc-blue-icon', 'color.icon.accent.blue', 'the icon on the blue disc'],
  ['disc-teal', 'color.background.accent.teal.subtlest', 'the disc — teal'],
  ['disc-teal-icon', 'color.icon.accent.teal', 'the icon on the teal disc'],
  ['disc-green', 'color.background.accent.green.subtlest', 'the disc — green: money coming in'],
  ['disc-green-icon', 'color.icon.accent.green', 'the icon on the green disc'],
  ['disc-purple', 'color.background.accent.purple.subtlest', 'the disc — purple'],
  ['disc-purple-icon', 'color.icon.accent.purple', 'the icon on the purple disc'],
  ['disc-magenta', 'color.background.accent.magenta.subtlest', 'the disc — magenta'],
  ['disc-magenta-icon', 'color.icon.accent.magenta', 'the icon on the magenta disc'],
  ['disc-red', 'color.background.accent.red.subtlest', 'the disc — red: money going out'],
  ['disc-red-icon', 'color.icon.accent.red', 'the icon on the red disc'],
  ['disc-yellow', 'color.background.accent.yellow.subtlest', 'the disc — yellow: what needs watching'],
  ['disc-yellow-icon', 'color.icon.accent.yellow', 'the icon on the yellow disc'],
  ['disc-gray', 'color.background.accent.gray.subtlest', 'the disc — grey: a plain count'],
  ['disc-gray-icon', 'color.icon.accent.gray', 'the icon on the grey disc'],
  // (19 September, the duotone family) the flat block under a duotone icon’s line: the disc’s own ramp, one step up
  ['duo-blue', 'color.background.accent.blue.subtler', 'the block of a duotone icon on the blue disc'],
  ['duo-teal', 'color.background.accent.teal.subtler', 'the block — teal disc'],
  ['duo-green', 'color.background.accent.green.subtler', 'the block — green disc'],
  ['duo-purple', 'color.background.accent.purple.subtler', 'the block — purple disc'],
  ['duo-magenta', 'color.background.accent.magenta.subtler', 'the block — magenta disc'],
  ['duo-red', 'color.background.accent.red.subtler', 'the block — red disc'],
  ['duo-yellow', 'color.background.accent.yellow.subtler', 'the block — yellow disc'],
  ['duo-gray', 'color.background.accent.gray.subtler', 'the block — grey disc'],
  ['money-in', 'color.text.accent.green', 'money coming in, as text with its sign'],
  // (19 September, charts) LABELLED-REDUNDANT: a mark whose value is printed beside it — the overdue part of an owed
  // bar under CURRENT / OVERDUE, a tile bar under ORDERED / CONTRACT, the meter band with its overrun at the right —
  // takes the fixed status amber, orange-300, the same in both themes; yellow darkened to 3:1 on white is olive-brown,
  // which is physics, so the mark is not held to 3:1 and is separated from its neighbour by a 2px surface gap. A mark
  // that is the only carrier of its value stays obligated. The gate grants the class by finding the value text in the
  // mark's card; nothing declares it.
  ['owed-overdue', 'color.background.warning.bold', 'the overdue part of an owed bar — the fixed status amber; labelled-redundant'],
  ['chart-amber', 'color.background.warning.bold', 'the status amber on any labelled-redundant mark: a ring past its contract, a tile bar’s overrun'],
  ['owed-current', 'color.chart.brand', 'the part of an owed bar not yet due, and the covered part of a ratio bar — the brand’s mark colour, as the reference draws its bars'],
  ['chart-area', 'color.background.accent.blue.subtlest', 'the fill under a single-series line'],
  ['row-mine', 'color.background.accent.purple.subtlest', 'a row waiting on this person — the lightest published purple; there is no lighter step to take'],
  ['star', 'color.icon.accent.yellow', 'a favourite’s star, in the Reports Center and the saved-views menu'],
  ['chart-brand', 'color.chart.brand', 'the mark, when one colour is enough — a sparkline, a bar'],
  ['chart-brand-hover', 'color.chart.brand.hovered', 'the mark under the pointer'],
  ['chart-gap', 'color.border.inverse', 'the space between two adjacent chart colours — a stacked bar'],
  // money-out is declared here, apart from money-in: the India layer reads the token table on part 0 as painted, and a saffron swatch
  // within 24px of a green one is the one adjacency it never allows. The orange text accent is the reference’s money-out, taken on
  // 19 September as the owner’s decision; on every product screen the two directions were already never within 24px of each other
  ['money-out', 'color.text.accent.orange', 'money going out, as text with its sign — the reference’s orange-red, taken as the nearest orange text step that passes AA'],
  ['series-1', 'color.chart.categorical.1', 'the first chart series'],
  ['series-2', 'color.chart.categorical.2', 'the second chart series'],
  ['series-3', 'color.chart.categorical.3', 'the third chart series'],
  // (19 September, charts) the categorical order, fixed 1–8, never cycled; the neutral for the series that is not the story
  ['series-4', 'color.chart.categorical.4', 'the fourth chart series'],
  ['series-5', 'color.chart.categorical.5', 'the fifth chart series'],
  ['series-6', 'color.chart.categorical.6', 'the sixth chart series'],
  ['series-7', 'color.chart.categorical.7', 'the seventh chart series'],
  ['series-8', 'color.chart.categorical.8', 'the eighth chart series'],
  ['chart-neutral', 'color.chart.neutral', 'a series that is not the story, and the Other slice of a part-to-whole'],
  ['ring-track', 'color.background.accent.blue.subtler', 'the unfilled part of a ring — a lighter step of the brand’s own ramp'],
  ['chart-point-bad', 'color.chart.danger.bold', 'the marker where a series crossed its limit'],
  ['chart-threshold', 'color.chart.neutral', 'a threshold or reference line'],
  ['chart-band', 'color.background.warning.bold', 'the out-of-tolerance region, as an area — the fixed status amber, labelled-redundant since the overrun is printed at the right; the warning surface it was on measured 1.09:1 light and 1.22:1 dark, invisible (19 September)'],
  ['track', 'color.background.neutral', 'the unfilled part of a bar'],
  ['progress', 'color.background.neutral.bold', 'the filled part of a progress bar — progress is not a status and not the brand'],
  // illustrations, 17 September 2026: flat blocks of the accent colours under a hand-drawn line. The line is the only
  // part held to 3:1; the blocks are decorative fills (see the gate below).
  ['illo-line', 'color.icon', 'an illustration’s hand-drawn line — black in light, near-white in dark, 3:1 on the card'],
  ['illo-a', 'color.background.accent.blue.subtler', 'an illustration’s first block'],
  ['illo-b', 'color.background.accent.yellow.subtle', 'an illustration’s second block'],
  ['illo-c', 'color.background.accent.teal.subtler', 'an illustration’s third block'],
  ['illo-n', 'color.background.accent.gray.subtlest', 'an illustration’s paper and shadow'],
  ['illo-accent', 'color.background.accent.magenta.subtle', 'an illustration’s one highlight — a stamp, a tag — never outside a drawing, never a chart or status colour'],
  ['skeleton', 'color.skeleton', 'a loading placeholder'],
  // 17 September 2026 — the components, as published: each name below is what one component paints with
  ['subtle-pressed', 'color.background.neutral.subtle.pressed', 'a default or subtle button, pressed'],
  ['accent-pressed', 'color.background.brand.bold.pressed', 'the primary button, pressed'],
  ['bad-bold-pressed', 'color.background.danger.bold.pressed', 'a danger button, pressed'],
  ['warn-bold', 'color.background.warning.bold', 'a warning button'],
  ['warn-bold-hover', 'color.background.warning.bold.hovered', 'a warning button, hovered'],
  ['warn-bold-pressed', 'color.background.warning.bold.pressed', 'a warning button, pressed'],
  ['on-warn-bold', 'color.text.warning.inverse', 'text on a warning button or a warning banner'],
  ['select-hover', 'color.background.selected.hovered', 'a selected thing, hovered'],
  ['select-pressed', 'color.background.selected.pressed', 'a selected thing, pressed'],
  ['disabled-fill', 'color.background.disabled', 'a disabled control'],
  ['disabled-ink', 'color.text.disabled', 'text on a disabled control'],
  ['disabled-line', 'color.border.disabled', 'the edge of a disabled control'],
  ['input-pressed', 'color.background.input.pressed', 'a text field while it has focus'],
  ['link-pressed', 'color.link.pressed', 'a link, pressed'],
  ['icon-soft', 'color.icon.subtle', 'an icon beside secondary text'],
  ['icon-faint', 'color.icon.subtlest', 'a decorative icon: a chevron, a crumb separator'],
  ['inverse-fill', 'color.background.neutral.bold', 'a tooltip'],
  ['on-inverse', 'color.text.inverse', 'text in a tooltip'],
  ['lozenge-done', 'color.background.success.subtler', 'lozenge · done'],
  ['lozenge-done-ink', 'color.text.success.bolder', 'lozenge · done, its text'],
  ['lozenge-active', 'color.background.information.subtler', 'lozenge · in progress'],
  ['lozenge-active-ink', 'color.text.information.bolder', 'lozenge · in progress, its text'],
  ['lozenge-waiting', 'color.background.discovery.subtler', 'lozenge · waiting on someone'],
  ['lozenge-waiting-ink', 'color.text.discovery.bolder', 'lozenge · waiting, its text'],
  ['lozenge-caution', 'color.background.warning.subtler', 'lozenge · caution'],
  ['lozenge-caution-ink', 'color.text.warning.bolder', 'lozenge · caution, its text'],
  ['lozenge-bad', 'color.background.danger.subtler', 'lozenge · refused, failed, money the wrong way'],
  ['lozenge-bad-ink', 'color.text.danger.bolder', 'lozenge · bad, its text'],
  ['lozenge-idle', 'color.background.neutral', 'lozenge · draft, closed, nothing owed'],
  ['lozenge-idle-ink', 'color.text', 'lozenge · idle, its text'],
  ['tag-fill', 'color.background.accent.gray.subtlest', 'a tag — a label someone applied, or a removable filter'],
  ['tag-ink', 'color.text.accent.gray.bolder', 'a tag, its text'],
  ['badge-fill', 'color.background.accent.gray.subtler', 'a badge — a count'],
  ['badge-ink', 'color.text', 'a badge, its number'],
  ['badge-important', 'color.background.danger.subtler', 'a badge counting something that has gone wrong — on a card or the sidebar'],
  ['badge-important-ink', 'color.text.danger.bolder', 'its number'],
  // (19 September, charts) a semantic element inside the dark island — the bell's badge, a chip, a count, a dot —
  // resolves to a bold fill with the light set's inverse ink: the dark set's subtlest red on the navy read as a
  // maroon smudge in the light theme, rgb(93,31,26) under pink, and the dark set has no white to put on a bold
  ['island-important', 'color.background.danger.bold@light', 'a badge on the dark island — the light set’s bold red, in both themes'],
  ['island-important-ink', 'color.text.inverse@light', 'its number — the light set’s white, in both themes'],
  ['badge-primary', 'color.background.information.subtler', 'a badge on a selected thing'],
  ['badge-primary-ink', 'color.text.information.bolder', 'its number'],
  ['chart-done', 'color.chart.success.bold', 'a status series — on track'],
  // (19 September, charts) the caution segment changed family between themes — Orange700 light, Orange300 dark, 37°
  // apart. Its count is printed in the legend, so it is labelled-redundant and takes the fixed amber in both themes.
  ['chart-caution', 'color.background.warning.bold', 'a status series — at risk: the fixed status amber, labelled-redundant (its count is in the legend)'],
  ['chart-bad', 'color.chart.danger.bold', 'a status series — off track'],
  ['chart-paused', 'color.chart.gray.bold', 'a status series — paused'],
  ['chart-grid', 'color.border', 'a gridline'],
  ['check-on', 'color.background.selected.bold', 'a checked checkbox or radio'],
  ['check-on-hover', 'color.background.selected.bold.hovered', 'the same, hovered'],
  ['check-on-pressed', 'color.background.selected.bold.pressed', 'the same, pressed'],
  ['toggle-off', 'color.background.neutral.bold', 'a toggle, off'],
  ['toggle-off-hover', 'color.background.neutral.bold.hovered', 'a toggle, off, hovered'],
  ['toggle-on', 'color.background.success.bold', 'a toggle, on'],
  ['toggle-on-hover', 'color.background.success.bold.hovered', 'a toggle, on, hovered'],
  ['knob', 'color.icon.inverse', 'the knob of a toggle, the tick of a checkbox, the dot of a radio'],
  ['icon-disabled', 'color.icon.disabled', 'an icon on a disabled control'],
  ['danger-line', 'color.border.danger', 'the edge of a field that did not validate'],
  ['chart-axis', 'color.border.bold', 'an axis line'],
  ['skeleton-hi', 'color.skeleton.subtle', 'its shimmer'],
  ['scrim', 'color.blanket', 'behind a drawer or a sheet'],
];
export const COMPONENT_SHADOW = [
  ['shadow-1', 'none', 'a card: flat, on the default surface, with a border — as the elevation guidance asks'],
  ['shadow-2', 'elevation.shadow.raised', 'raised for emphasis: the hero, an open record'],
  ['shadow-3', 'elevation.shadow.overlay', 'overlay: popovers, drawers, sheets'],
];
// geometry and type, composed from the semantic scale; the four figure sizes above the published scale are
// the one extension, and each is bounded by published steps at both ends except the hero's upper bound
export const COMPONENT_GEOMETRY = [
  ['control-height', 'var(--space-400)', 'a button, an input, a select, a filter — one height in a row'],
  ['control-height-compact', 'var(--space-300)', 'a compact button'],
  ['control-height-large', 'var(--space-500)', 'a large button, the one action of a hero'],
  ['control-height-touch', 'var(--space-600)', 'a control in a portal, on a phone — 44px or more'],
  ['checkbox-size', 'var(--space-200)', 'a checkbox or a radio'],
  ['avatar-size', 'var(--space-300)', 'a person named in a row'],
  ['avatar-size-large', 'var(--space-400)', 'the person signed in'],
  ['focus-ring-width', 'var(--border-width-focused)', 'the focus ring'],
  ['focus-ring-offset', 'var(--space-025)', 'the focus ring sits this far outside the control'],
  ['mark-ring', 'var(--border-width-selected)', 'the surface ring that separates adjacent chart marks'],
  ['illo-lg', '160px', 'an illustration in a wide empty state — the published maximum'],
  ['side-width', '200px', 'the sidebar, and the top bar’s brand column over it — the reference’s; no published step'],
  ['side-width-rail', 'var(--space-600)', 'the sidebar as an icon rail'],
  ['topbar-height', 'var(--space-600)', 'the top bar'],
  ['bar-control-height', '34px', 'the switcher and the search on the top bar — the reference’s; the published control is 32'],
  ['search-width', '300px', 'the search on the top bar'],
  ['brand-size', '17px', 'the product’s name on the top bar — the reference’s 18 does not fit the seventeen-character name in the 200px column; 17 is the largest that does'],
  ['avatar-size-bar', '28px', 'the person on the top bar — the reference’s; between the published 24 and 32'],
  ['nav-item-height', '38px', 'a sidebar item — the reference’s row; the published scale has no 38'],
  ['illo-sm', '120px', 'an illustration in a narrow empty state'],
  ['field-height', 'calc(var(--line-height-body) + var(--space-075) * 2 + var(--border-width) * 4)', 'a text field, a select, a date picker — 36px, as published'],
  ['measure', '72ch', 'the longest line of running prose'],
  ['measure-tight', '48ch', 'centred copy'],
  ['font-size-hero', 'clamp(36px, 5.5cqw, 48px)', 'EXTENSION — the one number on a screen; above the published scale, see TOKEN-DIFF. 48px at the dashboard grid (19 September, the grid); 56 until then'],
  // (19 September, the grid) the dashboard's one figure scale: hero 48 · a money card's total 28 · a tile's figure 24
  ['font-size-total', '28px', 'the total on a money card — the dashboard scale'],
  ['font-size-tile', '24px', 'a tile’s figure — the dashboard scale'],
  ['card-head-height', 'var(--space-600)', 'a dashboard card’s header: one line, 48px, the disc left of the title'],
  ['disc-size', 'var(--space-500)', 'a stat’s disc'],
  ['disc-size-small', '28px', 'the disc in a dashboard card’s header'],
  ['duo-size', 'var(--space-300)', 'the duotone on a stat’s disc'],
  ['duo-size-small', 'var(--space-250)', 'the duotone on the header’s small disc'],
  ['grid-gutter', 'var(--space-300)', 'the dashboard grid’s gutter, 24px'],
  ['frame-desktop-width', '1400px', 'the width the document draws Today and Overview at — a director’s laptop; the four-tile row needs it'],
  ['font-size-figure', 'clamp(24px, 13cqw, 32px)', 'a figure in a card or pane, between metric M and heading XXL'],
  ['font-size-stat', 'clamp(16px, 11.5cqw, 24px)', 'a stat value, between metric S and metric M'],
  ['font-size-stat-compact', 'clamp(16px, 11cqw, 20px)', 'a stat value in a tight column'],
  ['font-size-title', 'clamp(20px, 2.9cqw, 24px)', 'a page title, between heading M and heading L'],
  ['line-height-fluid', '1.12', 'the leading of a figure that sizes itself'],
  ['letter-spacing-caps', '0.04em', 'the one capitalised label treatment'],
  ['transition-control', 'background var(--motion-duration-short) var(--motion-easing-out-practical), border-color var(--motion-duration-short) var(--motion-easing-out-practical), box-shadow var(--motion-duration-short) var(--motion-easing-out-practical), color var(--motion-duration-short) var(--motion-easing-out-practical)', 'a control changing state — an interaction, 150ms'],
  ['transition-card', 'box-shadow var(--motion-duration-medium) var(--motion-easing-out-practical), border-color var(--motion-duration-medium) var(--motion-easing-out-practical)', 'a card changing state'],
  ['font-family-body', "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif", 'every text, in place of the system’s own licensed sans'],
  ['font-family-heading', "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif", 'headings — the same family, as the system uses one family for both'],
  ['font-family-code', "ui-monospace, Consolas, 'SF Mono', Menlo, monospace", 'code'],
];

export function tokenCss() {
  const L = [];
  L.push(`/* ================================================================================================
   Construct-O-Genie — tokens. Rebuilt ${READ_ON} on the Atlassian Design System's published tokens.
   Three layers: primitives (the palette as published), semantic (the system's own token names, light and
   dark), component (this product's names, each pointing at a semantic token). Every value in the set is here.
   Sources, the read date, and every value our gates made us change: 00-foundations.html and TOKEN-DIFF.md.
   ================================================================================================ */`);
  L.push(':root {');
  L.push('  color-scheme: light;');
  L.push('  /* ---- 1. primitives ---- */');
  for (const [f, names] of RAMPS) L.push('  ' + names.map(n => `${primVar(n)}: ${PRIM[n]};`).join(' '));
  L.push('  /* ---- 2. semantic — colour and elevation, light ---- */');
  for (const n of COLOR_TOKENS) L.push(`  ${semVar(n)}: ${cssValue(valueOf(n, 'light'))};`);
  L.push('  /* the light set, whatever the island: read by a semantic element on the dark top bar */');
  for (const n of LIGHT_ALIASES) L.push(`  ${semVar(n + '@light')}: ${cssValue(valueOf(n, 'light'))};`);
  L.push('  /* ---- 2. semantic — space, radius, border, opacity, motion, type ---- */');
  L.push('  ' + SPACE.map(n => `${semVar(n)}: ${SEM[n].light};`).join(' '));
  L.push('  ' + RADIUS.map(n => `${semVar(n)}: ${SEM[n].light};`).join(' '));
  L.push('  ' + BORDER.map(n => `${semVar(n)}: ${SEM[n].light};`).join(' '));
  L.push('  ' + Object.entries(OPACITY).map(([n, v]) => `${semVar(n)}: ${v};`).join(' '));
  for (const n of MOTION) L.push(`  ${semVar(n)}: ${SEM[n].light};`);
  L.push('  ' + WEIGHTS.map(([w, v]) => `--font-weight-${w}: ${v};`).join(' '));
  for (const t of TYPE) L.push(`  --font-size-${t.key}: ${t.size}px; --line-height-${t.key}: ${t.leading}px;`);
  for (const [n, v] of MOTION_TOKENS) L.push(`  --${n}: ${v};`);
  for (const [n, v] of EXTRA_MOTION) L.push(`  --${n}: ${v};`);
  L.push('}');
  L.push('/* ---- 3. component — declared on every themed element too, so a light or dark specimen resolves its own; and on a');
  L.push('   .page-theme element, so a menu opened from the dark top bar resolves the page’s values, not the bar’s ---- */');
  L.push(':root, [data-theme], .page-theme {');
  for (const [k, s] of COMPONENT_COLOUR) L.push(`  --${k}: var(${semVar(s)});`);
  for (const [k, s] of COMPONENT_SHADOW) L.push(`  --${k}: ${s === 'none' ? 'none' : `var(${semVar(s)})`};`);
  for (const [k, v] of COMPONENT_GEOMETRY) L.push(`  --${k}: ${v};`);
  L.push('}');
  const aliases = LIGHT_ALIASES.map(n => `${semVar(n + '@light')}: ${cssValue(valueOf(n, 'light'))};`).join(' ');
  const dark = COLOR_TOKENS.filter(n => SEM[n].dark).map(n => `${semVar(n)}: ${cssValue(valueOf(n, 'dark'))};`).join(' ') + ' ' + aliases;
  const light = COLOR_TOKENS.map(n => `${semVar(n)}: ${cssValue(valueOf(n, 'light'))};`).join(' ') + ' ' + aliases;
  // a .page-theme element inside a themed island (a menu opened from the dark top bar) follows the page's theme, not the island's
  L.push(`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]), :root:not([data-theme="light"]) .page-theme { color-scheme: dark; ${dark} } }`);
  L.push(`[data-theme="dark"], :root[data-theme="dark"] .page-theme { color-scheme: dark; ${dark} }`);
  L.push(`[data-theme="light"], [data-theme="dark"] .page-theme { color-scheme: light; ${light} }`);
  const reduced = REDUCED_MOTION.map(([n, v]) => `--${n}: ${v};`).join(' ');
  L.push('/* ---- reduced motion: an entrance or exit crossfades, a transform cuts, the spinner breathes — and a');
  L.push('   [data-motion="reduce"] element shows the same thing whatever the device is set to ---- */');
  L.push(`@media (prefers-reduced-motion: reduce) { :root { ${reduced} } }`);
  L.push(`[data-motion="reduce"] { ${reduced} }`);
  L.push('/* ---- motion keyframes, as published, then the spinner\'s and the skeleton\'s ---- */');
  for (const k of KEYFRAMES) L.push(k);
  L.push('@keyframes spinner-rotate { to { transform: rotate(360deg); } }');
  L.push('@keyframes spinner-load-in { from { opacity: 0; transform: rotate(50deg); } to { opacity: 1; transform: rotate(230deg); } }');
  L.push('@keyframes spinner-breathe { from { opacity: 0.4; } to { opacity: 1; } }');
  L.push('@keyframes skeleton-shimmer { from { background-color: var(--skeleton); } to { background-color: var(--skeleton-hi); } }');
  return L.join('\n') + '\n';
}

// ---------------------------------------------------------------- the token gate
// The pre-flight's checks, run over the emitted mapping. A published value that fails is an adjustment in
// adjust.mjs, never a lowered floor.
const alphaOf = (h) => (h.length === 9 ? parseInt(h.slice(7), 16) / 255 : 1);
const over = (fg, bg) => { const a = alphaOf(fg); const f = [1, 3, 5].map(i => parseInt(fg.slice(i, i + 2), 16)); const b = [1, 3, 5].map(i => parseInt(bg.slice(i, i + 2), 16)); return '#' + f.map((c, i) => Math.round(c * a + b[i] * (1 - a)).toString(16).padStart(2, '0')).join(''); };
const lab = (h) => { const [L, A, B] = oklab(h); return [L, Math.hypot(A, B)]; };
export function componentHex(mode) {
  const H = {};
  for (const [k, s] of COMPONENT_COLOUR) H[k] = hexOf(s, mode);
  return H;
}
// (19 September, charts) HUE PARITY — every token used as a fill on a mark, a badge, a disc or a lozenge resolves to the
// same family in both themes: the light and dark colours within 20° of hue, and each above the chroma floor for its
// role — 0.10 for a mark (the validator's floor: below it a hue cannot be told apart from another), 0.08 for a bold
// fill that carries 4.5:1 text (the text identifies it; the teal avatar sits at 0.094 with its letter at 4.7:1),
// 0.015 for a tint under an icon or an ink (the published subtlest steps sit at 0.019–0.06 and their hue is still
// determinate; the icon or the ink on the tint carries the identity). A pair that fails is re-stepped or declared
// labelled-redundant; a neutral is not swept; text is not a fill and is held by the contrast gate instead.
export const PARITY = [
  // marks
  ...['series-1', 'series-2', 'series-3', 'chart-brand', 'chart-done', 'chart-caution', 'chart-bad', 'chart-point-bad', 'chart-band', 'chart-amber', 'owed-overdue', 'owed-current'].map(k => [k, 'mark', 0.10]),
  // bold fills
  ...['accent', 'bad-bold', 'warn-bold', 'nav-current', 'tenant-accent', 'new-sq', 'island-important', 'check-on', 'toggle-on'].map(k => [k, 'bold', 0.08]),
  // tints: a badge, a disc, a lozenge
  ...['badge-important', 'badge-primary', 'disc-blue', 'disc-teal', 'disc-green', 'disc-purple', 'disc-magenta', 'disc-red', 'disc-yellow', 'lozenge-done', 'lozenge-active', 'lozenge-waiting', 'lozenge-caution', 'lozenge-bad', 'warn-soft', 'bad-soft', 'ok-soft', 'waiting-soft', 'info-soft',
     'duo-blue', 'duo-teal', 'duo-green', 'duo-purple', 'duo-magenta', 'duo-red', 'duo-yellow'].map(k => [k, 'tint', 0.015]),   // the grey disc and its block are neutral by design, as disc-gray is
  // the icons on the discs
  ...['disc-blue-icon', 'disc-teal-icon', 'disc-green-icon', 'disc-purple-icon', 'disc-magenta-icon', 'disc-red-icon', 'disc-yellow-icon'].map(k => [k, 'icon', 0.10]),
];
export function hueParity() {
  const out = [];
  const HL = componentHex('light'), HD = componentHex('dark');
  const solidOn = (h, bg) => (alphaOf(h) < 1 ? over(h, bg) : h.slice(0, 7));
  for (const [k, role, floor] of PARITY) {
    const a = solidOn(HL[k], HL.panel.slice(0, 7)), b = solidOn(HD[k], HD.panel.slice(0, 7));
    const [, Ca] = lab(a), [, Cb] = lab(b);
    let d = Math.abs(hueOf(a) - hueOf(b)); d = Math.min(d, 360 - d);
    const okHue = d <= 20, okC = Ca >= floor && Cb >= floor;
    out.push({ token: k, role, floor, light: a, dark: b, hueLight: +hueOf(a).toFixed(1), hueDark: +hueOf(b).toFixed(1), dHue: +d.toFixed(1), chromaLight: +Ca.toFixed(3), chromaDark: +Cb.toFixed(3), ok: okHue && okC, why: !okHue ? `hue ${d.toFixed(0)}° apart` : !okC ? `chroma under ${floor}` : '' });
  }
  return out;
}
export function verify() {
  const problems = []; let checks = 0; const rows = [];
  for (const r of hueParity()) { checks++; rows.push({ mode: 'both', kind: 'parity', label: `${r.token} (${r.role}) — light ${r.light} h${r.hueLight} C${r.chromaLight} · dark ${r.dark} h${r.hueDark} C${r.chromaDark}`, value: r.dHue, floor: 20, fg: r.light, bg: r.dark }); if (!r.ok) problems.push(`parity: ${r.token} — ${r.why}`); }
  for (const mode of ['light', 'dark']) {
    const H = componentHex(mode);
    const solid = (k, on = 'panel') => (alphaOf(H[k]) < 1 ? over(H[k], H[on].slice(0, 7)) : H[k].slice(0, 7));
    const need = (label, a, b, floor) => { checks++; const c = contrast(a, b); rows.push({ mode, kind: 'contrast', label, value: c, floor, fg: a, bg: b }); if (c < floor) problems.push(`${mode}: ${label} ${c.toFixed(2)} < ${floor}`); };
    const surfaces = ['ground', 'panel', 'elevated', 'sunk'];
    for (const k of ['ink', 'ink-soft', 'ink-faint', 'ok', 'waiting', 'bad', 'link']) for (const s of surfaces) need(`${k} on ${s}`, solid(k), solid(s), 4.5);
    for (const s of ['ground', 'panel', 'elevated']) need(`body ink on ${s} (AAA)`, solid('ink'), solid(s), 7);
    for (const s of surfaces) need(`line-strong on ${s}`, solid('line-strong', s), solid(s), 3);
    // the lozenge, the badge and the tag: text on its own fill, and the statuses 40° apart on the fills as painted
    for (const k of ['done', 'active', 'waiting', 'caution', 'bad', 'idle']) need(`lozenge-${k}-ink on lozenge-${k}`, solid(`lozenge-${k}-ink`), solid(`lozenge-${k}`), 4.5);
    for (const [i, f] of [['tag-ink', 'tag-fill'], ['badge-ink', 'badge-fill'], ['badge-important-ink', 'badge-important'], ['badge-primary-ink', 'badge-primary'], ['on-warn-bold', 'warn-bold'], ['on-warn-bold', 'warn-bold-hover'], ['on-accent', 'accent-pressed'], ['on-accent', 'bad-bold-pressed'], ['on-inverse', 'inverse-fill']]) need(`${i} on ${f}`, solid(i), solid(f), 4.5);
    {
      const fills = ['done', 'caution', 'waiting', 'bad', 'active'].map(k => [k, hueOf(solid(`lozenge-${k}`))]).sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < fills.length; i++) { checks++; const a = fills[i], b = fills[(i + 1) % fills.length]; let d = Math.abs(b[1] - a[1]); d = Math.min(d, 360 - d); rows.push({ mode, kind: 'hue-fill', label: `${a[0]} to ${b[0]}`, value: d, floor: 40 }); if (d < 40) problems.push(`${mode}: lozenge fills ${a[0]} and ${b[0]} paint ${d.toFixed(1)}° apart, under 40°`); }
    }
    // the controls that are only a shape: 3:1 against the card, and their mark 3:1 against them (WCAG 1.4.11)
    for (const k of ['check-on', 'toggle-off', 'toggle-on']) need(`${k} on panel`, solid(k), solid('panel'), 3);
    for (const k of ['check-on', 'toggle-off', 'toggle-on']) need(`knob on ${k}`, solid('knob'), solid(k), 3);
    // the hairline: raised by choice, not obligated — visible at 1.4:1, and capped under 3:1
    for (const s of ['panel', 'ground']) { need(`line on ${s}`, solid('line', s), solid(s), 1.4); checks++; if (contrast(solid('line', s), solid(s)) >= 3) problems.push(`${mode}: line on ${s} reaches 3:1 and out-shouts the figures`); }
    for (const s of ['ground', 'panel', 'elevated']) need(`focus on ${s}`, solid('focus'), solid(s), 3);
    need('on-accent on accent', solid('on-accent'), solid('accent'), 4.5);
    need('on-accent on accent-hover', solid('on-accent'), solid('accent-hover'), 4.5);
    for (const [i, f] of [['ok', 'ok-soft'], ['warn', 'warn-soft'], ['waiting', 'waiting-soft'], ['bad', 'bad-soft'], ['info', 'info-soft'], ['ink', 'idle-soft'], ['link', 'select'], ['selected-ink', 'accent-soft'], ['on-accent', 'bad-bold'], ['on-accent', 'bad-bold-hover'], ['ink-soft', 'neutral'], ['ink-soft', 'neutral-hover'], ['ink', 'input'], ['ink', 'input-hover'], ['ink', 'raised']]) need(`${i} on ${f}`, solid(i, f === 'raised' ? 'panel' : 'panel'), solid(f), 4.5);
    for (const s of ['panel', 'ground', 'select']) need(`selected-line on ${s}`, solid('selected-line'), solid(s), 3);
    for (const s of ['input', 'input-hover']) need(`line-strong on ${s}`, solid('line-strong', s), solid(s), 3);
    // the drawing system: two planes and an accent, each a graphic that carries meaning (WCAG 1.4.11)
    // ILLUSTRATIONS — changed 17 September 2026 by the owner, not lowered. Every drawing is decorative: aria-hidden, with
    // its meaning always in the empty state's heading and text. WCAG 1.4.11 obliges 3:1 only for graphics required to
    // understand the content, and a decorative image is exempt, so the gate holds the one part that gives a drawing its
    // shape — the hand-drawn line — to 3:1 on the card and the page, and exempts the flat blocks. Before this date the
    // planes and the accent were held to 3:1 too, because the drawings were treated as carrying the state; they no
    // longer are, and the empty-state gate checks that the heading and the text say everything the drawing does.
    for (const s of ['panel', 'ground', 'raised']) need(`illo-line on ${s}`, solid('illo-line'), solid(s), 3);
    // colour where it carries meaning: the pill, the discs, the owed bar and the money direction hold their floors
    need('nav-current-ink on nav-current', solid('nav-current-ink'), solid('nav-current'), 4.5);
    if (mode === 'dark') {   // the top bar is a dark island: its pairs exist only in the dark set
      need('ink on the top bar', solid('ink'), solid('topbar'), 4.5);
      need('ink-soft on the top bar (icons, the tenant)', solid('ink-soft'), solid('topbar'), 4.5);
      need('ink-soft on the lifted fill (placeholder, the switcher’s name)', solid('ink-soft'), solid('topbar-lift', 'topbar'), 4.5);
      need('ink on the lifted fill', solid('ink'), solid('topbar-lift', 'topbar'), 4.5);
      need('the light set’s inverse ink on the quick-create square (the plus, a light island: the dark set has no white)', componentHex('light')['on-accent'].slice(0, 7), solid('new-sq'), 3);
      need('the square against the top bar (a control boundary)', solid('new-sq'), solid('topbar'), 3);
      // the bell's badge on the island: the light set's bold red under the light set's white — text, so 4.5
      need('island-important-ink on island-important (the badge’s numeral, on the top bar)', solid('island-important-ink'), solid('island-important'), 4.5);
      { checks++; const c = contrast(solid('island-important'), solid('topbar')); rows.push({ mode, kind: 'raised', label: 'the badge’s fill against the top bar — not a boundary, the numeral carries it', value: c, floor: 1, fg: solid('island-important'), bg: solid('topbar') }); }
      { checks++; const [, C] = lab(solid('island-important')); rows.push({ mode, kind: 'island', label: 'the badge on the island is a bold fill, not a subtlest-family tint', value: C, floor: 0.10, fg: solid('island-important'), bg: solid('topbar') }); if (C < 0.10) problems.push(`${mode}: the island badge fill is a tint (chroma ${C.toFixed(3)})`); }
      need('the tenant’s accent against the top bar (the avatar’s disc)', solid('tenant-accent'), solid('topbar'), 3);
      need('on-accent on the tenant’s accent (the avatar’s letter)', solid('on-accent'), solid('tenant-accent'), 4.5);
      { checks++; const lift = contrast(solid('topbar-lift', 'topbar'), '#000000'), bar = contrast(solid('topbar'), '#000000'); rows.push({ mode, kind: 'order', label: 'the lifted fill is lighter than the bar', value: lift, floor: bar }); if (lift <= bar) problems.push(`${mode}: the lifted fill is not lighter than the bar`); }
      need('line-strong against the top bar (the search’s boundary)', solid('line-strong', 'topbar'), solid('topbar'), 3);
    }
    need('nav-open against the sidebar', solid('nav-open', 'side'), solid('side'), 1);   // a tint, not a boundary
    need('nav-current on side', solid('nav-current'), solid('side'), 3);
    for (const h of ['blue', 'teal', 'green', 'purple', 'magenta', 'red', 'yellow', 'gray']) need(`disc-${h}-icon on disc-${h}`, solid(`disc-${h}-icon`), solid(`disc-${h}`, 'panel'), 3);
    for (const k of ['money-in', 'money-out']) for (const s of ['panel', 'ground']) need(`${k} on ${s}`, solid(k), solid(s), 4.5);
    for (const s of ['panel', 'ground']) need(`owed-current on ${s}`, solid('owed-current'), solid(s), 3);
    // LABELLED-REDUNDANT (19 September, charts): the amber mark's value is printed beside it, so the ratio is recorded,
    // not held — and the mark is the same hex in both themes, which the hue-parity rows below assert
    for (const k of ['owed-overdue', 'chart-band', 'chart-amber']) for (const s of ['panel', 'ground']) { checks++; const c = contrast(solid(k), solid(s)); rows.push({ mode, kind: 'redundant', label: `${k} on ${s} — labelled-redundant, its value printed beside it`, value: c, floor: 1, fg: solid(k), bg: solid(s) }); }
    need('owed-overdue against owed-current', solid('owed-overdue'), solid('owed-current'), 1);   // adjacent chart colours are separated by a gap, not by contrast
    need('warn on warn-soft (the header chip)', solid('warn'), solid('warn-soft', 'panel'), 4.5);
    const ring = ['ok', 'warn', 'waiting', 'bad', 'accent'].map(k => [k, hueOf(solid(k))]).sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < ring.length; i++) { checks++; const a = ring[i], b = ring[(i + 1) % ring.length]; let d = Math.abs(b[1] - a[1]); d = Math.min(d, 360 - d); rows.push({ mode, kind: 'hue', label: `${a[0]} to ${b[0]}`, value: d, floor: 40 }); if (d < 40) problems.push(`${mode}: ${a[0]} and ${b[0]} paint ${d.toFixed(1)}° apart, under 40°`); }
    const band = mode === 'light' ? [0.43, 0.77] : [0.48, 0.67];
    const CAT = [1, 2, 3, 4, 5, 6, 7, 8].map(i => hexOf(`color.chart.categorical.${i}`, mode));
    for (const [label, h] of [...CAT.map((h, i) => [`categorical ${i + 1}`, h]), ['chart-point-bad', solid('chart-point-bad')]]) {
      const [Lx, Cx] = lab(h); checks += 3; rows.push({ mode, kind: 'chart', label, hex: h, L: Lx, C: Cx, band });
      if (Cx < 0.10) problems.push(`${mode}: ${label} chroma ${Cx.toFixed(3)} under 0.10`);
      // (19 September, charts) the lightness band was recorded and never asserted — the validator's band, held now
      if (Lx < band[0] || Lx > band[1]) problems.push(`${mode}: ${label} lightness ${Lx.toFixed(3)} outside ${band[0]}–${band[1]}`);
      if (Lx < band[0] || Lx > band[1]) problems.push(`${mode}: ${label} lightness ${Lx.toFixed(3)} outside ${band.join('–')}`);
      for (const s of ['panel', 'ground']) need(`${label} on ${s}`, h, solid(s), 3);
    }
    need('chart-threshold on panel', solid('chart-threshold'), solid('panel'), 3);
    need('series-1 on its track', solid('series-1'), solid('track'), 3);
    for (const k of ['series-4', 'series-5', 'series-6', 'series-7', 'series-8', 'chart-neutral']) need(`${k} on panel`, solid(k), solid('panel'), 3);
    need('chart-brand on ring-track', solid('chart-brand'), solid('ring-track', 'panel'), 3);
    need('chart-amber against ring-track (a labelled overrun on its track)', solid('chart-amber'), solid('ring-track', 'panel'), 1);
    need('progress on its track', solid('progress'), solid('track'), 3);
    for (let i = 0; i < 7; i++) { checks += 2; const g = cvdGap(CAT[i], CAT[i + 1]), n = dE(oklab(CAT[i]), oklab(CAT[i + 1])); rows.push({ mode, kind: 'adjacent', label: `${i + 1} and ${i + 2}`, cvd: g, normal: n });
      if (g < 8) problems.push(`${mode}: categorical ${i + 1} and ${i + 2} are CVD ΔE ${g.toFixed(1)} apart, under 8`);
      if (n < 15) problems.push(`${mode}: categorical ${i + 1} and ${i + 2} are ΔE ${n.toFixed(1)} apart, under 15`); }
    checks++; if (new Set(CAT).size !== 8) problems.push(`${mode}: the categorical sequence repeats a colour`);
    for (const [a, b] of [['series-1', 'chart-point-bad'], ['series-1', 'chart-threshold'], ['chart-point-bad', 'chart-threshold']]) { checks++; const g = cvdGap(solid(a), solid(b)); if (g < 8) problems.push(`${mode}: ${a} and ${b}, drawn together, CVD ΔE ${g.toFixed(1)} under 8`); }
    // a status colour never IS the brand, and never the illustration accent
    for (const k of ['ok', 'warn', 'waiting', 'bad']) { checks++; if (solid(k) === solid('accent') || solid(k) === solid('link')) problems.push(`${mode}: --${k} is the brand colour`); }
    checks++; if (['ok', 'warn', 'waiting', 'bad', 'accent', 'link'].some(k => solid(k) === solid('illo-accent'))) problems.push(`${mode}: the illustration accent is also a status or the brand`);
    // and never a chart colour: the containment gate proves the accent never paints outside a drawing, which it
    // could not do if a chart swatch computed to the same value
    checks++; if (CAT.some(h => h.slice(0, 7).toLowerCase() === solid('illo-accent').toLowerCase())) problems.push(`${mode}: the illustration accent is also a categorical chart colour`);
  }
  // every adjustment must still be needed: a value that passes as published is not replaced
  return { problems, checks, rows, primitives: Object.keys(PRIM).length, semantic: COLOR_TOKENS.length + SPACE.length + RADIUS.length + BORDER.length + 2 + MOTION.length + WEIGHTS.length + TYPE.length * 2, component: COMPONENT_COLOUR.length + COMPONENT_SHADOW.length + COMPONENT_GEOMETRY.length, adjustments: ADJUST.length };
}

// css-base.mjs — the visual layer, restyled on the rebuilt token set (tokens.mjs). Every colour, space, radius,
// weight and duration is a token; the build greps this file for colour literals and fails if it finds one.
// Type: Inter in every family (the reference system's own typeface is not licensed here), one Google Fonts link,
// Segoe UI as the Windows fallback so the page reads as designed offline.
import { tokenCss, TYPE } from './tokens.mjs';
import { EXTRA } from './css-patterns.mjs';
import { COMPONENTS } from './css-components.mjs';
import { ZOHO } from './css-shell.mjs';
import { CHARTS } from './css-charts.mjs';

// The token block is written to tokens.css and linked by every page. The component rules are inlined
// into each page. That division is the point: a value lives in exactly one file, and a page that opens
// alone still has every rule it needs.
export const TOKENS = `/* ================================================================
   Construct-O-Genie — tokens. Primitive ramps, then semantic tokens, then this product's component names.
   Light and dark are the same semantic names at two values. See 00-foundations.html for sources.
   EVERY value in the set is here. No other file defines a colour, a radius, a shadow or a space.
   ================================================================ */
${tokenCss()}
`;

export const RULES = `

* { box-sizing: border-box; }
html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
body { margin: 0; background: var(--ground); color: var(--ink); font: var(--font-weight-regular) var(--font-size-body)/var(--line-height-body) var(--font-family-body); -webkit-font-smoothing: antialiased; }
h1, h2, h3, h4, h5, h6 { margin: 0; font-weight: var(--font-weight-bold); }
p { margin: 0; }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; text-underline-offset: var(--space-025); }
code { font-family: var(--font-family-code); font-size: .92em; background: var(--idle-soft); border-radius: var(--radius-small); padding: var(--space-025) var(--space-050); }
button, input, select, textarea { font: inherit; color: inherit; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.muted { color: var(--ink-faint); }
.nowrap { white-space: nowrap; }
.dsp { font-family: var(--font-family-heading); font-weight: var(--font-weight-bold); }
.figbox { container-type: inline-size; min-width: 0; }
.figbox .fig { font-family: var(--font-family-heading); font-weight: var(--font-weight-bold); font-size: var(--font-size-figure); line-height: var(--line-height-fluid); font-variant-numeric: tabular-nums; white-space: nowrap; margin-bottom: var(--space-150); }
svg.i { width: var(--space-200); height: var(--space-200); fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: square; stroke-linejoin: round; flex: none; display: block; }
svg.i.sm { width: var(--space-150); height: var(--space-150); }
/* every icon rides its own line box and sits on the x-height of the text beside it */
.ico { display: inline-block; vertical-align: baseline; line-height: inherit; flex: none; }
.ico > svg.i, .ico > input { vertical-align: middle; }
.ico > svg.i { display: inline-block; }

/* ================================================================
   DOCUMENT CHROME — the samples document itself (nav, sections, notes).
   ================================================================ */
.dsx-skip { position: absolute; left: 12px; top: -60px; background: var(--elevated); color: var(--ink); padding: var(--space-100) var(--space-150); border-radius: var(--radius-medium); z-index: 50; box-shadow: var(--shadow-2); }
.dsx-skip:focus { top: 12px; }
.dsx-layout { display: grid; grid-template-columns: 284px minmax(0, 1fr); min-height: 100vh; }
.dsx-nav { position: sticky; top: 0; height: 100vh; overflow: hidden; padding: var(--space-250) var(--space-150) var(--space-200); border-right: 1px solid var(--line); background: var(--ground); display: flex; flex-direction: column; gap: var(--space-200); }
.dsx-nav .brand { font-family: var(--font-family-heading); font-weight: var(--font-weight-bold); font-size: var(--font-size-heading-medium); line-height: var(--line-height-heading-medium); padding: 0 var(--space-150); flex: none; }
.dsx-nav .brand small { display: block; font-family: var(--font-family-body); font-weight: var(--font-weight-regular); font-size: var(--font-size-body-small); color: var(--ink-faint); letter-spacing: 0; margin-top: var(--space-025); line-height: var(--line-height-body-small);}
.dsx-nav ol { list-style: none; margin: 0; padding: 0 0 var(--space-050); display: grid; gap: var(--space-025); align-content: start; flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scroll-padding: var(--space-300) 0 var(--space-100); }
.dsx-nav ol .grp { font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); font-weight: var(--font-weight-semibold); color: var(--ink-faint); padding: var(--space-200) var(--space-150) var(--space-050); letter-spacing: var(--letter-spacing-caps); }
.dsx-nav ol > li:first-child > .grp { padding-top: var(--space-050); }
.dsx-nav ol a { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: var(--space-100); align-items: baseline; padding: var(--space-100) var(--space-150); border-radius: var(--radius-medium); position: relative; color: var(--ink-soft); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); transition: background var(--motion-duration-short) var(--motion-easing-out-practical), color var(--motion-duration-short) var(--motion-easing-out-practical); }
.dsx-nav ol a .n { font-variant-numeric: tabular-nums; font-weight: var(--font-weight-medium); font-size: var(--font-size-body-small); color: var(--ink-faint); text-align: right; line-height: var(--line-height-body-small);}
.dsx-nav ol a .t { min-width: 0; }
.dsx-nav ol a:hover { background: var(--subtle-hover); color: var(--ink); text-decoration: none; }
.dsx-nav ol a[aria-current="true"] { background: var(--accent-soft); color: var(--selected-ink); font-weight: var(--font-weight-medium); }
.dsx-nav ol a[aria-current="true"]::before { content: ''; position: absolute; left: 0; top: var(--space-075); bottom: var(--space-075); width: var(--border-width-selected); border-radius: 0 var(--radius-xsmall) var(--radius-xsmall) 0; background: var(--selected-line); }
.dsx-nav ol a[aria-current="true"] .n { color: var(--selected-ink); }
.dsx-theme { flex: none; border-top: 1px solid var(--line); padding: var(--space-150) var(--space-150) 0; }
.dsx-theme legend, .dsx-theme p { font-size: var(--font-size-body-small); color: var(--ink-faint); padding: 0; margin: 0 0 var(--space-100); line-height: var(--line-height-body-small);}
.dsx-theme fieldset { border: 0; padding: 0; margin: 0; }
.dsx-theme .seg { display: flex; max-width: 320px; background: var(--sunk); border: 1px solid var(--line); border-radius: var(--radius-medium); padding: var(--space-050); gap: var(--space-025); }
.dsx-theme .seg label { flex: 1; text-align: center; padding: var(--space-075) var(--space-050); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); font-weight: var(--font-weight-medium); cursor: pointer; color: var(--ink-soft); white-space: nowrap; position: relative; border-radius: var(--radius-medium); transition: background var(--motion-duration-short) var(--motion-easing-out-practical), color var(--motion-duration-short) var(--motion-easing-out-practical); }
.dsx-theme .seg input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
.dsx-theme .seg label:has(input:checked) { background: var(--elevated); color: var(--ink); box-shadow: inset 0 0 0 var(--border-width) var(--line-strong); }

.dsx-main { padding: var(--space-500) var(--space-500) var(--space-1000); min-width: 0; max-width: 1400px; }
.dsx-section { scroll-margin-top: var(--space-200); margin-bottom: var(--space-1000); }
.dsx-section > h2 { font-family: var(--font-family-heading); font-weight: var(--font-weight-bold); font-size: var(--font-size-heading-xlarge); line-height: var(--line-height-heading-xlarge); margin-bottom: var(--space-100); }
.dsx-section > h2 small { font-family: var(--font-family-body); font-weight: var(--font-weight-medium); color: var(--ink-faint); font-size: var(--font-size-body-small); letter-spacing: 0; margin-right: var(--space-100); vertical-align: middle; line-height: var(--line-height-body-small);}
.dsx-section > .lede { color: var(--ink-soft); max-width: var(--measure); margin-bottom: var(--space-300); font-size: var(--font-size-heading-small); line-height: var(--line-height-heading-small); }
.dsx-sample { margin: var(--space-300) 0 var(--space-500); }
.dsx-sample > h3 { font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); font-weight: var(--font-weight-semibold); color: var(--ink-faint); letter-spacing: var(--letter-spacing-caps); margin-bottom: var(--space-150); display: flex; gap: var(--space-100); align-items: baseline; flex-wrap: wrap; }
.dsx-sample > h3 .dsx-h3-note { font-weight: var(--font-weight-regular); letter-spacing: 0; color: var(--ink-faint); }
.dsx-sample > h3 .dsx-h3-note::before { content: '· '; }
.dsx-note { margin: var(--space-200) 0 0; padding: var(--space-150) var(--space-250) var(--space-150) var(--space-200); border-left: var(--border-width-selected) solid var(--line-strong); background: var(--panel); border-radius: 0 var(--radius-large) var(--radius-large) 0; font-size: var(--font-size-body); line-height: var(--line-height-body); color: var(--ink-soft); max-width: var(--measure); box-shadow: var(--shadow-1); }
.dsx-note .h { display: block; font-size: var(--font-size-body-small); font-weight: var(--font-weight-semibold); color: var(--ink-soft); margin-bottom: var(--space-050); line-height: var(--line-height-body-small);}
.dsx-note p { margin: 0 0 var(--space-075); } .dsx-note p:last-child { margin: 0; }
.dsx-note em { color: var(--ink); font-style: italic; }
.dsx-say { margin: var(--space-150) 0 0; padding: var(--space-150) var(--space-250); border-left: var(--border-width-selected) solid var(--line-strong); background: var(--panel); border-radius: 0 var(--radius-large) var(--radius-large) 0; max-width: var(--measure); box-shadow: var(--shadow-1); }
.dsx-say .h { display: block; font-size: var(--font-size-body-small); font-weight: var(--font-weight-semibold); color: var(--ink-soft); margin-bottom: var(--space-050); line-height: var(--line-height-body-small);}
.dsx-say p { font-family: var(--font-family-heading); font-size: var(--font-size-heading-medium); line-height: var(--line-height-heading-medium); color: var(--ink); }
.dsx-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: var(--space-250); }
.dsx-grid > * { min-width: 0; }
.dsx-grid.phones { grid-template-columns: repeat(2, minmax(0, 390px)); justify-content: start; align-items: stretch; }
.dsx-grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.dsx-decisions h3 { font-family: var(--font-family-heading); font-size: var(--font-size-heading-large); line-height: var(--line-height-heading-large); margin: var(--space-400) 0 var(--space-100); }
.dsx-decisions h4 { font-size: var(--font-size-body); margin: var(--space-250) 0 var(--space-075); line-height: var(--line-height-body);}
.dsx-decisions p, .dsx-decisions li { max-width: var(--measure); font-size: var(--font-size-body); line-height: var(--line-height-body); }
.dsx-decisions li { margin-bottom: var(--space-100); }
.dsx-decisions .full { max-width: none; }
.dsx-map td:first-child { font-family: var(--font-family-code); font-size: var(--font-size-body-small); color: var(--ink-soft); line-height: var(--line-height-body-small);}
.dsx-pills { display: flex; gap: var(--space-100); flex-wrap: wrap; align-items: center; margin-bottom: var(--space-100); }
.dsx-pills .lbl { font-size: var(--font-size-body-small); color: var(--ink-faint); min-width: 150px; line-height: var(--line-height-body-small);}
.dsx-frame { border: 1px solid var(--line); border-radius: var(--radius-xlarge); background: var(--ground); overflow: hidden; box-shadow: var(--shadow-2); container-type: inline-size; position: relative; }
.dsx-frame.web { max-width: 1280px; }
.dsx-frame.tablet { max-width: 768px; }
.dsx-frame.phone { max-width: 390px; }
.dsx-frame:has(> .drawer) { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
.dsx-frame:has(> .drawer) > .bar { grid-area: 1 / 1; }
.dsx-frame:has(> .drawer) > .app { grid-area: 2 / 1; min-height: 0; }
.dsx-frame:has(> .drawer) > .drawer { position: relative; grid-area: 1 / 1 / 3 / 2; justify-self: end; }
.dsx-frame.phone, .dsx-frame.tablet { display: flex; flex-direction: column; }
.dsx-frame.phone > .p-body, .dsx-frame.tablet > .p-body { flex: 1; }
.dsx-frame > .bar { display: flex; gap: var(--space-075); align-items: center; padding: var(--space-100) var(--space-150); border-bottom: 1px solid var(--line); background: var(--panel); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-faint); }
.dsx-frame > .bar i { width: 9px; height: 9px; border-radius: var(--radius-full); background: var(--line-strong); display: inline-block; }
.dsx-frame > .bar .lbl { white-space: nowrap; }
.dsx-frame > .bar .meta { margin-left: auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsx-t { width: 100%; border-collapse: collapse; font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); }
.dsx-t th, .dsx-t td { text-align: left; padding: var(--space-100) var(--space-150); border-bottom: 1px solid var(--line); vertical-align: top; }
.dsx-t th { font-size: var(--font-size-body-small); font-weight: var(--font-weight-semibold); color: var(--ink-faint); line-height: var(--line-height-body-small);}
.dsx-t th.num, .dsx-t td.num { text-align: right; }
.dsx-t td small { display: block; font-size: var(--font-size-body-small); color: var(--ink-faint); line-height: var(--line-height-body-small);}
.dsx-t td.unused { color: var(--ink-faint); }
.dsx-t td.used { font-weight: var(--font-weight-semibold); }
.dsx-chip { display: inline-block; width: 14px; height: 14px; border-radius: var(--radius-small); border: 1px solid var(--line-strong); vertical-align: middle; margin-right: var(--space-100); }
table.dsx-tok td:first-child, table.dsx-tok td:nth-child(3) { white-space: nowrap; }
table.dsx-pairs th, table.dsx-pairs td { padding: var(--space-075) var(--space-100); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); }
table.dsx-pairs code { font-size: var(--font-size-body-small); padding: 0 var(--space-050); }
.dsx-map-tbl td:nth-child(2) { white-space: nowrap; }
.dsx-targets { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-200); margin: 0 0 var(--space-300); }
.dsx-targets > div { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius-large); padding: var(--space-250) var(--space-250); box-shadow: var(--shadow-1); }
.dsx-targets b { display: block; font-family: var(--font-family-heading); font-size: var(--font-size-heading-xxlarge); line-height: var(--line-height-heading-xxlarge); font-weight: var(--font-weight-bold); font-variant-numeric: tabular-nums; margin-bottom: var(--space-050); }
.dsx-targets span { color: var(--ink-soft); font-size: var(--font-size-body); line-height: var(--line-height-body);}
.dsx-surfaces { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-200); }
.dsx-surfaces > div { padding: var(--space-250); border-radius: var(--radius-large); border: 1px solid var(--line); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-soft); }
.dsx-surfaces b { display: block; color: var(--ink); font-size: var(--font-size-body-large); margin-bottom: var(--space-025); line-height: var(--line-height-body-large);}
.dsx-surfaces code { display: inline-block; margin: var(--space-025) 0 var(--space-075); }
.dsx-surfaces .s-ground { background: var(--ground); }
.dsx-surfaces .s-panel { background: var(--panel); box-shadow: var(--shadow-1); }
.dsx-surfaces .s-elevated { background: var(--elevated); box-shadow: var(--shadow-3); }
.dsx-type { display: grid; gap: var(--space-150); }
.dsx-type > div { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: var(--space-200); align-items: baseline; border-bottom: 1px solid var(--line); padding: var(--space-100) 0; }
.dsx-type small b { display: block; margin-top: var(--space-025); font-weight: var(--font-weight-medium); color: var(--ink-soft); font-variant-numeric: tabular-nums; }
.dsx-type small { font-size: var(--font-size-body-small); color: var(--ink-faint); font-family: var(--font-family-body); font-weight: var(--font-weight-regular); letter-spacing: 0; line-height: var(--line-height-body-small);}
.dsx-space { display: flex; gap: var(--space-150); align-items: flex-end; flex-wrap: wrap; }
.dsx-space > div { display: grid; justify-items: center; gap: var(--space-075); font-size: var(--font-size-body-small); color: var(--ink-faint); font-variant-numeric: tabular-nums; line-height: var(--line-height-body-small);}
.dsx-space i { display: block; background: var(--idle-soft); border: 1px solid var(--line-strong); border-radius: var(--radius-small); }
.dsx-showcase { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-200); }
.dsx-showcase > div { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-100); }
.dsx-showcase > div > small { font-size: var(--font-size-body-small); color: var(--ink-faint); line-height: var(--line-height-body-small);}
.dsx-states { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--space-250); }
.dsx-states > div { display: grid; grid-template-rows: auto minmax(0, 1fr); }
.dsx-states > div > .notice { margin: 0; }
.dsx-states > div { min-width: 0; container-type: inline-size; }
.dsx-states > div > .card, .dsx-states > div > .empty { height: 100%; }
.dsx-states h4.lbl { font-size: var(--font-size-body-small); font-weight: var(--font-weight-semibold); color: var(--ink-faint); margin: 0 0 var(--space-100); line-height: var(--line-height-body-small);}
.dsx-illorules { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-150); }
.dsx-illorules > div { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius-large); padding: var(--space-150) var(--space-200) var(--space-200); }
.dsx-illorules b { display: block; font-family: var(--font-family-heading); font-size: var(--font-size-heading-small); line-height: var(--line-height-heading-small); font-weight: var(--font-weight-bold); margin-bottom: var(--space-050); }
.dsx-illorules span { display: block; font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-soft); }
.dsx-bar { display: block; height: 8px; border-radius: var(--radius-small); background: var(--chart-brand); width: var(--w); min-width: 2px; }
.dsx-motion { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-200); }
.dsx-motion > div { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius-large); padding: var(--space-200); box-shadow: var(--shadow-1); font-size: var(--font-size-body-small); color: var(--ink-soft); line-height: var(--line-height-body-small);}
.dsx-motion b { display: block; color: var(--ink); margin-bottom: var(--space-050); }
.dsx-motion code { margin-top: var(--space-100); display: inline-block; }
.dsx-step { display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: var(--space-250); margin: var(--space-400) 0; }
.dsx-step .stepno { width: 44px; height: 44px; border-radius: var(--radius-full); background: var(--ink); color: var(--on-accent); display: flex; align-items: center; justify-content: center; font-family: var(--font-family-heading); font-size: var(--font-size-heading-medium); font-weight: var(--font-weight-bold); line-height: var(--line-height-heading-medium);}
.dsx-step h3 { font-family: var(--font-family-heading); font-size: var(--font-size-heading-large); line-height: var(--line-height-heading-large); margin: var(--space-075) 0 var(--space-075); }
.dsx-step > div > p { color: var(--ink-soft); max-width: var(--measure); margin-bottom: var(--space-200); }
.dsx-demo .dsx-frame { margin-top: var(--space-050); }

/* ================================================================
   PRODUCT — the shell. Page = ground; card = panel, lifted; drawer/popover = elevated.
   ================================================================ */
.app { display: flex; flex-direction: column; min-height: 100%; }
.app > .body { display: flex; flex: 1 1 auto; min-height: 0; }
.side { position: relative; width: var(--side-width); flex: none; display: flex; flex-direction: column; padding: var(--space-150) var(--space-150) var(--space-150); background: var(--side); border-right: 1px solid var(--line); }
.side .brand { display: flex; align-items: center; gap: var(--space-100); padding: var(--space-050) var(--space-100) var(--space-200); }
.side .brand .mark { width: 30px; height: var(--control-height-compact); border-radius: var(--radius-medium); background: var(--accent); color: var(--on-accent); display: flex; align-items: center; justify-content: center; font-family: var(--font-family-heading); font-weight: var(--font-weight-bold); font-size: var(--font-size-heading-small); flex: none; line-height: var(--line-height-heading-small);}
.side .brand b { display: block; font-size: var(--font-size-body); line-height: var(--line-height-body); font-weight: var(--font-weight-semibold); }
.side .brand small { display: block; font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-faint); }
.side-nav { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-025); align-content: start; }   /* minmax(0, …): a long label ellipsizes rather than widening every row */
.side-nav .nav-sep { height: 1px; background: var(--line); margin: var(--space-100) var(--space-100); }
.side-nav a, .side-nav .nav-h { display: flex; align-items: center; justify-content: flex-start; gap: var(--space-100); width: 100%; min-height: var(--nav-item-height); padding: var(--space-050) var(--space-100); border: 0; border-radius: var(--radius-medium); background: transparent; color: var(--ink-soft); font: inherit; font-size: var(--font-size-body); line-height: var(--line-height-body); font-weight: var(--font-weight-medium); text-align: left; cursor: pointer; position: relative; transition: var(--transition-control); }
.side-nav .nav-t { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.side-nav a .ico, .side-nav .nav-h .ico { color: var(--ink-faint); transition: var(--transition-control); }
.side-nav a:hover, .side-nav .nav-h:hover { background: var(--subtle-hover); color: var(--ink); text-decoration: none; }
.side-nav a:hover .ico, .side-nav .nav-h:hover .ico { color: var(--ink-soft); }
.side-nav a[aria-current] { background: var(--accent-soft); color: var(--selected-ink); }
.side-nav a[aria-current] .ico { color: var(--selected-ink); }
.side-nav a[aria-current]::before { content: ''; position: absolute; left: 0; top: var(--space-100); bottom: var(--space-100); width: var(--border-width-selected); border-radius: 0 var(--radius-xsmall) var(--radius-xsmall) 0; background: var(--selected-line); }
.side-nav .nav-h .nav-chev { margin-left: auto; color: var(--ink-faint); display: flex; }
.side-nav .nav-h .cnt + .nav-chev { margin-left: var(--space-050); }
.side-nav .nav-h .nav-chev svg { transition: var(--motion-chevron); }
.side-nav .nav-h[aria-expanded="false"] .nav-chev svg { transform: rotate(-90deg); }
.side-nav .nav-sec.open > .nav-h .nav-sum { display: none; }
/* a closed section that holds the page you are on says so, so closing it never loses your place */
.side-nav .nav-h.has-current { color: var(--selected-ink); }
.side-nav .nav-h.has-current .ico { color: var(--selected-ink); }
.side-nav .nav-pages { list-style: none; margin: 0; padding: 0 0 var(--space-050); display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-025); }
.side-nav .nav-pages[hidden] { display: none; }
.side-nav .nav-pages a { padding-left: calc(var(--space-100) * 2 + var(--space-200)); font-weight: var(--font-weight-regular); }
/* the rail: a section is its icon; its pages open beside it, over the page, and close again */
.app > .body { position: relative; }   /* the flyout and the banner position against the body, under the top bar */
.nav-fly { position: absolute; left: calc(var(--side-width-rail) + var(--space-050)); width: 232px; background: var(--elevated); border: 1px solid var(--line); border-radius: var(--radius-large); box-shadow: var(--shadow-3); padding: var(--space-100); z-index: 9; }
.nav-fly .nav-fly-t { display: flex; align-items: center; gap: var(--space-100); padding: var(--space-050) var(--space-100) var(--space-100); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); font-weight: var(--font-weight-semibold); color: var(--ink-soft); }
.nav-fly .side-nav .nav-pages a { padding-left: var(--space-100); }
.nsheet .side-nav { padding: var(--space-100) var(--space-150); overflow-y: auto; flex: 1; }
.nsheet .side-nav a, .nsheet .side-nav .nav-h { min-height: var(--control-height-touch); }
.nsheet .nsheet-foot { border-top: 1px solid var(--line); padding: var(--space-100) var(--space-150); display: grid; gap: var(--space-025); }
.side .foot { margin-top: auto; border-top: 1px solid var(--line); padding-top: var(--space-100); display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-050); }
.side .me { display: flex; align-items: center; gap: var(--space-100); min-width: 0; padding: var(--space-100) var(--space-100); border-radius: var(--radius-large); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); transition: background var(--motion-duration-short) var(--motion-easing-out-practical); cursor: pointer; }
.side .me:hover { background: var(--sunk); }
.side .me > div { min-width: 0; flex: 1; }
.side .me b { display: block; font-weight: var(--font-weight-semibold); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.side .me small { display: block; color: var(--ink-faint); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.side .me .ico { margin-left: auto; color: var(--ink-faint); }
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.topbar { display: flex; align-items: center; gap: var(--space-150); padding: var(--space-100) var(--space-300) var(--space-100) 0; min-height: var(--topbar-height); }
.topbar .btn.nav-open { display: none; }
.topbar .spacer { flex: 1; }
.bell { position: relative; }
.bell .dot { position: absolute; top: 2px; right: 2px; min-width: 15px; height: 15px; padding: 0 var(--space-050); border-radius: var(--radius-full); background: var(--accent); color: var(--on-accent); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); font-weight: var(--font-weight-bold); text-align: center; box-shadow: 0 0 0 var(--mark-ring) var(--ground); font-variant-numeric: tabular-nums; }
.page { padding: var(--space-300) var(--space-400) var(--space-600); flex: 1; }
.page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-250); margin-bottom: var(--space-250); }
.page-head > div { min-width: 0; }
.pt { font-family: var(--font-family-heading); font-weight: var(--font-weight-bold); font-size: var(--font-size-title); line-height: var(--line-height-fluid); }
.ps { color: var(--ink-soft); font-size: var(--font-size-body); line-height: var(--line-height-body); margin-top: var(--space-050); }
.ps .pill { vertical-align: baseline; }
.page-head .actions { flex: none; }
.eyebrow { display: inline-flex; align-items: center; gap: var(--space-100); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); font-weight: var(--font-weight-semibold); color: var(--ink-soft); margin-bottom: var(--space-075); }
.eyebrow::before { content: ''; width: 8px; height: 8px; border-radius: var(--radius-full); background: var(--ink-faint); }
.actions { display: flex; gap: var(--space-100); align-items: center; flex-wrap: wrap; }
.actions .spacer { flex: 1; }

/* ---- tabs ---- */

/* ---- cards ---- */
.card { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius-large); margin-bottom: var(--space-250); transition: var(--transition-card); }
.card.lift:hover { border-color: var(--line-strong); }
.card-h { display: flex; align-items: center; justify-content: space-between; gap: var(--space-150) var(--space-150); padding: var(--space-200) var(--space-250); border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.card-h .ct { font-size: var(--font-size-heading-small); line-height: var(--line-height-heading-small); font-weight: var(--font-weight-bold); min-width: 0; flex: 1 1 140px; }
.card-h .actions { flex: 0 1 auto; min-width: 0; flex-wrap: nowrap; }
.card-h .ct .sub { font-weight: var(--font-weight-regular); color: var(--ink-faint); font-size: var(--font-size-body-small); margin-left: var(--space-100); line-height: var(--line-height-body-small);}
.card-b { padding: var(--space-250); }
.card-b.tight { padding: var(--space-100) var(--space-150) var(--space-150); }
/* A board's columns carry their own inset, so the body that holds them gives up some of its own. */
.card-b.board { padding: var(--space-150); }
/* A second body under the first, continuing it: the rule between them is the separation, not a gap. */
.card-b.continued { padding-top: 0; }
.card-f { padding: var(--space-150) var(--space-250); border-top: 1px solid var(--line); display: flex; gap: var(--space-100); align-items: center; justify-content: space-between; font-size: var(--font-size-body-small); color: var(--ink-soft); line-height: var(--line-height-body-small);}
.two { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: var(--space-250); }
.two > .card, .two > .stat { margin-bottom: 0; }
.two { margin-bottom: var(--space-250); }
.two > * { min-width: 0; }
.two.even { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
/* three panels a row when each can have 360px — a chart's x labels and its tooltip need it; two otherwise, the third wrapping */
.three { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: var(--space-250); margin-bottom: var(--space-250); }
.three > * { min-width: 0; margin-bottom: 0; }
.kv { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: var(--space-100) var(--space-250); margin: 0; font-size: var(--font-size-body); line-height: var(--line-height-body); }
.kv dt { color: var(--ink-faint); }
.kv dd { margin: 0; min-width: 0; }
.kv dd .pill { vertical-align: baseline; }

/* ---- the Stat, rebuilt: a large tabular figure, a delta with direction and period, a sparkline ---- */
/* stats share row tracks (subgrid) so labels, figures and deltas align across a row whatever wraps */
.stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-auto-rows: auto; gap: var(--space-200); margin-bottom: var(--space-250); }
.stats > .stat { grid-row: span 5; grid-template-rows: subgrid; row-gap: 0; }
.stats.n2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.stats.n4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.stat { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius-large); padding: var(--space-250) var(--space-250) var(--space-200); box-shadow: var(--shadow-1); display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto auto auto auto; align-items: end; align-content: start; min-width: 0; transition: var(--transition-card); }
.stat.lift:hover { border-color: var(--line-strong); }
.stat .l { grid-row: 1; grid-column: 1 / -1; align-self: start; font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-soft); font-weight: var(--font-weight-medium); margin-bottom: var(--space-100); }
/* the figure's box is the container the clamp() reads, so a long figure shrinks to fit its stat (subgrid forbids containment on the stat itself) */
.stat .vbox { grid-row: 2; grid-column: 1 / -1; align-self: start; min-width: 0; container-type: inline-size; }
.stat .v { font-family: var(--font-family-heading); font-weight: var(--font-weight-bold); font-size: var(--font-size-stat); line-height: var(--line-height-fluid); font-variant-numeric: tabular-nums; white-space: nowrap; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.stat .v.txt { font-family: var(--font-family-body); font-weight: var(--font-weight-semibold); font-size: var(--font-size-heading-medium); line-height: var(--line-height-heading-medium); white-space: normal; }
.stat .d { grid-row: 3; grid-column: 1 / -1; align-self: start; font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-faint); margin-top: var(--space-075); font-variant-numeric: tabular-nums; display: flex; align-items: baseline; gap: var(--space-075); flex-wrap: wrap; }
.stat .d b { font-weight: var(--font-weight-semibold); color: var(--ink-soft); }
.stat .d.up b { color: var(--ok); }
.stat .d.down b { color: var(--bad); }
/* Caution is a FILL carrying INK, never a thin stroke or small text on a light panel — amber cannot
   hold 4.5:1 at any lightness where it still looks like amber. The delta goes neutral and the
   caution signal moves to .next, which is an area. */
.stat .d.watch b { color: var(--ink); }
/* The note under a stat used to hold a PILL reading "Renegotiate, or raise a variation". A pill is a
   status and does not wrap, so it pushed the card open; that text is an instruction, not a state.
   As marked text it wraps, and it stops pretending to be a status. */
.stat .n .next { display: inline-block; color: var(--warn); font-weight: var(--font-weight-semibold); }
.stat .n { grid-row: 5; grid-column: 1 / -1; font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-faint); margin-top: var(--space-100); padding-top: var(--space-100); border-top: 1px solid var(--line); }
.stat .n .pill { vertical-align: baseline; }
.stat.mini { padding: var(--space-150) var(--space-150); }
.stat.mini .v { font-size: var(--font-size-stat-compact); line-height: 28px; }

/* ---- the hero: one thing per screen, at a size nothing else approaches ---- */
.hero { background: var(--raised); border: 1px solid var(--line); border-radius: var(--radius-xlarge); box-shadow: var(--shadow-2); padding: var(--space-300) var(--space-300) var(--space-300); margin-bottom: var(--space-250); display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'e e' 'v s' 'p s' 'a a' 'f f'; column-gap: var(--space-300); align-items: end; position: relative; overflow: hidden; }
.hero .eyebrow { grid-area: e; margin-bottom: var(--space-100); }
.hero .v { grid-area: v; font-family: var(--font-family-heading); font-weight: var(--font-weight-bold); font-size: var(--font-size-hero); line-height: var(--line-height-fluid); font-variant-numeric: tabular-nums; white-space: nowrap; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.hero .v small { font-size: .46em; line-height: 1; color: var(--ink-soft); font-weight: var(--font-weight-medium); margin-left: var(--space-050); }
.hero .p { grid-area: p; font-size: var(--font-size-heading-small); line-height: var(--line-height-heading-small); color: var(--ink-soft); margin-top: var(--space-075); max-width: var(--measure-tight); }
.hero .p b { color: var(--ink); font-weight: var(--font-weight-semibold); }
.hero .hs { grid-area: s; display: grid; gap: var(--space-100); justify-items: end; align-self: end; }
.hero .d { font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-faint); font-variant-numeric: tabular-nums; display: flex; gap: var(--space-075); align-items: baseline; }
.hero .d b { font-weight: var(--font-weight-semibold); color: var(--ink-soft); }
.hero .d.up b { color: var(--ok); } .hero .d.down b { color: var(--bad); }
.hero .a { grid-area: a; margin-top: var(--space-250); display: flex; align-items: center; gap: var(--space-150); flex-wrap: wrap; }
.hero .foot { grid-area: f; margin-top: var(--space-150); padding-top: var(--space-150); border-top: 1px solid var(--line); display: flex; align-items: center; gap: var(--space-250); flex-wrap: wrap; font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-faint); }
.hero .foot .who { display: inline-flex; align-items: center; gap: var(--space-100); }
.hero .foot .avatar { width: var(--avatar-size); height: var(--avatar-size); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small);}
.hero .foot b { color: var(--ink-soft); font-weight: var(--font-weight-semibold); }
.hero.watch { grid-template-areas: 'e e' 'v s' 'p s' 'b b' 'a a' 'f f'; }

/* ---- buttons ---- */

/* ---- the set: contents, pager, and a brand that goes home ---- */
.dsx-nav .brand a { color: inherit; display: block; border-radius: var(--radius-medium); }
.dsx-nav .brand a:hover { text-decoration: none; color: var(--link); }
.dsx-contents { list-style: none; margin: var(--space-300) 0 var(--space-400); padding: 0; display: grid; gap: var(--space-075); }
.dsx-contents a { display: grid; grid-template-columns: var(--space-400) minmax(0, 1fr); gap: var(--space-200); align-items: baseline; padding: var(--space-200) var(--space-250); border: 1px solid var(--line); border-radius: var(--radius-large); background: var(--panel); color: var(--ink); box-shadow: var(--shadow-1); transition: var(--transition-card); }
.dsx-contents a:hover { border-color: var(--line-strong); background: var(--sunk); text-decoration: none; }
.dsx-contents .n { font-family: var(--font-family-heading); font-weight: var(--font-weight-bold); font-size: var(--font-size-heading-large); line-height: var(--line-height-heading-large); color: var(--ink-faint); font-variant-numeric: tabular-nums; }
.dsx-contents strong { display: block; font-weight: var(--font-weight-semibold); font-size: var(--font-size-heading-small); line-height: var(--line-height-heading-small); }
.dsx-contents small { display: block; margin-top: var(--space-025); color: var(--ink-soft); font-size: var(--font-size-body); line-height: var(--line-height-body); max-width: var(--measure); }
.dsx-pager { display: grid; grid-template-columns: minmax(0, 1fr) max-content minmax(0, 1fr); gap: var(--space-150); align-items: stretch; margin-top: var(--space-1000); padding-top: var(--space-250); border-top: 1px solid var(--line); }
.dsx-pager a { display: flex; flex-direction: column; justify-content: center; gap: var(--space-025); padding: var(--space-150) var(--space-200); border: 1px solid var(--line); border-radius: var(--radius-large); background: var(--panel); color: var(--ink); box-shadow: var(--shadow-1); transition: var(--transition-card); }
.dsx-pager a:hover { border-color: var(--line-strong); background: var(--sunk); text-decoration: none; }
.dsx-pager small { font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-faint); }
.dsx-pager b { font-weight: var(--font-weight-semibold); font-size: var(--font-size-body); line-height: var(--line-height-body); }
.dsx-pager .pg-next { text-align: right; }
.dsx-pager .pg-up { justify-content: center; text-align: center; color: var(--ink-soft); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); font-weight: var(--font-weight-medium); }
.dsx-pager .sp { display: block; }
@media (max-width: 720px) { .dsx-pager { grid-template-columns: minmax(0, 1fr); } .dsx-pager .pg-next { text-align: left; } .dsx-pager .sp { display: none; } }

/* ---- the type specimen: one class per ramp step, generated from the ramp ---- */
.dsx-type .fluidbox { container-type: inline-size; display: block; min-width: 0; }
${TYPE.map(t => `.ty-${t.key} { font: var(--font-weight-${({ 653: 'bold', 600: 'semibold', 500: 'medium', 400: 'regular' })[t.weight]}) var(--font-size-${t.key})/var(--line-height-${t.key}) var(--font-family-${t.key.startsWith('body') ? 'body' : 'heading'}); ${t.key.startsWith('metric') ? 'font-variant-numeric: tabular-nums; ' : ''}}`).join('\n')}
${['hero', 'figure', 'stat', 'stat-compact', 'title'].map(n => `.tyf-${n} { font-family: var(--font-family-heading); font-weight: var(--font-weight-bold); font-size: var(--font-size-${n}); line-height: var(--line-height-fluid); font-variant-numeric: tabular-nums; }`).join('\n')}
.u-tabular { display: inline-block; text-align: left; font-variant-numeric: tabular-nums; }
.u-sm { font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); }
/* holds the height a conditional block would occupy, so a card keeps one footprint whether or not
   the block is there — the parity rule, given a name instead of a number */
.u-hold { height: var(--space-150); }

/* ---- pills ---- */
/* In progress is the most common state in the product and the least informative. It gets the neutral
   pill and a dot: present, moving, nothing owed. Colour is spent on the states that need a decision. */
.gated { color: var(--ink-faint); font-style: italic; }

/* ---- tables ---- */
.tbl-wrap { overflow-x: auto; padding-inline: var(--space-200); }
.card-b > .tbl-wrap, .spec-pane > .tbl-wrap, .spec-pane .tbl-wrap { padding-inline: 0; }
.row-link { cursor: pointer; }
/* --- applied state: what a control did, not that it exists ------------------------------ */
.vline { display: block; margin: calc(var(--space-050) * -1) 0 var(--space-200); padding: var(--space-150) var(--space-200) var(--space-150) var(--space-200); border-left: var(--border-width-selected) solid var(--line-strong); background: var(--panel); border-radius: 0 var(--radius-large) var(--radius-large) 0; box-shadow: var(--shadow-1); max-width: var(--measure); font-family: var(--font-family-heading); font-size: var(--font-size-heading-small); line-height: var(--line-height-heading-small); color: var(--ink); }
.vline .vl-l { display: block; font-family: var(--font-family-body); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); font-weight: var(--font-weight-bold); letter-spacing: var(--letter-spacing-caps); text-transform: uppercase; color: var(--ink-soft); margin-bottom: var(--space-050); }
.chips { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-100); padding: var(--space-150) var(--space-200); border-bottom: 1px solid var(--line); background: var(--sunk); }
.chips-l { font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-faint); }
.bulkbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-150); padding: var(--space-100) var(--space-200); border-bottom: 1px solid var(--line); background: var(--select); }
.bulkbar .n { font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink); font-variant-numeric: tabular-nums; }
.bulkbar .n b { font-weight: var(--font-weight-bold); }
.bulkbar .ba { display: flex; flex-wrap: wrap; gap: var(--space-100); flex: 1; }
th.sel, td.sel { width: 34px; padding-right: 0; }
th.sel input, td.sel input, th.check input, td.check input { margin: 0; width: var(--checkbox-size); height: var(--checkbox-size); accent-color: var(--accent); }
tr.picked > td { background: var(--select); }
.docs.sel li { grid-template-columns: 15px 20px minmax(0, 1fr) max-content; }
.docs.sel li > input[type="checkbox"] { margin: 0; width: var(--checkbox-size); height: var(--checkbox-size); flex: none; align-self: center; accent-color: var(--accent); }
.docs.sel li.picked { background: var(--select); }
.toolbar { display: flex; gap: var(--space-100); align-items: flex-end; padding: var(--space-150) var(--space-200); border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.toolbar .field { margin: 0; }
.toolbar .search { max-width: 280px; min-width: 200px; }
.toolbar .spacer { flex: 1; }
.showing { font-size: var(--font-size-body-small); color: var(--ink-faint); padding: var(--space-100) var(--space-200); line-height: var(--line-height-body-small);}
.bulkbar { display: flex; align-items: center; gap: var(--space-100) var(--space-150); padding: var(--space-100) var(--space-200); background: var(--select); border-bottom: 1px solid var(--line); font-size: var(--font-size-body); flex-wrap: wrap; line-height: var(--line-height-body);}
.bulkbar b { color: var(--ink); }
.bulkbar .spacer { flex: 1; }

/* ---- lists ---- */
.list { list-style: none; margin: 0; padding: 0; }
.list li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-050) var(--space-200); align-items: center; padding: var(--space-150) var(--space-200); border-bottom: 1px solid var(--line); transition: background var(--motion-duration-short) var(--motion-easing-out-practical); }
.list li:hover { background: var(--sunk); }
.list li:last-child { border-bottom: 0; }
.list li small { display: block; color: var(--ink-faint); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); }
.list li > .num { font-weight: var(--font-weight-medium); }
.list.day li { grid-template-columns: 22px minmax(0, 1fr) auto; }
.list.day .when { font-size: var(--font-size-body-small); color: var(--ink-faint); white-space: nowrap; font-variant-numeric: tabular-nums; line-height: var(--line-height-body-small);}
.list.day .kind { width: 7px; height: 7px; border-radius: var(--radius-full); background: var(--line-strong); margin: 0 auto; }

/* ---- notices, empty states, gate ---- */
/* the drawing system: 160×160, blocks of the accent colours under one hand-drawn line, sparkles off the object.
   The six drawings are symbol definitions in the sprite (illustrations.mjs); every empty state references one, so a
   change lands in all of them at once. The selectors that style the symbol are with the empty state. */

/* ---- forms ---- */
.steps { display: grid; gap: 0; list-style: none; margin: 0 0 var(--space-200); padding: 0; }
.steps li { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: var(--space-150); align-items: start; padding: var(--space-075) 0; }
.steps li > div small { display: block; font-size: var(--font-size-body-small); color: var(--ink-faint); line-height: var(--line-height-body-small); }
.tick, .ic { width: 26px; height: 26px; border-radius: var(--radius-full); border: 2px solid var(--line-strong); display: inline-flex; align-items: center; justify-content: center; flex: none; background: var(--panel); }
.tick .ico, .ic .ico { display: flex; }
.steps li.done .tick { background: var(--ok); border-color: var(--ok); color: var(--on-ok); }
.steps li.now .tick { border-color: var(--accent); }
.ic { width: var(--control-height); height: var(--control-height); background: var(--idle-soft); border-color: transparent; color: var(--ink-soft); }

/* ---- setup card ---- */
.setup ol { list-style: none; margin: 0; padding: 0; }
.setup li { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; gap: var(--space-150); align-items: center; padding: var(--space-150) var(--space-250); border-bottom: 1px solid var(--line); }
.setup li:last-child { border-bottom: 0; }
.setup li b { display: block; font-weight: var(--font-weight-semibold); font-size: var(--font-size-body); line-height: var(--line-height-body);}
.setup li small { display: block; color: var(--ink-faint); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); }
.setup li.done b { color: var(--ink-soft); font-weight: var(--font-weight-medium); }
.setup li.done .tick { background: var(--ok); border-color: var(--ok); color: var(--on-ok); }
.setup .status { font-size: var(--font-size-body-small); color: var(--ok); font-weight: var(--font-weight-medium); line-height: var(--line-height-body-small);}
.setup .chart.progress { display: flex; align-items: center; gap: var(--space-100); font-size: var(--font-size-body-small); color: var(--ink-soft); flex: 1 1 auto; min-width: 0; white-space: nowrap; line-height: var(--line-height-body-small);}
.setup .chart.progress .bar { flex: 1 1 auto; }
.setup.mini { display: flex; align-items: center; gap: var(--space-150); padding: var(--space-150) var(--space-200); margin-bottom: var(--space-250); font-size: var(--font-size-body); flex-wrap: wrap; line-height: var(--line-height-body);}
.setup.mini > span { flex: 1 1 220px; min-width: 0; }

/* ---- charts (meter list) ---- */

/* ---- kanban ---- */
.kanban { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(168px, 1fr); gap: var(--space-150); overflow-x: auto; padding-bottom: var(--space-100); }
.kcol { background: var(--sunk); border: 1px solid var(--line); border-radius: var(--radius-xlarge); padding: var(--space-100); min-width: 0; }
.kcol > .kh { display: grid; gap: var(--space-025); padding: var(--space-050) var(--space-075) var(--space-100); font-size: var(--font-size-body-small); color: var(--ink-soft); font-weight: var(--font-weight-semibold); line-height: var(--line-height-body-small);}
.kcol > .kh .num { font-weight: var(--font-weight-medium); color: var(--ink-faint); font-size: var(--font-size-body-small); text-align: left; line-height: var(--line-height-body-small);}
.kcard { display: block; color: var(--ink); background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius-large); padding: var(--space-150) var(--space-150); margin-bottom: var(--space-100); cursor: pointer; transition: var(--transition-card); }
.kcard:hover { border-color: var(--line-strong); background: var(--sunk); text-decoration: none; }
.kcard b { display: block; font-size: var(--font-size-body); line-height: var(--line-height-body); font-weight: var(--font-weight-semibold); }
.kcard small { display: block; color: var(--ink-faint); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); }
.kcard .num { display: block; text-align: left; margin-top: var(--space-075); font-weight: var(--font-weight-medium); font-variant-numeric: tabular-nums; }
.kcard .who { display: flex; align-items: center; gap: var(--space-075); margin-top: var(--space-100); font-size: var(--font-size-body-small); color: var(--ink-faint); line-height: var(--line-height-body-small);}
.kcard .who .avatar { width: var(--avatar-size); height: var(--avatar-size); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small);}

/* ---- drawer & popover ---- */
.drawer .stat, .drawer .card { background: var(--panel); }
.drawer .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-100); margin-bottom: var(--space-200); }
.drawer .stat .v { font-size: var(--font-size-heading-large); line-height: 28px; }
.popover .ph b { display: block; font-weight: var(--font-weight-regular); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-faint); }
.popover .ph { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-100); padding: var(--space-150) var(--space-200); border-bottom: 1px solid var(--line); font-weight: var(--font-weight-semibold); font-size: var(--font-size-body); line-height: var(--line-height-body);}
.popover .ph .link-btn { font-size: var(--font-size-body-small); line-height: var(--line-height-body-small);}
.popover .notifs { list-style: none; margin: 0; padding: 0; max-height: 520px; overflow-y: auto; overscroll-behavior: contain; }
.popover .notifs .day { position: sticky; top: 0; z-index: 1; padding: var(--space-075) var(--space-200); background: var(--sunk); border-bottom: 1px solid var(--line); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); font-weight: var(--font-weight-semibold); color: var(--ink-soft); letter-spacing: var(--letter-spacing-caps); text-transform: uppercase; }
.popover .notifs .n { position: relative; display: grid; grid-template-columns: var(--avatar-size) minmax(0, 1fr) max-content; gap: var(--space-025) var(--space-100); align-items: start; padding: var(--space-100) var(--space-200); border-bottom: 1px solid var(--line); }
.popover .notifs .n:last-child { border-bottom: 0; }
.popover .notifs .n:hover { background: var(--sunk); }
.popover .notifs .n.unread::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--accent); }
.popover .notifs .n p { font-size: var(--font-size-body); line-height: var(--line-height-body); }
.popover .notifs .n small { display: block; margin-top: var(--space-025); color: var(--ink-faint); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); }
.popover .notifs .n .when { font-size: var(--font-size-body-small); line-height: var(--line-height-body); color: var(--ink-faint); white-space: nowrap; font-variant-numeric: tabular-nums; text-align: right; }
.popover .notifs .n .when .dot { display: block; width: 6px; height: 6px; border-radius: var(--radius-full); background: var(--accent); margin: var(--space-050) 0 0 auto; }
.popover .notifs .n .acts { display: flex; gap: var(--space-050); margin-top: var(--space-075); flex-wrap: wrap; }
.popover .pf { padding: var(--space-100) var(--space-200); border-top: 1px solid var(--line); font-size: var(--font-size-body-small); text-align: center; line-height: var(--line-height-body-small);}

/* ---- health strip, phases, milestones, docs, variations ---- */
.health { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-200); margin-bottom: var(--space-250); }
.phases { display: flex; gap: var(--space-075); margin-bottom: var(--space-250); overflow-x: auto; }
.phases a { flex: 1; min-width: 90px; text-align: center; padding: var(--space-100) var(--space-100); border-radius: var(--radius-medium); background: var(--sunk); border: 1px solid var(--line); font-size: var(--font-size-body-small); font-weight: var(--font-weight-medium); color: var(--ink-soft); white-space: nowrap; transition: background var(--motion-duration-short) var(--motion-easing-out-practical), color var(--motion-duration-short) var(--motion-easing-out-practical); line-height: var(--line-height-body-small);}
.phases a:hover { text-decoration: none; color: var(--ink); }
.phases a[aria-current="step"] { background: var(--accent-soft); color: var(--selected-ink); border-color: var(--selected-line); }
.phases a.done { color: var(--ok); }
.mstones { list-style: none; margin: 0; padding: 0; }
.mstones li { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; gap: var(--space-150); align-items: center; padding: var(--space-150) var(--space-250); border-bottom: 1px solid var(--line); }
.mstones li:last-child { border-bottom: 0; }
.mstones li b { display: block; font-weight: var(--font-weight-semibold); }
.mstones li small { display: block; color: var(--ink-faint); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small);}
.mstones li.done .tick { background: var(--ok); border-color: var(--ok); color: var(--on-ok); }
.mstones li.now .tick { border-color: var(--accent); }
.mstones .num { font-size: var(--font-size-body); line-height: var(--line-height-body);}
.mstones .num small { display: block; color: var(--ink-faint); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small);}
.docs { list-style: none; margin: 0; padding: 0; }
.docs li { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; gap: var(--space-150); align-items: center; padding: var(--space-150) var(--space-250); border-bottom: 1px solid var(--line); transition: background var(--motion-duration-short) var(--motion-easing-out-practical); }
.docs li:hover { background: var(--sunk); }
.docs li:last-child { border-bottom: 0; }
.docs li > .ico { color: var(--ink-faint); display: flex; }
.docs li b { display: block; font-weight: var(--font-weight-medium); }
.docs li small { display: block; color: var(--ink-faint); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small);}
.docs li > span:nth-child(3) { font-size: var(--font-size-body-small); color: var(--ink-faint); white-space: nowrap; line-height: var(--line-height-body-small);}
.variation { padding: var(--space-250) var(--space-250); border-bottom: 1px solid var(--line); }
.variation:last-child { border-bottom: 0; }
.variation .vh { display: flex; justify-content: space-between; gap: var(--space-150); align-items: baseline; margin-bottom: var(--space-050); }
.variation .vh b { font-size: var(--font-size-body-large); line-height: var(--line-height-body-large);}
.variation p { color: var(--ink-soft); font-size: var(--font-size-body); line-height: var(--line-height-body); }
.variation .num { font-family: var(--font-family-heading); font-size: var(--font-size-heading-medium); line-height: var(--line-height-heading-medium); font-weight: var(--font-weight-bold); text-align: left; margin-top: var(--space-100); }
.variation .num small { display: block; font-family: var(--font-family-body); font-size: var(--font-size-body-small); color: var(--ink-faint); font-weight: var(--font-weight-regular); letter-spacing: 0; line-height: var(--line-height-body-small);}
.stepper { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; margin-bottom: var(--space-250); background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius-large); box-shadow: var(--shadow-1); overflow: hidden; }
.stepper li { list-style: none; display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: var(--space-100); align-items: center; padding: var(--space-150) var(--space-250); border-right: 1px solid var(--line); font-size: var(--font-size-body); color: var(--ink-soft); line-height: var(--line-height-body);}
.stepper li:last-child { border-right: 0; }
.stepper li b { display: block; color: var(--ink); font-weight: var(--font-weight-semibold); }
.stepper li small { display: block; font-size: var(--font-size-body-small); color: var(--ink-faint); line-height: var(--line-height-body-small);}
.stepper li .stepno { width: 26px; height: 26px; border-radius: var(--radius-full); border: 2px solid var(--line-strong); display: inline-flex; align-items: center; justify-content: center; font-size: var(--font-size-body-small); font-weight: var(--font-weight-semibold); color: var(--ink-soft); line-height: var(--line-height-body-small);}
.stepper li[aria-current="step"] .stepno { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.stepper li.done .stepno { background: var(--ok); border-color: var(--ok); color: var(--on-ok); }
.taxrow { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(min-content, 1fr) auto; gap: var(--space-150); align-items: center; padding: var(--space-150) var(--space-250); border-bottom: 1px solid var(--line); }
.taxrow:last-child { border-bottom: 0; }
.taxrow b { display: block; font-weight: var(--font-weight-semibold); }
.taxrow small { display: block; color: var(--ink-faint); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); }
.taxrow .val { font-weight: var(--font-weight-medium); }
/* The loading table IS a table, so its rows are the rows it stands in for. The bar sits in a line box
   the height of a line of text, which is what makes the row match without anybody typing a row height. */
.skel-note { padding: var(--space-100) var(--space-150); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); }
.err-detail { margin-top: var(--space-100); font-family: var(--font-family-code); font-size: var(--font-size-body-small); color: var(--ink-faint); line-height: var(--line-height-body-small);}

/* ---- site: day card, ledger, measurement ---- */
.daysum { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-150); padding: var(--space-200) var(--space-250); border-bottom: 1px solid var(--line); }
.daysum > div { font-size: var(--font-size-body-small); color: var(--ink-faint); line-height: var(--line-height-body-small);}
.daysum > div b { display: block; font-family: var(--font-family-heading); font-size: var(--font-size-heading-large); line-height: var(--line-height-heading-large); font-weight: var(--font-weight-bold); color: var(--ink); font-variant-numeric: tabular-nums; }
.daysum > div small { display: block; font-size: var(--font-size-body-small); line-height: var(--line-height-body-small);}
.photos { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-100); padding: var(--space-200) var(--space-250); }
.photos > div { aspect-ratio: 4 / 3; border-radius: var(--radius-medium); background: var(--sunk); border: 1px solid var(--line); display: flex; align-items: flex-end; padding: var(--space-100); font-size: var(--font-size-body-small); color: var(--ink-faint); position: relative; overflow: hidden; line-height: var(--line-height-body-small);}
.photos > div::before { content: ''; position: absolute; inset: 0; background: linear-gradient(160deg, var(--idle-soft), var(--sunk) 60%); }
.photos > div span { position: relative; }
.recce { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: var(--space-250); margin-bottom: var(--space-250); }
.recce > .card { margin-bottom: 0; }
.recce > * { min-width: 0; }
.checks { list-style: none; margin: 0; padding: 0; }
.checks li { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; gap: var(--space-150); align-items: center; padding: var(--space-100) var(--space-250); border-bottom: 1px solid var(--line); font-size: var(--font-size-body); line-height: var(--line-height-body);}
.checks li:last-child { border-bottom: 0; }
.checks li small { display: block; color: var(--ink-faint); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small);}
.checks li.done .tick { background: var(--ok); border-color: var(--ok); color: var(--on-ok); }
.sheet td.num.diff-up { color: var(--bad); }
.sheet td.num.diff-down { color: var(--ok); }
.tasks li { grid-template-columns: 26px minmax(0, 1fr) auto auto; }
.tasks li .avatar { width: var(--avatar-size); height: var(--avatar-size); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small);}
.tasks li .due { font-size: var(--font-size-body-small); color: var(--ink-faint); white-space: nowrap; line-height: var(--line-height-body-small);}
.tasks li .due.today { display: inline-block; color: var(--warn); font-weight: var(--font-weight-semibold); }
.stock-low { color: var(--ink); font-weight: var(--font-weight-semibold); }

/* ---- portals (phone, tablet) ---- */
.p-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-100) var(--space-150); padding: var(--space-150) var(--space-200); border-bottom: 1px solid var(--line); background: var(--panel); flex-wrap: wrap; }
.p-head > div { min-width: 0; flex: 1 1 220px; }
.p-head b { display: block; font-size: var(--font-size-heading-small); line-height: var(--line-height-heading-small); }
.p-head small { display: block; color: var(--ink-faint); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); }
.p-head .ptabs { display: flex; gap: var(--space-025); max-width: 100%; overflow-x: auto; }
.p-head .ptabs a { padding: var(--space-100) var(--space-150); border-radius: var(--radius-medium); font-size: var(--font-size-body); font-weight: var(--font-weight-medium); color: var(--ink-soft); min-height: 44px; display: inline-flex; align-items: center; }
.p-head .ptabs a[aria-current="page"] { background: var(--accent-soft); color: var(--selected-ink); }
.p-body { padding: var(--space-200); }
.p-body .ps { margin-bottom: var(--space-200); }
.p-nav { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; border-top: 1px solid var(--line); background: var(--panel); }
.p-nav a { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-050); min-height: 56px; padding: var(--space-100) var(--space-050); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small); color: var(--ink-faint); font-weight: var(--font-weight-medium); }
.p-nav a .ico { display: flex; }
.p-nav a[aria-current="page"] { color: var(--selected-ink); }
.p-nav a:hover { text-decoration: none; }
.card-list { display: grid; gap: var(--space-150); }
.card-list .card { margin: 0; }
.card-list .top { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-100); padding: var(--space-150) var(--space-200) 0; }
.card-list .top b { font-size: var(--font-size-body-large); display: block; line-height: var(--line-height-body-large);}
.card-list .top small { display: block; color: var(--ink-faint); font-size: var(--font-size-body-small); line-height: var(--line-height-body-small);}
.card-list .amt { padding: var(--space-100) var(--space-200) 0; font-family: var(--font-family-heading); font-size: var(--font-size-heading-large); line-height: var(--line-height-heading-large); font-weight: var(--font-weight-bold); font-variant-numeric: tabular-nums; }
.card-list .amt small { display: block; font-family: var(--font-family-body); font-size: var(--font-size-body-small); color: var(--ink-faint); font-weight: var(--font-weight-regular); letter-spacing: 0; line-height: var(--line-height-body-small);}
.card-list .row { padding: var(--space-150) var(--space-200) var(--space-150); display: flex; gap: var(--space-100); align-items: center; flex-wrap: wrap; }
.card-list .row:has(.pill) { align-items: baseline; gap: var(--space-150); }
.card-list .row .btn { flex: 1; min-height: var(--control-height-touch); }
.card-list p { padding: var(--space-100) var(--space-200) 0; color: var(--ink-soft); font-size: var(--font-size-body); line-height: var(--line-height-body);}
.card-list .card > .notice { margin: var(--space-150) var(--space-200) var(--space-200); }
.dsx-frame.phone .btn, .dsx-frame.tablet .btn { min-height: var(--control-height-touch); height: var(--control-height-touch); }
.dsx-frame.phone .btn.icon, .dsx-frame.tablet .btn.icon { width: var(--control-height-touch); }
.dsx-frame.phone input:not([type="checkbox"]):not([type="radio"]), .dsx-frame.phone select, .dsx-frame.tablet input:not([type="checkbox"]):not([type="radio"]), .dsx-frame.tablet select { font-size: var(--font-size-body-large); height: var(--control-height-touch); }
.dsx-frame.phone .field .money-in::before, .dsx-frame.tablet .field .money-in::before { height: var(--control-height-touch); line-height: var(--control-height-touch); }
.dsx-frame.phone .search > .ico, .dsx-frame.tablet .search > .ico { line-height: var(--control-height-touch); font-size: var(--font-size-heading-small); }
.dsx-frame.phone .search input[type="search"], .dsx-frame.tablet .search input[type="search"] { height: var(--control-height-touch); }

/* ================================================================
   RESPONSIVE — container queries on the frame, media queries on the document.
   ================================================================ */
@container (max-width: 1100px) {
  .stats.n4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container (max-width: 999px) {
  /* the sidebar becomes an icon rail: labels hidden, the active state a filled square, the tenant an avatar */
  .side { width: var(--side-width-rail); padding: var(--space-150) var(--space-100) var(--space-150); }
  .side .brand { padding: 0 0 var(--space-150); justify-content: center; }
  .side .brand > div, .side .nav-t, .side .nav-chev, .side .nav-pages, .side .firm, .side .nav-sep, .side .me > div, .side .me > .ico { display: none; }
  .side .side-nav a, .side .side-nav .nav-h { justify-content: center; padding: var(--space-100) 0; }
  .side .side-nav a[aria-current]::before { display: none; }
  .side .side-nav .nav-sec.open > .nav-h .nav-sum { display: block; }
  .side .side-nav .nav-h.has-current { background: var(--accent-soft); }
  .side .side-nav .badge { position: absolute; top: 2px; right: 2px; margin: 0; min-width: var(--space-200); height: var(--space-200); line-height: var(--space-200); font-size: var(--font-size-body-small); padding: 0 var(--space-025); }
  .side .side-nav .nav-h[aria-expanded="true"] { background: var(--subtle-hover); color: var(--ink); }
  .side .nav-fly .nav-pages { display: grid; }
  .side .nav-fly .nav-t, .side .nav-fly .firm { display: block; }
  .side .side-nav .nav-fly a { justify-content: flex-start; padding: var(--space-050) var(--space-100); }
  .side .side-nav .nav-fly .badge { position: static; margin-left: auto; min-width: var(--space-250); height: var(--space-250); line-height: var(--space-250); padding: 0 var(--space-075); }
  .side .me { justify-content: center; padding: var(--space-100) 0; }
  .two, .two.even, .three { grid-template-columns: minmax(0, 1fr); }
  .recce { grid-template-columns: minmax(0, 1fr); }
}
@container (max-width: 760px) {
  .page { padding: var(--space-250) var(--space-200) var(--space-500); }
  .topbar { padding: var(--space-100) var(--space-200); }
  .stepper { grid-template-columns: 1fr; }
  .stepper li { border-right: 0; border-bottom: 1px solid var(--line); }
  .stepper li:last-child { border-bottom: 0; }
  .docs li { grid-template-columns: 24px minmax(0, 1fr); }
  .docs li > :nth-child(3) { grid-column: 2; justify-self: start; }
  .mstones li { grid-template-columns: 26px minmax(0, 1fr); }
  .mstones li > :nth-child(3) { grid-column: 2; text-align: left; }
  .hero { grid-template-areas: 'e' 'v' 'p' 's' 'a' 'f'; grid-template-columns: minmax(0, 1fr); }
  .hero.watch { grid-template-areas: 'e' 'v' 'p' 'b' 's' 'a' 'f'; }
  .hero .hs { justify-items: start; margin-top: var(--space-150); }
  .daysum { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .photos { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container (max-width: 820px) {
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stats > .stat:last-child:nth-child(odd), .stats > .card:last-child:nth-child(odd) { grid-column: 1 / -1; }
}
@container (max-width: 640px) {
  /* on a phone the hero figure cannot be both a complete rupee amount and 1.6x the rest, so the
     stats step down instead and the hero holds the screen as its largest card */
  .stat .v { font-size: clamp(18px, 7.4cqw, 24px); line-height: 28px; }
  .side { display: none; }
  .topbar .btn.nav-open { display: inline-flex; }
  .topbar .spacer { flex: 0 0 0; }
  .search { flex: 1; min-width: 0; }
  .search .kbd { display: none; }
  .search input[type="search"], .field > .search input[type="search"] { padding-right: var(--space-150); }
  .drawer { width: 100%; }
  .dsx-frame:has(> .drawer) > .app { max-height: 0; overflow: hidden; }
  .dsx-frame:has(> .drawer) > .drawer { min-height: 560px; }
  .stats.n4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .health { grid-template-columns: minmax(0, 1fr); }
  .taxrow { grid-template-columns: minmax(0, 1fr); gap: var(--space-075); }
  .taxrow .pill { justify-self: start; }
  .page-head { flex-direction: column; }
  .kv { grid-template-columns: minmax(0, 1fr); gap: var(--space-025) 0; }
  .kv dt { margin-top: var(--space-100); }
}
@container (max-width: 520px) {
  .stats, .stats.n2, .stats.n4, .drawer .stats { grid-template-columns: minmax(0, 1fr); }
  .stats > .stat:last-child:nth-child(odd), .stats > .card:last-child:nth-child(odd) { grid-column: auto; }
  .actions { flex-direction: column; align-items: stretch; }
  .actions .btn { width: 100%; }
  .actions .spacer { display: none; }
  .drawer-f { flex-direction: column; align-items: stretch; }
  .drawer-f .spacer { display: none; }
  .drawer-f > .btn { width: 100%; }
  .empty .actions { flex-direction: row; align-items: center; } .empty .actions .btn { width: auto; }   /* the published empty state keeps its button group in a row at every width */
  .page-head .actions { flex-direction: row; }
  .page-head .actions .btn { width: auto; }
  .card-h { flex-wrap: wrap; }
  .card-h .actions { flex-direction: row; }
  .card-h .actions .btn { width: auto; }
  .hero .a { flex-direction: column; align-items: stretch; }
  .hero .a .btn { width: 100%; }
  .card-list .row { flex-wrap: nowrap; }
  .card-list .row .btn { min-width: 0; }
}
@media (max-width: 1100px) {
  .dsx-grid.phones { grid-template-columns: minmax(0, 390px); }
  .dsx-surfaces { grid-template-columns: 1fr; }
}
@media (max-width: 900px) {
  .dsx-layout { grid-template-columns: minmax(0, 1fr); }
  .dsx-nav { position: sticky; height: auto; border-right: 0; border-bottom: 1px solid var(--line); padding: var(--space-100) 0; gap: var(--space-100); z-index: 20; }
  .dsx-nav .brand { padding: 0 var(--space-200); }
  .dsx-theme { padding: var(--space-150) var(--space-200) 0; }
  .dsx-nav ol { display: flex; overflow-x: auto; gap: var(--space-025); padding: 0 var(--space-150); flex: none; }
  .dsx-nav ol .grp { display: none; }
  .dsx-nav ol a { white-space: nowrap; border-radius: 0; border-bottom: 2px solid transparent; padding: var(--space-075) var(--space-100); display: flex; }
  .dsx-nav ol a .n { display: none; }
  .dsx-nav ol a[aria-current="true"] { border-bottom-color: var(--accent); background: none; }
  .dsx-nav ol a[aria-current="true"]::before { display: none; }
  .dsx-theme { padding: 0 var(--space-150); border: 0; margin: 0; }
  .dsx-theme legend, .dsx-theme p { display: none; }
  .dsx-main { padding: var(--space-250) var(--space-200) var(--space-1000); }
  .dsx-section { scroll-margin-top: 150px; }
  .dsx-section > h2 { font-size: var(--font-size-heading-large); line-height: var(--line-height-heading-large); }
  .dsx-step { grid-template-columns: 1fr; gap: var(--space-100); }
  .dsx-targets { grid-template-columns: 1fr; }
  .dsx-targets b { font-size: var(--font-size-heading-xlarge); line-height: var(--line-height-heading-xlarge); }
  .dsx-grid, .dsx-states, .dsx-grid.three { grid-template-columns: minmax(0, 1fr); }
  .dsx-type > div { grid-template-columns: minmax(0, 1fr); gap: var(--space-050); }
}
@media (max-width: 600px) {
  input:not([type="checkbox"]):not([type="radio"]), select, textarea { font-size: var(--font-size-heading-small); line-height: var(--line-height-heading-small);}
}
@media print { .dsx-nav { display: none; } .dsx-layout { grid-template-columns: 1fr; } .dsx-section { break-inside: avoid; } }

${EXTRA}
${COMPONENTS}
${ZOHO}
${CHARTS}
/* ---- focus, last on purpose ------------------------------------------------------------------------
   A focus ring is the one treatment that must outrank component styling, and specificity cannot express
   that: :focus-visible and .btn are both 0,1,0, so whichever is written later wins. Declared at the top
   of the sheet this rule was beaten by every component that set its own outline. Last in the sheet is the
   only place the rule is true of everything. The ring is 2px, 2px outside the control; the outline follows
   the control's radius, so the ring's corner is the control's plus the offset, as the radius guidance asks. */
:focus-visible:focus-visible, .is-focus.is-focus { outline: var(--focus-ring-width) solid var(--focus); outline-offset: var(--focus-ring-offset); }
.dsx-theme .seg label:has(input:focus-visible) { outline: var(--focus-ring-width) solid var(--focus); outline-offset: var(--focus-ring-offset); }
`;

export const CSS = TOKENS + RULES;   // the monolith, and what the census scripts read
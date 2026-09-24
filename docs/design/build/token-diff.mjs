// token-diff.mjs — writes TOKEN-DIFF.md from repaint.json, tokens.mjs and adjust.mjs. Nothing in it is typed.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const HERE = (u) => fileURLToPath(new URL(u, import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = (process.env.OUT || HERE('..')).replace(/\/$/, '');
import * as T from './tokens.mjs';
import { ADJUST } from './adjust.mjs';
import { RENAME } from './token-renames.mjs';
const J = JSON.parse(readFileSync(new URL('./repaint.json', import.meta.url), 'utf8'));
const S = J.summary;
const hex = (v) => { if (!v) return '—'; const m = /^rgba?\(([^)]+)\)$/.exec(v); if (!m) return v.length > 48 ? v.slice(0, 45) + '…' : v;
  const p = m[1].split(',').map(Number); const h = '#' + p.slice(0, 3).map(x => x.toString(16).padStart(2, '0')).join(''); return p.length > 3 ? `${h} at ${Math.round(p[3] * 100)}%` : h; };
const code = (t) => '`' + t + '`';
const POINT = new Map([...T.COMPONENT_COLOUR.map(([k, s]) => [k, T.semVar(s)]), ...T.COMPONENT_SHADOW.map(([k, s]) => [k, s === 'none' ? 'none' : T.semVar(s)])]);
const WHAT = new Map([...T.COMPONENT_COLOUR, ...T.COMPONENT_GEOMETRY].map(([k, , w]) => [k, w]));
const RNOTE = new Map(RENAME.map(([a, b, n]) => [a, n]));
const kept = J.rows.filter(r => r.kind === 'kept'), renamed = J.rows.filter(r => r.kind === 'renamed'), removed = J.rows.filter(r => r.kind === 'removed');
const refsTotal = (l) => l.reduce((s, r) => s + r.refs, 0);
const colourKept = kept.filter(r => POINT.has(r.name));
const colourChanged = colourKept.filter(r => r.lightChanged || r.darkChanged);
const newComponent = J.added.filter(n => WHAT.has(n) || POINT.has(n));
const byRamp = T.RAMPS.map(([f, names]) => `${f.replace(/([a-z])([A-Z])/g, '$1 $2')} ${names.length}`).join(' · ');
const out = [];
const P = (s = '') => out.push(s);
// the reference's measurements (the owner's, 19 September 2026), the nearest published step, the gate's verdict, the token used
const REFERENCE = [
  ['Top bar `#21263c`', 'Blue1000 `#1C2B42` (1.8)', 'ink on it 9.15:1', '`color.background.brand.subtlest`, read in the dark set — the bar is a dark island in both themes'],
  ['Lifted field on the bar `#333850` (the search, the switcher)', '`color.background.neutral` read in the dark set — white at 7% over the navy, `#29374D` painted (1.7); Blue900 `#123263` (4.9) was the step until later on 19 September', 'placeholder 5.49:1; the search’s boundary is `color.border.input`, 3.65:1 against the bar — the published border on the lifted fill measured 1.69:1 and failed 1.4.11', '`--topbar-lift`, lighter than the bar (the token gate holds the order), hover `color.background.neutral.hovered`'],
  ['Quick-create square `#408dfb`', 'Blue500 `#4688EC` (2.4) — `color.chart.brand` read in the dark set', 'white on it 3.50:1: a plus passes 3:1; the dark set’s inverse ink is near-black, so the plus is the *light* set’s inverse ink, an island inside the island; the square against the bar 4.07:1', '`--new-sq` under `--on-accent` resolved on a `data-theme="light"` span; until later on 19 September the published primary, Blue700, under a word'],
  ['Sidebar `#f7f7fe`', 'Neutral100 `#F8F8F8` (0.9)', '—', '`elevation.surface.sunken`'],
  ['Open section tint `#ededf7`', 'Blue100 `#E9F2FE` (1.3)', 'a tint, not a boundary — the token gate holds it at 1:1 against the sidebar', '`color.background.accent.blue.subtlest` (`--nav-open`), taken later on 19 September; the grey accent’s subtlest fill until then, because blue was never a state — an open section is a place, not a state'],
  ['Current page', 'Blue700 `#1868DB`', '5.20:1 with white; the reference’s lighter blue fails', '`color.background.selected.bold`, kept'],
  ['Sidebar rows 38px, label 14px', 'no published step at 38', '—', '`--nav-item-height: 38px` in the component layer; `font.size.body` is 14px'],
  ['List head row `#f9f9fb`', 'Neutral100 `#F8F8F8` (0.4)', '—', '`elevation.surface.sunken` (`--card-head`)'],
  ['Head text `#6c7184`', 'Neutral700 `#6B6E76` (2.1)', '5.10:1 on the card, 4.80:1 on the head row', '`color.text.subtlest`'],
  ['Dividers `#ebeaf2`', 'Neutral200 `#F0F1F2` (2.0)', '1.13:1 on the card — under the 1.4:1 hairline floor the non-text gate raises for dense tables; Neutral300 1.35:1 also', '`color.border`, 1.96:1, kept'],
  ['Row needing this person `#ebf3e2` (green)', 'Green100 `#DCFFF1` (3.3)', 'green is money coming in here', '`color.background.accent.purple.subtlest` Purple100 `#F8EEFE`, kept — the lightest purple the palette publishes'],
  ['Money in `#28b47e`', 'Green500 `#2ABB7F` (2.1)', '2.47:1 fails AA; Green600 3.33:1; Green700 `#1F845A` 4.66:1 on the card but 4.38:1 on the sunken surface', '`color.text.accent.green` Green800 `#216E4E`, 6.17:1 and 5.81:1, kept'],
  ['Money out `#f76831`', 'Orange600 `#E06C00` (5.0) on the ramp the brief named; Red500 `#F15B50` (4.6) nearer', 'Orange600 2.51:1 and Orange700 4.51:1 on the card but 4.24:1 on the sunken surface fail AA; Orange800 `color.text.accent.orange` 6.02:1 and 5.67:1 passes; the India layer found no pair with green money-in on any product screen, and the two swatches 18px apart in the token table on part 0 are declared apart now', '`color.text.accent.orange` Orange800 `#9E4C00` (`#FBC828` dark), taken later on 19 September as the owner’s decision; the red text accent until then'],
  ['Top bar 48px', '`space.600`', '—', '`--topbar-height: var(--space-600)`; 56px until later on 19 September'],
  ['Brand column 200px, ending in a 1px darker divider', 'no published step', 'the divider `elevation.surface.sunken` read in the dark set, `#18191A`, darker than the bar', '`--side-width: 200px` (252 until then), `--topbar-div`'],
  ['Product name 18px medium', '`font.size.heading.small` is 16, `font.size.heading.medium` 20', 'the reference’s 18 does not fit the seventeen-character name in the 200px column beside a 16px mark', '`--brand-size: 17px`, the largest that fits'],
  ['Bar controls 34px (the switcher, the search)', 'the published control is 32', '—', '`--bar-control-height: 34px`; the consistency gate holds it as its own row'],
  ['Search 300px wide', 'no published step', '—', '`--search-width: 300px`; the switcher never wider'],
  ['Square 32px, radius 4', '`space.400`, `radius.small`', '—', '`--control-height`, `radius.small`'],
  ['Avatar 28px', 'no published step between 24 and 32', '—', '`--avatar-size-bar: 28px`'],
  ['Icons ~18px', 'the published grid is 16', 'one icon size in the set — the consistency gate holds 16×16 everywhere', '16px on a 40px pitch, kept'],
  ['Tenant’s accent (the avatar)', '`color.background.accent.teal.bolder`', 'the letter on it 4.5:1 in both sets; the disc against the bar 7.14:1', '`--tenant-accent` — a tenant setting one day'],
  ['Overdue label, amber text', 'the caution ink', '5.93:1 light, 8.36:1 dark, as text', '`color.text.warning` (`--warn`), as a label over an ink figure — never a fill'],
];

P('# TOKEN-DIFF');
P();
P('`tokens.css` against the shipped `packages/design-system/src/styles.css` — read by script from both files on');
P(`${T.READ_ON}, every token resolved through its \`var()\` chain in each theme, and every \`var()\` reference counted`);
P(`across \`apps/\` and \`packages/\` (${S.filesScanned} source files; never \`node_modules\`, a build or a cache).`);
P();
P('Until today the two files held the same values (the record of that reconciliation, 12 and 13 September, is in');
P('this file\'s git history and in `CHANGES.md`). On 16 September the owner rethemed the product on a published');
P('design system, so this file now states **the size of the product\'s repaint**. On 17 September the elements were');
P('redrawn to the system\'s own components, which added the lozenge, tag, badge, control, chart and motion names below;');
P('the counts are re-measured from that build.');
P();
P('## The size of the repaint');
P();
P('| | Shipped | Rebuilt |');
P('|---|---|---|');
P(`| Tokens declared | ${S.shipped.light} | ${S.rebuilt.declared} |`);
P(`| Overridden for dark | ${S.shipped.dark} | ${S.rebuilt.darkOverrides} |`);
P();
P('| What happens to a shipped token | Tokens | Change value | `var()` references to edit |');
P('|---|---|---|---|');
P(`| **Kept by name** — this product's component names | ${kept.length} | ${kept.filter(r => r.lightChanged || r.darkChanged).length} | none — the name stays; the value moves under it (${refsTotal(kept)} references pick it up) |`);
P(`| **Renamed** — space, radius, type, control and motion names onto the system's scale | ${renamed.length} | ${renamed.filter(r => r.lightChanged || r.darkChanged).length} | **${refsTotal(renamed)}** |`);
P(`| **Removed** | ${removed.length} | — | **${refsTotal(removed)}** |`);
P(`| **New** | ${J.added.length} — ${S.addedKinds.primitive} primitives, ${S.addedKinds.semantic} semantic, ${S.addedKinds.component} component | — | none; nothing references them yet |`);
P();
P(`**Every colour the product paints with changes.** Of the ${colourKept.length} colour and shadow tokens kept by name,`);
P(`${colourChanged.length} take a new value in light or dark or both; the ${kept.length - colourKept.length} kept tokens that do not change are container dimensions`);
P(`(${kept.filter(r => !POINT.has(r.name)).map(r => code('--' + r.name)).join(', ')}). No shipped hex survives.`);
P();
P(`**The markup barely moves.** Because the component names survive, the colour change on its own is a replacement of the`);
P(`token block. The token edits are the ${refsTotal(renamed)} references to renamed tokens and the ${refsTotal(removed)} to removed ones,`);
P(`in ${S.refFiles.renamedOrRemoved} files — almost all of them \`styles.css\` itself.`);
P();
P('**What the repaint is, in order:**');
P();
P('1. Replace the token block in `styles.css` with `tokens.css` — primitives, semantic tokens in light and dark, component names.');
P(`2. Rename the ${renamed.length} geometry, type and motion tokens at their ${refsTotal(renamed)} references (the table in §2; a mechanical rename, the old name → the new one).`);
P(`3. Remove ${removed.map(r => code('--' + r.name)).join(', ')} at their ${refsTotal(removed)} references (§3).`);
P('4. Drop the Newsreader `@font-face` and its vendored file. Inter is already self-hosted and becomes the only family.');
P('5. Restyle the rules whose shape changed, not only their colour — listed in §5. `COMPONENT-MAP.md` says which components they are.');
P('6. Run `pnpm verify`: `scripts/design-gates.mjs` checks token contrast in both themes against the token block, so it re-measures the new values.');
P();
P('## Gate-forced adjustments');
P();
P(`A published value that failed one of our gates moved to the nearest step on the same ramp; no gate moved. ${ADJUST.length} values, both themes:`);
P();
P('| Token | Theme | Published | Used | Gate | Before → after | Why |');
P('|---|---|---|---|---|---|---|');
for (const a of ADJUST) P(`| ${code(T.semVar(a.token))} | ${a.mode} | ${a.from} | **${a.to}** | ${a.gate} | ${a.before} → ${a.after} | ${a.why} |`);
P();
P('## 1. Kept by name — the value under each name');
P();
P('| Token | Now points at | Light: shipped → rebuilt | Dark: shipped → rebuilt | References |');
P('|---|---|---|---|---|');
for (const r of kept) P(`| ${code('--' + r.name)} | ${POINT.has(r.name) ? code(POINT.get(r.name)) : 'a dimension'} | ${hex(r.sl)} → ${r.lightChanged ? '**' + hex(r.nl) + '**' : 'same'} | ${hex(r.sd)} → ${r.darkChanged ? '**' + hex(r.nd) + '**' : 'same'} | ${r.refs} |`);
P();
P('## 2. Renamed — onto the system\'s scale');
P();
P('The old names described an old scale (a 10px step, a 15px body, an 8px control corner) that the system does not have. Where the old step had no equal it takes the nearest one, and the value column says so.');
P();
P('| Shipped | Rebuilt | Value | References |');
P('|---|---|---|---|');
for (const r of renamed) P(`| ${code('--' + r.name)} | ${code('--' + r.target)} | ${RNOTE.get(r.name) || (r.lightChanged ? `${hex(r.sl)} → ${hex(r.nl)}` : 'same')} | ${r.refs} |`);
P();
P('## 3. Removed');
P();
P('| Shipped | References | Why |');
P('|---|---|---|');
const WHY = { glow: 'The focus specification is a 2px ring set 2px outside the control and nothing else.', radius: 'The one-release alias of the control radius; the release has passed.', 'ls-display': 'Headings are set at normal tracking in one family.', 'ls-heading': 'As above.' };
for (const r of removed) P(`| ${code('--' + r.name)} | ${r.refs} | ${WHY[r.name] || ''} |`);
P();
P('## 4. New');
P();
P(`- **${S.addedKinds.primitive} primitives** — the published palette, one ramp per family: ${byRamp}. Nothing in a component references one.`);
P(`- **${S.addedKinds.semantic} semantic tokens** — colour and elevation in light and dark, and the space, radius, border, opacity, motion and type scales. Their names are the system's: \`color.text.subtle\` is \`--color-text-subtle\`.`);
P(`- **${S.addedKinds.component} component tokens** this product did not have:`);
P();
P('| Token | Points at | What it is for |');
P('|---|---|---|');
for (const n of J.added.filter(n => WHAT.has(n))) P(`| ${code('--' + n)} | ${POINT.has(n) ? code(POINT.get(n)) : code(T.COMPONENT_GEOMETRY.find(([k]) => k === n)?.[1] || '')} | ${WHAT.get(n)} |`);
P();
P('## 5. What is not a token but comes with it');
P();
P('- **Buttons** are the published button: a transparent fill inside a 1px border (default), the brand fill (primary), the danger fill (Decline, Cancel the order), the warning fill (Send anyway), or no border (subtle). Heights 32px, compact 24px with the small corner, large 40px for a hero\'s one action; 48px on a phone or tablet. Radius medium; compact small.');
P('- **Cards** are flat with a border, under a header strip on the sunken surface (`--card-head`) holding the title, a help icon and one action. Raised — `--raised` and `--shadow-2` — is spent once per screen, on the hero or the record beside a list. `--shadow-1` is `none`.');
P('- **Lozenges** are the published lozenge: 20px, small radius, sentence case, bold at 12/16, the subtler status fill under its bolder ink. *In progress* is the information lozenge (blue); information as a sentence is a section message, never a lozenge. A **tag** is a label someone applied or a removable filter; a **badge** is a count.');
P('- **Inputs** sit on `--input` with a `--line-strong` border and a small corner; hover changes the fill, not the border; focus is the published focused border, 2px in the focus colour, with no outer ring.');
P('- **Navigation** (19 September). The top bar spans the window on `--topbar` — navy, the brand’s subtlest surface read in the dark set, because the bar carries `data-theme="dark"` and resolves the dark set in both themes; 48px tall (`--topbar-height`). The product’s mark and its name (`--brand-size`) fill a `--side-width` brand column ending in a `--topbar-div` divider; then the switcher and the search on `--topbar-lift`, a neutral alpha over the navy, 34px tall (`--bar-control-height`), the search `--search-width` wide with a `--line-strong` hairline; recent history; and at the right a *Demo organisation* notice in `--warn` when the tenant is one, the tenant’s name, the quick-create square on `--new-sq` (Blue500) under the light set’s inverse ink, the bell, the gear and the person on `--tenant-accent` at `--avatar-size-bar`. The sidebar sits on `--side`, the sunken surface, `--side-width` wide, with `--nav-item-height` rows and a 14px label; an open section is tinted `--nav-open`, blue-100, with its pages indented; the current page is a solid pill — `--nav-current` under `--nav-current-ink`, 5.20:1 in light and 6.00:1 in dark, 4.89:1 and 6.42:1 against the sidebar — carrying a `+` in the same ink; inside a project the sidebar is the project’s lifecycle under ◂ All projects and the project’s block. The four apps share the bar; a portal’s bar has fewer controls, never different colours.');
P('- **Colour where it carries meaning** (18 September) comes from the accent tokens through the component layer, and none of it is blue: a stat’s disc is `--disc-<hue>` under `--disc-<hue>-icon`, one accent per tile, each pair 3:1 or better; money direction is `--money-in` (the green text accent, with a plus) and `--money-out` (the red text accent, with a minus; the orange one was measured on 19 September and the India layer flagged it beside green in the token table on part 0), and overdue is the caution ink on the caution fill; an owed card’s bar is `--owed-overdue` (the yellow ramp, 4.63:1 on the card in light) beside `--owed-current` (the grey ramp) with a hairline of the surface between; a single-series chart fills under its line with `--chart-area` and marks every point; a row waiting on this person is `--row-mine`, the tint of the waiting lozenge. Coloured plain text is for money direction only; blue stays action, link, focus and selection and is never a state. Since 19 September there is no highlighter: the caution fill is under a lozenge or a section message only, and overdue is an amber small-capitals label (`--warn` as text) over an ink figure.');
P('- **Focus** on a button or a link is `outline: 2px solid var(--focus); outline-offset: 2px`, last in the stylesheet, with no box-shadow; on a field it is the focused border above.');
P('- **Type** is Inter in every family; headings at weight 653.');
P('- **Charts** paint one colour, the brand chart colour, unless the data is a status, which takes the bold status chart colours in the owner\'s order — off track, at risk, on track, paused — with a hairline of the surface between segments; the categorical sequence in order where series must be told apart; the failure point and the threshold keep their own tokens. The overrun band is `--chart-band` on `color.background.accent.yellow.bolder` — the same yellow as an overdue owed bar — since 19 September: on the warning surface it measured 1.09:1 light and 1.22:1 dark, invisible, and the non-text gate now reads every mark from the property that paints it and holds a legend swatch to its mark.');
P('- **Illustrations** are six drawings from the trade: flat blocks of the accent colours under one hand-drawn line in the icon colour. The line alone is held to 3:1; the drawing is decorative and the text beside it carries the meaning.');
P('- **Motion** is the published motion tokens, plus the spinner\'s, skeleton\'s, tooltip\'s and toggle\'s own and three composed from the published durations and curves; under reduced motion every token is redefined so nothing travels, turns or scales.');
P();
P('## 6. The reference’s values, mapped — 19 September 2026');
P();
P('The look is the books the buyers keep. Each value was measured on the reference by the owner, taken to the nearest');
P('step on the ramp the brief named (OKLab ΔE), and then put through the gates; where a step failed, the nearest passing');
P('step is used and the failure is written down. Nothing of the reference is reused — these are colour values, not assets.');
P();
P('| Reference | Nearest step (ΔE) | Gate | Used |');
P('|---|---|---|---|');
for (const r of REFERENCE) P(`| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |`);
P();
P('## 7. What the diff does not ask for');
P();
P('- No component renames and no new props. The component names in `COMPONENT-MAP.md` stand.');
P('- No change to any figure, rounding or formatting. Money is unchanged.');
P('- No second palette: nothing from any other system\'s colours, and no hand-mixed value. Every colour is a published token, or one of the adjustments above.');
writeFileSync(OUT + '/TOKEN-DIFF.md', out.join('\n') + '\n');
console.log('wrote TOKEN-DIFF.md', out.length, 'lines');

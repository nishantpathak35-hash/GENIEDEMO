import { writeFileSync, readFileSync, statSync, mkdirSync } from 'node:fs';
import { tidyHtml, tidyCss, layoutKeysFrom } from './tidy.mjs';
import { fileURLToPath } from 'node:url';
const HERE = (u) => fileURLToPath(new URL(u, import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
import { TOKENS, RULES } from './css-base.mjs';
import * as A from './pages/today-to-buying.mjs';
import * as B from './pages/site-to-demo.mjs';
import * as NAV from './pages/navigation.mjs';
import * as M from './pages/money.mjs';
import * as P from './pages/patterns.mjs';
import * as F from './pages/foundations.mjs';
import * as K from './pages/components.mjs';
import * as X from './pages/components-in-place.mjs';
import * as MO from './pages/motion.mjs';   // the motion page; its script is in design.js
import { upgrade } from './patterns.mjs';
import { verify, tokenCss } from './tokens.mjs';
import * as L4 from './shell.mjs';
import * as SEED from './seed.mjs';
import { LINKS, illoSymbols } from './shell.mjs';
import { ILLO_FOR, ILLO_SUBJECTS, EMPTY_NAMES_NEW } from './illustrations.mjs';
import { iconSprite } from './icons.mjs';
import { duoSprite } from './duotone.mjs';
import { listPass } from './cards.mjs';
const lp = { views: 0, kebabs: 0, viewBy: 0 };

import { FILES, INDEX, NAV_GROUPS, SPLIT, setCurrentFile } from './files.mjs';
const DIR = (process.env.OUT || HERE('..')).replace(/\/$/, '');   // the set: docs/design, the folder above this one

const FN = {
  '0': () => F.foundations() + P.patterns(), '1': K.components, '2': MO.motion, '3': NAV.navigation,
  '4': () => A.today() + X.newMenuSample() + X.today() + X.charts(), '5': A.sales, '6': () => A.projects() + X.projects(), '7': () => A.buying() + X.buying(), '8': B.site,
  '9': () => M.decide() + X.money(), '10': B.portals, '11': B.adminSettings, '12': (r) => B.states(r) + X.loading() + B.roles(r),
  '13': null, '14': B.demo,
};
const SECTIONS = FILES.map(([id, , title]) => [id, title, FN[id]]);
const TITLE_OF = new Map(FILES.map(([id, , title]) => [id, title]));
const FILE_OF = new Map(FILES.map(([id, file]) => [id, file]));

// (19 September) one drawing per subject: a drawing that served two states with different subjects — the BOQ sheet for
// Today, Tasks and the operator — said nothing about any of them. The map from an empty state's name to its drawing
// is one-to-one, and a name with no drawing fails the build in illo().
{ const names = Object.keys(ILLO_FOR), drawings = new Set(Object.values(ILLO_FOR));
  if (drawings.size !== names.length) { console.error(`ILLUSTRATION GATE FAIL — ${names.length} empty-state names share ${drawings.size} drawings`); process.exit(1); }
  for (const d of drawings) if (!ILLO_SUBJECTS.includes(d)) { console.error(`ILLUSTRATION GATE FAIL — no drawing named ${d}`); process.exit(1); }
  console.log(`illustrations: ${drawings.size} drawings for ${names.length} empty-state names, one each · ${EMPTY_NAMES_NEW.length} names the shipped Empty component does not take yet: ${EMPTY_NAMES_NEW.join(', ')}`); }
// the sprite a page carries: every icon, every duotone, and only the drawings that page references — twenty-three drawings inlined
// sixteen times over is 200 KB of nothing (19 September)
const ICONS = (main) => `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
${iconSprite()}
${duoSprite()}
${illoSymbols(new Set([...String(main).matchAll(/href="#illo-([a-z-]+)"/g)].map(m => m[1])))}
</svg>`;

// the page's script is design.js beside this file — one file, loaded by every page
const JS = readFileSync(new URL('./design.js', import.meta.url), 'utf8');

// (19 September) the decisions page reads current decisions first, clean. Every superseded block — a span inside a
// paragraph, a whole paragraph, or a was-block — is lifted out in document order into a History section at the end,
// under the heading it sat beneath and with the date its own text names. Nothing is deleted.
function historise(html) {
  const items = [];
  let heading = 'Opening';
  const dateOf = (t) => { const m = /\b(\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December))( \d{4})?/.exec(t.replace(/<[^>]+>/g, ' ')); return m ? m[1] + (m[2] || ' 2026') : 'the day it was written'; };
  // a was-block holds nested divs (a table's wrap), so its end is found by depth, not by a regex
  const lift = (src) => {
    let out = '', at = 0;
    for (;;) {
      const k = src.indexOf('<div class="was-block">', at); if (k < 0) { out += src.slice(at); break; }
      out += src.slice(at, k);
      let depth = 0, pos = -1; const re = /<(\/?)div\b[^>]*>/g; re.lastIndex = k; let m;
      while ((m = re.exec(src))) { depth += m[1] ? -1 : 1; if (depth === 0) { pos = m.index + m[0].length; break; } }
      if (pos < 0) throw new Error('historise: a was-block never closes');
      const block = src.slice(k, pos);
      // the heading this block sat under: the last h3 or h4 before it in the whole page
      const before = src.slice(0, k).match(/<h[34][^>]*>([\s\S]*?)<\/h[34]>/g); const under = before ? before[before.length - 1].replace(/<[^>]+>/g, '').trim() : 'Opening';
      items.push({ heading: under, date: dateOf(block), html: block });
      at = pos;
    }
    return out;
  };
  // whole blocks first, over the whole page — a was-block spans headings; then the spans and paragraphs under each heading
  const parts = lift(html).split(/(<h[34][^>]*>[\s\S]*?<\/h[34]>|<p class="superseded">[\s\S]*?<\/p>|<span class="superseded">[\s\S]*?<\/span>)/);
  const out = parts.map(p => {
    if (/^<h[34]/.test(p)) {
      const lifted = p.replace(/<span class="superseded">([\s\S]*?)<\/span>/g, (m, inner) => { items.push({ heading: p.replace(/<[^>]+>/g, '').replace(/\s*—\s*amended.*$/, '').trim(), date: dateOf(inner), html: '<p>' + inner.trim() + '</p>' }); return ''; });
      heading = lifted.replace(/<[^>]+>/g, '').trim();
      return lifted;
    }
    if (p.startsWith('<p class="superseded">')) { items.push({ heading, date: dateOf(p), html: p.replace(/^<p class="superseded">/, '<p>') }); return ''; }
    if (p.startsWith('<span class="superseded">')) { items.push({ heading, date: dateOf(p), html: p.replace(/^<span class="superseded">/, '<p>').replace(/<\/span>$/, '</p>') }); return ''; }
    return p;
  }).join('').replace(/\s+<\/p>/g, '</p>');
  const when = (d) => { const t = Date.parse(d); return Number.isNaN(t) ? Infinity : t; };
  items.sort((x, y) => when(x.date) - when(y.date));   // oldest first; a block that names no date goes last
  const history = `<section class="dsx-history" id="history" aria-labelledby="history-h"><h3 id="history-h">History — ${items.length} decisions superseded, oldest first</h3>
<p>Each block below was once inline under the heading it names, and was moved here on 19 September 2026 so the decisions above read as the current record. Nothing was deleted or reworded; a block that was itself amended keeps its amendment.</p>
${items.map((it, i) => `<div class="hist"><h4 class="lbl">${i + 1}. Under <em>${it.heading}</em> · ${it.date}</h4>${it.html}</div>`).join('\n')}
</section>`;
  return { html: out + history, count: items.length };
}
function build() {
  // Each section is built with the generator told which file it is being written into, so every
  // cross-reference resolves to a fragment when it is local and to a filename when it is not.
  const built = new Map();
  const up = { heads: 0, toolbars: 0, exportsMoved: 0, projectFiltersDropped: 0 };
  for (const [n, , fn] of SECTIONS) if (fn) { setCurrentFile(n); built.set(n, listPass(upgrade(fn(), up), lp)); }
  console.log(`lists: ${lp.views} titles as the view’s name, ${lp.kebabs} kebabs added, ${lp.viewBy} toolbars labelled View by`);
  console.log(`patterns: ${up.heads} older page headers and ${up.toolbars} older toolbars rewritten into the one header and the one list toolbar · ${up.exportsMoved} Export buttons moved from a header to its list · ${up.projectFiltersDropped} project filters dropped for the switcher`);
  // the 18-link table's third column comes from the rendered sections, never from a typed list
  const renders = {};
  for (const [n, title] of SECTIONS) { const html = built.get(n); if (!html) continue;
    for (const m of html.matchAll(/<div class="dsx-sample" data-renders="([a-z]+)"><h3>([^<]*)/g)) { if (!renders[m[1]]) renders[m[1]] = { section: `s${n}`, sectionTitle: `${n} ${title}`, sample: m[2] }; } }
  setCurrentFile('13'); { const h = historise(B.decisions(renders)); built.set('13', h.html); console.log(`decisions: ${h.count} superseded blocks moved to History`); }
  const missing = LINKS.filter(([k]) => !renders[k]).map(([, , name]) => name);
  if (missing.length) { console.error('LINK GATE FAIL — no rendered sample for: ' + missing.join(', ')); process.exit(1); }
  { const dead = L4.unusedValueKeys(), dup = L4.valueKeyCollisions();
  if (dead.length || dup.length) { console.error(`value keys: DEAD ${dead.join(' | ')}${dup.length ? ' ;; COLLIDING ' + dup.join(' | ') : ''}`); process.exit(1); }
  console.log(`value keys: ${Object.keys(L4.VALUE_LINES).length} entries, each resolving for exactly one sample`); }
console.log(`link gate: ${LINKS.length - missing.length} of ${LINKS.length} links have a rendered sample`);
  return built;
}


// One shell, written once, worn by every file — which is the only way a set of thirteen pages stays a
// set. The nav is the same list in the same order on every page, with the current page marked; the theme
// control is identical; the sprite and the script are inlined identically.
const DESC = 'Design samples for Construct-O-Genie — a multi-tenant ERP for Indian interior fit-out contractors. Synthetic data throughout.';
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap">`;

const THEME = `<div class="dsx-theme"><fieldset><legend>Theme</legend>
    <div class="seg" role="radiogroup" aria-label="Colour theme">
      <label><input type="radio" name="theme" value="system" checked><span><svg class="i sm" aria-hidden="true"><use href="#i-monitor"/></svg>System</span></label>
      <label><input type="radio" name="theme" value="light"><span><svg class="i sm" aria-hidden="true"><use href="#i-sun"/></svg>Light</span></label>
      <label><input type="radio" name="theme" value="dark"><span><svg class="i sm" aria-hidden="true"><use href="#i-moon"/></svg>Dark</span></label>
    </div><p>Not remembered. Reload and it follows your system again.</p></fieldset></div>`;

function navHtml(currentId) {
  return NAV_GROUPS.map(([g, ns]) => (g ? `<li class="grp" role="presentation">${g}</li>` : '')
    + ns.map(n => {
      const here = SPLIT ? n === currentId : false;
      const href = SPLIT ? (here ? `#s${n}` : FILE_OF.get(n)) : `#s${n}`;
      return `<li><a href="${href}"${here ? ' aria-current="page"' : ''}><b class="n">${n}</b><span class="t">${TITLE_OF.get(n)}</span></a></li>`;
    }).join('')).join('');
}

// Previous and next, so the set can be read straight through without going back to the contents.
function pager(currentId) {
  if (!SPLIT) return '';
  const i = FILES.findIndex(([id]) => id === currentId);
  const link = (k, rel, label) => {
    if (k < 0 || k >= FILES.length) return `<span class="sp"></span>`;
    const [id, file, title] = FILES[k];
    return `<a class="pg-${rel}" href="${file}" rel="${rel}"><small>${rel === 'prev' ? 'Previous' : 'Next'}</small><b>${id} · ${title}</b></a>`;
  };
  return `<nav class="dsx-pager" aria-label="Across the set">${link(i - 1, 'prev')}<a class="pg-up" href="${INDEX}">All ${FILES.length} parts</a>${link(i + 1, 'next')}</nav>`;
}

function shell({ id, title, main, skipTo }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${id === null ? 'Construct-O-Genie design samples' : `${id} · ${title} — Construct-O-Genie design samples`}</title>
<meta name="description" content="${DESC}">
${FONTS}
${SPLIT ? '<link rel="stylesheet" href="tokens.css">\n<link rel="stylesheet" href="design.css">' : `<style>${TOKENS}</style>\n<style>${RULES}</style>`}
</head>
<body>
<a class="dsx-skip" href="#${skipTo}">Skip to content</a>
${ICONS(main)}
<div class="dsx-layout">
<nav class="dsx-nav" aria-label="Sections">
  <h1 class="brand">${SPLIT ? `<a href="${INDEX}">Construct-O-Genie<small>Design samples · synthetic data</small></a>` : 'Construct-O-Genie<small>Design samples · synthetic data</small>'}</h1>
  <ol>${navHtml(id)}</ol>
  ${THEME}
</nav>
<main class="dsx-main" id="main">
${main}
</main>
</div>
${SPLIT ? '<script src="design.js"></script>' : `<script>${JS}</script>`}
</body>
</html>
`;
}

function sectionHtml(id, title, inner) {
  return `<section class="dsx-section" id="s${id}" aria-labelledby="h${id}"><h2 id="h${id}"><small>${id}</small>${title}</h2>${inner}</section>`;
}

// The contents page. Not a link list — the point of a set is that you can tell from the outside which
// part answers the question you arrived with.
function indexHtml() {
  const cards = FILES.map(([id, file, title, blurb]) =>
    `<li><a href="${file}"><b class="n">${id}</b><span><strong>${title}</strong><small>${blurb}</small></span></a></li>`).join('');
  return shell({
    id: null, title: '', skipTo: 'contents',
    main: `<section class="dsx-section" id="contents" aria-labelledby="hc">
<h2 id="hc">The set</h2>
<p class="lede">${FILES.length} parts and this contents page. Three files beside them are shared by every page: <code>tokens.css</code> holds every colour, space, radius and type step in the system — ${(TOKENS.match(/--[a-z][a-z0-9-]*\s*:/g) || []).length} values, in three layers: the published palette, the published semantic tokens in light and dark, and this product’s own names for them — and nothing else in the set defines one, so changing a line there changes every page at once; <code>design.css</code> holds every component rule; <code>design.js</code> the theme control and the demos. The folder opens from disk with no server: double-click any page.</p>
<ol class="dsx-contents">${cards}</ol>
<div class="dsx-note"><b class="h">How to read it</b><p>Start at <a href="${FILE_OF.get('0')}">0 · Foundations</a> if you want to know why the system looks the way it does, at <a href="${FILE_OF.get('3')}">3 · Navigation</a> for how the shell works, or at <a href="${FILE_OF.get('14')}">14 · The five-minute demo</a> if you want to see the product work. <a href="${FILE_OF.get('13')}">13 · Decisions</a> is the audit trail: every one of the shipped product's eighteen links, and where each is rendered here.</p></div>
</section>`,
  });
}

// Build-time gates: the token module's own contrast checks, and no hex literal outside the token block.
const tk = verify();
if (tk.problems.length) { console.error('TOKEN GATE FAIL\n' + tk.problems.join('\n')); process.exit(1); }
const stray = (RULES.match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter(h => !/^#i-/.test(h));
if (stray.length) { console.error('HEX GATE FAIL — colour literals outside the token block: ' + [...new Set(stray)].join(' ')); process.exit(1); }
console.log(`token gate: ok · ${tk.checks} checks, both themes · ${tk.primitives} primitives, ${tk.semantic} semantic, ${tk.component} component · ${tk.adjustments} gate-forced adjustments · no hex outside the token block`);
// An identifier (SAN-01, PO-0019, PEC-RA-02) is one word. Every code in every text node is wrapped so it can never
// break at its hyphen; text inside code, pre, script, style, title, option, textarea and svg is left alone, as are
// attributes (tags are skipped whole). The gate's code-split check measures the result.
const CODE = /(?<![A-Za-z0-9/])((?:[A-Z]{2,5}-(?:[A-Z]{2,5}-)?\d{1,4}(?:-\d{1,4})*)|(?:[A-Z]{2,5}(?:\/(?:[A-Z]{2,5}|\d{2,4}(?:-\d{2})?))*\/\d{2,4})|(?:\d{4}-\d{2}-\d{2}))(?![A-Za-z0-9/])/g;
const SKIP = /^(code|pre|script|style|title|option|textarea|svg)$/i;
function nowrapCodes(src) {
  const parts = src.split(/(<[^>]+>)/); const stack = []; let wrapped = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]; if (!p) continue;
    if (p[0] === '<') {
      const m = /^<\/?([a-zA-Z][\w-]*)/.exec(p); if (!m) continue; const tag = m[1].toLowerCase();
      if (!SKIP.test(tag)) continue;
      if (p[1] === '/') { const at = stack.lastIndexOf(tag); if (at >= 0) stack.length = at; } else if (!/\/>$/.test(p)) stack.push(tag);
      continue;
    }
    if (stack.length) continue;
    parts[i] = p.replace(CODE, (_, c) => { wrapped++; return `<span class="nowrap">${c}</span>`; });
  }
  return { html: parts.join(''), wrapped };
}
const sections = build();

// The identifier gate runs per file and the prose gate over the whole set, which is the same coverage the
// monolith had. Nothing about the split is allowed to make a gate see less than it saw before.
const pages = new Map();
let wrapped = 0;
if (SPLIT) {
  for (const [id, file, title] of FILES) {
    setCurrentFile(id);
    const one = nowrapCodes(shell({ id, title, skipTo: `s${id}`, main: sectionHtml(id, title, sections.get(id)) + pager(id) }));
    wrapped += one.wrapped; pages.set(file, one.html);
  }
  setCurrentFile(null);
  const idx = nowrapCodes(indexHtml()); wrapped += idx.wrapped; pages.set(INDEX, idx.html);
} else {
  const body = FILES.map(([id, , title]) => sectionHtml(id, title, sections.get(id))).join('\n');
  const one = nowrapCodes(shell({ id: null, title: '', skipTo: 's0', main: body }));
  wrapped = one.wrapped; pages.set('DESIGN-SAMPLES.html', one.html);
}
const html = [...pages.values()].join('\n');
console.log(`identifiers wrapped as one word: ${wrapped}`);
// Prose drift: the document must never name a token the generator no longer emits. The colour narrative
// went a whole build describing a violet --warn and an --accent2 that had both been deleted, because
// every gate here reads the rendered DOM and nothing read the words.
{
  // <code class="was">--x</code> names a token in the SHIPPED system, said in order to state what
  // becomes of it. Those are not drift; everything else must be a token this build emits.
  const prose = html.replace(/<code class="was">[^<]*<\/code>/g, '');
  const named = new Set([...prose.matchAll(/--([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?![a-z0-9-])/g)].map(m => m[1]));
  const emitted = new Set();
  // every custom property the token block actually declares, read off the block itself
  const declared = new Set([...tokenCss().matchAll(/--([a-z][a-z0-9-]*)\s*:/g)].map(m => m[1]));
  // plus the ones set per element as inline styles, which no stylesheet declares
  const INLINE = new Set(['w', 'x', 'y', 'o', 'v', 'max', 'top', 'mark', 'mo-enter', 'mo-exit']);   // the custom properties a sample sets inline: a width, a threshold, an overrun, a chart value, its scale and a group's top, a series' mark, and the motion page's entrance and exit
  const CSSISH = new Set([...declared, ...INLINE]);
  const ghosts = [...named].filter(n => !emitted.has(n) && !CSSISH.has(n));
  if (ghosts.length) { console.error(`PROSE DRIFT: the document names tokens that do not exist — ${ghosts.join(', ')}`); process.exit(1); }
  console.log(`prose gate: ${named.size} token names in the document, every one of them real`);
}

// (19 September) a stale-PHRASE list fails the build: each names something a drawing no longer shows. Phrases, not
// words — “sparkline” is still a component on the components page and must not trip it. A superseded span and the
// History section of the decisions page may say what was, so they are stripped before the check.
const STALE = ['three stats', 'with a sparkline', 'Money in its setup state', '12-project-scope', 'scope table', 'the six drawings', 'six drawings from the trade',
  'tenant-wide or both', 'foot of the sidebar opens', 'the + New menu', 'One project at a time', 'thirteen pages in one place', 'dark-neutral-0 as the bar', 'an × beside it that leaves',
  // (19 September, last) the sample the design was drawn on before the seed: the firm, its projects and its people
  'Northwind', 'KEST-01', 'MERI-01', 'Kestrel', 'Meridian', 'Priya', 'Rahul Menon', '88% of its contract', '88% of the contract ordered', 'Ashvale', 'Dunhollow'];
{ let stale = [];
  for (const [file, content] of pages) {
    const live = content.replace(/<span class="superseded">[\s\S]*?<\/span>/g, '').replace(/<section[^>]*class="[^"]*dsx-history[^"]*"[\s\S]*?<\/section>/g, '');
    for (const p of STALE) if (live.includes(p)) stale.push(`${file}: “${p}”`);
  }
  if (stale.length) { console.error('STALE PHRASE GATE FAIL — the prose describes what the drawing no longer shows:\n  ' + stale.join('\n  ')); process.exit(1); }
  console.log(`stale-phrase gate: ok · ${STALE.length} phrases absent from every page's live prose`); }
// ---- the sample gate (19 September, last) -----------------------------------------------------------
// Every project code, project name, client, vendor, prospect, stock item, task, order number, bill number and
// person the design prints is read from the product's demo seed. The gate reads the seed's own text — the
// two scripts, as committed — and refuses any name build/seed.mjs carries that the seed does not spell the
// same way, so a name the owner changes in the seed cannot survive here unnoticed.
{
  const root = new URL('../../../', import.meta.url);
  const seedText = readFileSync(new URL('scripts/seed-demo.mjs', root), 'utf8');
  const peopleText = readFileSync(new URL('scripts/demo-principals.mjs', root), 'utf8');
  const missing = [];
  // the two organisations' legal names live in demo-principals.mjs; everything else the seed spells itself
  for (const name of SEED.SAMPLE_NAMES.seed) if (!seedText.includes(name) && !peopleText.includes(name)) missing.push(`seed-demo.mjs: “${name}”`);
  for (const name of SEED.SAMPLE_NAMES.principals) if (!peopleText.includes(name)) missing.push(`demo-principals.mjs: “${name}”`);
  if (missing.length) { console.error('SAMPLE GATE FAIL — the design names something the seed does not:\n  ' + missing.join('\n  ')); process.exit(1); }
  console.log(`sample gate: ok · ${SEED.SAMPLE_NAMES.seed.length + SEED.SAMPLE_NAMES.principals.length} names read from the seed at ${SEED.SEED_COMMIT}, every one spelled as the seed spells it`);
}
// ---- no value outside tokens.css --------------------------------------------------------------------
// tokens.css is the only file in the set allowed to contain a value. Everything else references one.
// The gate reads the component rules AND the emitted markup, because an inline style attribute is where
// this discipline actually breaks: it is invisible to a stylesheet audit and unreachable by a theme.
{
  const SPACING = /(?:^|[;{\s"])((?:margin|padding)(?:-(?:top|right|bottom|left|block|inline))?|(?:row-|column-)?gap|border-radius)\s*:\s*([^;}"]+)/g;
  const faults = [];
  const scan = (text, where) => {
    for (const m of text.matchAll(SPACING)) {
      for (const tok of m[2].split(/[\s,]+/)) {
        if (/^\d+(?:\.\d+)?px$/.test(tok) && tok !== '0px') faults.push(`${where}: ${m[1]}: ${m[2].trim().slice(0, 44)}`);
      }
    }
  };
  scan(RULES, 'component rules');
  const TAGS = /<[^>]*\bstyle="([^"]*)"[^>]*>/g;   // \b, not a backspace: the byte a shell once put here made this scan match nothing (19 September)
  for (const [file, content] of pages) {
    for (const a of content.matchAll(TAGS)) {
      if (a[0].includes('is-specimen')) continue;          // a swatch paints the value it names
      if (/\d+(?:\.\d+)?%/.test(a[1])) continue;            // a datum is not a literal
      scan(a[1], `${file} (inline style)`);
    }
  }
  // and no colour may be written down anywhere but the token block
  const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|color-mix)\s*\(/g;
  const colourFaults = [];
  for (const m of RULES.matchAll(COLOUR)) if (!/^#i-/.test(m[0])) colourFaults.push(`component rules: ${m[0]}`);
  for (const [file, content] of pages) {
    for (const a of content.matchAll(TAGS)) {
      if (a[0].includes('is-specimen')) continue;
      for (const m of a[1].matchAll(COLOUR)) colourFaults.push(`${file} (inline style): ${m[0]}`);
    }
  }
  const all = [...faults, ...colourFaults];
  if (all.length) {
    console.error(`LITERAL GATE FAIL — ${all.length} value(s) outside tokens.css:`);
    for (const f of [...new Set(all)].slice(0, 20)) console.error('  ' + f);
    process.exit(1);
  }
  const declared = (TOKENS.match(/--[a-z][a-z0-9-]*\s*:/g) || []).length;
  console.log(`literal gate: ok · ${declared} values declared in tokens.css · none anywhere else, in ${pages.size} files`);
}
mkdirSync(DIR, { recursive: true });
let total = 0;
const LAYOUT = layoutKeysFrom(RULES);   // the flex and grid containers, so the layout may break a line between their items
const SHARED = SPLIT ? [['tokens.css', tidyCss(TOKENS)], ['design.css', tidyCss(RULES)], ['design.js', JS]] : [];
for (const [file, content] of SHARED) { writeFileSync(`${DIR}/${file}`, content, 'utf8'); total += statSync(`${DIR}/${file}`).size; }
for (const [file, content] of pages) { writeFileSync(`${DIR}/${file}`, tidyHtml(content, LAYOUT), 'utf8'); total += statSync(`${DIR}/${file}`).size; }
const rows = [...pages.keys()].map(f => `  ${f.padEnd(24)} ${(statSync(`${DIR}/${f}`).size / 1024).toFixed(1).padStart(7)} KB`);
console.log(SPLIT ? `wrote ${pages.size + SHARED.length} files to ${DIR}\n${SHARED.map(([f]) => `  ${f.padEnd(24)} ${(statSync(`${DIR}/${f}`).size / 1024).toFixed(1).padStart(7)} KB`).join('\n')}\n${rows.join('\n')}\n  ${'TOTAL'.padEnd(24)} ${(total / 1024).toFixed(1).padStart(7)} KB`
                 : `wrote ${DIR}/DESIGN-SAMPLES.html — ${total.toLocaleString('en-US')} bytes`);

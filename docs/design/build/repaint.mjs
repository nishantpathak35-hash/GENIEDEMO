// repaint.mjs — the size of the product's repaint: the shipped stylesheet's tokens against the rebuilt tokens.css.
// Reads packages/design-system/src/styles.css (read only), resolves every token per theme on both sides, and counts
// var(--x) references to each shipped token under apps/ and packages/ (never node_modules, builds or caches).
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RENAME } from './token-renames.mjs';
import { fileURLToPath } from 'node:url';
const HERE = (u) => fileURLToPath(new URL(u, import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const REPO = HERE('../../..');
const OUT = (process.env.OUT || HERE('..')).replace(/\/$/, '');
const shipped = readFileSync(`${REPO}/packages/design-system/src/styles.css`, 'utf8');
const rebuilt = readFileSync(`${OUT}/tokens.css`, 'utf8');

const decls = (block) => { const m = new Map(); for (const d of block.matchAll(/--([a-z][a-z0-9-]*)\s*:\s*([^;]+);/g)) m.set(d[1], d[2].trim()); return m; };
// a block's declarations, from the selector to its closing brace
const block = (css, sel) => { const st = css.indexOf(sel); if (st < 0) return ''; let depth = 0, end = -1; for (let i = st; i < css.length; i++) { if (css[i] === '{') depth++; else if (css[i] === '}') { depth--; if (depth === 0) { end = i; break; } } } return css.slice(st, end); };
function themes(css) {
  // the rebuilt file declares its component layer on ':root, [data-theme], .page-theme' so a themed specimen re-resolves it; the dark
  // block is '[data-theme="dark"]'. (19 September, charts: the selector had gained `.page-theme` and this read an empty block, so
  // TOKEN-DIFF counted one new component token; it now finds the block by its start, whatever follows.)
  const compSel = (css.match(/^:root, \[data-theme\][^{]*\{/m) || [':root, [data-theme] {'])[0];
  const light = new Map([...decls(block(css, ':root {')), ...decls(block(css, compSel))]);
  const darkOnly = decls(block(css, css.includes(':root[data-theme="dark"]') ? ':root[data-theme="dark"]' : '[data-theme="dark"] {'));
  const dark = new Map([...light, ...darkOnly]);
  return { light, dark, darkOnly };
}
const S = themes(shipped), N = themes(rebuilt);
const resolve = (map, v, depth = 0) => { if (depth > 20) return v; return v.replace(/var\(--([a-z0-9-]+)\)/g, (_, n) => map.has(n) ? resolve(map, map.get(n), depth + 1) : `var(--${n})`); };
const norm = (v) => { v = v.trim().toLowerCase().replace(/\s+/g, ' ');
  const h = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(v); if (h) { const n = parseInt(h[1], 16); const a = h[2] ? +(parseInt(h[2], 16) / 255).toFixed(2) : 1; return a === 1 ? `rgb(${n >> 16},${(n >> 8) & 255},${n & 255})` : `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
  const r = /^rgba?\(([^)]+)\)$/.exec(v); if (r) { const p = r[1].split(/[ ,/]+/).map(Number); return p.length > 3 && p[3] !== 1 ? `rgba(${p[0]},${p[1]},${p[2]},${+p[3].toFixed(2)})` : `rgb(${p[0]},${p[1]},${p[2]})`; }
  return v; };
const val = (T, theme, name) => { const m = T[theme]; return m.has(name) ? norm(resolve(m, m.get(name))) : null; };

const RN = new Map(RENAME.map(([a, b]) => [a, b]));
const rows = [];
for (const name of S.light.keys()) {
  const target = N.light.has(name) ? name : RN.get(name) || null;
  const sl = val(S, 'light', name), sd = val(S, 'dark', name);
  if (!target) { rows.push({ name, kind: 'removed', target: null, sl, sd }); continue; }
  const nl = val(N, 'light', target), nd = val(N, 'dark', target);
  const kind = target === name ? 'kept' : 'renamed';
  rows.push({ name, kind, target, sl, sd, nl, nd, lightChanged: sl !== nl, darkChanged: sd !== nd, themed: S.darkOnly.has(name) || N.darkOnly.size > 0 });
}
const shippedNames = new Set(S.light.keys());
const renamedTargets = new Set(rows.filter(r => r.target).map(r => r.target));
const added = [...N.light.keys()].filter(n => !shippedNames.has(n) && !renamedTargets.has(n));
const addedKinds = { primitive: added.filter(n => /^(neutral|dark-neutral|blue|teal|green|lime|yellow|orange|red|magenta|purple)-(minus-)?[0-9]+a?$/.test(n)).length };
addedKinds.semantic = added.filter(n => /^(color|elevation|space|radius|border-width|opacity|motion|font-size|line-height|font-weight)-/.test(n) && !/^font-size-(hero|figure|stat|stat-compact|title)$/.test(n)).length;
addedKinds.component = added.length - addedKinds.primitive - addedKinds.semantic;

// references under apps/ and packages/
const SKIP = new Set(['node_modules', '.next', 'dist', 'build', '.turbo', 'coverage', 'fonts']);
const files = [];
(function walk(d) { for (const e of readdirSync(d)) { if (SKIP.has(e)) continue; const p = join(d, e); const st = statSync(p); if (st.isDirectory()) walk(p); else if (/\.(css|tsx?|mjs|jsx?)$/.test(e)) files.push(p); } })(join(REPO, 'apps'));
(function walk(d) { for (const e of readdirSync(d)) { if (SKIP.has(e)) continue; const p = join(d, e); const st = statSync(p); if (st.isDirectory()) walk(p); else if (/\.(css|tsx?|mjs|jsx?)$/.test(e)) files.push(p); } })(join(REPO, 'packages'));
const refs = new Map(); const refFiles = new Map();
for (const f of files) { const t = readFileSync(f, 'utf8'); for (const m of t.matchAll(/var\(--([a-z][a-z0-9-]*)\)/g)) { refs.set(m[1], (refs.get(m[1]) || 0) + 1); if (!refFiles.has(m[1])) refFiles.set(m[1], new Set()); refFiles.get(m[1]).add(f.replace(/\\/g, '/').replace(REPO + '/', '')); } }
for (const r of rows) { r.refs = refs.get(r.name) || 0; r.files = refFiles.has(r.name) ? refFiles.get(r.name).size : 0; }

const kept = rows.filter(r => r.kind === 'kept'), renamed = rows.filter(r => r.kind === 'renamed'), removed = rows.filter(r => r.kind === 'removed');
const changed = (list) => list.filter(r => r.lightChanged || r.darkChanged);
const summary = {
  shipped: { light: S.light.size, dark: S.darkOnly.size },
  rebuilt: { declared: N.light.size, darkOverrides: N.darkOnly.size },
  kept: kept.length, keptChanged: changed(kept).length, keptSame: kept.length - changed(kept).length,
  renamed: renamed.length, renamedChanged: changed(renamed).length,
  removed: removed.length, added: added.length, addedKinds,
  refs: { renamed: renamed.reduce((s, r) => s + r.refs, 0), removed: removed.reduce((s, r) => s + r.refs, 0), keptChanged: changed(kept).reduce((s, r) => s + r.refs, 0) },
  refFiles: { renamedOrRemoved: new Set([...renamed, ...removed].flatMap(r => [...(refFiles.get(r.name) || [])])).size },
  filesScanned: files.length,
};
writeFileSync(new URL('./repaint.json', import.meta.url), JSON.stringify({ summary, rows, added }, null, 1));
console.log(JSON.stringify(summary, null, 1));
console.log('removed:', removed.map(r => `${r.name}(${r.refs})`).join(' '));
console.log('kept, same value:', kept.filter(r => !r.lightChanged && !r.darkChanged).map(r => r.name).join(' '));

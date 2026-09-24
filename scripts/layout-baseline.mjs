#!/usr/bin/env node
// Merges what the layout detector recorded into its baseline.
//
//   LAYOUT_BASELINE=write pnpm exec playwright test e2e/design-gates.spec.ts   # every test writes e2e/results/layout/*.json
//   node scripts/layout-baseline.mjs                                          # → e2e/alignment-baseline.json, and the table
//
// The baseline is per key (screen, state, width, theme) and rule: the number
// of faults the product had before the fixes in `docs/prompts/…` were made.
// `e2e/design-gates.spec.ts` reads it and fails only on a count above it, so
// the detector could land green on the tree before any fix, and the diff of
// the file shows which fault each fix closed. The table it prints is the
// report's: faults per rule per width. The file goes when it is empty.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = join(ROOT, 'e2e', 'results', 'layout');
const OUT = join(ROOT, 'e2e', 'alignment-baseline.json');

/** @type {Record<string, Record<string, number>>} */
const baseline = {};
/** @type {Map<string, Map<string, number>>} width → rule → faults */
const table = new Map();
/** @type {string[]} */
const lines = [];
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()) {
  /** @type {Array<{ key: string; faults: Record<string, string[]> }>} */
  const records = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
  for (const r of records) {
    // a bar record holds the bar's own faults and one list per popover; the spec holds those under
    // `key · bar` and `key · <popover>` as rules `bar` and `h`
    const ofBar = Object.hasOwn(r.faults, 'bar');
    for (const [name, faults] of Object.entries(r.faults)) {
      if (name === 'stops' || faults.length === 0) continue;
      const key = ofBar ? `${r.key} · ${name}` : r.key;
      const rule = ofBar ? (name === 'bar' ? 'bar' : 'h') : name;
      (baseline[key] ??= {})[rule] = faults.length;
      const width = /· (\d+)x\d+/.exec(r.key)?.[1] ?? '?';
      const row = table.get(width) ?? new Map();
      row.set(rule, (row.get(rule) ?? 0) + faults.length);
      table.set(width, row);
      for (const f of faults) lines.push(`${key} · ${rule} · ${f}`);
    }
  }
}
// rule j is static: the traps gate's count, held under one key the gate reads back
const traps = spawnSync('node', [join(ROOT, 'scripts', 'design-gates.mjs'), 'traps'], { encoding: 'utf8', cwd: ROOT, shell: true });
const trapped = (traps.stdout.match(/scrolls under a max-height/g) ?? []).length;
if (trapped > 0) {
  baseline['styles.css · j'] = { j: trapped };
  const row = table.get('static') ?? new Map();
  row.set('j', trapped);
  table.set('static', row);
}
writeFileSync(OUT, `${JSON.stringify(baseline, null, 1)}\n`);
writeFileSync(join(DIR, 'faults.txt'), `${lines.join('\n')}\n`);

const rules = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'bar'];
const widths = [...table.keys()].sort((a, b) => (Number(a) || 1e9) - (Number(b) || 1e9));
process.stdout.write(`| width | ${rules.join(' | ')} |\n|---|${rules.map(() => '---:').join('|')}|\n`);
for (const w of widths) {
  const row = table.get(w) ?? new Map();
  process.stdout.write(`| ${w} | ${rules.map((r) => String(row.get(r) ?? 0)).join(' | ')} |\n`);
}
process.stdout.write(`\n${String(Object.keys(baseline).length)} keys, ${String(lines.length)} faults → ${OUT}\n`);

// gates.mjs — every gate, over the built set, both themes. One command:
//
//   node docs/design/build/gates.mjs            the whole suite against docs/design (about twenty minutes)
//   node docs/design/build/gates.mjs --quick    the whole-set gates only, no per-file colour gates, no alignment
//   node docs/design/build/gates.mjs <dir>      the same suite against another built set
//
// Each gate is its own script beside this one and prints its own report; this runner keeps every report in a
// folder under the OS temp directory, prints one verdict line per gate, and exits 1 if any gate failed.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = (u) => fileURLToPath(new URL(u, import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const SET = (args.find(a => !a.startsWith('--')) || HERE('..')).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = `${tmpdir().replace(/\\/g, '/')}/cog-design-gates`;
mkdirSync(OUT, { recursive: true });

const files = readdirSync(SET).filter(f => f.endsWith('.html')).sort();
let failed = 0;
const run = (name, script, argv, verdict) => {
  const r = spawnSync(process.execPath, [HERE(`./${script}`), ...argv], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, CVD_SHOTS: OUT } });
  const log = (r.stdout || '') + (r.stderr || '');
  writeFileSync(`${OUT}/${name}.txt`, log);
  const line = verdict(log, r.status);
  const ok = r.status === 0 && !/FAIL/.test(line);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(26)} ${line}`);
};
const last = (re) => (log, status) => { const m = log.match(re); return m ? m[0].slice(0, 150) : `exit ${status}`; };

console.log(`gates over ${SET} — reports in ${OUT}\n`);
run('standalone', 'gates/standalone.mjs', [SET], last(/STANDALONE GATE: .*/));
run('consistency', 'gates/consistency.mjs', [SET], last(/CONSISTENCY GATE: .*/));
run('money', 'gates/money.mjs', [SET], last(/MONEY GATE: .*/));
run('polish', 'gates/polish.mjs', [SET], last(/POLISH GATE: .*/));
run('frame', 'gates/frame.mjs', [SET], last(/FRAME GATE: .*/));
run('motion', 'gates/motion.mjs', [SET], last(/MOTION GATE: .*/));
run('states', 'gates/states.mjs', [SET], last(/STATES GATE: .*/));
run('names', 'gates/names.mjs', [SET], last(/names gate: .*/));
run('readable', 'gates/readable.mjs', [SET], last(/READABLE GATE: .*/));

if (!QUICK) {
  for (const f of files) {
    const b = f.replace(/\.html$/, '');
    run(`contrast · ${b}`, 'gates/contrast.mjs', [`${SET}/${f}`], (log) => { const m = [...log.matchAll(/^== (light|dark): .*?, (\d+) below target/gm)]; const below = m.reduce((s, x) => s + +x[2], 0); return m.length === 2 ? `${below ? 'FAIL ' : ''}${below} below target over ${m.length} themes` : 'FAIL no verdict'; });
    run(`non-text · ${b}`, 'gates/non-text.mjs', [`${SET}/${f}`], (log) => { const m = log.match(/obligated \+ raised failures: (\d+)/); return m ? `${+m[1] ? 'FAIL ' : ''}${m[1]} failures` : 'FAIL no verdict'; });
    run(`colour vision · ${b}`, 'gates/colour-vision.mjs', [`${SET}/${f}`], (log) => { const m = log.match(/full colour vision: (\d+)/); return m ? `${+m[1] ? 'FAIL ' : ''}${m[1]} charts colour-only` : 'FAIL no verdict'; });
    run(`india · ${b}`, 'gates/india.mjs', [`${SET}/${f}`], (log) => { const m = [...log.matchAll(/FLAG ADJACENCY .*?: (\d+) pairs/g)]; const n = m.reduce((s, x) => s + +x[1], 0); return m.length ? `${n ? 'FAIL ' : ''}${n} flag pairs` : 'FAIL no verdict'; });
  }
  run('alignment', 'gates/alignment.mjs', [SET, '--top', '60'], last(/ALIGN GATE: .*/));
}

console.log(`\n${failed ? `${failed} gate(s) FAILED` : 'every gate passed'} — reports in ${OUT}`);
process.exit(failed ? 1 : 0);

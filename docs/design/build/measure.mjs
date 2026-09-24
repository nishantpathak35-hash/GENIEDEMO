// measure.mjs — refreshes the measured inputs the build reads back in, then rebuilds so the pages print them.
//
//   node docs/design/build/measure.mjs
//
// Four files beside this script are measurements of the built set, not sources: non-text.json (every non-text
// pair, WCAG 1.4.11), ink.json (ink coverage of the foundations page), inventory.json (the element census
// over the product frames) and repaint.json (tokens.css against the shipped stylesheet). The plain build
// reads them as committed; this command re-measures them from the current set, writes TOKEN-DIFF.md, and
// runs the build again so 00-foundations, 13-components and TOKEN-DIFF.md carry the fresh figures. Run it
// after a change to a token or to the elements a frame draws; run the plain build for anything else.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = (u) => fileURLToPath(new URL(u, import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const SET = HERE('..');
const node = (script, argv, env = {}) => {
  const r = spawnSync(process.execPath, [HERE(`./${script}`), ...argv], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...env } });
  if (r.status !== 0) { console.error((r.stdout || '') + (r.stderr || '')); throw new Error(`${script} exited ${r.status}`); }
  return (r.stdout || '').trim().split('\n').pop();
};
const html = readdirSync(SET).filter(f => f.endsWith('.html')).sort().map(f => `${SET}/${f}`);

console.log('1. build, so the measurements are of the current sources');
console.log('   ' + node('build.mjs', []));
console.log('2. non-text pairs over every file → non-text.json');
console.log('   ' + node('gates/non-text.mjs', [html.join(','), '--json', HERE('./non-text.json')]));
console.log('3. ink coverage of the foundations page → ink.json');
console.log('   ' + node('ink.mjs', ['light', '--json', HERE('./ink.json')], { INK_FILE: `${SET}/00-foundations.html` }));
console.log('4. the element census over the product frames → inventory.json');
console.log('   ' + node('census.mjs', [SET, '--json']));
console.log('5. tokens.css against the shipped stylesheet → repaint.json, then TOKEN-DIFF.md');
console.log('   ' + node('repaint.mjs', []));
console.log('   ' + node('token-diff.mjs', []));
console.log('6. build again, so the pages print what was measured');
console.log('   ' + node('build.mjs', []));

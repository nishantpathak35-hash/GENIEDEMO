// readable.mjs — the set reads as source. Every .html, .css and .js file in the set: no line over 120
// characters; no page carries a <style> block or an inline script — the three shared files do; and
// inside a product frame one block-level element starts per line, so a diff of a screen reads element by
// element. Whitespace is the only thing the layout changes: the same pages rendered before and after it were
// compared element by element (box, colour, rendered text) when the layout was introduced.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WIDTH } from '../tidy.mjs';

const SET = (process.argv[2] || fileURLToPath(new URL('../..', import.meta.url))).replace(/\\/g, '/').replace(/\/$/, '');
const files = readdirSync(SET).filter(f => /\.(html|css|js)$/.test(f)).sort();
const BLOCK = /<(?:div|section|main|header|footer|nav|aside|article|p|ul|ol|li|dl|table|thead|tbody|tr|figure|form|fieldset|h[1-6])\b/g;
let faults = 0, lines = 0;
for (const f of files) {
  const text = readFileSync(`${SET}/${f}`, 'utf8');
  const rows = text.split('\n');
  lines += rows.length;
  const long = [], many = [], inlineStyle = [], inlineScript = [];
  let inFrame = 0;
  rows.forEach((ln, i) => {
    if (ln.length > WIDTH) long.push(i + 1);
    if (f.endsWith('.html')) {
      if (/<style[\s>]/.test(ln)) inlineStyle.push(i + 1);
      if (/<script(?![^>]*\bsrc=)[^>]*>(?!<\/script>)/.test(ln)) inlineScript.push(i + 1);
      if (/class="dsx-frame/.test(ln)) inFrame++;
      if (inFrame && (ln.match(BLOCK) || []).length > 1) many.push(i + 1);
    }
  });
  const bad = [];
  if (long.length) bad.push(`${long.length} line(s) over ${WIDTH} (first ${long.slice(0, 3).join(', ')})`);
  if (inlineStyle.length) bad.push(`a <style> block at ${inlineStyle[0]}`);
  if (inlineScript.length) bad.push(`an inline script at ${inlineScript[0]}`);
  if (many.length) bad.push(`${many.length} line(s) opening two block elements (first ${many.slice(0, 3).join(', ')})`);
  if (bad.length) faults++;
  console.log(`  ${bad.length ? 'FAIL' : 'ok  '} ${f.padEnd(26)} ${String(rows.length).padStart(6)} lines${bad.length ? ' · ' + bad.join(' · ') : ''}`);
}
console.log(`\nREADABLE GATE: ${faults ? `FAIL (${faults} files)` : 'PASS'} — ${files.length} files, ${lines.toLocaleString('en-US')} lines, none over ${WIDTH} characters, no page inlines a style or a script, one block element a line inside every frame`);
process.exit(faults ? 1 : 0);

// No product screen names the system it borrows from. Every frame's rendered text, every file, both themes the same.
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');   // the workspace's own copy — resolved from this folder upward
const DIR = process.argv[2];
const b = await chromium.launch(); const p = await b.newPage();
let bad = 0, frames = 0;
for (const f of readdirSync(DIR).filter(x => x.endsWith('.html')).sort()) {
  await p.goto(`file:///${DIR}/${f}`);
  const r = await p.evaluate(() => [...document.querySelectorAll('.dsx-frame')].map(fr => { const t = fr.innerText + ' ' + [...fr.querySelectorAll('[aria-label],[title],[alt]')].map(e => (e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('title') || '') + ' ' + (e.getAttribute('alt') || '')).join(' '); const m = t.match(/Atlassian|Salesforce|Lightning|Jira|Confluence|Trello|Charlie Sans|Atlassian Sans/gi); return m ? m.join(',') : ''; }));
  frames += r.length; const hits = r.filter(Boolean); bad += hits.length;
  if (hits.length) console.log(`FAIL ${f}: ${hits.join(' | ')}`);
}
console.log(`names gate: ${frames} frames read, ${bad} naming a borrowed system`);
await b.close(); process.exit(bad ? 1 : 0);

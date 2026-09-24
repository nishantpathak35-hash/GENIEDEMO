// gates/states.mjs — the states gate (17 September 2026).
//   node gates/states.mjs <dir>
// Every state on the components page is drawn with a class — .is-hover, .is-pressed, .is-focus, .is-selected,
// .is-checked, .is-disabled — because a page cannot hold a pointer over a specimen. Each state rule is written once
// as a selector list (`:hover, .is-hover`), so the specimen and the real state are the same rule; this gate proves
// it. For every element drawn in a state it finds the same control at rest — a sibling, or the same element inside
// the sibling specimen — puts that control into the real state (the pointer over it, the mouse down on it, focus
// arriving by keyboard, the attribute set) and compares what the page computes for both: background, colour,
// borders, shadow, outline, opacity, decoration, transform. A state whose rule was missed renders as the rest and
// shows up as a mismatch; a specimen whose rule lost to a base rule's specificity shows up the same way.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');   // the workspace's own copy — resolved from this folder upward
const DIR = process.argv[2];
const PROPS = ['background-color', 'color', 'border-top-color', 'border-bottom-color', 'box-shadow', 'outline-color', 'outline-width', 'outline-style', 'opacity', 'text-decoration-line', 'transform'];
const STATES = { hover: 'is-hover', pressed: 'is-pressed', focused: 'is-focus', selected: 'is-selected', checked: 'is-checked', disabled: 'is-disabled' };

const b = await chromium.launch();
let fails = 0, checked = 0; const out = [];
for (const theme of ['light', 'dark']) {
  const p = await (await b.newContext({ colorScheme: theme, reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto(`file:///${DIR}/01-components.html`, { waitUntil: 'load' });
  // every element drawn in a state, in this theme's panes, and the same control at rest
  const specs = await p.evaluate((STATES) => {
    const rows = []; let n = 0;
    // at rest: no drawn state, and no real one either — not current, selected, pressed, checked or disabled
    const isState = e => [...e.classList].some(c => c.startsWith('is-')) || e.matches('[aria-current], [aria-selected="true"], [aria-pressed="true"], [aria-checked="true"], [aria-disabled="true"], :disabled, :checked');
    const same = (a, b) => !!b && b.tagName === a.tagName && (a.classList[0] === b.classList[0] || (a.classList[0] || '').startsWith('is-')) && !isState(b);
    const theme = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    for (const el of document.querySelectorAll('[class*="is-"]')) {
      const state = Object.keys(STATES).find(k => el.classList.contains(STATES[k])); if (!state) continue;
      const pane = el.closest('[data-theme]'); if (pane && pane.getAttribute('data-theme') !== theme) continue;
      // the same control at rest: a sibling, or the element at the same path inside a sibling of an ancestor
      let rest = [...el.parentElement.children].find(s => s !== el && same(el, s));
      if (!rest) { const path = []; let a = el;
        for (let depth = 0; depth < 6 && !rest && a.parentElement; depth++) { path.unshift([...a.parentElement.children].indexOf(a)); a = a.parentElement;
          for (const sib of [...(a.parentElement ? a.parentElement.children : [])]) { if (sib === a || sib.tagName !== a.tagName) continue; let d = sib; for (const i of path) d = d && d.children[i]; if (d && same(el, d)) { rest = d; break; } } } }
      if (!rest) continue;
      const id = 's' + (n++); el.setAttribute('data-stel', id); rest.setAttribute('data-rest', ((rest.getAttribute('data-rest') || '') + ' ' + id).trim());
      const head = [...document.querySelectorAll('.spec-h')].filter(h => h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).pop();
      rows.push({ id, state, checked: !!(el.checked || el.getAttribute('aria-checked') === 'true'), heading: (head ? head.textContent : '').trim().slice(0, 44), tag: el.tagName.toLowerCase() + '.' + (el.classList[0] || '') });
    }
    return rows;
  }, STATES);
  for (const s of specs) {
    const stel = p.locator(`[data-stel="${s.id}"]`), rest = p.locator(`[data-rest~="${s.id}"]`);
    const read = (loc) => loc.evaluate((el, PROPS) => { const c = getComputedStyle(el); return Object.fromEntries(PROPS.map(k => [k, c.getPropertyValue(k)])); }, PROPS);
    const want = await read(stel);
    await rest.scrollIntoViewIfNeeded();
    if (s.checked) await rest.evaluate(el => { if ('checked' in el) el.checked = true; else el.setAttribute('aria-checked', 'true'); });   // a specimen drawn on a checked control is compared against a checked one
    if (s.state === 'hover') await rest.hover();
    else if (s.state === 'pressed') { await rest.hover(); await p.mouse.down(); }
    else if (s.state === 'focused') { await rest.evaluate(el => { const t = document.createElement('button'); t.setAttribute('data-tmp', ''); t.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0'; el.parentElement.insertBefore(t, el); t.focus(); }); await p.keyboard.press('Tab'); }   // focus arrives by keyboard, so :focus-visible holds as it would for a person
    else if (s.state === 'selected') await rest.evaluate(el => { if (el.matches('.menu-i')) el.setAttribute('aria-checked', 'true'); else if (el.matches('[role="tab"]')) el.setAttribute('aria-selected', 'true'); else if (el.matches('tr')) el.setAttribute('aria-selected', 'true'); else el.setAttribute('aria-pressed', 'true'); });
    else if (s.state === 'checked') await rest.evaluate(el => { if ('checked' in el) el.checked = true; else el.setAttribute('aria-checked', 'true'); });
    else if (s.state === 'disabled') await rest.evaluate(el => { if ('disabled' in el) el.disabled = true; else el.setAttribute('aria-disabled', 'true'); });
    await p.waitForTimeout(350);   // the published hover and press transitions are 150ms; let them arrive
    const got = await read(rest);
    if (s.state === 'pressed') await p.mouse.up();
    await p.mouse.move(0, 0);
    await p.evaluate(() => document.querySelectorAll('[data-tmp]').forEach(t => t.remove()));
    await rest.evaluate(el => { el.blur(); for (const a of ['aria-pressed', 'aria-checked', 'aria-selected', 'aria-disabled']) el.removeAttribute(a); if ('disabled' in el) el.disabled = false; if ('checked' in el) el.checked = false; });
    const diff = PROPS.filter(k => want[k] !== got[k]);
    checked++; if (diff.length) fails++;
    out.push(`  ${diff.length ? 'FAIL' : 'ok  '} ${theme} ${s.state.padEnd(8)} ${s.tag.padEnd(20)} ${s.heading.padEnd(44)}${diff.length ? ' differs on ' + diff.map(k => `${k}: ${want[k]} vs ${got[k]}`).join('; ') : ''}`);
  }
  await p.close();
}
await b.close();
console.log(`STATES GATE — ${DIR}/01-components.html\n\nEvery element drawn in a state, against the same control at rest put into the real state, both themes\n`);
console.log(out.join('\n'));
console.log(`\nSTATES GATE: ${fails ? `FAIL (${fails} of ${checked})` : `PASS — ${checked} drawn states match the real state they stand for, both themes`}`);
process.exit(fails ? 1 : 0);

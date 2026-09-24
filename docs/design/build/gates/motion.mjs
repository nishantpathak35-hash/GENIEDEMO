// gates/motion.mjs — the motion gate (17 September 2026).
//   node gates/motion.mjs <dir>
// On the motion page, with motion allowed: every specimen plays exactly the tokens it names — the animation and
// transition the page computes for its elements are read back and matched, name for name, duration for duration,
// curve for curve, against the token's value in the emitted tokens.css; and every named token is played by some element.
// With reduced motion asked for, on the motion page and on every other page: nothing travels, turns or scales —
// every running animation is one of the two fades, the spinner's breath or the skeleton's colour, and no transition
// with a duration moves a transform, a width, a height or a grid row. And the page's own switch produces the same
// computed motion as the device setting, so what the page shows is what a device would show.
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');   // the workspace's own copy — resolved from this folder upward
const DIR = process.argv[2];
const ALLOWED = ['FadeIn0to100', 'FadeOut100to0', 'spinner-breathe', 'skeleton-shimmer', 'none'];
const MOVING = /\b(transform|width|height|grid-template-rows|all)\b/;

// in-page: read the played motion of a specimen and the tokens it names
const READ = `(function () {
  const root = getComputedStyle(document.documentElement);
  const sec = s => (/ms$/.test(s) ? parseFloat(s) / 1000 : parseFloat(s));
  const norm = v => v.replace(/\\s+/g, ' ').trim();
  // a token value → the animations or the transitions it declares
  const parseToken = (name) => { const raw = norm(root.getPropertyValue('--' + name)); if (!raw || raw === 'none') return { raw, anims: [], trans: [] };
    const parts = []; let d = 0, st = 0; for (let i = 0; i < raw.length; i++) { if (raw[i] === '(') d++; else if (raw[i] === ')') d--; else if (raw[i] === ',' && d === 0) { parts.push(raw.slice(st, i).trim()); st = i + 1; } } parts.push(raw.slice(st).trim());
    const anims = [], trans = [];
    for (const p of parts) { const m = p.match(/^(\\d[\\d.]*m?s) (cubic-bezier\\([^)]*\\)|[a-z-]+)(?: ([A-Za-z0-9-]+))?(?: (\\d[\\d.]*m?s))?(?: (backwards|forwards|both|infinite|alternate))*/);
      if (m && /^[A-Z]|^spinner|^skeleton/.test(m[3] || '')) anims.push({ name: m[3], dur: sec(m[1]), tf: m[2] });
      else { const t = p.match(/^([a-z-]+) (\\d[\\d.]*m?s) (cubic-bezier\\([^)]*\\)|[a-z-]+)/); if (t) trans.push({ prop: t[1], dur: sec(t[2]), tf: t[3] }); } }
    return { raw, anims, trans }; };
  const played = (el) => { const c = getComputedStyle(el); const out = { anims: [], trans: [] };
    const an = c.animationName.split(',').map(norm), ad = c.animationDuration.split(',').map(norm), at = c.animationTimingFunction.split(/,(?![^(]*\\))/).map(norm);
    an.forEach((n, i) => { if (n !== 'none') out.anims.push({ name: n, dur: sec(ad[i] || ad[0]), tf: at[i] || at[0] }); });
    const tp = c.transitionProperty.split(',').map(norm), td = c.transitionDuration.split(',').map(norm), tt = c.transitionTimingFunction.split(/,(?![^(]*\\))/).map(norm);
    tp.forEach((p, i) => { const dur = sec(td[i] || td[0]); if (dur > 0) out.trans.push({ prop: p, dur, tf: tt[i] || tt[0] }); });
    return out; };
  const key = a => (a.name || a.prop) + '|' + a.dur + '|' + a.tf.replace(/\\s/g, '');
  const rows = [];
  for (const s of document.querySelectorAll('.mo')) {
    const tokens = s.getAttribute('data-tokens').split(' ');
    const kind = s.getAttribute('data-play').split(':')[0];
    const declared = new Map(); const add = (k, t) => declared.set(k, [...(declared.get(k) || []), t]); for (const t of tokens) { const p = parseToken(t); for (const a of p.anims) add(key(a), t); for (const tr of p.trans) add(key(tr), t); }
    const els = [...s.querySelectorAll('.mo-el')];
    if (kind === 'pair') els.forEach(e => e.classList.add('mo-in'));
    const seen = new Map(); const stray = []; const raw = [];
    const scan = (e, self = true) => { const p = played(e); for (const a of [...p.anims, ...(self ? p.trans : [])]) { const k = key(a); raw.push(k); if (declared.has(k)) seen.set(k, declared.get(k)); else stray.push(k); } };
    const scanAll = () => els.forEach(e => { scan(e); e.querySelectorAll('*').forEach(d => scan(d, false)); });
    scanAll();
    if (kind === 'hover') { els.forEach(e => e.classList.add('is-pressed')); scanAll(); els.forEach(e => e.classList.remove('is-pressed')); }
    if (kind === 'pair') { els.forEach(e => { e.classList.remove('mo-in'); e.classList.add('mo-out'); }); scanAll(); els.forEach(e => e.classList.remove('mo-out')); }
    if (kind === 'section') { const list = s.querySelector('.mo-list'); list.classList.add('mo-in'); scan(list); scan(s.querySelector('.mo-body')); scan(s.querySelector('.nav-chev svg')); list.classList.remove('mo-in'); }
    if (kind === 'toggle') scan(s.querySelector('.knob'));
    if (kind === 'progress') scan(s.querySelector('.chart.progress .bar > i'));   // the grammar's one progress bar (19 September, charts)
    const playedTokens = new Set([...seen.values()].flat());
    rows.push({ id: s.getAttribute('data-mo'), tokens, played: [...playedTokens], unplayed: tokens.filter(t => !playedTokens.has(t) && parseToken(t).raw !== 'none'), stray: [...new Set(stray)], all: raw.sort() });
  }
  return rows;
})()`;

// in-page: everything that moves on this page, as computed now
const MOVES = `(function () {
  const bad = []; let anims = 0, trans = 0;
  for (const el of document.querySelectorAll('body *')) { const c = getComputedStyle(el);
    const an = c.animationName.split(',').map(s => s.trim()).filter(n => n !== 'none'); anims += an.length;
    for (const n of an) if (!${JSON.stringify(ALLOWED)}.includes(n)) bad.push('animation ' + n + ' on ' + el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className.split(' ')[0] : ''));
    const tp = c.transitionProperty.split(',').map(s => s.trim()), td = c.transitionDuration.split(',').map(s => s.trim());
    tp.forEach((p, i) => { const d = td[i] || td[0]; const dur = /ms$/.test(d) ? parseFloat(d) / 1000 : parseFloat(d); if (dur > 0) { trans++; if (${MOVING.toString()}.test(p)) bad.push('transition ' + p + ' ' + d + ' on ' + el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className.split(' ')[0] : '')); } });
  }
  return { anims, trans, bad: [...new Set(bad)] };
})()`;

const b = await chromium.launch();
let fails = 0;
const say = (ok, msg) => { if (!ok) fails++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`); };

// 1. the motion page, motion allowed: each specimen plays its tokens
{
  const p = await (await b.newContext({ reducedMotion: 'no-preference' })).newPage();
  await p.goto(`file:///${DIR}/02-motion.html`, { waitUntil: 'load' });
  const rows = await p.evaluate(READ);
  console.log(`MOTION GATE — ${DIR}\n\nSPECIMENS, motion allowed: each plays the tokens it names, and nothing else\n`);
  for (const r of rows) say(!r.unplayed.length && !r.stray.length, `${r.id.padEnd(9)} ${r.tokens.length} tokens named, ${r.played.length} played${r.unplayed.length ? ' · not played: ' + r.unplayed.join(', ') : ''}${r.stray.length ? ' · played but not named: ' + r.stray.join(', ') : ''}`);
  // 2. the page's own switch equals the device setting
  await p.evaluate(() => document.body.setAttribute('data-motion', 'reduce'));
  const bySwitch = await p.evaluate(MOVES);
  const byToggleRows = await p.evaluate(READ);
  await p.close();
  const q = await (await b.newContext({ reducedMotion: 'reduce' })).newPage();
  await q.goto(`file:///${DIR}/02-motion.html`, { waitUntil: 'load' });
  const byDevice = await q.evaluate(MOVES);
  const byDeviceRows = await q.evaluate(READ);
  await q.close();
  console.log('\nREDUCED MOTION on the motion page: the switch and the device setting agree, and nothing moves\n');
  const same = JSON.stringify(byToggleRows.map(r => r.all)) === JSON.stringify(byDeviceRows.map(r => r.all));
  say(same, `the page's switch computes the same motion as the device setting (${byDeviceRows.reduce((n, r) => n + r.all.length, 0)} played motions compared)`);
  say(!byDevice.bad.length, `device setting: ${byDevice.anims} animations and ${byDevice.trans} timed transitions on the page, none moving${byDevice.bad.length ? ' — ' + byDevice.bad.slice(0, 6).join('; ') : ''}`);
  say(!bySwitch.bad.length, `the switch: ${bySwitch.anims} animations and ${bySwitch.trans} timed transitions, none moving${bySwitch.bad.length ? ' — ' + bySwitch.bad.slice(0, 6).join('; ') : ''}`);
}

// 3. every other page under reduced motion: nothing moves
console.log('\nREDUCED MOTION across the set: every animation a fade, a breath or a colour; no timed transition of a transform, a size or a row\n');
const ctx = await b.newContext({ reducedMotion: 'reduce' }); const p = await ctx.newPage();
for (const f of readdirSync(DIR).filter(x => x.endsWith('.html')).sort()) {
  await p.goto(`file:///${DIR}/${f}`, { waitUntil: 'load' });
  const m = await p.evaluate(MOVES);
  say(!m.bad.length, `${f.padEnd(26)} ${String(m.anims).padStart(4)} animations · ${String(m.trans).padStart(4)} timed transitions${m.bad.length ? ' — ' + m.bad.slice(0, 5).join('; ') : ''}`);
}
await b.close();
console.log(`\nMOTION GATE: ${fails ? `FAIL (${fails})` : 'PASS'}`);
process.exit(fails ? 1 : 0);

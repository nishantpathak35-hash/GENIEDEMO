// pages/motion.mjs — the motion page (17 September 2026): every motion the product makes, named by its published token,
// played on the page with a replay button, and shown again under reduced motion, where nothing moves.
import * as L from '../shell.mjs';
import { progress as progressBar } from '../charts.mjs';
import * as T from '../tokens.mjs';
import { calendar } from './components.mjs';
const { esc, icon, pill, sample, note, spinner } = L;

const TOK = Object.fromEntries([...T.MOTION_TOKENS, ...T.EXTRA_MOTION]);
const RED = Object.fromEntries(T.REDUCED_MOTION);
const short = v => v.replace(/cubic-bezier\(([^)]*)\)/g, (m, a) => ({ '0, 0.4, 0, 1': 'ease-out bold', '0.4, 0, 0, 1': 'ease-in-out bold', '0.6, 0, 0.8, 0.6': 'ease-in practical', '0.4, 1, 0.6, 1': 'ease-out practical' })[a.replace(/\s+/g, ' ').trim()] || m).replace(/var\(--motion-duration-(\w+)\)/g, (m, d) => ({ xxshort: '50ms', xshort: '100ms', short: '150ms', medium: '200ms', long: '250ms', xlong: '400ms' })[d] || m).replace(/var\(--motion-easing-(\w+)-(\w+)\)/g, '$1 $2');
const tokenLine = (names) => names.map(n => `<code>--${n}</code> <span>${esc(short(TOK[n] || ''))}</span>`).join('<br>');
const reducedLine = (names) => names.map(n => n in RED ? esc(short(RED[n])) : 'unchanged — it changes a colour in place').join(' · ');

// one specimen: a stage that plays, the tokens it plays, and what the reduced set does instead
const mo = ({ id, title, tokens, stage, play, what, reduced, tall = false }) =>
  `<section class="mo" id="mo-${id}" data-mo="${id}" data-play="${esc(play)}" data-tokens="${tokens.join(' ')}">
<div class="mo-h"><h4>${esc(title)}</h4><button class="btn" type="button" data-replay>${icon('refresh')}Replay</button></div>
<div class="mo-stage${tall ? ' tall' : ''}">${stage}</div>
<dl class="mo-dl"><dt>Plays</dt><dd>${tokenLine(tokens)}</dd><dt>What</dt><dd>${what}</dd><dt>Reduced</dt><dd>${reduced || reducedLine(tokens)}</dd></dl>
</section>`;

export function motion() {
  const menu = `<div class="popup mo-el" style="position:absolute;left:0;top:0;width:220px"><ul class="menu" role="menu"><li role="none"><button class="menu-i" role="menuitem" type="button">${icon('copy')}Duplicate</button></li><li role="none"><button class="menu-i" role="menuitem" type="button">${icon('download')}Download the PDF</button></li><li role="separator"><hr></li><li role="none"><button class="menu-i danger" role="menuitem" type="button">Cancel the order…</button></li></ul></div>`;
  const flag = `<div class="flag ok mo-el" role="status" style="position:absolute;right:0;top:0">${icon('check-circle')}<span class="t">PO-0019 approved</span><button class="btn icon ghost sm" type="button" aria-label="Dismiss">${icon('x', 'i sm')}</button><p>Prakashvahini has been told. The next one is PO-0003.</p></div>`;
  const modal = `<div class="blanket mo-el mo-blanket"></div><div class="modal mo-el" role="dialog" aria-modal="true" aria-labelledby="mo-modal-t"><div class="modal-h"><h4 class="modal-t" id="mo-modal-t">Cancel PO-0019?</h4></div><div class="modal-b"><p>Prakashvahini will be told the order is withdrawn. The lines go back to the BOQ as unordered.</p></div><div class="modal-f"><button class="btn" type="button">Keep it</button><button class="btn danger" type="button">Cancel the order</button></div></div>`;
  const drawer = `<div class="scrim mo-el mo-blanket"></div><div class="drawer mo-el" role="dialog" aria-label="Raise an order"><div class="drawer-h"><h4 class="drawer-t">Raise an order from 3 lines</h4><button class="btn icon ghost" type="button" aria-label="Close">${icon('x')}</button></div><div class="drawer-b"><p>Lines 2.1, 2.3 and 1.3, at BOQ rates.</p></div></div>`;
  const pane = `<aside class="pane mo-pane" aria-label="PO-0019" style="position:absolute;inset:0"><div class="pane-h"><div><h5 class="pane-t">PO-0019</h5><small>Prakashvahini Electrical Contracts · ANU-01</small></div></div><div class="pane-b mo-el"><dl class="kv"><dt>Total</dt><dd>₹18,40,600.00</dd><dt>Vendor</dt><dd>Prakashvahini Electrical Contracts Private Limited</dd><dt>Raised</dt><dd>8 September 2026</dd></dl></div></aside>`;
  const section = `<nav class="side-nav mo-nav" aria-label="Sections" style="width:240px"><div class="nav-group"><button class="nav-h" type="button" aria-expanded="true" aria-controls="mo-sec">${icon('cart')}<span class="nav-t">Buying</span><span class="nav-chev">${icon('chevron', 'i sm')}</span></button><div class="mo-body" id="mo-sec"><ul class="mo-list"><li><a href="#">Orders <span class="badge">3</span></a></li><li><a href="#">Vendors</a></li><li><a href="#">Agreed rates</a></li><li><a href="#">Stock</a></li></ul></div></div></nav>`;
  const tag = `<div class="chips"><span class="chips-l">Filtered by</span>${L.removableTag('Vendor', 'Himanil')}<span class="mo-el">${L.removableTag('Status', 'Draft')}</span></div>`;
  const hover = `<div class="mo-row"><button class="btn mo-el" type="button">Export</button><button class="btn primary mo-el" type="button">Approve</button><ul class="menu mo-menu" role="menu" style="width:200px"><li role="none"><button class="menu-i mo-el" role="menuitem" type="button">${icon('copy')}Duplicate</button></li></ul></div>`;
  const toggle = `<label class="check-row"><button class="toggle mo-el" type="button" role="switch" aria-checked="false" aria-label="Email me when an order is approved"><span class="knob"></span></button>Email me when an order is approved</label>`;
  const progress = progressBar(31, { label: 'Export' }).replace('class="chart progress"', 'class="chart progress mo-el" style="width:280px"');
  const drawerStage = drawer.replace('class="drawer mo-el"', 'class="drawer mo-el" style="width:75%"');

  const specimens = [
    mo({ id: 'hover', title: 'Hover and press — a button, a menu item', tokens: ['motion-button-hovered', 'motion-button-pressed', 'motion-listitem-hovered', 'motion-listitem-pressed'], stage: hover, play: 'hover', what: 'The background and border colour ease to the hovered step in 150ms, then to the pressed step; a list item is faster, 50ms and 100ms. An interaction stays under 150ms so it feels immediate.', reduced: 'Unchanged: a colour changing in place moves nothing.' }),
    mo({ id: 'spinner', title: 'Spinner — arriving, then turning', tokens: ['motion-spinner-load-in', 'motion-spinner-rotate'], stage: `<div class="mo-row">${spinner('l', 'Loading', 'mo-el')}${spinner('m', 'Loading', 'mo-el')}${spinner('s', 'Loading', 'mo-el')}</div>`, play: 'remount', what: 'The arc fades in over one second while turning 180°, then turns every 0.86s on the published curve.', reduced: 'The arc fades in and then breathes between 40% and full opacity, so it still says it is working — the published spinner keeps turning under reduced motion; the owner’s rule is that nothing turns.' }),
    mo({ id: 'skeleton', title: 'Skeleton — the shape of what is loading', tokens: ['motion-skeleton-shimmer'], stage: `<div class="mo-skel mo-el"><span class="skeleton" style="width:40%"></span><span class="skeleton"></span><span class="skeleton" style="width:70%"></span></div>`, play: 'remount', what: 'Each block breathes between the skeleton colour and its subtler step every 1.5s, in place. Nothing sweeps across it.', reduced: 'Unchanged: it changes a colour in place.' }),
    mo({ id: 'popup', title: 'Popup — a dropdown menu opening and closing', tokens: ['motion-popup-enter-bottom', 'motion-popup-exit-bottom'], stage: `<div style="position:relative;height:100%">${menu}</div>`, play: 'pair:motion-popup-enter-bottom:motion-popup-exit-bottom', what: 'It slides up 8px and fades in over 150ms on the everyday entrance curve, and leaves in 100ms — an exit is always faster than an entrance.', tall: true }),
    mo({ id: 'flag', title: 'Flag — arriving, then dismissed', tokens: ['motion-flag-enter', 'motion-flag-exit'], stage: `<div style="position:relative;height:100%">${flag}</div>`, play: 'pair:motion-flag-enter:motion-flag-exit', what: 'It slides in from half its width to the left and fades, 250ms on the bold curve, and slides 15% away in 200ms when dismissed.', tall: true }),
    mo({ id: 'modal', title: 'Modal dialog — with its blanket', tokens: ['motion-blanket-enter', 'motion-modal-enter', 'motion-modal-exit', 'motion-blanket-exit'], stage: `<div style="position:relative;height:100%">${modal}</div>`, play: 'pair:motion-modal-enter:motion-modal-exit', what: 'The blanket fades in over 250ms while the dialog scales from 95% on the in-out curve; leaving, both take 200ms.', tall: true }),
    mo({ id: 'drawer', title: 'Drawer — entering from the right, and leaving', tokens: ['motion-blanket-enter', 'motion-panel-enter', 'motion-panel-exit', 'motion-blanket-exit'], stage: `<div style="position:relative;height:100%;overflow:hidden">${drawerStage}</div>`, play: 'pair:motion-panel-enter:motion-panel-exit', what: 'The blanket fades in while it slides in from fully off the right edge over 250ms on the bold curve; it slides out in 200ms.', tall: true }),
    mo({ id: 'pane', title: 'Record pane — the next record replacing the last', tokens: ['motion-panel-content-enter', 'motion-panel-content-exit'], stage: `<div style="position:relative;height:100%">${pane}</div>`, play: 'pair:motion-panel-content-enter:motion-panel-content-exit', what: 'The pane stays where it is beside the list; its content fades out in 50ms and the next record’s fades in over 150ms after a 100ms pause. Nothing slides, because the pane did not move.', tall: true }),
    mo({ id: 'section', title: 'Section expanding — a navigation group', tokens: ['motion-section-expand', 'motion-chevron', 'motion-panel-content-enter'], stage: section, play: 'section', what: 'Composed: the system publishes no token for a section opening. Its height eases open over 200ms on the in-out curve, the chevron turns in 150ms, and the items fade in as the panel content does.', reduced: 'The height and the chevron cut; the items crossfade in.', tall: true }),
    mo({ id: 'tag', title: 'Tag — a filter added, then removed', tokens: ['motion-label-enter', 'motion-label-exit'], stage: tag, play: 'pair:motion-label-enter:motion-label-exit', what: 'It scales in along its width from 80% and fades, 150ms; removed, it scales out to nothing in 100ms.' }),
    mo({ id: 'toggle', title: 'Toggle — the knob crossing', tokens: ['motion-toggle-knob', 'motion-toggle-track'], stage: toggle, play: 'toggle', what: 'The knob crosses in 200ms on the everyday curve while the track changes colour — the published toggle’s own transition.', reduced: 'The knob cuts across; the track colour still eases.' }),
    mo({ id: 'progress', title: 'Progress bar — the fill growing', tokens: ['motion-progress-fill'], stage: progress, play: 'progress', what: 'Composed: the fill eases to its new width over 200ms, so a jump from 31% to 64% is seen as growth.', reduced: 'The fill cuts to its new width.' }),
  ];

  const toggleRow = `<div class="mo-controls"><label class="check-row"><button class="toggle" type="button" role="switch" aria-checked="false" id="mo-reduce"><span class="knob"></span></button>Reduce motion on this page</label><p class="mo-os" id="mo-os" hidden>Your device asks for reduced motion, so every specimen below is already the reduced set.</p></div>`;
  const table = `<div class="tbl-wrap"><table class="dsx-t full"><thead><tr><th>Token</th><th>As published</th><th>Under reduced motion</th></tr></thead><tbody>${[...T.MOTION_TOKENS, ...T.EXTRA_MOTION].filter(([n]) => !n.startsWith('motion-keyframe-')).map(([n, v]) => `<tr><td><code>--${esc(n)}</code></td><td>${esc(short(v))}</td><td>${n in RED ? esc(short(RED[n])) : '<span class="muted">unchanged</span>'}</td></tr>`).join('')}</tbody></table></div>`;

  return `<p class="lede">Every motion the product makes, named by its token and played here. The published system ships ${T.MOTION_TOKENS.filter(([n]) => !n.startsWith('motion-keyframe-')).length} motion tokens and ${T.KEYFRAMES.length} keyframes; the product uses ${specimens.length} motions from them, ${T.EXTRA_MOTION.length} composed from their durations and curves where they publish nothing. Interactions stay under 150ms, transitions between 150 and 400ms, and an exit is always faster than its entrance. Under reduced motion nothing travels, turns or scales: an entrance or exit crossfades, a transform cuts, and a colour changing in place is unchanged — the switch below shows the same page that way.</p>
${sample('Reduced motion — the switch, and what your device says', toggleRow)}
<div id="mo" class="mo-grid">${specimens.join('\n')}</div>
${note(`<p><strong>The published system cuts under reduced motion; the owner allows a crossfade.</strong> Their guidance says motion is off and instant when reduced motion is on. The owner’s rule of 17 September is that nothing moves — and a fade moves nothing — so an entrance keeps its duration and curve and drops its slide or scale. The reduced set is built only from their durations, their curves and their two fade keyframes, and the tokens carry it: <code>@media (prefers-reduced-motion: reduce)</code> redefines every motion token, and <code>[data-motion="reduce"]</code> does the same for a region — the switch above sets it on the page’s body.</p>`, 'Reduced motion')}
${sample('Every motion token, as published and as reduced', table)}
${note('<p>A replay is the same element leaving and arriving again — the page holds no state, and nothing is stored. Each specimen names the token it plays; the motion gate reads the played animation back from the page and checks it against the token, in both conditions.</p>')}`;
}

// the page's own script: replay buttons, the reduce switch, the device's own setting
export const MOTION_JS = `
(function () {
  var root = document.getElementById('mo'); if (!root) return;
  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var os = document.getElementById('mo-os'); if (os && mq.matches) os.hidden = false;
  var sw = document.getElementById('mo-reduce');
  if (sw) sw.addEventListener('click', function () { var on = sw.getAttribute('aria-checked') !== 'true'; sw.setAttribute('aria-checked', on ? 'true' : 'false'); if (on) document.body.setAttribute('data-motion', 'reduce'); else document.body.removeAttribute('data-motion'); });
  function ms(el) { var c = getComputedStyle(el); var d = c.animationDuration.split(',').concat(c.transitionDuration.split(',')); var dl = c.animationDelay.split(',').concat(c.transitionDelay.split(',')); var m = 0; for (var i = 0; i < d.length; i++) { var t = parseFloat(d[i]) * (/ms/.test(d[i]) ? 1 : 1000) + parseFloat(dl[i] || 0) * (/ms/.test(dl[i] || '') ? 1 : 1000); if (t > m) m = t; } return m; }
  function reflow(el) { void el.offsetWidth; }
  var plays = {
    remount: function (s) { var els = s.querySelectorAll('.mo-el'); for (var i = 0; i < els.length; i++) { var c = els[i].cloneNode(true); els[i].parentNode.replaceChild(c, els[i]); } },
    pair: function (s, els, a) { var enter = a[0], exit = a[1]; var wait = 0;
      els.forEach(function (el) { el.classList.remove('mo-out'); el.style.setProperty('--mo-enter', 'var(--' + (el.classList.contains('mo-blanket') ? enter.replace(/modal|panel/, 'blanket') : enter) + ')'); el.style.setProperty('--mo-exit', 'var(--' + (el.classList.contains('mo-blanket') ? exit.replace(/modal|panel/, 'blanket') : exit) + ')'); el.classList.remove('mo-in'); reflow(el); el.classList.add('mo-in'); wait = Math.max(wait, ms(el)); });
      setTimeout(function () { els.forEach(function (el) { el.classList.remove('mo-in'); el.classList.add('mo-out'); }); var w2 = 0; els.forEach(function (el) { w2 = Math.max(w2, ms(el)); });
        setTimeout(function () { els.forEach(function (el) { el.classList.remove('mo-out'); }); }, w2 + 400); }, wait + 1400); },
    hover: function (s, els) { els.forEach(function (el) { el.classList.add('is-hover'); }); setTimeout(function () { els.forEach(function (el) { el.classList.add('is-pressed'); }); }, 700); setTimeout(function () { els.forEach(function (el) { el.classList.remove('is-pressed'); }); }, 1100); setTimeout(function () { els.forEach(function (el) { el.classList.remove('is-hover'); }); }, 1700); },
    toggle: function (s, els) { els.forEach(function (el) { var on = el.getAttribute('aria-checked') === 'true'; el.setAttribute('aria-checked', on ? 'false' : 'true'); }); },
    progress: function (s, els) { els.forEach(function (el) { var i = el.querySelector('i'); var now = +el.getAttribute('aria-valuenow'); var next = now === 31 ? 64 : 31; el.setAttribute('aria-valuenow', next); i.style.setProperty('--w', next + '%'); }); },
    section: function (s) { var h = s.querySelector('.nav-h'); var open = h.getAttribute('aria-expanded') === 'true'; h.setAttribute('aria-expanded', open ? 'false' : 'true'); if (!open) { var list = s.querySelector('.mo-list'); list.classList.remove('mo-in'); reflow(list); list.classList.add('mo-in'); } }
  };
  var specs = root.querySelectorAll('.mo');
  for (var i = 0; i < specs.length; i++) (function (s) {
    var play = s.getAttribute('data-play').split(':'); var kind = play[0]; var args = play.slice(1);
    var els = Array.prototype.slice.call(s.querySelectorAll('.mo-el'));
    if (kind === 'pair') els.forEach(function (el) { el.style.setProperty('--mo-enter', 'var(--' + (el.classList.contains('mo-blanket') ? args[0].replace(/modal|panel/, 'blanket') : args[0]) + ')'); el.style.setProperty('--mo-exit', 'var(--' + (el.classList.contains('mo-blanket') ? args[1].replace(/modal|panel/, 'blanket') : args[1]) + ')'); });
    var btn = s.querySelector('[data-replay]'); if (btn) btn.addEventListener('click', function () { plays[kind](s, els, args); });
    if (kind === 'toggle' || kind === 'section') { var t = s.querySelector('.toggle, .nav-h'); if (t) t.addEventListener('click', function () { plays[kind](s, els, args); }); }
  })(specs[i]);
})();
`;

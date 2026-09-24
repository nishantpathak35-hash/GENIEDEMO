// pages/overview.mjs — a project's Overview (19 September 2026): the project's Today, in the same card language as
// the firm's. Also the state a link to a switched-off module draws, and the Getting-started tab on Today.
// The project is ANU-01, the seed's first: every figure is what the seeded product computes for it.
import * as L from '../shell.mjs';
import * as S from '../patterns.mjs';
import * as PANELS from '../panels.mjs';
import { hrefFor } from '../files.mjs';
const { esc, fmt, pill, icon, card, stat, hero, notice, money, R } = L;

const OPEN = L.OPEN_PROJECT;
const SEED = L.SEED;
// the project's money, three ways: contract, ordered so far, billed to the client so far (its tax invoices, gross)
const BILLED = L.add('0', ...SEED.INVOICES.filter(i => i.project === OPEN.code).map(i => i.total));
const pctOf = (part, whole) => L.pct(part, whole);
const bar = (label, pct) => ({ kind: 'ratio', label, pct: Math.min(100, pct) });

const overviewHead = (p, sub) => S.pageHead({ crumbs: [p.code], title: 'Overview', sub, actions: `<button class="btn" type="button">${icon('doc')}Project report</button>`, primary: `<button class="btn primary" type="button">${icon('plus')}Raise an order</button>` });

// the project's one thing, in the product's order of urgency: nothing on ANU-01 waits on an approval and it is
// inside its contract, so the hero is ordered so far — with what does wait, on the client and on site, in the sentence
export function projectOverview(code = L.OPEN) {
  const p = OPEN; if (code !== OPEN.code) throw new Error(`overview: only ${OPEN.code} is drawn`);
  const orderedPct = pctOf(p.committed, p.contract), billedPct = pctOf(BILLED, p.contract);
  const waiting = L.BLOCKED.filter(b => b.project === p.code);
  const pendingCo = L.VARIATIONS.find(v => v.state === 'pending_client');
  const openIssues = SEED.ISSUES.filter(i => i.project === p.code && i.open);
  const blocking = openIssues.filter(i => i.severity === 'blocking');
  const rep = [...SEED.DAILY_REPORTS].filter(r => r.project === p.code).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const onSite = rep.manpower.reduce((n, m) => n + m.headCount, 0);
  const heroBlock = hero({
    eyebrow: `${p.code} · ${L.TODAY_LONG}`, value: fmt(p.committed),
    text: `Ordered so far — <b>${orderedPct.toFixed(0)}%</b> of the contract, ${waiting.length === 0 ? 'nothing waiting on an approval' : `${waiting.length} waiting on an approval`}. <b>${pendingCo.number}</b> is with <b>${esc(p.clientShort)}</b> for sign-off, and one site issue is <b>blocking</b>: ${esc(blocking[0].title.split(' — ')[0].toLowerCase())}.`,
    delta: `<b>${orderedPct.toFixed(0)}%</b> of ${fmt(p.contract)} · ${p.orders} orders`,
    actions: `<a href="#" class="btn primary lg">Open the issue</a><a href="#" class="btn lg">Remind ${esc(L.CLIENT_LOGIN.first)}</a>`,
  });
  // the grid (19 September): the hero at 12; four tiles — ordered and billed, margin at risk on this project, unsigned
  // variations on this project, payables this week on this project; then milestones (absent: no stage carries a
  // date) beside site this week; then money in and out for this project at 8 beside the team at 4. One form per
  // fact; what Today answers at the firm level is not repeated here with the same number — on the seed every bill is
  // this project's, so its payables tile coincides with the firm's, which is the seed and not a repeat.
  const tiles = PANELS.tilesRow([PANELS.orderedBilledTile(p), PANELS.marginTile({ project: p.code }), PANELS.unsignedTile({ project: p.code }), PANELS.payablesTile({ project: p.code })]);
  return overviewHead(p, `${esc(p.name)} — what on it needs you, then the rest`) + `<div class="grid"><div data-hero class="c12">${heroBlock}</div>` + tiles + PANELS.milestonesCard({ project: p.code }) + PANELS.siteCard({ project: p.code }) + PANELS.moneyInOut({ project: p.code }) + PANELS.teamCard() + '</div>';
}

// a link to a page whose module this firm has turned off: not found, never refused — there is nothing to be refused
export function moduleOff(code = 'KRA-01') {
  return S.pageHead({ crumbs: [code], title: 'Not found' }) + `<div data-hero>${L.empty('not-found', 'There is no such page here', `Stock is not one of the features ${esc(L.TENANT.short)} has turned on, so this address has nothing behind it. If your firm keeps stock, an administrator can turn the feature on under Settings › Modules; until then nothing on it exists to show.`, `<a href="#" class="btn primary">Back to ${esc(code)}</a>`, { secondary: '<a href="#" class="btn">Configure features</a>' })}</div>`;
}

// Getting started: a tab on Today with the setup checklist, until it is done
const STEPS = [
  ['Company details', 'Legal name, address, the logo on every document', true],
  ['GSTIN and TAN', 'The registrations every tax invoice and deduction is made under', true],
  ['Numbering', 'How orders, invoices and vouchers are numbered — a prefix and a series per financial year', true],
  ['People', 'Invite the team; each signs in with their work email', true],
  ['First project', 'Code, client, contract value — the switcher fills from here', true],
  ['Import vendors', 'From an Excel list, with their GSTINs and agreed rates', false],
  ['Connect Tally', 'Install the connector on the machine that runs Tally', false],
];
export function gettingStarted() {
  const done = STEPS.filter(s => s[2]).length;
  const tick = (on) => `<span class="tick ${on ? 'on' : ''}" aria-hidden="true">${on ? icon('check', 'i sm') : ''}</span>`;
  const list = `<ol>${STEPS.map(([n, d, on]) => `<li class="${on ? 'done' : ''}">${tick(on)}<div><b>${esc(n)}</b><small>${esc(d)}</small></div>${on ? '<span class="status">Done</span>' : `<a href="#" class="btn ${n === 'Import vendors' ? 'primary' : ''}">${n === 'Connect Tally' ? 'Install' : 'Import'}</a>`}</li>`).join('')}</ol>`;
  return card('Get set up', list, { actions: `<div class="actions">${L.CH.progress(done / STEPS.length * 100, { text: `${done} of ${STEPS.length} done` })}<button class="btn ghost" type="button">Hide for now</button></div>`, cls: 'setup' });
}
export const GETTING_STARTED_DONE = STEPS.filter(s => s[2]).length;
export const GETTING_STARTED_STEPS = STEPS.length;

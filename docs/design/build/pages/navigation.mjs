// pages/navigation.mjs — section 3, the navigation (19 September 2026).
//
// Two navigations, one shell. The top bar is the same everywhere: the product's mark over the sidebar column,
// the project switcher, recent history, search scoped to the page, and on the right the tenant, the quick-create
// square, the bell, the gear and the person. Picking a project in the switcher CHANGES the sidebar — from the
// firm's functions to that project's lifecycle — and every list, search and quick-create inside follows. This
// page draws the shell at every width, both trees, the switcher in every state, the edge states a link can land
// on, and the mapping table: every route the product has, its level, the module and action that gate it, and
// what a link to a hidden entry draws.
import * as L from '../shell.mjs';
import * as S from '../patterns.mjs';
import * as N from '../nav.mjs';
import { hrefFor } from '../files.mjs';
import { ordersScreen, ordersScreenPane, todayHead, todayAll, todayAnu2, stateBlock } from './navigation-screens.mjs';
import { projectOverview, moduleOff } from './overview.mjs';
const { esc, fmt, pill, icon, card, stat, notice, sample, note, shell } = L;

// ---------------------------------------------------------------- value lines for this section --
// One sentence on the canonical render of the two levels; every other sample here is the same shell in another
// state, so each is an explicit ruling with no line of its own.
Object.assign(L.VALUE_LINES, {
  'Navigation · the same list inside SAN-01': 'Pick the project once in the morning, and the whole app becomes that project — its sidebar, its lists, its search, its quick-create — until you step back out to All projects.',
  'Navigation · Buying › Orders across all projects': null,
  'Navigation · the two trees': null,
  'Navigation · the switcher, open': null,
  'Navigation · on a phone': null,
  'Navigation · the quick-create menu': null,
  'Navigation · recent history': null,
  'Navigation · the rail': null,
  'Navigation · Overview inside ANU-02': null,
  'Navigation · a link to a project you are not on': null,
  'Navigation · a link to a project that is not there': null,
  'Navigation · a link to a module that is off': null,
  'Navigation · the server cannot be reached': null,
});

const kv = (pairs) => `<dl class="dsx-kv">${pairs.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
const navSpec = (title, opts, text) => `<div><h4 class="lbl">${title}</h4><aside class="side nav-spec${opts.rail ? ' rail-spec' : ''}" aria-label="${esc(title)}"><nav class="side-nav" aria-label="Main">${L.sideNav(opts)}</nav></aside><p class="ps">${text}</p></div>`;
const OPEN = L.OPEN_PROJECT; const P = L.PEOPLE;
const short = (code) => S.idOf(code).slice(0, 8) + '…';   // an id in prose: its first eight characters, the way the product shows one it cannot name

// ---------------------------------------------------------------- the mapping table --
const LEVEL = { firm: 'Firm', project: 'Project', both: 'Both', neither: 'Neither' };
function mappingTable() {
  let group = null;
  const rows = N.ROUTES.map(r => {
    const dest = r.nav === 'neither' ? 'Reached from a list, a bell or a link — never from the sidebar' : r.nav === 'both' ? 'Pinned at both levels' : r.nav === 'firm' ? 'The firm’s sidebar' : 'The project’s sidebar';
    const g = dest !== group ? `<tr class="group"><td colspan="7">${esc(dest)}</td></tr>` : '';
    group = dest;
    return g + `<tr${r.twin ? ' class="twin"' : ''}><td><code>${esc(r.route)}</code>${r.twin ? pill('active', 'new') : ''}</td><td>${esc(r.name)}</td><td><span class="scls ${r.nav}">${LEVEL[r.nav]}</span></td><td>${r.module === '—' ? '—' : `<code>${esc(r.module)}</code>`}</td><td>${r.action === '—' ? '—' : `<code>${esc(r.action)}</code>`}</td><td>${esc(r.presented)}</td><td class="why">${N.hiddenDraws(r)}${r.note ? `<small class="svw">${esc(r.note)}</small>` : ''}</td></tr>`;
  }).join('');
  return `<div class="tbl-wrap"><table class="tbl scope-t map-t"><thead><tr><th>Route</th><th>Name</th><th>Level</th><th>Module</th><th>Action</th><th>Drawn as</th><th>A link to it when hidden</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function navigation() {
  const n = N.NAV_COUNTS;
  if (N.SHIPPED !== 58 || N.ROUTES.length !== 58 + N.NEW_ROUTES.length) throw new Error(`section 3: ${N.SHIPPED} shipped routes, ${N.ROUTES.length} rows`);
  const modules = new Set(N.ROUTES.map(r => r.module).filter(m => m !== '—'));

  // the two levels, on the list that shows the difference best
  const allOrders = shell(ordersScreen(null), { current: '/buying', label: 'Buying · Orders · all projects', who: P.proc.first, role: P.proc.role, url: '/purchase-orders' });
  const kestOrders = shell(ordersScreen('SAN-01'), { current: '/buying', label: 'Orders · SAN-01', who: P.proc.first, role: P.proc.role, scope: 'SAN-01', url: `/projects/${S.idOf('SAN-01')}/orders` });
  const popOpen = shell(ordersScreen('SAN-01'), { current: '/buying', label: 'Orders · SAN-01 · the switcher open', who: P.proc.first, role: P.proc.role, scope: 'SAN-01', url: `/projects/${S.idOf('SAN-01')}/orders`, scopePop: S.scopePopover({ current: 'SAN-01', active: 'SAN-01' }) });
  const newOpen = shell(ordersScreen('SAN-01'), { current: '/buying', label: 'Orders · SAN-01 · the quick-create menu open', who: P.proc.first, role: P.proc.role, scope: 'SAN-01', url: `/projects/${S.idOf('SAN-01')}/orders`, newOpen: true });
  const historyOpen = shell(ordersScreen(null), { current: '/buying', label: 'Buying · Orders · recent history open', who: P.proc.first, role: P.proc.role, url: '/purchase-orders', historyOpen: true });

  // the shell at three widths: the same screen at the web, as a rail, and on a phone
  const rail = `<div class="nav-railbox">${shell(ordersScreenPane(), { current: '/buying', label: `Buying · ${L.DEMO_PO} · Money opened from the rail`, who: P.proc.first, role: P.proc.role, url: `/purchase-orders/${L.DEMO_PO}`, navFly: 'money' })}</div>`;
  const reports = [...L.SEED.DAILY_REPORTS].filter(r => r.project === L.OPEN).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3).map(r => [L.dayDate(r.date), String(r.manpower.reduce((n, m) => n + m.headCount, 0)), String(L.SEED.ISSUES.filter(i => i.project === L.OPEN && i.open).length)]);
  const phoneReports = S.pageHead({ crumbs: [L.OPEN, 'Build'], title: 'Site', sub: `${L.OPEN} · last filed ${L.dueWord(L.dayFrom(-1)).toLowerCase()}`, primary: `<button class="btn primary" type="button">${icon('plus')}File today’s report</button>` })
    + `<div data-hero>${S.listView({ label: 'Daily reports', toolbar: false, select: false, cols: [{ label: 'Day', p: 1 }, { label: 'On site', p: 2, num: true }, { label: 'Issues', p: 1, num: true }], rows: reports.map(([d, p, i]) => ({ name: d, cells: [`<a href="#">${esc(d)}</a>`, p, i] })), pager: L.pager({ from: 1, to: 3, total: 31, page: 1, pages: 11, unit: 'reports' }) })}</div>`;
  const phoneA = shell(phoneReports, { current: '/site', label: `Site · ${L.OPEN}`, who: P.finance.first, role: P.finance.role, scope: L.OPEN, phone: true, url: `/projects/${S.idOf(L.OPEN)}/site` });
  const phoneB = shell(phoneReports, { current: '/site', label: `Site · ${L.OPEN} · the sheet open`, who: P.finance.first, role: P.finance.role, scope: L.OPEN, phone: true, url: `/projects/${S.idOf(L.OPEN)}/site`, overlay: S.scopeSheet({ current: L.OPEN }) });

  // the two trees, standalone
  const trees = `<div class="nav-specs">
${navSpec('The firm — first visit, on Today', { current: '/', label: 'Today', open: [] }, 'Function: Today and Approvals pinned, then Sales, Projects, Buying, Site, Money as sections, and Reports. A folded section shows the total that needs attention inside it. Rate analysis has moved to Sales: pricing happens before award.')}
${navSpec('The firm — Buying opened by hand', { current: '/buying', label: 'Buying · Orders', open: ['buying'] }, 'The open section is tinted, its pages indented, and the current page a pill with a <b>+</b> that raises that module’s new thing — here an order.')}
${navSpec('Inside ANU-01 — first visit, on Overview', { current: '/', label: 'Overview · ANU-01', scope: 'ANU-01', open: [] }, 'Lifecycle: ◂ All projects, the project’s block — code, name, state, client, contract — then Overview and Design, Build, Commercial, People, Close. Approvals stays pinned at the foot, firm-wide, because the queue other people are waiting on never hides.')}
${navSpec('Inside ANU-01 — arrived on Orders', { current: '/buying', label: 'Orders · ANU-01', scope: 'ANU-01', open: ['build'] }, 'Build opened on its own, because the page you are on is never hidden. The pill’s <b>+</b> raises an order on ANU-01 without asking which project.')}
${navSpec('The operator', { current: '/operator', label: 'Organisations', app: 'operator' }, 'The operator app has its own tree — Organisations, Provisioning, Activity — under the same bar, whose switcher chooses a tenant rather than a project.')}
</div>`;

  const TREE_ROWS = [
    ['Firm · Today', 'Pinned', 'The one screen anyone opens without being sent there.', 'Overview takes its slot'],
    ['Firm · Approvals', 'Pinned, with its count', 'The queue other people are waiting on, so never folded away.', 'Pinned at the foot, still firm-wide'],
    ['Firm · Sales', 'Pipeline · Leads · Rate analysis', 'Winning work. Rate analysis is pricing, which happens before there is a project to put it in.', 'Absent — a project is already won'],
    ['Firm · Projects', 'All projects · Documents', 'The chooser and the firm’s vault.', 'Absent — you are inside one'],
    ['Firm · Buying', 'Orders · Vendors · Agreed rates · Stock', 'Getting materials to site at the rate agreed. Its lists carry a Project column and filter.', 'Orders and Stock become the project’s own; Vendors and Agreed rates stay the firm’s'],
    ['Firm · Site', 'Daily reports · Measurements & imprest', 'What happened on site, across every site.', 'Site, Recce and Milestones under Build'],
    ['Firm · Money', 'Bills · Payments · Tax deducted · Client billing · Retention', 'What comes in, what goes out, what is held.', 'Bills and Client billing become the project’s own; the rest stays the firm’s'],
    ['Firm · Reports', 'Reports Center', 'Every report the firm runs, grouped, with favourites.', 'A project’s Reports twin, filtered to it'],
    ['Project · Overview', 'The project’s Today', 'The one thing on it that needs you, then contract against ordered against billed.', '—'],
    ['Project · Design', 'Brief · Design · Drawings · Selections · Joinery', 'What is being made.', '—'],
    ['Project · Build', 'BOQ · Takeoff · Orders · Site · Recce · Milestones · Stock', 'What it costs and what has happened on site.', '—'],
    ['Project · Commercial', 'Commercials · Variations · Client actions · Bills · Client billing', 'The money on this project, both directions.', '—'],
    ['Project · People', 'Team · Timesheets', 'Who is on it and their hours.', '—'],
    ['Project · Close', 'Handover · Warranty', 'Leaving it well.', '—'],
    ['Both · Configure features', 'Settings › Modules', 'The foot of both trees: which modules this firm has turned on — the nav is generated from them.', '—'],
  ];
  const treeTable = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Entry</th><th>Holds</th><th>Why</th><th>Inside a project</th></tr></thead><tbody>${TREE_ROWS.map(([e, h, why, sc]) => `<tr><td><b>${esc(e)}</b></td><td>${esc(h)}</td><td class="why">${esc(why)}</td><td>${esc(sc)}</td></tr>`).join('')}</tbody></table></div>`;

  // the edges
  const anu2 = shell(todayAnu2(), { current: '/', label: 'Overview · ANU-02 · handed over', scope: 'ANU-02', url: `/projects/${S.idOf('ANU-02')}`, banner: '' });
  const refusedFrame = shell(todayHead(null, '', { name: P.proc.first, acts: false }) + stateBlock('bad', 'You don’t have access to this project', 'The link names a project you are not on the team of, so none of it is shown here — not its name, not a figure. Ask the project’s lead to add you, or work across all projects.', `<a href="#" class="btn primary lg">Work across all projects</a>`),
    { current: '/', label: 'Today · a project this person cannot open', who: P.proc.first, role: P.proc.role, url: `/projects/${S.idOf('NCB-02')}`, held: 'Not available' });
  const missingFrame = shell(todayHead(null, '', { acts: false }) + stateBlock('warn', 'We can’t find that project', `Nothing in ${L.TENANT.short} has the project this link names — it may have been copied only in part. Nothing about any project has been shown.`, `<a href="#" class="btn primary lg">All projects</a>`),
    { current: '/', label: 'Today · a project that is not there', who: P.admin.first, role: P.admin.role, url: '/projects/4d1e7a90-0c2b-4f55-9d18-3e6b2a7c5f01', held: 'No such project' });
  const offFrame = shell(moduleOff('SAN-01'), { current: '/', label: 'Not found · SAN-01 · a module that is off', who: P.proc.first, role: P.proc.role, scope: 'SAN-01', url: `/projects/${S.idOf('SAN-01')}/stock` });
  const offlineFrame = shell(S.pageHead({ crumbs: ['SAN-01', 'Build'], title: 'Orders' }) + stateBlock('bad', 'We can’t reach Construct-O-Genie right now', 'Nothing was saved. The project in this link is kept in the address, so trying again brings back exactly this screen.', `<button class="btn primary lg" type="button">${icon('refresh')}Try again</button>`, 'unreachable'),
    { current: '/buying', label: 'Orders · SAN-01 · the server cannot be reached', who: P.proc.first, role: P.proc.role, scope: 'SAN-01', url: `/projects/${S.idOf('SAN-01')}/orders` });

  const deltas = [
    ['Nav from modules × roles', 'The sidebar is generated: an entry whose module is off is not drawn, one whose action the role lacks is not drawn. Today the nav is a static list in <code>apps/web</code>.'],
    ['Per-person preferences', 'Sidebar open or closed, sections folded, the last project opened, single-key shortcuts on or off. One small store on the server; nothing in the browser.'],
    ['The project-level twins', `${N.NEW_ROUTES.length} routes that do not exist: ${N.NEW_ROUTES.filter(r => r.route.startsWith('/projects/')).map(r => `<code>${esc(r.route.replace('/projects/[projectId]', '…'))}</code>`).join(' · ')}, and the terminology page.`],
    ['A Project column and filter', 'On every firm-level list that does not have one yet — Bills, Stock, Documents, Client billing, Daily reports.'],
    ['Search scoped to the page and project', 'The placeholder says what it searches; the server has one search endpoint that takes a scope.'],
    ['Recent history', 'The last twenty records this person opened, kept on the server.'],
    ['Reports Center data', 'The groups, counts and favourites on 11 · Reports.'],
    ['Getting-started state', 'Which of the seven setup steps a tenant has completed.'],
    ['Terminology per tenant', 'BOQ or Estimate, Variation or Change order — one setting, read by every label.'],
  ];

  return `<p class="lede">Two navigations, one shell. The top bar is the same on every screen of every app: the product’s mark over the sidebar column, then the project switcher, recent history and a search scoped to the page; on the right the tenant, a square that creates, the bell, the gear and you. Picking a project in the switcher <strong>changes the sidebar</strong>. At the firm level it is the firm’s functions — Sales, Projects, Buying, Site, Money. Inside a project it is that project’s lifecycle — Design, Build, Commercial, People, Close — and every list, search and quick-create inside is the project’s. <code>?project=</code> survives only as a saved-view filter on the firm’s lists.</p>

${sample('Navigation · Buying › Orders across all projects — the firm’s list, with a Project column', allOrders)}
${sample('Navigation · the same list inside SAN-01 — the sidebar changed, the Project column went, the address is the project’s', kestOrders)}
${note(`<p>Five things change. The <strong>sidebar</strong> becomes the project’s: ◂ All projects, the project’s block, then its lifecycle. The <strong>address</strong> is the project’s own — <code>/projects/${short('SAN-01')}/orders</code>, the id in the URL and the code on the screen. The <strong>title</strong> keeps the saved view’s name and the crumb carries the project; the window reads <em>Orders · SAN-01</em>. The <strong>Project column</strong> and its filter go, because every row is the project’s. <strong>Quick-create</strong> pre-fills the project and <strong>search</strong> scopes to it: <em>Search in Orders · SAN-01</em>. Nothing else moves: the same columns, the same pane, the same primary at the same edge.</p>`)}

${sample('Navigation · the two trees — the firm’s functions, and a project’s lifecycle', trees)}
${card('Which entries are where, and why', treeTable, { sub: `firm: 2 pinned · 5 sections · Reports — project: Overview · 5 sections — both: Configure features · Collapse` })}
<div class="two even">
${card('The top bar, left to right', `<div class="card-b">${kv([
  ['The brand column', `200px, the sidebar’s width, ending in a 1px divider darker than the bar. A line-drawn mark and the product’s name at 17px medium. Under 1000px it is the rail’s 48px and the name goes; under 640px the menu button takes its place.`],
  ['The switcher', '<em>All projects ▾</em>, or the code and the name’s first clause: <em>SAN-01 · Workplace refresh ▾</em>. On the lifted fill, 34px, no border. Never a neutral grey on the navy: one navy and one lifted navy.'],
  ['Recent history', 'A clock. Opens the last twenty records this person opened, newest first, with the project each is on.'],
  ['Search', '300 × 34 on the lifted fill with a 1px hairline, a magnifier and a scope chevron. The placeholder is the page’s: <em>Search in Orders ( / )</em>, and inside a project <em>Search in Orders · SAN-01 ( / )</em>. The slash is text, not a boxed key.'],
  ['Demo organisation', 'A caution-coloured word when the tenant is a demo, so nobody types a real order into it.'],
  ['The tenant', 'Its name; a chevron only when this person belongs to more than one.'],
  ['The square', '32 × 32 on the brand’s mark colour with a white plus, radius 4. <em>New · C</em> on hover; the menu on click, grouped by section, the project pre-filled inside one.'],
  ['The bell, the gear, you', 'The bell with its count. The gear opens the settings hub — Settings has left the sidebar. A 28px circle with your initial on the tenant’s accent; no chevron.'],
])}</div>`)}
${card('The sidebar, top to bottom', `<div class="card-b">${kv([
  ['Rows', '38px, an icon on every entry, a ▸ on every section. The open section is tinted and its pages indented.'],
  ['The current page', 'A pill in the brand’s bold blue with white text, and a <b>+</b> on it for that module’s quick-create — the same thing the square offers, one click nearer.'],
  ['Inside a project', '◂ All projects, then the project’s block: code, name, its state, the client and the contract. The block is the scope, said in words.'],
  ['The foot', 'Approvals, pinned firm-wide inside a project. Configure features, which is Settings › Modules. Collapse, which folds the sidebar to its 48px rail and is remembered per person.'],
  ['Under 1000px', 'The rail: icons only, sections opening beside it. Under 640px: behind the menu button, as a sheet.'],
  ['What left', 'The <em>firm</em> chips beside the firm’s pages inside a project — the tree says it now. The × on the switcher — the way out is ◂ All projects. Settings — the gear.'],
])}</div>`)}
</div>

${sample('Navigation · the switcher, open — Recent, Mine, All active, and Finished folded away', popOpen)}
<div class="dsx-grid">
<div><h4 class="lbl">Typing narrows it — code, project or client</h4>${S.scopePopover({ current: 'SAN-01', filter: 'anu', active: 'ANU-02', standalone: true })}</div>
<div><h4 class="lbl">Nothing matches — and what cannot be opened is never listed</h4>${S.scopePopover({ current: 'SAN-01', filter: 'zen', standalone: true })}</div>
</div>
${note(`<p><strong>The menu.</strong> A search, then <em>All projects</em>, then Recent — the projects this person opened last, newest first — then Mine, then All active, then Finished folded with its count. Each row is code, name and client. The footer is <em>All projects</em> and <em>New project</em>. Sign-in lands at All projects, on the firm’s Today, with the remembered project first under Recent; nothing opens a project on its own.</p><p><strong>Where it lives.</strong> Second in the top bar, after the mark and before the search — not at the top of the sidebar. Under 640px the sidebar folds into a menu, and a switcher inside it would be two taps from every screen. The bar is the one strip that never folds.</p>`)}

${sample('Navigation · on a phone — the code in the bar, and a sheet the height of the screen', `<div class="dsx-grid phones">${phoneA}${phoneB}</div>`)}
${sample('Navigation · the rail, with a record open beside the list — a section opens beside it', rail)}
${sample('Navigation · the quick-create menu — grouped by section, the project pre-filled', newOpen)}
${sample('Navigation · recent history — the last records this person opened', historyOpen)}

<div class="dsx-flow">
${card('The shell by keyboard', `<div class="card-b">${kv([
  ['<kbd>/</kbd>', 'Focus the search, scoped to the page. The placeholder says so.'],
  ['<kbd>Shift</kbd>+<kbd>?</kbd>', 'The shortcut sheet.'],
  ['<kbd>N</kbd>', 'The primary action on this page — the same thing the blue button does.'],
  ['<kbd>C</kbd>, then a key', 'Quick-create: <kbd>C</kbd> <kbd>O</kbd> an order, <kbd>C</kbd> <kbd>B</kbd> a bill, <kbd>C</kbd> <kbd>P</kbd> a project — the letters shown in the menu.'],
  ['<kbd>P</kbd>', 'Open the switcher. Under the same off switch as every other single key (WCAG 2.1.4), in Settings › Your preferences › Keyboard.'],
  ['<kbd>Tab</kbd>', 'The skip link, then the mark, the switcher, history, search, then the right group, then the sidebar. The order the frame draws.'],
  ['In the switcher', '<kbd>↑</kbd> <kbd>↓</kbd> move, typing narrows, <kbd>Enter</kbd> opens the project as a new history entry so Back returns, <kbd>Esc</kbd> closes and changes nothing.'],
  ['In the sidebar', 'A list of links with disclosures: <kbd>Enter</kbd> on a section opens it and does not navigate, <kbd>↑</kbd> <kbd>↓</kbd> move through what is visible, <kbd>←</kbd> <kbd>→</kbd> do nothing.'],
])}</div>`)}
${card('The address is the level', `<div class="card-b">${kv([
  ['<code>/purchase-orders</code>', 'Orders, across all projects — the firm’s list.'],
  ['<code>/purchase-orders?view=…</code>', 'A saved view of the firm’s list; <code>?project=</code> lives only inside a saved view’s criteria now.'],
  [`<code>/projects/${short('SAN-01')}/orders</code>`, 'Orders on SAN-01 — the project’s own list, the plan as a tab beside it. The id in the URL; the code on the screen, because a code is “correctable” and a link must not rot.'],
  [`<code>/projects/${short('SAN-01')}/boq</code>`, 'SAN-01 › Build › BOQ. The project is in the path; the switcher reads it from there.'],
  ['<code>/vendors</code>, inside a project', 'The firm’s list, unchanged. Vendors and Agreed rates are not the project’s, so they are reached from the firm’s tree; the sidebar says so by not listing them.'],
  [`<code>/purchase-orders/${L.DEMO_PO}</code>`, 'The order opens in <em>its</em> project’s shell. The record decides; the page says so once if the link came from elsewhere.'],
  ['A project link, signed out', 'Sign in, then the same address. Sign-in carries it through whole.'],
])}</div>`)}
</div>

<div class="dsx-sample"><h3>Every route: firm, project, both or neither</h3>
<div class="dsx-flow"><div class="stats n4">${stat('Firm', String(n.firm), { delta: 'in the firm’s sidebar' })}${stat('Project', String(n.project), { delta: 'in a project’s sidebar' })}${stat('Both', String(n.both), { delta: 'pinned at both levels' })}${stat('Neither', String(n.neither), { delta: 'reached from a list, a bell or a link' })}</div>
${card(`${N.ROUTES.length} routes`, mappingTable(), { sub: `${N.SHIPPED} shipped — 56 named in apps/web/lib/routes.ts, plus sign-in and export — and ${N.NEW_ROUTES.length} new · gated by ${modules.size} module keys from packages/contracts/src/authz.ts` })}
</div></div>
${note(`<p><strong>The nav is generated from enabled modules × role permissions.</strong> Every entry names the module key that gates it. A module that is off is not drawn, and a link to one of its pages draws <em>not found</em> — never <em>refused</em>, because a firm that has not turned on Stock has no stock to be refused. An entry whose action this role lacks is not drawn, and a link to it draws <em>refused</em>, because the thing exists and somebody else can open it. Four routes have no module: sign-in, export, the operator’s pages and the person’s own preferences.</p>`, 'The rule that sorts every row')}

${sample('Navigation · Overview inside ANU-02 — handed over, and read-only', anu2)}
${sample('Navigation · a link to a project you are not on', refusedFrame)}
${sample('Navigation · a link to a project that is not there', missingFrame)}
${sample('Navigation · a link to a module that is off — not found, never refused', offFrame)}
${sample('Navigation · the server cannot be reached — the address still holds the project', offlineFrame)}
<div class="dsx-states pairs">
<div><h4 class="lbl">The project changed while you were in it</h4>${notice('info', `ANU-02 was handed over by ${P.admin.first} at 14:20`, 'You are still looking at it, and everything on it can still be read and exported. A change you had not saved was not saved.', '<a href="#" class="btn sm">Read it</a>')}</div>
<div><h4 class="lbl">You were taken off its team</h4>${notice('bad', 'You no longer have access to SAN-01', `${P.admin.first} removed you from its team at 11:05, so its screens are closed to you now. Anything you saved before then is kept.`, '<a href="#" class="btn primary sm">All projects</a>')}</div>
<div><h4 class="lbl">Switching project with rows selected</h4>${notice('info', '2 selected orders were cleared', 'They are on ANU-01, not SAN-01. Switch back to ANU-01 to pick them up again.')}</div>
<div><h4 class="lbl">A record whose project the link got wrong</h4>${notice('info', `${L.DEMO_PO} is on ANU-01`, 'The link said SAN-01. The order is shown in its own project, and the address now says so.')}</div>
</div>
${note(`<p><strong>Handed over and closed are still projects.</strong> Both stay in the switcher under Finished and stay readable; neither drops you out. A handed-over project carries a banner saying so and what is still worked from it; a closed one says it is final — the seed has no closed project, so that state is specified here and not drawn: the same read-only screen with <em>closed on</em> in the banner and the final account as its hero. What can be done on them is not decided here: the project record already carries <code>nextStates</code>, the server’s list, and the shell draws only those.</p>`)}

${card('What a developer still cannot build from this', `<div class="card-b">${kv(deltas)}</div>`, { sub: 'recorded, not built — each is a product delta with a place to go' })}
`;
}

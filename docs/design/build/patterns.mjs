// patterns.mjs — what the scope-and-patterns pass adds: the project scope, the page header, the list with its
// detail pane beside it, the form surface, and the one set of states a list can be in.
//
// It imports lib2 only. lib4 imports this file for the switcher, and a module cycle that touches data at
// load time is a crash waiting for somebody to reorder an import.
import * as L from './vocabulary.mjs';
const { esc, pill } = L;
const icon = (name, cls = 'i') => `<span class="ico"><svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg></span>`;
const pt = (t) => `<h4 class="pt">${t}</h4>`;
// an applied filter is a removable tag: the field and the value, and a 16px button that removes it
export const removableTag = (k, v) => `<span class="tag removable"><span class="tk">${esc(k)}</span><b>${esc(v)}</b><button class="tag-x" type="button" aria-label="Remove the filter ${esc(k)}: ${esc(v)}">${icon('x', 'i sm')}</button></span>`;

// ============================================================ the projects a scope can be --
// The six fixture projects, plus one handed over and one closed, because those are two of the states the
// scope has to survive and none of the six is in either. Ids are what the URL carries: a project's code is
// "unique within the tenant. Quoted on the phone; correctable" (packages/contracts/src/api/projects.ts), and a
// correctable key in a pasted link is a link that rots.
// The six seeded projects are every scope there is: the seed has no closed project, so the closed state is
// specified, not drawn. The ids are placeholders in the product's shape (a uuid); the seed's are minted at run time.
const EXTRA = [];
const IDS = {
  'ANU-01': '3f6c2a1e-8b4d-4c2a-9e71-2d5b8a0c4f13', 'ANU-02': '0b7e4c1a-5d2f-4e8b-9a31-6c0d2f7e1b44',
  'KRA-01': 'c41d9e07-2a6b-4f3c-8d15-7e9a0b2c6d58', 'NCB-01': '7a2e5b90-1c4d-4e6f-a832-5b0d9c1e7f26',
  'NCB-02': 'e9b30c6d-4f1a-4b72-9c05-8a6e2d1f3b97', 'SAN-01': '5d8f1a24-7c3e-4b09-b6d2-1e4a9c7f0b35',
};
export const SCOPES = [...L.PROJECTS.map(p => ({ code: p.code, name: p.name, client: p.client, state: p.state, on: p.state === 'handed_over' ? L.longDate(L.SEED_DAY) : null })), ...EXTRA]
  .map(p => ({ ...p, id: IDS[p.code] }));
export const byCode = (c) => SCOPES.find(p => p.code === c);
export const idOf = (c) => IDS[c];
// the projects Shalini is on the team of — the switcher lists these first (a read the product does not have; README)
export const MINE = ['ANU-01', 'SAN-01', 'ANU-02'];
// the projects this person opened last, newest first — the remembered project is the first of them, never opened on sign-in
export const RECENT_CODES = ['ANU-01'];
const FINISHED = (p) => p.state === 'handed_over' || p.state === 'closed';
export const stateMark = (p) => p.state === 'handed_over' ? pill('ok', 'Handed over') : p.state === 'closed' ? pill('idle', 'Closed') : '';
// the project block at the head of the project-level sidebar: code, name, its state, the client and the contract
export const projectBlock = (code) => { const p = byCode(code) || { code, name: '', client: '', state: 'in_progress' }; const full = L.PROJECTS.find(x => x.code === code); return { code: p.code, name: p.name, client: p.client.replace(/ Private Limited| LLP/, ''), contract: full && full.contract !== null ? L.money(full.contract) : '<span class="num absent">—</span>', mark: stateMark(p) || pill('active', 'In progress') }; };
// the path a frame's address bar shows: the route, then the scope as the one query parameter
export const urlOf = (path, code = null, rest = '') => {
  const q = [code ? `project=${IDS[code]}` : '', rest].filter(Boolean).join('&');
  return q ? `${path}?${q}` : path;
};

// ============================================================ the switcher --
// The object switcher: the first thing in the top bar, before the search. It is a button that opens a
// dialog holding a combobox and a listbox, which is the pattern a screen reader already knows from every
// branch picker — typing filters, the arrows move, Enter chooses, Esc puts focus back on the button.
// held: the address names a project the server would not resolve — refused, missing, or unreachable — so the
// switcher holds the words the server gave, on a dashed edge, and never a code it could not look up
export function scopeTrigger(code = null, { open = false, pop = '', held = '' } = {}) {
  const p = code && !held ? byCode(code) : null;
  const aria = held ? `${held}. Choose a project` : p ? `Working in ${p.code}, ${p.name}. Change project` : 'Working across all projects. Choose a project';
  const label = held ? `<span class="sc t">${esc(held)}</span>` : p ? `<span class="sc">${esc(p.code)}</span><span class="sn">· ${esc(p.name.split(',')[0])}</span>` : '<span class="sc">All projects</span>';   // the name's first clause; the menu carries the whole name
  return `<div class="scope${p || held ? ' on' : ''}${held ? ' held' : ''}"><button class="scope-btn" type="button" aria-haspopup="dialog" aria-expanded="${open}" aria-label="${esc(aria)}">${icon(p ? 'projects' : 'layers')}${label}${icon('chevron', 'i sm')}</button>`
    + `${pop}</div>`;   // the way back is the sidebar's “All projects”, not an × here (19 September)
}

// The list inside the switcher. On your team first, then everything else you can see, then — folded —
// what is handed over or closed. Typing searches all three, codes, names and clients alike.
function scopeOptions({ current, filter, active, showFinished }) {
  const f = filter.toLowerCase();
  const match = (p) => !f || [p.code, p.name, p.client].some(s => s.toLowerCase().includes(f));
  const hl = (s) => { const i = f ? s.toLowerCase().indexOf(f) : -1; return i < 0 ? esc(s) : `${esc(s.slice(0, i))}<mark>${esc(s.slice(i, i + f.length))}</mark>${esc(s.slice(i + f.length))}`; };
  const opt = (p) => `<div role="option" id="scope-o-${p.code}" class="opt${active === p.code ? ' active' : ''}" aria-selected="${current === p.code}"><span class="oc">${hl(p.code)}</span><span class="on">${hl(p.name)}<small>${hl(p.client)}</small></span>${FINISHED(p) ? stateMark(p) : ''}${current === p.code ? icon('check', 'i sm') : ''}</div>`;
  const group = (id, title, list) => list.length ? `<div role="group" aria-labelledby="scope-g-${id}"><div class="og" id="scope-g-${id}">${title}</div>${list.map(opt).join('')}</div>` : '';
  const live = SCOPES.filter(p => !FINISHED(p));
  const recent = !f ? live.filter(p => RECENT_CODES.includes(p.code)).sort((a, b) => RECENT_CODES.indexOf(a.code) - RECENT_CODES.indexOf(b.code)) : [];
  const mine = live.filter(p => MINE.includes(p.code) && !recent.includes(p) && match(p));
  const rest = live.filter(p => !MINE.includes(p.code) && !recent.includes(p) && match(p));
  const done = SCOPES.filter(p => FINISHED(p) && match(p));
  const allOpt = !f ? `<div role="option" id="scope-o-all" class="opt all${active === 'all' ? ' active' : ''}" aria-selected="${current === null}"><span class="oc">${icon('layers', 'i sm')}</span><span class="on">All projects<small>${SCOPES.length} projects you can see</small></span>${current === null ? icon('check', 'i sm') : ''}</div>` : '';
  const shown = mine.length + rest.length + (f || showFinished ? done.length : 0);
  const list = shown === 0 && f
    ? `<p class="scope-none" role="status">No project matches “${esc(filter)}”.<small>Codes, project names and clients are searched. A project you cannot open is not listed.</small></p>`
    : `<div class="scope-list" role="listbox" id="scope-list" aria-label="Projects">${allOpt}${group('recent', 'Recent', recent)}${group('mine', 'Mine', mine)}${group('rest', 'All active', rest)}${f || showFinished ? group('done', 'Finished', done) : ''}</div>`;
  const more = !f && !showFinished ? `<div class="scope-more"><button class="link-btn" type="button">Finished · ${SCOPES.filter(FINISHED).length}</button></div>` : '';
  return { list, more, active: active === 'all' ? 'scope-o-all' : active ? `scope-o-${active}` : '' };
}
const scopeQuery = (filter, activeId) => `<div class="search">${icon('search')}<input type="search" role="combobox" aria-expanded="true" aria-controls="scope-list" aria-autocomplete="list"${activeId ? ` aria-activedescendant="${activeId}"` : ''} aria-label="Find a project" placeholder="Code, project or client"${filter ? ` value="${esc(filter)}"` : ''}></div>`;

export function scopePopover({ current = null, filter = '', active = null, showFinished = false, standalone = false } = {}) {
  const o = scopeOptions({ current, filter, active: active ?? current ?? 'all', showFinished });
  return `<div class="scope-pop page-theme${standalone ? ' static' : ''}" role="dialog" aria-label="Choose a project"><div class="scope-q">${scopeQuery(filter, o.active)}</div>${o.list}${o.more}`
    + `<div class="scope-foot"><a href="#">All projects</a><a href="#" class="scope-new">${icon('plus', 'i sm')}New project</a></div></div>`;
}

// On a phone the same list is a full-height sheet: the rows are touch height and the search is 16px, so
// the browser does not zoom on focus.
export function scopeSheet({ current = null, filter = '' } = {}) {
  const o = scopeOptions({ current, filter, active: null, showFinished: false });
  return `<div class="psheet" role="dialog" aria-modal="true" aria-labelledby="psheet-t"><div class="psheet-h"><b id="psheet-t">Work in</b><button class="btn icon ghost" type="button" aria-label="Close, and stay where you are">${icon('x')}</button></div><div class="psheet-q">${scopeQuery(filter, o.active)}</div>${o.list}${o.more ? `<div class="psheet-f">${o.more}</div>` : ''}</div>`;
}

// ============================================================ the page header --
// One header for every screen. Crumbs above; the title, its status and the actions on one row, with the
// actions on the right and the primary action last; one line under it, or the record's key facts; then
// the tabs. A screen does not get to put its actions anywhere else.
export function pageHead({ crumbs = [], title, status = '', sub = '', facts = null, actions = '', primary = '', more = false, tabs = '' }) {
  const crumb = crumbs.length ? `<nav class="pgh-c" aria-label="Breadcrumb"><ol>${crumbs.map(c => `<li><a href="#">${c}</a></li>`).join('')}</ol></nav>` : '';
  const acts = actions || more || primary
    ? `<div class="pgh-a">${actions}${more ? `<button class="btn icon" type="button" aria-haspopup="menu" aria-label="More actions">${icon('more')}</button>` : ''}${primary}</div>` : '';
  const fx = facts ? `<dl class="pgh-f">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>` : '';
  return `<header class="pgh">${crumb}<div class="pgh-t">${pt(title)}${status}</div>${acts}${sub ? `<p class="ps">${sub}</p>` : ''}${fx}${tabs}</header>`;
}
// the crumbs a screen carries: the scope first when there is one, then the destination
export const crumbsFor = (scope, ...rest) => [...(scope ? [esc(scope)] : []), ...rest];

// ============================================================ the list --
// One list pattern. Toolbar (search, filters, the column control, export); the filters that are on, as
// chips; the table with sortable headers and a checkbox column; the bulk bar, after the table in the DOM
// and above it on screen; the pager with the count. A row opens its record in a pane BESIDE the list, and
// the list stays live — the arrows move the open row. The overlay drawer is kept for a step in a flow.
//
// Columns carry a priority. 1 is identity or the decision and never drops; 2 is money or status; 3 is
// reference, and a priority-3 cell folds into the row's detail line when the list is narrow — which it
// is whenever a record is open beside it. Beside a record the list keeps number, status and amount as
// columns (19 September 2026); only reference folds.
export function listView(o) {
  const { search = '', filters = [], chips = [], cols, rows = [], select = true, bulk = null, pager = '', colsOpen = false, exportBtn = true, body = null, pane = '', label = 'List', toolbar = true, head = true } = o;
  const colsPop = colsOpen ? `<div class="cols-pop" role="dialog" aria-label="Columns"><p class="cols-h">Show these columns</p><ul>${cols.map(c => `<li><label${c.p === 1 ? ' class="lock"' : ''}><span class="ico"><input type="checkbox" checked${c.p === 1 ? ' disabled' : ''}></span><span>${esc(c.label)}</span>${c.p === 1 ? `${icon('lock', 'i sm')}<small>always shown</small>` : ''}</label></li>`).join('')}${(o.extraCols || []).map(c => `<li><label><span class="ico"><input type="checkbox"></span><span>${esc(c)}</span></label></li>`).join('')}</ul><div class="cols-f"><button class="link-btn" type="button">Back to the default columns</button></div></div>` : '';
  const tb = toolbar ? `<div class="toolbar lv-tb">${search ? `<div class="search">${icon('search')}<input type="search" aria-label="${esc(search)}" placeholder="${esc(search)}"></div>` : ''}${filters.map(([k, v]) => `<button class="fbtn${v ? ' on' : ''}" type="button" aria-haspopup="dialog"><span>${esc(k)}: <b>${esc(v || 'All')}</b></span>${icon('chevron', 'i sm')}</button>`).join('')}<span class="spacer"></span><div class="colwrap">${pane ? `<button class="btn icon" type="button" aria-haspopup="dialog" aria-expanded="${colsOpen}" aria-label="Columns">${icon('columns')}</button>` : `<button class="btn" type="button" aria-haspopup="dialog" aria-expanded="${colsOpen}">${icon('columns')}Columns</button>`}${colsPop}</div>${exportBtn ? (pane ? `<button class="btn icon" type="button" aria-label="Export">${icon('download')}</button>` : `<button class="btn" type="button">${icon('download')}Export</button>`) : ''}</div>` : '';
  const ch = chips.length ? `<div class="chips"><span class="chips-l">Filtered by</span>${chips.map(([k, v]) => removableTag(k, v)).join('')}<button class="btn sm ghost" type="button">Clear all</button></div>` : '';
  const cls = (c) => [c.num ? 'num' : '', c.p === 3 ? 'p3' : '', c.p === 2 ? 'p2' : '', c.check ? 'check' : '', c.clip ? 'clipc' : ''].filter(Boolean).join(' ');
  const th = (c) => c.sort === undefined || c.sort === false
    ? `<th${cls(c) ? ` class="${cls(c)}"` : ''}>${c.clip ? `<span class="sr-only">Attachment</span>${icon('paperclip', 'i sm')}` : esc(c.label)}</th>`
    : `<th${cls(c) ? ` class="${cls(c)}"` : ''}${c.sort ? ` aria-sort="${c.sort}"` : ''}><button class="sort" type="button">${esc(c.label)}${c.sort ? icon(c.sort === 'ascending' ? 'up' : 'down', 'i sm') : icon('sort', 'i sm off')}</button></th>`;
  const thead = head ? `<thead><tr>${select ? '<th class="check"><input type="checkbox" aria-label="Select every row on this page"></th>' : ''}${cols.map(th).join('')}</tr></thead>` : '';
  const idCol = Math.max(0, cols.findIndex(c => c.p === 1));   // the folded detail line hangs under the identity column, wherever it sits
  const tr = (r) => `<tr class="row-link${r.open ? ' open' : ''}${r.mine ? ' mine' : ''}"${r.open ? ' aria-current="true"' : ''}>${select ? `<td class="check"><input type="checkbox"${r.sel ? ' checked' : ''} aria-label="Select ${esc(r.name || 'this row')}"></td>` : ''}${r.cells.map((cell, i) => `<td${cls(cols[i]) ? ` class="${cls(cols[i])}"` : ''}>${cell}${i === idCol && r.alt ? `<span class="sub alt">${r.alt}</span>` : ''}${i === idCol && r.altPane ? `<span class="sub alt-pane">${r.altPane}</span>` : ''}</td>`).join('')}</tr>`;
  const table = body ?? `<div class="tbl-wrap"><table class="tbl lv-t">${thead}<tbody>${rows.map(tr).join('')}</tbody></table></div>`;
  const bb = bulk ? `<div class="bulkbar" role="region" aria-label="Selection"><span class="n"><b>${bulk.n}</b> selected</span><div class="ba">${bulk.actions}</div><button class="btn sm ghost" type="button">Clear selection</button></div>` : '';
  const list = `<section class="card lv-list" aria-label="${esc(label)}">${tb}${ch}${table}${bb}${pager}</section>`;
  return `<div class="lv${pane ? ' with-pane' : ''}">${list}${pane}</div>`;
}

// The record, beside the list. Its own header — the identity, its status, and the two ways out: the full
// page, and closing. Its facts, then whatever the record holds, then its actions docked at the foot.
export function pane({ title, status = '', sub = '', body, actions = '', back = 'Back to the list' }) {
  return `<aside class="pane" aria-label="${esc(title.replace(/<[^>]+>/g, ''))}"><div class="pane-h"><a class="pane-back link-btn" href="#">${icon('left', 'i sm')}${esc(back)}</a><div><h5 class="pane-t">${title}${status}</h5>${sub ? `<small>${sub}</small>` : ''}</div><a class="btn icon ghost" href="#" aria-label="Open the full page">${icon('expand', 'i sm')}</a><button class="btn icon ghost" type="button" aria-label="Close the record">${icon('x', 'i sm')}</button></div><div class="pane-b">${body}</div>${actions ? `<div class="pane-f">${actions}</div>` : ''}</aside>`;
}

// ============================================================ the form --
// One form pattern. Labels above their controls; a required field carries the asterisk, in ink and never
// in red, because a rule stated before anything has gone wrong is not an error; the hint under the
// control until an error takes its place; sections with a heading and one sentence; and the footer docked
// to the bottom of the surface — the destructive action alone on the left, Cancel then the primary on
// the right, the primary labelled with its verb.
export const formLegend = () => `<p class="flegend"><span aria-hidden="true">*</span> required</p>`;
export const fsection = (title, text, fieldsHtml, cols = 1) => `<fieldset class="fsec"><legend class="fsec-h">${esc(title)}</legend>${text ? `<p class="fsec-t">${text}</p>` : ''}<div class="fgrid${cols === 2 ? ' c2' : ''}">${fieldsHtml}</div></fieldset>`;
export const formFoot = ({ save, cancel = 'Cancel', danger = '', note = '' }) => `<div class="ffoot">${danger}<span class="spacer"></span>${note ? `<span class="ffoot-n">${note}</span>` : ''}<button class="btn" type="button">${esc(cancel)}</button><button class="btn primary" type="submit">${save}</button></div>`;

// ============================================================ the scope, route by route --
// The whole of apps/web/lib/routes.ts — 56 named routes — plus the two the manifest does not list because
// they are not screens a person navigates to by name: sign-in, and the export route handler. 58.
// [pattern, name, destination, scope, why, what the server does with a project today]
// scope:  'scoped' — means nothing without a project
//         'tenant' — belongs to the firm; a scope is carried through it but never narrows it
//         'both'   — the firm's list in All projects, one project's inside a scope
// server: 'path'   — the project is in the path already
//         'yes'    — the list route reads a project filter today (file:line)
//         'no'     — the route reads no project; a filter has to be added
//         'blocked'— the data model holds no project to filter on
//         'na'     — nothing to filter
export const ROUTE_SCOPE = [
  ['/', 'Today', 'Today', 'both', 'The first screen. Across projects it leads with the most urgent thing anywhere; inside one, with that project’s.', 'no', 'today/* read only <code>weeks</code>'],
  ['/notifications', 'Notifications', 'Today', 'tenant', 'An interruption is about something owed to you, wherever it is. A scope never hides it.', 'na', ''],
  ['/crm/board', 'Pipeline', 'Sales', 'tenant', 'A lead is work before a project exists. There is nothing to scope it to.', 'na', ''],
  ['/crm', 'Leads', 'Sales', 'tenant', 'The same leads as a list.', 'na', ''],
  ['/crm/[leadId]', 'A lead', 'Sales', 'tenant', 'Pre-project. Its handover creates the project, and the link it leaves opens that project in scope.', 'na', ''],
  ['/projects', 'All projects', 'Projects', 'tenant', 'The list of projects is the chooser itself, so it is never narrowed to one. Inside a scope, Projects in the sidebar opens that project.', 'na', ''],
  ['/estimation', 'Rate analysis', 'Projects', 'tenant', 'The rate library by trade is the firm’s, priced before any project buys against it.', 'na', ''],
  ['/documents', 'Documents', 'Projects', 'both', 'A drawing or a letter belongs to a project, so the vault should narrow with the scope.', 'blocked', '<code>workflow.documents</code> has no project column; <code>listDocuments</code> takes no query'],
  ['/projects/[projectId]', 'Overview', 'Project', 'scoped', 'The project’s own page. The path carries it.', 'path', ''],
  ['/projects/[projectId]/team', 'Team', 'Project', 'scoped', 'Who is on this project.', 'path', ''],
  ['/projects/[projectId]/timesheets', 'Timesheets', 'Project', 'scoped', 'Hours booked to this project.', 'path', ''],
  ['/projects/[projectId]/brief', 'Brief', 'Project', 'scoped', 'This client’s brief.', 'path', ''],
  ['/projects/[projectId]/design', 'Design', 'Project', 'scoped', 'This project’s design deliverables.', 'path', ''],
  ['/projects/[projectId]/drawings', 'Drawings', 'Project', 'scoped', 'This project’s drawing register.', 'path', ''],
  ['/projects/[projectId]/selections', 'Selections', 'Project', 'scoped', 'Finishes chosen for this site.', 'path', ''],
  ['/projects/[projectId]/joinery', 'Joinery', 'Project', 'scoped', 'This project’s joinery schedule.', 'path', ''],
  ['/projects/[projectId]/boq', 'BOQ', 'Project', 'scoped', 'A bill of quantities is one contract’s.', 'path', ''],
  ['/projects/[projectId]/boq/[itemId]', 'A BOQ line', 'Project', 'scoped', 'One line of that bill.', 'path', ''],
  ['/projects/[projectId]/takeoff', 'Takeoff', 'Project', 'scoped', 'Quantities measured off this project’s drawings.', 'path', ''],
  ['/projects/[projectId]/procurement', 'Orders', 'Project', 'scoped', 'What this BOQ still needs bought — the plan, not the order list.', 'path', ''],
  ['/projects/[projectId]/site', 'Site', 'Project', 'scoped', 'This site’s day card.', 'path', ''],
  ['/projects/[projectId]/recce', 'Recce', 'Project', 'scoped', 'The survey of this site.', 'path', ''],
  ['/projects/[projectId]/milestones', 'Milestones', 'Project', 'scoped', 'This contract’s milestones.', 'path', ''],
  ['/projects/[projectId]/commercials', 'Commercials', 'Project', 'scoped', 'This contract’s agreement and value.', 'path', ''],
  ['/projects/[projectId]/change-orders', 'Variations', 'Project', 'scoped', 'A variation changes one contract and means nothing outside it.', 'path', ''],
  ['/projects/[projectId]/client-actions', 'Client actions', 'Project', 'scoped', 'What this client owes a decision on.', 'path', ''],
  ['/projects/[projectId]/handover', 'Handover', 'Project', 'scoped', 'This project’s handover.', 'path', ''],
  ['/projects/[projectId]/warranty', 'Warranty', 'Project', 'scoped', 'This project’s defects period.', 'path', ''],
  ['/purchase-orders', 'Orders', 'Buying', 'both', 'An order is raised against a project or against stock. Inside a scope, stock orders stay under All projects.', 'yes', '<code>projectId</code> — procurement/src/api/routes.ts:157'],
  ['/purchase-orders/[id]', 'An order', 'Buying', 'both', 'The record decides. An order on a project opens in that project whatever the link said; a stock order opens in All projects.', 'na', 'the order carries its <code>projectId</code>, or null'],
  ['/vendors', 'Vendors', 'Buying', 'tenant', 'A vendor works for the firm across projects. Its orders on one project are a filter on its page, not a scope.', 'na', ''],
  ['/vendors/[vendorId]', 'A vendor', 'Buying', 'tenant', 'The same vendor, one record.', 'na', ''],
  ['/vendors/rate-contracts', 'Agreed rates', 'Buying', 'tenant', 'A rate is agreed with a vendor for the firm, before any project uses it.', 'na', ''],
  ['/inventory', 'Stock', 'Buying', 'both', 'Stock sits in stores. A project’s site store narrows; the central store stays under All projects.', 'no', 'reads <code>q</code>, <code>warehouse</code>, <code>belowReorder</code> — a store, not a project'],
  ['/site-reports', 'Daily reports', 'Site', 'both', 'A report is filed from one site. Across projects the question is which sites have not filed.', 'yes', '<code>projectId</code> — siteops/src/api/routes.ts:106'],
  ['/site-controls', 'Measurements and imprest', 'Site', 'scoped', 'Measurement sheets and site cash are kept per project. With no project there is only a choice to make.', 'path', '<code>listMeasurements</code> and <code>listImprest</code> are <code>/:projectId</code> routes'],
  ['/tasks', 'Tasks', 'Approvals', 'both', 'A task is about one project or about none. Inside a scope the list narrows; a task about nothing stays under All projects.', 'no', 'reads <code>assignedTo</code>, <code>due</code>, <code>status</code>'],
  ['/approvals', 'Approvals', 'Approvals', 'tenant', 'The queue is what is waiting on you, on every project. A scope narrows what you browse, never what you owe.', 'na', ''],
  ['/money/bills', 'Bills', 'Money', 'both', 'A bill is against an order, and the order is a project’s or stock’s. What is due this week is asked both ways.', 'no', 'reads <code>view</code> only — procurement/src/api/routes.ts:1063'],
  ['/money/payments', 'Payments', 'Money', 'both', 'A voucher pays one bill or releases one holding. Inside a scope: what left the bank for this project.', 'no', 'host/src/api/money.ts:91 reads paging only'],
  ['/money/tds', 'Tax deducted', 'Money', 'tenant', 'The challan and 26Q are the firm’s, filed under its TAN by month and quarter. A project has no challan.', 'na', ''],
  ['/money/client-billing', 'Client billing', 'Money', 'both', 'An invoice is raised on one project’s contract.', 'no', 'the service can filter (<code>projectIds</code>, finance/…/client-invoices.ts:356); host/src/api/money.ts:239 does not pass it'],
  ['/retention', 'Retention', 'Money', 'both', 'Retention is held per order, so per project. What is held in total is asked both ways.', 'no', 'host/src/api/money.ts:161 reads paging only; procurement’s own <code>/retention</code> reads <code>projectId</code>'],
  ['/settings', 'Settings', 'Settings', 'tenant', 'Settings are the firm’s.', 'na', ''],
  ['/settings/company', 'Company', 'Settings', 'tenant', 'The firm’s legal identity.', 'na', ''],
  ['/settings/tax', 'Tax', 'Settings', 'tenant', 'The firm’s GSTIN and TAN.', 'na', ''],
  ['/settings/people', 'People', 'Settings', 'tenant', 'Everyone in the firm. A project’s people are its Team tab.', 'na', ''],
  ['/settings/roles', 'Roles', 'Settings', 'tenant', 'What each role may do, firm-wide.', 'na', ''],
  ['/settings/modules', 'Modules', 'Settings', 'tenant', 'What the firm has switched on.', 'na', ''],
  ['/settings/number-series', 'Numbering', 'Settings', 'tenant', 'One gapless series per document, for the firm.', 'na', ''],
  ['/settings/trade-packages', 'Trade packages', 'Settings', 'tenant', 'The firm’s trades.', 'na', ''],
  ['/settings/approvals', 'Approval steps', 'Settings', 'tenant', 'One chain of steps for the firm.', 'na', ''],
  ['/settings/inventory', 'Stock locations', 'Settings', 'tenant', 'A store can be a site’s, but the list of stores is the firm’s.', 'na', ''],
  ['/settings/vendor-access', 'Vendor access', 'Settings', 'tenant', 'Who outside the firm can sign in as a vendor.', 'na', ''],
  ['/settings/client-access', 'Client access', 'Settings', 'tenant', 'It grants a client to projects, so it lists projects rather than sitting inside one.', 'na', ''],
  ['/settings/audit', 'Activity log', 'Settings', 'tenant', 'The firm’s record of every change.', 'na', ''],
  ['/sign-in', 'Sign in', 'Outside the frame', 'tenant', 'Before there is a scope. A signed-out link keeps its whole address, scope included, through sign-in.', 'na', ''],
  ['/export/[list]', 'Export', 'Outside the frame', 'both', 'An export is the list it was pressed on — same scope, same filters, same sort. Never the whole firm by surprise.', 'na', 'carries the list’s query'],
];
export const SCOPE_COUNTS = ROUTE_SCOPE.reduce((m, r) => (m[r[3]] = (m[r[3]] || 0) + 1, m), {});

// ============================================================ upgrading the older screens --
// Parts 4 to 14 were drawn before the patterns existed, with their own header and toolbar markup. Rather
// than retype twenty-one headers and a dozen toolbars — and miss one — the build rewrites that markup into
// the patterns, screen by screen, and counts what it rewrote. A screen written with the patterns already is
// untouched, because nothing in it matches.
const OLD_HEAD = /<div class="page-head"><div>(?:<p class="crumb">([\s\S]*?)<\/p>)?<h4 class="pt ?">([\s\S]*?)<\/h4>(?:<p class="ps">([\s\S]*?)<\/p>)?<\/div>(?:<div class="actions">([\s\S]*?)<\/div>)?<\/div>/g;
const BTN = /<(button|a)\b[^>]*class="btn[^"]*"[^>]*>[\s\S]*?<\/\1>/g;
const textOf = (h) => h.replace(/<[^>]+>/g, '').trim();
export function upgrade(html, counts = { heads: 0, toolbars: 0, exportsMoved: 0, projectFiltersDropped: 0 }) {
  const screens = html.split(/(<main class="page">[\s\S]*?<\/main>)/);
  const out = screens.map(seg => {
    if (!seg.startsWith('<main class="page">')) return seg.replace(OLD_HEAD, (m, crumb, title, sub, acts) => head(m, crumb, title, sub, acts, false));
    const hasList = /<div class="toolbar[ "]/.test(seg);
    let s = seg.replace(OLD_HEAD, (m, crumb, title, sub, acts) => head(m, crumb, title, sub, acts, hasList));
    s = s.replace(/<div class="toolbar">([\s\S]*?)<div class="spacer"><\/div>([\s\S]*?)<\/div>(?=<div class="tbl-wrap">|<ul class|<div class="bulkbar"|<div class="chips"|<ol class)/g, (m, left, right) => {
      counts.toolbars++;
      let filters = left.replace(/<div class="field"><label for="[^"]*">([^<]*)<\/label><select[^>]*>([\s\S]*?)<\/select>(?:<span class="hint">[^<]*<\/span>)?<\/div>/g, (fm, label, opts) => {
        if (/^(Project|Site)$/.test(label.trim())) { counts.projectFiltersDropped++; return ''; }
        const sel = /<option value="[^"]*"\s+selected>([^<]*)<\/option>/.exec(opts);
        return `<button class="fbtn${sel ? ' on' : ''}" type="button" aria-haspopup="dialog"><span>${label}${sel ? `: <b>${sel[1]}</b>` : ''}</span>${icon('chevron', 'i sm')}</button>`;
      });
      return `<div class="toolbar lv-tb">${filters}<span class="spacer"></span><div class="colwrap"><button class="btn" type="button" aria-haspopup="dialog" aria-expanded="false">${icon('columns')}Columns</button></div>${EXPORT}</div>`;
    });
    return s;
  });
  function head(m, crumb, title, sub, acts, hasList) {
    counts.heads++;
    const crumbs = crumb ? crumb.split(/\s*›\s*/).map(textOf).filter(Boolean) : [];
    let status = '', line = sub || '';
    const lead = /^\s*(<span class="pill[^"]*">[\s\S]*?<\/span>)\s*(?:&nbsp;)?\s*/.exec(line);
    if (lead) { status = lead[1]; line = line.slice(lead[0].length); }
    const buttons = acts ? acts.match(BTN) || [] : [];
    let primary = '', rest = [];
    for (const b of buttons) {
      if (hasList && textOf(b) === 'Export') { counts.exportsMoved++; continue; }
      if (/class="btn primary/.test(b) && !primary) primary = b; else rest.push(b);
    }
    return pageHead({ crumbs, title, status, sub: line, actions: rest.join(''), primary });
  }
  return out.join('');
}
const EXPORT = `<button class="btn" type="button">${icon('download')}Export</button>`;

// pages/patterns.mjs — the patterns: the page header, the list, the five states of a list, the form, density, and the
// record of what was taken from Salesforce Lightning, Atlassian and Ant Design and what was refused.
//
// Specimens here are drawn in plain frames, not app screens: a pattern is not a screen, so it carries no
// hero and no value line. Every screen in parts 6 to 14 is built from these same functions.
import * as L from '../shell.mjs';
import * as S from '../patterns.mjs';
import { hrefFor } from '../files.mjs';
const { esc, fmt, pill, icon, card, notice, sample, note, labelOf2, V2, pager, R, field, moneyField, notes, choice } = L;
Object.assign(L.VALUE_LINES, { 'Pattern · the page header': null, 'Pattern · the list': null, 'Pattern · the six states': null, 'Pattern · the form': null });

const plain = (html, extra = '') => `<div class="dsx-frame web pattern${extra}"><div class="pat">${html}</div></div>`;
const kv = (pairs) => `<dl class="dsx-kv">${pairs.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;

// the three orders awaiting approval on the demo's morning that the pattern draws: the demo's own, and the seed's two oldest
const ORDERS = [
  [L.PO_DEMO.number, L.PO_DEMO.vendor.short, L.OPEN, L.PO_DEMO.raised, 'pending_approval', L.PO_DEMO.gross, false],
  ...L.BLOCKED.filter(b => b.days >= 9).map(b => [b.number, L.SEED.vendorByKey(L.SEED.orderByNumber(b.number).vendor).short, b.project, L.SEED_DAY, 'pending_approval', b.amount, false]),
];
const COLS = [{ label: 'Order', p: 1, sort: false }, { label: 'Project', p: 3 }, { label: 'Vendor', p: 3 }, { label: 'Raised', p: 3, num: true, sort: 'descending' }, { label: 'Status', p: 2 }, { label: 'Total', p: 2, num: true, sort: null }, { label: 'Rates', p: 1 }];
const orderRows = (sel = []) => ORDERS.map(([no, v, p, raised, st, gross, dev]) => ({
  name: no, sel: sel.includes(no),
  cells: [`<a href="#">${no}</a>`, esc(p), esc(v), raised, labelOf2(V2.po, st), fmt(gross), dev ? pill('warn', 'Above agreed rate') : '<span class="muted">Within agreed rates</span>'],
  alt: `${esc(p)} · ${esc(v)} · ${raised}`,
}));

function states() {
  const head = `<thead><tr><th>Order</th><th>Vendor</th><th class="num">Total</th></tr></thead>`;
  const tb = (withChips = false) => `<div class="toolbar lv-tb"><div class="search">${icon('search')}<input type="search" aria-label="Number or vendor" placeholder="Number or vendor"></div><button class="fbtn${withChips ? ' on' : ''}" type="button" aria-haspopup="dialog"><span>Status${withChips ? ': <b>Draft</b>' : ''}</span>${icon('chevron', 'i sm')}</button></div>${withChips ? L.chips([['Status', 'Draft'], ['Vendor', 'Himanil Air Systems']]) : ''}`;
  const block = (label, html) => `<div><h4 class="lbl">${label}</h4><section class="card lv-list" aria-label="${esc(label)}">${html}</section></div>`;
  return `<div class="dsx-states">
${block('Loading — the table itself, with its header', tb() + L.skeleton(3, [['Order', ''], ['Vendor', ''], ['Total', 'num']]))}
${block('Empty — nothing exists yet', L.empty('orders', 'No orders yet', 'Raise the first one here, or from any project’s BOQ.', `<button class="btn primary" type="button">${icon('plus')}Raise an order</button>`))}
${block('No result — a filter excluded everything', tb(true) + L.emptyFiltered('search', 'No orders match these two filters', 'Himanil has no draft orders. Widen the status, or drop the vendor.', '<button class="btn primary" type="button">Clear both filters</button>') + pager({ from: 0, to: 0, total: 0, unit: 'orders', filtered: 41 }))}
${block('Error — the list could not be read', tb(true) + `<div class="card-b">${notice('bad', 'The orders could not be loaded', 'Something went wrong on our side. Your filters are kept, so trying again brings back the same list.', `<button class="btn primary" type="button">${icon('refresh')}Try again</button><button class="btn" type="button">${icon('copy')}Copy details for support</button>`)}</div>`)}
${block('Refused — this person may not see it', `<div class="card-b">${notice('bad', 'You can’t see orders from here', 'Your role doesn’t include purchase orders. Ask an administrator if that should change — they can do it in Settings › Roles.', `<button class="btn" type="button">${icon('copy')}Copy details for support</button>`)}</div>`)}
${block('Unreachable — the server did not answer', tb() + `<div class="card-b">${L.unreachable()}</div>`)}
</div>`;
}

export function patterns() {
  const listHead = S.pageHead({ crumbs: ['SAN-01', 'Buying'], title: 'Orders', sub: `${L.POS.filter(o => o.project === 'SAN-01').length} orders on SAN-01 · ${L.BLOCKED.filter(b => b.project === 'SAN-01').length} waiting for approval`, primary: `<button class="btn primary" type="button">${icon('plus')}Raise an order</button>`, tabs: L.subtabs(['Orders', 'Vendors', 'Agreed rates', 'Stock'], 'Orders') });
  const recordHead = S.pageHead({
    crumbs: [L.OPEN, 'Buying', 'Orders'], title: L.PO_DEMO.number, status: labelOf2(V2.po, 'pending_approval'),
    facts: [['Vendor', L.PO_DEMO.vendor.short], ['Project', L.OPEN], ['Raised', `${L.TODAY_SHORT} · ${L.PEOPLE.proc.name}`], ['Total', fmt(L.PO_DEMO.gross)], ['Waiting at', 'Pending Approval · step 1 of 1']],
    actions: `<button class="btn" type="button">${icon('download')}PDF</button><button class="btn" type="button">Send to vendor</button>`, more: true,
    primary: `<button class="btn primary" type="button">${icon('check')}Approve</button>`,
    tabs: L.tabs(['Lines', 'Approval', 'Bills', 'Activity'], 'Lines'),
  });
  const fullList = S.listView({
    label: 'Orders', search: 'Number or vendor', filters: [['Status', 'Waiting for approval'], ['Vendor', '']], chips: [['Status', 'Waiting for approval']],
    cols: COLS, rows: orderRows(['PO-0019', 'PO-0006']), colsOpen: true, extraCols: ['Raised by', 'Needed by'],
    bulk: { n: 2, actions: `<button class="btn sm" type="button">${icon('download')}Export these 2</button><button class="btn sm" type="button">Remind the approvers</button>` },
    pager: pager({ from: 1, to: 3, total: 3, unit: 'orders', filtered: 41 }),
  });
  const form = S.pageHead({ crumbs: ['Money', 'Client billing'], title: 'Raise an invoice', sub: 'the GST, its heads and the number come back from the server — you give the value and where the site is' })
    + `<form class="fsurface" onsubmit="return false"><div class="fs-b">${notice('bad', 'This invoice was not raised', 'Nothing was saved. One field needs an answer first, and it is marked below.')}${S.formLegend()}`
    + S.fsection('What it bills', 'The project decides the client and the contract it is billed against.', choice('i-proj', 'Project', L.PROJECTS.map(p => [p.code, `${p.code} · ${p.name}`]), 'SAN-01').replace('>Project</label>', '>Project<span class="req" aria-hidden="true">*</span></label>').replace('<select ', '<select required ') + notes('i-desc', 'What it bills', 2, 'Optional. Appears on the invoice under the line.'))
    + S.fsection('The amount', '', `${moneyField('i-tax', 'Taxable value', '13,40,000.00', 'Before GST.', true)}${field('i-pos', 'Site’s state code', { value: '29', required: true, hint: 'Two digits — 29 is Karnataka. It decides CGST and SGST, or IGST.' })}`, 2)
    + S.fsection('Dates and the client', '', `${field('i-date', 'Dated', { type: 'date', value: '2026-09-16', required: true })}${field('i-exp', 'Payment expected', { type: 'date', value: '2026-10-16', required: true })}${field('i-cert', 'Work certified on', { type: 'date', hint: 'Optional.' })}${field('i-gstin', 'Client’s GSTIN', { value: '29AAKCK7781H1Z', error: 'That is 14 characters. A GSTIN is 15 — the state code, the ten characters of the PAN, then three more.' })}`, 2)
    + `</div>${S.formFoot({ save: 'Raise the invoice' })}</form>`;

  return `
<h3 class="dsx-h3" id="patterns">The patterns — one header, one list, one set of states, one form</h3>
<p class="dsx-p">Every screen in this set is built from the same five parts, so a person who has learnt one screen has learnt the product. The conventions come from Salesforce Lightning, Atlassian and Ant Design, because those are what an enterprise user has already learnt somewhere else. Since 16 September one of them also supplies the look — colour, elevation, spacing, radius, the type scale and dark mode — and the last part of this section says exactly what was taken from which system and what was refused. <span class="superseded">Until 16 September this paragraph said their look does not come with them and the palette stays our own. The owner withdrew that rule; see <a href="${hrefFor('13')}">13 · Decisions</a>, The retheme.</span></p>

${sample('Pattern · the page header — a list, then a record', plain(listHead) + plain(recordHead))}
${card('The header, part by part', `<div class="card-b">${kv([
  ['Crumbs', 'Above the title. The project first when there is a scope, then the destination, then the list a record came from. Ancestors only — the page itself is the title.'],
  ['Title and status', 'The title, then the record’s status as its pill on the same line. A list has no status. The title is never a sentence.'],
  ['Actions', 'On the title’s row, right-aligned, centred on it. Secondary actions first, then <em>More</em> when there are more than two, then the one primary action, always last. A screen has at most one primary action in its header. On a phone the actions move under the line below the title, in the same order.'],
  ['The line under', 'One line for a list — the count and what it is counted against. A record replaces it with its facts: up to five, the ones a person checks before acting, with the money figure among them when there is one.'],
  ['Tabs', 'Last. A destination’s tabs are the segmented control; a record’s tabs are the underline. Both are part of the header, so the header’s bottom edge is the same on every screen.'],
])}</div>`)}

${sample('Pattern · the list — every control on at once', plain(fullList))}
${card('The list, part by part', `<div class="card-b">${kv([
  ['Toolbar', 'In this order: search, the filters, a space, <em>Columns</em>, <em>Export</em>. A filter is a button that names its field and, when it is on, its value. There is no project filter on any list — the switcher in the frame is the project filter.'],
  ['Applied filters', 'A row of chips under the toolbar the moment one is on, each naming its field and value, each removable, with <em>Clear all</em>. The pager then says what the list was filtered from.'],
  ['Sort', 'A button in the column header with the arrow the rows actually follow and <code>aria-sort</code> saying so. Server-side, and in the address, so a sorted list can be sent to someone.'],
  ['Columns', 'Show or hide any column except the identity column and the decision column, which are locked. The choice is kept per person, on the server — the one piece of list state not in the address, because it changes what a person sees of the records and never which records a link opens.'],
  ['Column priority', 'Every column is 1 (identity or the decision — never drops), 2 (money and status) or 3 (reference). A priority-3 column folds into the row’s detail line when the list is narrow. While a record is open beside the list, priority 2 folds as well, and the toolbar’s Columns and Export become their icons.'],
  ['Selection', 'A checkbox column. Selecting shows the bulk bar — above the table on screen, after it in the reading order — with the count and only the actions that apply to a set. It survives paging and sorting and is cleared when the scope changes, with a line saying how many rows it dropped.'],
  ['Paging', 'Fifty rows a page, never infinite scroll. The count is always stated: <em>Showing 1–50 of 4,012 orders</em>; <em>1–3 of 3, filtered from 41</em>; <em>No orders</em>, never <em>0–0 of 0</em>. The page is in the address.'],
  ['A row', 'Opens its record in a pane beside the list, not a new page. The list stays live: ↑ ↓ move the open row and the pane follows, the address names the record (<code>?order=PO-0019</code>), and the pane’s ⤢ opens the full page. Below 760px the pane takes the screen, with <em>Back to the list</em>. The sidebar folds to its rail while a record is open. The overlay drawer is kept for a step in a flow — raising an order from BOQ lines, handing a lead over — never for reading a record.'],
])}</div>`)}
${note(`<p>Drawn in full: <a href="${hrefFor('9')}">9 · Money</a>, where all five screens are a list with the record beside it, and <a href="${hrefFor('3')}">3 · Navigation</a>, where the same Orders list is drawn across all projects and inside one.</p>`)}

${sample('Pattern · the six states of a list — the card, the toolbar and the header stay', states())}
${note('<p>Every list has these six, and they differ in what they keep. <strong>Loading</strong> keeps everything and shimmers the rows — the page cannot change height when the data arrives. <strong>No result</strong> and <strong>Error</strong> keep the toolbar and the chips, because the person’s filters are still the question. <strong>Empty</strong> and <strong>Refused</strong> drop the toolbar, because there is nothing to filter and nothing the person may see. <strong>Unreachable</strong> keeps the toolbar and says that nothing was saved. The sentence in each is written per screen; the anatomy is not.</p>')}

${sample('Pattern · the form — on its own page, with the footer docked', plain(form))}
${card('The form, part by part', `<div class="card-b">${kv([
  ['Where it lives', 'Two fields or fewer: inline, beside what they change. More than two, about a record: in the record’s pane. A new record or a long form: its own page, like this one. A step in a flow: the drawer. Never a modal dialog for a record.'],
  ['Layout', 'Labels above their controls, always. One column in a pane; on a page, two columns only for short fields that belong together — two dates, an amount and its state code. Sections get a heading and at most one sentence.'],
  ['Required and optional', 'A required field carries an asterisk, in ink, never red, and the form says once what the asterisk means. An optional field says <em>Optional.</em> in its hint.'],
  ['Hint and error', 'The hint sits under the control. An error takes the hint’s place, says what to type rather than what is wrong, and points at itself with <code>aria-describedby</code>. A format is checked when the person leaves the field; a missing answer when they submit; a refusal from the server comes back as the banner at the top, saying nothing was saved.'],
  ['Save and cancel', 'Docked to the bottom of the surface, so they are in the same place however long the form is. The destructive action alone on the left; Cancel, then the primary, on the right. The primary says its verb — <em>Raise the invoice</em>, never <em>Submit</em>. A form in a pane has no Cancel: the pane’s × is the way out. The primary is never disabled to signal a mistake — it is pressed, and the form says what is missing.'],
  ['Leaving', 'Leaving a form with changes asks first. Nothing a person typed is lost to a refusal.'],
])}</div>`)}

${card('Density and rhythm', `<div class="card-b">${kv([
  ['One density', 'A table row is 45px — a 20px line and 12.5px above and below. A control is 40px, a small control 30px, a touch control 46px. There is no density setting: the same list looks the same for everyone, which is what makes a screenshot in a support ticket mean something.'],
  ['One rhythm', 'The page gutter is 32px, 16px under 760px. A card body is inset 20px. Blocks on a page are 20px apart. Every value is a step on the scale in <code>tokens.css</code>.'],
  ['One type scale', 'Eleven steps, each a size paired with its leading. A page title is the fluid title step; a card title the lead step; table text the body step; a column header and a hint the meta step.'],
])}</div>`)}

${card('What was taken, and from whom — and what was refused', `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>System</th><th>Taken</th><th>Refused</th></tr></thead><tbody>
<tr><td><b>Salesforce Lightning</b></td><td>A global header with an object switcher in its leading position — here, the project. The record header with a row of key facts under the title. The split view: a list beside the record it opened. The docked form footer. The grouping of a sidebar into sections of pages that belong to one job.</td><td>Its colour, its typeface, its icons and its names — colour comes from one system only. The coloured square behind every object icon — a hue per record type would put colour on a taxonomy, which is the misuse 13 · Decisions removed from green. Inline edit pencils on every table cell: a figure that ends up in a statutory output is changed in a form, deliberately. The app launcher: eight destinations need no launcher.</td></tr>
<tr><td><b>Atlassian</b></td><td>The page header’s anatomy — crumbs above the title, actions on the title’s row, the controls under it. The section message for a page-level notice. Labels above fields, the helper text under the field and the error in its place. An empty state with one primary action. <b>Since 16 September:</b> the colour tokens in light and dark, elevation, spacing, radius, the type scale, motion values, and the side navigation’s expanding sections.</td><td>Its typeface, logo, product names and icons. <span class="superseded">Until 16 September this cell began: its blue.</span> The lozenge set in which <em>in progress</em> is blue — the brand used as a status. Flags that dismiss themselves: a failure never disappears on its own here. The project switcher at the top of the sidebar, for the reasons in 12.</td></tr>
<tr><td><b>Ant Design</b></td><td>The table as one pattern — row selection with a bulk bar, the sorter in the header, pagination that states the total — and ProTable’s column control. Result pages for refused, not found and failed as full-area states with one action. Descriptions for a record’s key–value facts. A skeleton that keeps the table.</td><td>Its blue and its <em>processing</em> badge in that blue. The red required asterisk. Filters hidden in a dropdown inside the column header — undiscoverable, and unusable on a phone; filters live in the toolbar and show as chips. ProTable’s density switch. A modal dialog as the home of a multi-field form.</td></tr>
</tbody></table></div>`, { sub: 'conventions from three, and since 16 September the look from one' })}
`;
}

// v2 additions: the customer-facing vocabulary, the screen map, and the extra synthetic data.
// Money and the base fixtures come from data.mjs unchanged.
import * as L from './data.mjs';
export * from './data.mjs';
const { R, NEG, esc } = L;

// ---------------------------------------------------------- vocabulary --
// Values are the contract's; labels are the customer's. Tone is the pill colour.
export const V2 = {
  po: [['draft', 'Draft', 'idle'], ['pending_approval', 'Waiting for approval', 'waiting'], ['approved', 'Approved', 'ok'], ['cancelled', 'Cancelled', 'idle']],
  project: [['lead', 'Lead', 'idle'], ['won', 'Won', 'ok'], ['in_progress', 'In progress', 'active'], ['handed_over', 'Handed over', 'ok'], ['closed', 'Closed', 'idle'], ['lost', 'Lost', 'idle']],
  health: [['on-track', 'On track', 'ok'], ['at-risk', 'Watch closely', 'warn'], ['over-budget', 'Over contract', 'bad'], ['no-budget', 'Add contract value', 'idle']],
  acceptance: [['accepted', 'Accepted', 'ok'], ['rejected', 'Declined', 'bad'], [null, 'Waiting for you', 'waiting']],
  bill: [['submitted', 'Sent', 'waiting'], ['acknowledged', 'Received', 'ok'], ['returned', 'Sent back', 'bad']],
  co: [['draft', 'Draft', 'idle'], ['pending_client', 'Waiting for client', 'waiting'], ['client_approved', 'Signed off', 'ok'], ['client_rejected', 'Declined by client', 'bad'], ['withdrawn', 'Withdrawn', 'idle']],
  rc: [['draft', 'Draft', 'idle'], ['active', 'In force', 'ok'], ['withdrawn', 'Withdrawn', 'idle']],
  vendor: [['active', 'Active', 'ok'], ['inactive', 'Inactive', 'idle']],
  provision: [['created', 'Created', 'ok'], ['refused', 'Refused', 'bad']],
  series: [['provisional', 'Not confirmed yet', 'warn'], ['confirmed', 'Confirmed', 'ok']],
  lead: [['lead', 'New', 'idle'], ['qualified', 'Qualified', 'active'], ['proposal_shared', 'Proposal sent', 'waiting'], ['negotiation', 'Negotiating', 'active'], ['won', 'Won', 'ok'], ['unqualified', 'Not a fit', 'idle'], ['rejected', 'Lost', 'idle']],
  task: [['pending', 'To do', 'idle'], ['in_progress', 'Doing', 'active'], ['completed', 'Done', 'ok'], ['cancelled', 'Cancelled', 'idle']],
};
// The same closed set, read from the other side of the table. A variation the client declined is not
// a failure in the client's view — it is their own decision, carried out — and "Declined by client"
// is a sentence written from the contractor's chair. Red here would say something to a paying customer
// that nobody at the contractor would say to their face. This is the calibration, not a colour tweak.
export const V2_CLIENT = {
  co: [['draft', 'Not sent yet', 'idle'], ['pending_client', 'Waiting for you', 'waiting'], ['client_approved', 'You signed off', 'ok'], ['client_rejected', 'You declined', 'idle'], ['withdrawn', 'Withdrawn by Northwind', 'idle']],
};
export const REFUSAL_SENTENCES = {
  'self-approval': 'You raised this order, so someone else needs to approve it.',
  'not-entitled': 'Your role can’t approve at this stage. Ask an administrator if that should change.',
  'already-approved-this-stage': 'You’ve already approved this stage. It’s waiting on someone else now.',
  'chain-complete': 'This order is fully approved. Nothing more to decide.',
  'unknown-stage': 'This order’s approval steps have changed. Reload to see where it is now.',
  'above-ceiling': 'This amount is above what this step can approve, and there’s no higher step set up. Ask an administrator to add one.',
};
export const OLD_TO_NEW = [
  ['Committed spend', 'Ordered so far'], ['Contract value', 'Contract'], ['Taxable', 'Before GST'], ['Gross', 'Total'],
  ['pending_approval', 'Waiting for approval'], ['at-risk', 'Watch closely'], ['over-budget', 'Over contract'], ['no-budget', 'Add contract value'],
  ['rejected (vendor)', 'Declined'], ['submitted / acknowledged / returned', 'Sent / Received / Sent back'], ['pending_client', 'Waiting for client'],
  ['client_approved', 'Signed off'], ['client_rejected', 'Declined by client'], ['Rate contract', 'Agreed rates'], ['Rate deviation', 'Above agreed rate'],
  ['RA bill', 'RA bill (kept — the industry term)'], ['Approval chain / stage', 'Approval steps'], ['Principal 1c77d0e4 · staff', 'Shalini · Admin'],
  ['FORBIDDEN · request req_…', 'a sentence + “Copy details for support”'], ['Refusal', 'a sentence saying what to do next'],
];
export const labelOf2 = (set, v) => { const f = set.find(([k]) => k === v); return f ? L.pill(f[2], f[1]) : L.pill('idle', String(v)); };

// ---------------------------------------------------------- screen map --
// Every screen the four apps ship today, and where it lives in the seven-item nav.
export const SCREENS = [
  ['Today', [['(shell)/page.tsx', 'Today › Overview'], ['notifications', 'Today › Notifications (and the bell)'], ['tasks', 'Approvals › Tasks']]],
  ['Sales', [['crm', 'Sales › Leads (list)'], ['crm/board', 'Sales › Pipeline (board)'], ['crm/[leadId]', 'Sales › Lead page, with the handover to a project']]],
  ['Projects', [['projects', 'Projects › All projects'], ['estimation', 'Projects › Rate analysis'], ['documents', 'Projects › Documents (and top-bar search)'],
    ['projects/[projectId]', 'Project › Overview'], ['projects/[projectId]/team', 'Project › Overview › Team'], ['projects/[projectId]/timesheets', 'Project › Overview › Timesheets'],
    ['projects/[projectId]/brief', 'Project › Design › Brief'], ['projects/[projectId]/design', 'Project › Design › Design'], ['projects/[projectId]/drawings', 'Project › Design › Drawings'], ['projects/[projectId]/selections', 'Project › Design › Selections'], ['projects/[projectId]/joinery', 'Project › Design › Joinery'],
    ['projects/[projectId]/boq', 'Project › Build › BOQ'], ['projects/[projectId]/boq/[itemId]', 'Project › Build › BOQ › line (drawer)'], ['projects/[projectId]/takeoff', 'Project › Build › Takeoff'], ['projects/[projectId]/procurement', 'Project › Build › Orders'], ['projects/[projectId]/site', 'Project › Build › Site'], ['projects/[projectId]/recce', 'Project › Build › Recce'], ['projects/[projectId]/milestones', 'Project › Build › Milestones'],
    ['projects/[projectId]/commercials', 'Project › Commercial › Commercials'], ['projects/[projectId]/change-orders', 'Project › Commercial › Variations'], ['projects/[projectId]/client-actions', 'Project › Commercial › Client actions'],
    ['projects/[projectId]/handover', 'Project › Handover › Handover'], ['projects/[projectId]/warranty', 'Project › Handover › Warranty']]],
  ['Buying', [['purchase-orders', 'Buying › Orders'], ['purchase-orders/[id]', 'Buying › Orders › order (drawer, or full page)'], ['vendors', 'Buying › Vendors'], ['vendors/[vendorId]', 'Buying › Vendors › vendor'], ['vendors/rate-contracts', 'Buying › Agreed rates'], ['inventory', 'Buying › Stock']]],
  ['Site', [['site-reports', 'Site › Daily reports'], ['site-controls', 'Site › Measurements & imprest']]],
  ['Approvals', [['approvals', 'Approvals']]],
  ['Money', [['money/bills', 'Money › Bills'], ['money/payments', 'Money › Payments'], ['money/tds', 'Money › Tax deducted'], ['money/client-billing', 'Money › Client billing'], ['retention', 'Money › Retention']]],
  ['Settings', [['settings', 'Settings › Overview'], ['settings/company', 'Settings › Company'], ['settings/tax', 'Settings › Tax — the review, every rate provisional'], ['settings/people', 'Settings › People'], ['settings/roles', 'Settings › Roles'], ['settings/modules', 'Settings › Modules'], ['settings/number-series', 'Settings › Numbering'], ['settings/trade-packages', 'Settings › Trade packages'], ['settings/approvals', 'Settings › Approval steps'], ['settings/inventory', 'Settings › Stock locations'], ['settings/vendor-access', 'Settings › Vendor access'], ['settings/client-access', 'Settings › Client access'], ['settings/audit', 'Settings › Activity log']]],
  ['Sign in', [['sign-in (web)', 'Sign in — staff'], ['admin/sign-in', 'Sign in — operator'], ['vendor-portal/sign-in', 'Sign in — vendor (magic link, proposed)'], ['client-portal/sign-in', 'Sign in — client (magic link, proposed)']]],
  ['Vendor portal', [['vendor-portal/(signed-in)/page', 'Orders'], ['vendor-portal/(signed-in)/bills', 'Bills'], ['vendor-portal/(signed-in)/payments', 'Payments'], ['vendor-portal/(signed-in)/documents', 'Documents']]],
  ['Client portal', [['client-portal/(signed-in)/page', 'Your projects'], ['client-portal/(signed-in)/projects/[projectId]', 'Project › Progress · Variations · Documents · Billing']]],
  ['Operator (admin app)', [['admin/(signed-in)/page', 'Organisations · Provisioning']]],
];
export const SCREEN_COUNT = SCREENS.reduce((n, [, s]) => n + s.filter(([f]) => !f.startsWith('—')).length, 0);

// ------------------------------------------------------------ setup --
export const SETUP = [
  { name: 'Company details', detail: 'Legal name, GSTIN, PAN, address on every document', done: true, backed: 'settings/company' },
  { name: 'Add your projects', detail: 'Type them in, or import the Excel you already keep', done: true, backed: null, gap: 'No importer exists. Projects are added one at a time through the form; nothing reads Excel.' },
  { name: 'Add your vendors', detail: 'From your Tally ledgers, or an Excel list', done: true, backed: null, gap: 'The connector pushes vouchers to Tally and reads nothing back. There is no vendor import from Tally or Excel.' },
  { name: 'Invite your team', detail: 'Everyone signs in with their work email; no passwords to manage', done: true, backed: 'identity invites', gap: 'Invites exist; the “no passwords” half needs magic-link sign-in, which is proposed, not shipped — every sign-in form today is one credential field' },
  { name: 'Connect Tally', detail: 'Install the connector on the machine that runs Tally', done: false, backed: null, gap: 'The connector exists as its own repo and the key is minted at provisioning by the operator. There is no tenant-side pairing screen in Settings.' },
  { name: 'Review your tax settings', detail: 'About two minutes. Verified defaults; two questions about your business', done: false, backed: 'settings/tax (screen exists; verified defaults are not seeded)', gap: 'The tax screen exists but seeds nothing. Pre-filled verified defaults require the M2.5 spec to be seeded per tenant at provisioning.' },
];

// The two-minute review. VALUES BELOW ARE ILLUSTRATIVE and are tagged so in the document:
// the build seeds these from the verified spec (M2.5), never from this file.
export const TAX_REVIEW = {
  statutory: [
    { setting: 'GST on works contracts', value: '18%', note: 'Interior fit-out under one contract for materials and labour' },
    { setting: 'GST on goods supplied separately', value: 'As billed, per item', note: 'Taken from the vendor’s invoice line' },
    { setting: 'TDS on contractor payments — individuals and HUFs', value: '1%', note: 'Section 194C' },
    { setting: 'TDS on contractor payments — companies and firms', value: '2%', note: 'Section 194C' },
    { setting: 'TDS applies from', value: `${L.fmt(R(30_000))} per bill or ${L.fmt(R(1_00_000))} in a year`, note: 'Below both, nothing is deducted' },
    { setting: 'Rounding', value: 'Nearest rupee on each invoice; TDS to the nearest ten rupees', note: 'The statutory rounding rules, applied for you' },
  ],
  questions: [
    { q: 'Do your projects bundle materials and labour under one contract?', help: 'Most fit-out contracts do. This sets how GST is applied to your client invoices.', options: ['Yes, one contract for both', 'Materials and labour are billed separately'], picked: 0 },
    { q: 'Do you pay transporters who have given you a PAN declaration?', help: 'Transporters with ten or fewer vehicles can declare, and then no TDS is deducted from their bills.', options: ['Yes, some of our vendors', 'No'], picked: 1 },
  ],
};

// ------------------------------------------------------------ sales --
// The seed's nine leads: a prospect or an existing client, a city from the business districts the seed
// draws on, the stage by index, the estimate and the next follow-up. The admin owns every one — the seed
// has no salesperson.
const SEED_LEADS = L.SEED.LEADS;
const nextWord = (l) => l.stage === 'won' ? 'Hand over to delivery' : l.stage === 'rejected' ? '' : l.next ? `${l.next.kind === 'site_visit' ? 'Site visit' : 'Call'} ${L.dayDate(l.next.on)}` : 'No follow-up booked';
export const LEADS = SEED_LEADS.map((l, i) => ({ name: l.clientName, short: l.clientName.replace(/ (Private Limited|Limited)$/, ''), title: `${l.projectType}, ${l.district}`, city: l.city, value: l.estimatedValue, stage: l.stage, owner: L.PEOPLE.admin.first,
  next: nextWord(l), nextKind: l.next?.kind ?? null, nextOn: l.next?.on ?? null, contact: l.contact, contactName: l.contactName, probabilityPct: l.probabilityPct, source: l.source, activity: l.activity, lostReason: l.lostReason ?? null, index: i }));
export const PIPELINE_TOTAL = L.add(...LEADS.filter(l => !['won', 'unqualified', 'rejected'].includes(l.stage)).map(l => l.value));
export const LEADS_OPEN = LEADS.filter(l => !['won', 'unqualified', 'rejected'].includes(l.stage)).length;

// the seed's six tasks, as the short list on Today shows them
export const TASKS = L.SEED.TASKS.map(t => ({ t: `${t.title} — ${t.project}`, who: t.owner.first, due: L.dueWord(t.due), kind: t.priority === 'high' ? 'approval' : 'project' }));
export const NOTIFS = [
  ['2 min', `${L.V.Prakashvahini.short} sent PEC-RA-02`], ['1 h', `KRA-01 is past its contract — ${L.projectOf('KRA-01').sharePct}% ordered`], ['Yesterday', `${L.CLIENT_LOGIN.name} signed off CO-01`],
];


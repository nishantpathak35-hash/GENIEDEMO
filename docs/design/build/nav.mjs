// nav.mjs — the two navigations, one shell (19 September 2026). Picking a project in the top bar CHANGES the
// sidebar; it does not filter it. At the firm level the sidebar is the firm's functions; inside a project it is
// that project's lifecycle. One table under both, ROUTES, names every route the product has — the 56 in
// apps/web/lib/routes.ts, sign-in and export, and the project-level twins this pass adds — with the module key
// that gates it (MODULES in packages/contracts/src/authz.ts), the action key, and what a link to a hidden
// entry draws. The nav is generated from enabled modules × role permissions: an entry whose module is off is
// not drawn, and its URL answers not found; an entry whose action the role lacks draws refused.

// the counts on the sidebar are the seed's (a read the product does not have yet — README): stock at the gate not
// checked in, agreed rates ending within 30 days, items below reorder, sites that have never filed, bills past due
import { SEED } from './data.mjs';
const C = { unchecked: SEED.STOCK.filter(s => s.atGate).length, expiring: 0, low: SEED.STOCK.filter(s => s.low).length, noReport: SEED.SITES_NO_REPORT.length, overdue: SEED.PAYABLES.overdue.length, waiting: SEED.BLOCKED.length };

// ---- the firm level: function ----------------------------------------------------------------------------
export const NAV_FIRM = [
  { href: '/', t: 'Today', ic: 'home', pin: true, m: /^Today/ },
  { href: '/approvals', t: 'Approvals', ic: 'check-sq', pin: true, count: 'badge', say: 'waiting on you', m: /^(Approvals|Tasks)/ },
  { sep: true },
  { id: 'sales', t: 'Sales', ic: 'sales', pages: [
    { href: '/crm/board', t: 'Pipeline', m: /^Pipeline/ },
    { href: '/crm', t: 'Leads', m: /^Leads?/ },
    { href: '/estimation', t: 'Rate analysis', m: /^Rate analysis/ }] },
  { id: 'projects', t: 'Projects', ic: 'projects', pages: [
    { href: '/projects', t: 'All projects', m: /^(Projects?|All projects)/ },
    { href: '/documents', t: 'Documents', m: /^Documents/ }] },
  { id: 'buying', t: 'Buying', ic: 'cart', pages: [
    { href: '/purchase-orders', t: 'Orders', count: C.unchecked, say: 'received and not checked', m: /^(Orders|PO-)/ },
    { href: '/vendors', t: 'Vendors', m: /^Vendors?/ },
    { href: '/vendors/rate-contracts', t: 'Agreed rates', count: C.expiring, say: 'ending within 30 days', m: /^(Agreed rates|Rates)/ },
    { href: '/inventory', t: 'Stock', count: C.low, say: 'below their reorder level', m: /^Stock/ }] },
  { id: 'site', t: 'Site', ic: 'site', pages: [
    { href: '/site-reports', t: 'Daily reports', count: C.noReport, say: 'sites that have never filed a report', m: /^(Daily reports|Daily log|Site)/ },
    { href: '/site-controls', t: 'Measurements & imprest', m: /^(Measurement|Imprest|Recce)/ }] },
  { id: 'money', t: 'Money', ic: 'rupee', pages: [
    { href: '/money/bills', t: 'Bills', count: C.overdue, say: 'past their due date', m: /^Bills/ },
    { href: '/money/payments', t: 'Payments', m: /^Payments/ },
    { href: '/money/tds', t: 'Tax deducted', m: /^Tax deducted/ },
    { href: '/money/client-billing', t: 'Client billing', m: /^Client billing/ },
    { href: '/retention', t: 'Retention', m: /^Retention/ }] },
  { href: '/reports', t: 'Reports', ic: 'chart', m: /^Reports/ },
];

// ---- the project level: lifecycle -------------------------------------------------------------------------
export const NAV_PROJECT = [
  { href: '/projects/[projectId]', t: 'Overview', ic: 'home', pin: true, m: /^(Overview|Today)/ },
  { id: 'design', t: 'Design', ic: 'pen', pages: [
    { href: '/projects/[projectId]/brief', t: 'Brief', m: /^Brief/ },
    { href: '/projects/[projectId]/design', t: 'Design', m: /^Design$/ },
    { href: '/projects/[projectId]/drawings', t: 'Drawings', m: /^(Drawings|Documents)/ },
    { href: '/projects/[projectId]/selections', t: 'Selections', m: /^Selections/ },
    { href: '/projects/[projectId]/joinery', t: 'Joinery', m: /^Joinery/ }] },
  { id: 'build', t: 'Build', ic: 'hammer', pages: [
    { href: '/projects/[projectId]/boq', t: 'BOQ', m: /^BOQ/ },
    { href: '/projects/[projectId]/takeoff', t: 'Takeoff', m: /^Takeoff/ },
    { href: '/projects/[projectId]/orders', t: 'Orders', count: 2, say: 'waiting for approval', m: /^(Orders|PO-)/ },
    { href: '/projects/[projectId]/site', t: 'Site', m: /^(Site|Daily)/ },
    { href: '/projects/[projectId]/recce', t: 'Recce', m: /^Recce/ },
    { href: '/projects/[projectId]/milestones', t: 'Milestones', m: /^Milestones/ },
    { href: '/projects/[projectId]/stock', t: 'Stock', m: /^Stock/ }] },
  { id: 'commercial', t: 'Commercial', ic: 'rupee', pages: [
    { href: '/projects/[projectId]/commercials', t: 'Commercials', m: /^Commercials/ },
    { href: '/projects/[projectId]/change-orders', t: 'Variations', m: /^Variations/ },
    { href: '/projects/[projectId]/client-actions', t: 'Client actions', m: /^Client actions/ },
    { href: '/projects/[projectId]/bills', t: 'Bills', m: /^Bills/ },
    { href: '/projects/[projectId]/client-billing', t: 'Client billing', m: /^Client billing/ }] },
  { id: 'people', t: 'People', ic: 'users', pages: [
    { href: '/projects/[projectId]/team', t: 'Team', m: /^Team/ },
    { href: '/projects/[projectId]/timesheets', t: 'Timesheets', m: /^Timesheets/ }] },
  { id: 'close', t: 'Close', ic: 'flag', pages: [
    { href: '/projects/[projectId]/handover', t: 'Handover', m: /^Handover/ },
    { href: '/projects/[projectId]/warranty', t: 'Warranty', m: /^Warranty/ }] },
];

// ---- every route, and what gates it ------------------------------------------------------------------------
// nav: firm · project · both · neither (a record, a settings page, sign-in — reached from a list, the gear or
// outside the frame). module: the MODULES key that must be on, or '—' when none gates it. action: the ACTIONS key
// the role must hold to see it, or '—'. twin: 'new' when this pass adds the route as a project-level twin.
// hidden: what a URL to an entry the nav does not show draws — 'not found' when its module is off (the server
// answers 404 for a module a tenant never enabled), 'refused' when the role lacks the action.
const R = (route, name, nav, module, action, presented, note = '', twin = '') => ({ route, name, nav, module, action, presented, note, twin });
export const ROUTES = [
  R('/', 'Today', 'firm', 'dashboard', '—', 'cards', 'The firm’s. Inside a project the same slot is Overview.'),
  R('/notifications', 'Notifications', 'neither', 'dashboard', '—', 'panel from the bell', 'An interruption is about something owed to you; never in a nav.'),
  R('/crm/board', 'Pipeline', 'firm', 'crm', '—', 'board'),
  R('/crm', 'Leads', 'firm', 'crm', '—', 'list + record'),
  R('/crm/[leadId]', 'A lead', 'neither', 'crm', '—', 'record', 'Opened from Leads; its handover creates the project.'),
  R('/projects', 'All projects', 'firm', 'projects', '—', 'list with stage, contract, ordered %', 'The chooser itself, so never inside a project.'),
  R('/estimation', 'Rate analysis', 'firm', 'estimation', '—', 'library table', 'Moved from Projects to Sales: pricing happens before award.'),
  R('/documents', 'Documents', 'firm', 'documents', 'upload_document', 'file list with versions and preview', 'The firm’s vault; a project’s twin is new.'),
  R('/projects/[projectId]', 'Overview', 'project', 'projects', '—', 'cards', 'The project’s Today, in the same card language.'),
  R('/projects/[projectId]/team', 'Team', 'project', 'project_team', '—', 'list'),
  R('/projects/[projectId]/timesheets', 'Timesheets', 'project', 'project_team', '—', 'list'),
  R('/projects/[projectId]/brief', 'Brief', 'project', 'design_build', '—', 'form'),
  R('/projects/[projectId]/design', 'Design', 'project', 'design_build', '—', 'file list with versions and preview'),
  R('/projects/[projectId]/drawings', 'Drawings', 'project', 'design_build', '—', 'file list with versions and preview'),
  R('/projects/[projectId]/selections', 'Selections', 'project', 'design_build', '—', 'list'),
  R('/projects/[projectId]/joinery', 'Joinery', 'project', 'design_build', '—', 'list'),
  R('/projects/[projectId]/boq', 'BOQ', 'project', 'boq', '—', 'spreadsheet-like: sections, subtotals, line pane', 'One click from Overview.'),
  R('/projects/[projectId]/boq/[itemId]', 'A BOQ line', 'neither', 'boq', '—', 'pane beside the BOQ'),
  R('/projects/[projectId]/takeoff', 'Takeoff', 'project', 'estimation', '—', 'spreadsheet-like'),
  R('/projects/[projectId]/procurement', 'Procurement plan', 'neither', 'purchase_orders', 'create_po', 'a tab inside the project’s Orders', 'Shipped as a PLAN, not an order list; it becomes a tab inside the project-level Orders.'),
  R('/projects/[projectId]/orders', 'Orders', 'project', 'purchase_orders', 'create_po', 'document list + pane', 'The API filters orders by project; the plan is a tab inside it.', 'new'),
  R('/projects/[projectId]/site', 'Site', 'project', 'operations', '—', 'list + day card'),
  R('/projects/[projectId]/recce', 'Recce', 'project', 'site_controls', '—', 'record'),
  R('/projects/[projectId]/milestones', 'Milestones', 'project', 'projects', '—', 'timeline + list'),
  R('/projects/[projectId]/stock', 'Stock', 'project', 'inventory', '—', 'list', 'The site store; the central store stays at the firm level.', 'new'),
  R('/projects/[projectId]/documents', 'Documents', 'project', 'documents', 'upload_document', 'file list with versions and preview', 'The project’s vault, under Design ▸ Drawings until <code>workflow.documents</code> carries a project.', 'new'),
  R('/projects/[projectId]/commercials', 'Commercials', 'project', 'client_billing', '—', 'record'),
  R('/projects/[projectId]/change-orders', 'Variations', 'project', 'change_orders', '—', 'list + record'),
  R('/projects/[projectId]/client-actions', 'Client actions', 'project', 'client_billing', '—', 'list'),
  R('/projects/[projectId]/bills', 'Bills', 'project', 'payments', '—', 'document list + pane', 'Bills against this project’s orders.', 'new'),
  R('/projects/[projectId]/client-billing', 'Client billing', 'project', 'client_billing', '—', 'document list + pane', 'Invoices on this contract.', 'new'),
  R('/projects/[projectId]/handover', 'Handover', 'project', 'projects', '—', 'checklist'),
  R('/projects/[projectId]/warranty', 'Warranty', 'project', 'projects', '—', 'list'),
  R('/purchase-orders', 'Orders', 'firm', 'purchase_orders', 'create_po', 'document list + pane', 'Carries a Project column and a Project filter; <code>?project=</code> survives as a saved-view filter so pasted links keep working.'),
  R('/purchase-orders/[id]', 'An order', 'neither', 'purchase_orders', '—', 'document with a toolbar', 'The record decides its project.'),
  R('/vendors', 'Vendors', 'firm', 'vendors', '—', 'list + record'),
  R('/vendors/[vendorId]', 'A vendor', 'neither', 'vendors', '—', 'record'),
  R('/vendors/rate-contracts', 'Agreed rates', 'firm', 'vendors', '—', 'library table'),
  R('/inventory', 'Stock', 'firm', 'inventory', '—', 'list', 'The central store and every site store; the project twin is one store.'),
  R('/site-reports', 'Daily reports', 'firm', 'operations', '—', 'list + day card', 'Which sites have not filed; the project twin is Site.'),
  R('/site-controls', 'Measurements & imprest', 'firm', 'site_controls', '—', 'ledger with a running balance', 'Kept per project; at the firm level it asks which.'),
  R('/tasks', 'Tasks', 'neither', 'dashboard', '—', 'a tab of Approvals'),
  R('/approvals', 'Approvals', 'both', 'purchase_orders', 'approve_po', 'queue + decide in pane', 'Firm-wide; pinned at the project level too. A scope narrows what you browse, never what you owe.'),
  R('/money/bills', 'Bills', 'firm', 'payments', '—', 'document list + pane'),
  R('/money/payments', 'Payments', 'firm', 'payments', 'create_payment', 'document list + pane'),
  R('/money/tds', 'Tax deducted', 'firm', 'payments', '—', 'statement with draft and refused states', 'The firm’s TAN; a project has no challan.'),
  R('/money/client-billing', 'Client billing', 'firm', 'client_billing', '—', 'document list + pane'),
  R('/retention', 'Retention', 'firm', 'payments', '—', 'list + pane'),
  R('/reports', 'Reports', 'firm', 'reports', 'view_analytics', 'Reports Center: categories and a grouped table', 'Net-new product surface, drawn on part 8.', 'new'),
  R('/settings', 'Settings', 'neither', '—', 'manage_settings', 'hub of categories', 'The gear opens it; it left the sidebar.'),
  R('/settings/company', 'Company', 'neither', '—', 'manage_settings', 'form'),
  R('/settings/tax', 'Tax', 'neither', '—', 'manage_settings', 'form: the two-minute review'),
  R('/settings/people', 'People', 'neither', '—', 'manage_users', 'list'),
  R('/settings/roles', 'Roles', 'neither', '—', 'manage_users', 'table'),
  R('/settings/modules', 'Modules', 'neither', '—', 'manage_settings', 'switches', '“Configure features” in the sidebar’s foot lands here.'),
  R('/settings/number-series', 'Numbering', 'neither', '—', 'manage_settings', 'form'),
  R('/settings/trade-packages', 'Trade packages', 'neither', '—', 'manage_settings', 'list'),
  R('/settings/approvals', 'Approval steps', 'neither', '—', 'manage_settings', 'list'),
  R('/settings/inventory', 'Stock locations', 'neither', 'inventory', 'manage_settings', 'list'),
  R('/settings/vendor-access', 'Vendor access', 'neither', 'vendors', 'manage_users', 'list'),
  R('/settings/client-access', 'Client access', 'neither', 'client_billing', 'manage_users', 'list'),
  R('/settings/audit', 'Activity log', 'neither', '—', 'manage_settings', 'list'),
  R('/settings/terminology', 'Terminology', 'neither', '—', 'manage_settings', 'form', 'BOQ or Estimate, Variation or Change order — per tenant.', 'new'),
  R('/sign-in', 'Sign in', 'neither', '—', '—', 'form', 'Always lands at All projects, on the firm’s Today.'),
  R('/export/[list]', 'Export', 'neither', '—', 'export_data', 'the list it was pressed on', 'Same level, same filters, same sort.'),
];
export const SHIPPED = ROUTES.filter(r => !r.twin).length;
export const NEW_ROUTES = ROUTES.filter(r => r.twin === 'new');
export const NAV_COUNTS = ROUTES.reduce((m, r) => (m[r.nav] = (m[r.nav] || 0) + 1, m), {});
// what a URL to an entry the nav does not show draws
export const hiddenDraws = (r) => (r.module === '—' ? 'refused if the action is missing; not found otherwise' : `not found when <code>${r.module}</code> is off${r.action !== '—' ? `; refused when the role lacks <code>${r.action}</code>` : ''}`);

// which project-level entry a firm route stands for, by the page's name — the shell resolves the current
// item inside a project from the frame's label, the way it always has
export const PROJECT_TWIN = { Orders: '/projects/[projectId]/orders', Bills: '/projects/[projectId]/bills', 'Client billing': '/projects/[projectId]/client-billing', Stock: '/projects/[projectId]/stock', Documents: '/projects/[projectId]/drawings', 'Daily reports': '/projects/[projectId]/site', 'Daily log': '/projects/[projectId]/site', Site: '/projects/[projectId]/site', Today: '/projects/[projectId]', Overview: '/projects/[projectId]', BOQ: '/projects/[projectId]/boq', Variations: '/projects/[projectId]/change-orders', Imprest: '/projects/[projectId]/site', Measurement: '/projects/[projectId]/boq', Recce: '/projects/[projectId]/recce' };

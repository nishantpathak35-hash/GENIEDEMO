/**
 * Every route in this app, named — the manifest the two navigations, the
 * "/" search, the twins and the route test all read.
 *
 * **One list, four consumers, and a test that it matches the filesystem.**
 * `docs/design/03-navigation.html` ("Every route: firm, project, both or
 * neither", `build/nav.mjs` ROUTES) names for every route the level it sits
 * at, the module key that gates it, the action key the role must hold, and
 * what a link to a hidden entry draws. That table is this file. A route that
 * is in `app/` and not here is a route the search cannot reach and the nav
 * cannot rule on, so `tests/routes.test.ts` walks `app/**\/page.tsx` and fails
 * on the difference.
 *
 * `pattern` is the Next.js route with its `[param]` segments in place. A
 * screen under a project is reached through the project it belongs to; a
 * record page (an order, a vendor, a lead, a BOQ line) has no name of its own
 * and is reached from its list, which is what `via` says.
 *
 * `level`: `firm` is drawn in the firm's tree, `project` in a project's,
 * `both` in both (Approvals — a scope narrows what you browse, never what you
 * owe), `neither` is reached from a list, the gear or outside the frame.
 * `module` is the role-grant module (`MODULES` in `@cog/contracts`) that must
 * be on for this role, `null` when none gates it; `optional` is the tenant's
 * switch (`modules` route) the API's own gate reads, where one does; `action`
 * the power the role must hold TO READ the screen. A URL to an entry the nav
 * does not show draws NOT FOUND when its module is off and REFUSED when the
 * role lacks the action.
 *
 * The design's mapping table names `create_po` on Orders, `approve_po` on
 * Approvals, `create_payment` on Payments and `upload_document` on Documents.
 * The server enforces those powers on the WRITE — raising, deciding,
 * recording, uploading — and answers the list by the module alone; an
 * approval's right is the chain stage's ROLE, not an action (workflow
 * `isEntitled`). A tree that hid those lists would hide a director's Orders
 * and every approver's queue, so here an action gates an entry only where the
 * server refuses the read: the settings pages and, when it lands, the Reports
 * Center. Recorded for the design session.
 */

export type RouteGroup =
  | 'Today'
  | 'Sales'
  | 'Projects'
  | 'Project'
  | 'Buying'
  | 'Site'
  | 'Approvals'
  | 'Money'
  | 'Reports'
  | 'Settings'
  | 'Preferences';

export type RouteLevel = 'firm' | 'project' | 'both' | 'neither';

export interface RouteEntry {
  readonly pattern: string;
  /** What the search shows and what a person would type. */
  readonly name: string;
  readonly group: RouteGroup;
  readonly level: RouteLevel;
  /** The role-grant module that gates it, or `null` when none does. */
  readonly module: string | null;
  /** The tenant's optional workflow switch the API gates it behind, where one does. */
  readonly optional?: string;
  /** The action the role must hold to open it, or `null`. */
  readonly action: string | null;
  /** For a record page: the list it is opened from. */
  readonly via?: string;
  /** A project-level twin of a firm list, new with the navigation. */
  readonly twin?: true;
}

const R = (
  pattern: string,
  name: string,
  group: RouteGroup,
  level: RouteLevel,
  module: string | null,
  action: string | null,
  extra: Partial<Pick<RouteEntry, 'optional' | 'via' | 'twin'>> = {},
): RouteEntry => ({ pattern, name, group, level, module, action, ...extra });

export const ROUTES: readonly RouteEntry[] = [
  R('/', 'Today', 'Today', 'firm', 'dashboard', null),
  R('/notifications', 'Notifications', 'Today', 'neither', 'dashboard', null),
  R('/tasks', 'Tasks', 'Approvals', 'neither', 'dashboard', null),

  R('/crm/board', 'Pipeline', 'Sales', 'firm', 'crm', null),
  R('/crm', 'Leads', 'Sales', 'firm', 'crm', null),
  R('/crm/[leadId]', 'A lead', 'Sales', 'neither', 'crm', null, { via: '/crm' }),

  R('/projects', 'All projects', 'Projects', 'firm', 'projects', null),
  R('/estimation', 'Rate analysis', 'Sales', 'firm', 'estimation', null),
  R('/documents', 'Documents', 'Projects', 'firm', 'documents', null),

  R('/projects/[projectId]', 'Overview', 'Project', 'project', 'projects', null),
  R('/projects/[projectId]/team', 'Team', 'Project', 'project', 'project_team', null),
  R('/projects/[projectId]/timesheets', 'Timesheets', 'Project', 'project', 'project_team', null, { optional: 'design_timesheets' }),
  R('/projects/[projectId]/brief', 'Brief', 'Project', 'project', 'design_build', null, { optional: 'design_brief' }),
  R('/projects/[projectId]/design', 'Design', 'Project', 'project', 'design_build', null, { optional: 'design_deliverables' }),
  R('/projects/[projectId]/drawings', 'Drawings', 'Project', 'project', 'design_build', null),
  R('/projects/[projectId]/documents', 'Documents', 'Project', 'project', 'documents', null, { via: '/projects/[projectId]/drawings', twin: true }),
  R('/projects/[projectId]/selections', 'Selections', 'Project', 'project', 'design_build', null, { optional: 'room_selections' }),
  R('/projects/[projectId]/joinery', 'Joinery', 'Project', 'project', 'design_build', null, { optional: 'joinery_packages' }),
  R('/projects/[projectId]/boq', 'BOQ', 'Project', 'project', 'boq', null),
  R('/projects/[projectId]/boq/[itemId]', 'A BOQ line', 'Project', 'neither', 'boq', null, { via: '/projects/[projectId]/boq' }),
  R('/projects/[projectId]/takeoff', 'Takeoff', 'Project', 'project', 'estimation', null),
  R('/projects/[projectId]/orders', 'Orders', 'Project', 'project', 'purchase_orders', null, { twin: true }),
  R('/projects/[projectId]/procurement', 'Procurement plan', 'Project', 'project', 'purchase_orders', null, {
    optional: 'procurement_plan',
    via: '/projects/[projectId]/orders',
  }),
  R('/projects/[projectId]/site', 'Site', 'Project', 'project', 'operations', null),
  R('/projects/[projectId]/stock', 'Stock', 'Project', 'project', 'inventory', null, { twin: true }),
  R('/projects/[projectId]/recce', 'Recce', 'Project', 'project', 'site_controls', null),
  R('/projects/[projectId]/milestones', 'Milestones', 'Project', 'project', 'projects', null, { optional: 'delivery_milestones' }),
  R('/projects/[projectId]/commercials', 'Commercials', 'Project', 'project', 'client_billing', null, { optional: 'commercial_agreement' }),
  R('/projects/[projectId]/change-orders', 'Variations', 'Project', 'project', 'change_orders', null),
  R('/projects/[projectId]/client-actions', 'Client actions', 'Project', 'project', 'client_billing', null, { optional: 'client_actions' }),
  R('/projects/[projectId]/bills', 'Bills', 'Project', 'project', 'payments', null, { twin: true }),
  R('/projects/[projectId]/client-billing', 'Client billing', 'Project', 'project', 'client_billing', null, { twin: true }),
  R('/projects/[projectId]/handover', 'Handover', 'Project', 'project', 'projects', null, { optional: 'handover' }),
  R('/projects/[projectId]/warranty', 'Warranty', 'Project', 'project', 'projects', null, { optional: 'warranty' }),

  R('/purchase-orders', 'Orders', 'Buying', 'firm', 'purchase_orders', null),
  R('/purchase-orders/[id]', 'An order', 'Buying', 'neither', 'purchase_orders', null, { via: '/purchase-orders' }),
  R('/vendors', 'Vendors', 'Buying', 'firm', 'vendors', null),
  R('/vendors/[vendorId]', 'A vendor', 'Buying', 'neither', 'vendors', null, { via: '/vendors' }),
  R('/vendors/rate-contracts', 'Agreed rates', 'Buying', 'firm', 'vendors', null),
  R('/inventory', 'Stock', 'Buying', 'firm', 'inventory', null),

  R('/site-reports', 'Daily reports', 'Site', 'firm', 'operations', null),
  R('/site-controls', 'Measurements & imprest', 'Site', 'firm', 'site_controls', null),

  R('/approvals', 'Approvals', 'Approvals', 'both', 'purchase_orders', null),

  R('/money/bills', 'Bills', 'Money', 'firm', 'payments', null),
  R('/money/payments', 'Payments', 'Money', 'firm', 'payments', null),
  R('/money/tds', 'Tax deducted', 'Money', 'firm', 'payments', null),
  R('/money/client-billing', 'Client billing', 'Money', 'firm', 'client_billing', null),
  R('/retention', 'Retention', 'Money', 'firm', 'payments', null),


  R('/reports', 'Reports', 'Reports', 'firm', 'reports', 'view_analytics'),
  R('/projects/[projectId]/reports', 'Reports', 'Project', 'project', 'reports', 'view_analytics', { twin: true }),

  R('/settings', 'Settings', 'Settings', 'neither', null, 'manage_settings'),
  R('/settings/company', 'Company', 'Settings', 'neither', null, 'manage_settings'),
  R('/settings/tax', 'Tax', 'Settings', 'neither', null, 'manage_settings'),
  R('/settings/people', 'People', 'Settings', 'neither', null, 'manage_users'),
  R('/settings/roles', 'Roles', 'Settings', 'neither', null, 'manage_users'),
  R('/settings/modules', 'Modules', 'Settings', 'neither', null, 'manage_settings'),
  R('/settings/number-series', 'Numbering', 'Settings', 'neither', null, 'manage_settings'),
  R('/settings/trade-packages', 'Trade packages', 'Settings', 'neither', null, 'manage_settings'),
  R('/settings/approvals', 'Approval steps', 'Settings', 'neither', null, 'manage_settings'),
  R('/settings/inventory', 'Stock locations', 'Settings', 'neither', 'inventory', 'manage_settings'),
  R('/settings/vendor-access', 'Vendor access', 'Settings', 'neither', 'vendors', 'manage_users'),
  R('/settings/client-access', 'Client access', 'Settings', 'neither', 'client_billing', 'manage_users'),
  R('/settings/audit', 'Activity log', 'Settings', 'neither', null, 'manage_settings'),
  R('/settings/terminology', 'Terminology', 'Settings', 'neither', null, 'manage_settings'),

  R('/preferences', 'Your preferences', 'Preferences', 'neither', null, null),

];

/** The route a pathname belongs to, longest pattern first. */
export function matchRoute(pathname: string): RouteEntry | undefined {
  const candidates = ROUTES.filter((r) => toRegExp(r.pattern).test(pathname));
  return candidates.sort((a, b) => b.pattern.length - a.pattern.length)[0];
}

export function toRegExp(pattern: string): RegExp {
  const source = pattern
    .split('/')
    .map((segment) => (/^\[[^\]]+\]$/.test(segment) ? '[^/]+' : segment.replace(/[.*+?^${}()|\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${source}/?$`);
}

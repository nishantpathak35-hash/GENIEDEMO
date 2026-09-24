import { relabel, type IconName, type Terms } from '@cog/design-system';
import { ROUTES, toRegExp, type RouteEntry } from './routes';

/**
 * Two navigations, one shell — generated, never listed.
 *
 * `docs/design/03-navigation.html` and `docs/design/build/nav.mjs`: picking a
 * project in the top bar CHANGES the sidebar, it does not filter it. At the
 * firm level the tree is the firm's functions; inside a project it is that
 * project's lifecycle. Both are built here at request time from what the
 * tenant has switched on and what this role may do — `myEntitlements` gives
 * the modules a role reaches and the actions it holds, `modules` the eleven
 * optional workflows the tenant has turned on — over the one route manifest in
 * `routes.ts`, which names for every route the module that gates it and the
 * action the role must hold.
 *
 * The rule that sorts every entry (the design's, verbatim): a module that is
 * off is not drawn, and a link to one of its pages draws NOT FOUND — never
 * refused, because a firm that has not turned on Stock has no stock to be
 * refused (the server already answers 404 for it: `moduleGate` in the host).
 * An entry whose action this role lacks is not drawn, and a link to it draws
 * REFUSED, because the thing exists and somebody else can open it. A section
 * with nothing left in it is not drawn. Four routes have no module: sign-in,
 * export, the operator's pages and a person's own preferences.
 *
 * Nothing here is a permission. The server refuses what it refuses; the tree
 * only stops drawing doors that would not open.
 */

/** The counts the sidebar draws, one read per request (`shellCounts`). */
export interface NavCounts {
  readonly approvals: number;
  readonly unchecked: number;
  readonly expiring: number;
  readonly low: number;
  readonly noReport: number;
  readonly overdue: number;
}
export type CountKey = keyof NavCounts;

export interface NavLink {
  readonly kind: 'link';
  readonly href: string;
  readonly label: string;
  readonly icon?: IconName;
  /** Pinned entries never fold and sit above the sections. */
  readonly pinned?: true;
  readonly count?: CountKey;
  /** What the count counts — the tooltip and the screen reader's sentence. */
  readonly say?: string;
  /** What the pill's `+` raises on this page, in the firm's words; set by `navFor`. */
  readonly create?: string;
}
export interface NavSection {
  readonly kind: 'section';
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly pages: readonly NavLink[];
}
export interface NavSep {
  readonly kind: 'sep';
}
export type NavNode = NavLink | NavSection | NavSep;

const link = (href: string, label: string, extra: Partial<Omit<NavLink, 'kind' | 'href' | 'label'>> = {}): NavLink => ({
  kind: 'link',
  href,
  label,
  ...extra,
});
const section = (id: string, label: string, icon: IconName, pages: readonly NavLink[]): NavSection => ({
  kind: 'section',
  id,
  label,
  icon,
  pages,
});

/** The firm's functions. */
export const NAV_FIRM: readonly NavNode[] = [
  link('/', 'Today', { icon: 'home', pinned: true }),
  link('/approvals', 'Approvals', { icon: 'check-sq', pinned: true, count: 'approvals', say: 'waiting on you' }),
  { kind: 'sep' },
  section('sales', 'Sales', 'sales', [
    link('/crm/board', 'Pipeline'),
    link('/crm', 'Leads'),
    link('/estimation', 'Rate analysis'),
  ]),
  section('projects', 'Projects', 'projects', [link('/projects', 'All projects'), link('/documents', 'Documents')]),
  section('buying', 'Buying', 'cart', [
    link('/purchase-orders', 'Orders', { count: 'unchecked', say: 'received and not checked' }),
    link('/vendors', 'Vendors'),
    link('/vendors/rate-contracts', 'Agreed rates', { count: 'expiring', say: 'ending within 30 days' }),
    link('/inventory', 'Stock', { count: 'low', say: 'below their reorder level' }),
  ]),
  section('site', 'Site', 'site', [
    link('/site-reports', 'Daily reports', { count: 'noReport', say: 'sites that have never filed a report' }),
    link('/site-controls', 'Measurements & imprest'),
  ]),
  section('money', 'Money', 'rupee', [
    link('/money/bills', 'Bills', { count: 'overdue', say: 'past their due date' }),
    link('/money/payments', 'Payments'),
    link('/money/tds', 'Tax deducted'),
    link('/money/client-billing', 'Client billing'),
    link('/retention', 'Retention'),
  ]),
  link('/reports', 'Reports', { icon: 'chart' }),
];

/** A project's lifecycle. `[projectId]` is filled in by `navFor`. */
export const NAV_PROJECT: readonly NavNode[] = [
  link('/projects/[projectId]', 'Overview', { icon: 'home', pinned: true }),
  section('design', 'Design', 'pen', [
    link('/projects/[projectId]/brief', 'Brief'),
    link('/projects/[projectId]/design', 'Design'),
    link('/projects/[projectId]/drawings', 'Drawings'),
    link('/projects/[projectId]/selections', 'Selections'),
    link('/projects/[projectId]/joinery', 'Joinery'),
  ]),
  section('build', 'Build', 'hammer', [
    link('/projects/[projectId]/boq', 'BOQ'),
    link('/projects/[projectId]/takeoff', 'Takeoff'),
    link('/projects/[projectId]/orders', 'Orders'),
    link('/projects/[projectId]/site', 'Site'),
    link('/projects/[projectId]/recce', 'Recce'),
    link('/projects/[projectId]/milestones', 'Milestones'),
    link('/projects/[projectId]/stock', 'Stock'),
  ]),
  section('commercial', 'Commercial', 'rupee', [
    link('/projects/[projectId]/commercials', 'Commercials'),
    link('/projects/[projectId]/change-orders', 'Variations'),
    link('/projects/[projectId]/client-actions', 'Client actions'),
    link('/projects/[projectId]/bills', 'Bills'),
    link('/projects/[projectId]/client-billing', 'Client billing'),
  ]),
  section('people', 'People', 'users', [
    link('/projects/[projectId]/team', 'Team'),
    link('/projects/[projectId]/timesheets', 'Timesheets'),
  ]),
  section('close', 'Close', 'flag', [
    link('/projects/[projectId]/handover', 'Handover'),
    link('/projects/[projectId]/warranty', 'Warranty'),
  ]),
  link('/projects/[projectId]/reports', 'Reports', { icon: 'chart' }),
];

/** What a person may hold, as the server said it. */
export interface Entitled {
  readonly modules: readonly string[];
  readonly actions: readonly string[];
  /**
   * The tenant's optional workflows that are on (the `modules` route); `null`
   * when that read failed — every gated entry then stays drawn and the page
   * itself answers, because a sidebar that empties on a failed read hides
   * more than it protects.
   */
  readonly optional: readonly string[] | null;
}

/** The manifest entry a nav href stands for. */
function ruleFor(href: string): RouteEntry | undefined {
  return ROUTES.find((r) => r.pattern === href);
}

/**
 * Whether an entry is drawn: its module on for this role, its optional
 * workflow on for the tenant, its action held. An href with no manifest entry
 * is a fault in this file, not a hidden door, so it throws.
 */
export function drawn(href: string, who: Entitled): boolean {
  const rule = ruleFor(href);
  // a page the manifest does not know is a page not built yet: not drawn, and
  // `tests/nav.test.ts` names each one so the gap is a list, not a surprise
  if (rule === undefined) return false;
  if (rule.module !== null && !who.modules.includes(rule.module)) return false;
  if (rule.optional !== undefined && who.optional !== null && !who.optional.includes(rule.optional)) return false;
  if (rule.action !== null && !who.actions.includes(rule.action)) return false;
  return true;
}

/**
 * The tree this person sees at this level, hrefs filled in, empty sections
 * gone, every label in the firm's words (`terms`, Settings › Terminology):
 * the trees above stay constants in the canonical word and `relabel` is what
 * turns *Vendors* into *Suppliers* — the same map the quick-create uses.
 */
export function navFor(level: 'firm' | 'project', who: Entitled, projectId?: string, terms?: Terms): readonly NavNode[] {
  const fill = (href: string): string => (projectId === undefined ? href : href.replace('[projectId]', projectId));
  const word = (label: string): string => (terms === undefined ? label : relabel(label, terms));
  const draw = (p: NavLink): NavLink => {
    const create = NEW_OF[p.href];
    return { ...p, href: fill(p.href), label: word(p.label), ...(create === undefined ? {} : { create: word(create) }) };
  };
  const tree = level === 'project' ? NAV_PROJECT : NAV_FIRM;
  const out: NavNode[] = [];
  for (const node of tree) {
    if (node.kind === 'sep') {
      out.push(node);
      continue;
    }
    if (node.kind === 'link') {
      if (drawn(node.href, who)) out.push(draw(node));
      continue;
    }
    const pages = node.pages.filter((p) => drawn(p.href, who)).map(draw);
    if (pages.length > 0) out.push({ ...node, label: word(node.label), pages });
  }
  // a separator with nothing after it, or two in a row, is a line to nowhere
  return out.filter((n, i, all) => n.kind !== 'sep' || (i > 0 && i < all.length - 1 && all[i + 1]?.kind !== 'sep'));
}

/** Which nav entry a pathname lights up: the entry itself, or the list a record was opened from. */
export function currentEntry(
  pathname: string,
  tree: readonly NavNode[],
): { readonly href: string; readonly sectionId: string | null; readonly exact: boolean } | null {
  const links: Array<{ href: string; sectionId: string | null }> = [];
  for (const node of tree) {
    if (node.kind === 'link') links.push({ href: node.href, sectionId: null });
    if (node.kind === 'section') for (const p of node.pages) links.push({ href: p.href, sectionId: node.id });
  }
  const exact = links.find((l) => l.href === pathname || `${l.href}/` === pathname);
  if (exact !== undefined) return { ...exact, exact: true };
  // a record page lights the list it was opened from (`via` in the manifest)
  const route = ROUTES.filter((r) => toRegExp(r.pattern).test(pathname)).sort((a, b) => b.pattern.length - a.pattern.length)[0];
  if (route?.via !== undefined) {
    const viaHref = route.via.replace('[projectId]', projectIdOf(pathname) ?? '');
    const via = links.find((l) => l.href === viaHref);
    if (via !== undefined) return { ...via, exact: false };
  }
  // a page with no entry of its own lights the nearest ancestor it sits under
  const ancestor = links
    .filter((l) => l.href !== '/' && pathname.startsWith(`${l.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return ancestor === undefined ? null : { ...ancestor, exact: false };
}

/** The project a pathname is inside, or null at the firm level. */
export function projectIdOf(pathname: string): string | null {
  const m = /^\/projects\/([^/]+)/.exec(pathname);
  return m === null ? null : (m[1] ?? null);
}

/**
 * The quick-create for the current page: what the pill's `+` raises, keyed by
 * the entry's href pattern — never by its label, which is the firm's word and
 * changes under Settings › Terminology. The server's one-call read
 * (`quickCreate`) says whether this person may; this only names which item of
 * that menu the page is about, in the canonical word `navFor` relabels.
 */
export const NEW_OF: Readonly<Record<string, string>> = {
  '/purchase-orders': 'New order',
  '/money/bills': 'New bill',
  '/crm': 'New lead',
  '/crm/board': 'New lead',
  '/projects': 'New project',
  '/documents': 'Upload a document',
  '/vendors': 'New vendor',
  '/vendors/rate-contracts': 'New agreed rate',
  '/inventory': 'Stock receipt',
  '/site-reports': 'File today’s report',
  '/money/payments': 'New payment',
  '/money/client-billing': 'New invoice',
  '/projects/[projectId]/drawings': 'Upload a drawing',
  '/projects/[projectId]/documents': 'Upload a document',
  '/projects/[projectId]/orders': 'New order',
  '/projects/[projectId]/site': 'File today’s report',
  '/projects/[projectId]/bills': 'New bill',
  '/projects/[projectId]/client-billing': 'New invoice',
  '/projects/[projectId]/change-orders': 'New variation',
  '/projects/[projectId]/boq': 'New BOQ line',
  '/projects/[projectId]/takeoff': 'New takeoff',
  '/projects/[projectId]/milestones': 'New milestone',
  '/projects/[projectId]/team': 'Add a person',
  '/projects/[projectId]/timesheets': 'New timesheet',
  '/projects/[projectId]/selections': 'New selection',
  '/projects/[projectId]/joinery': 'New joinery item',
  '/projects/[projectId]/client-actions': 'New client action',
  '/projects/[projectId]/recce': 'New recce',
  '/projects/[projectId]/stock': 'Stock receipt',
};

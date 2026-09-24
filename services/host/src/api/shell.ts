import { Hono, type Context } from 'hono';
import {
  HTTP_STATUS,
  createSavedViewInput,
  recordOpenedInput,
  updatePreferencesInput,
} from '@cog/contracts';
import { addDays, tenantOf, todayInIndia, txOf } from '@cog/service-kit';
import { loadEntitlements, loadPrincipalRoles } from '@cog/identity';
import { listProjectBudgets, projectsFor, searchLeads, searchProjects } from '@cog/projects';
import { payablesSummary, pendingApprovals, rateContractsEndingBy, searchOrders, searchVendors, stockSummary } from '@cog/procurement';
import { siteToday } from '@cog/siteops';
import {
  listDocuments,
  SavedViewNameTaken,
  SavedViewNotFound,
  createSavedView,
  deleteSavedView,
  listSavedViews,
  readPreferences,
  recentHistory,
  recentProjects,
  recordOpened,
  updatePreferences,
} from '@cog/workflow';

/**
 * The shell — what the bar and the sidebar read on every request, and what a
 * person's own controls write.
 *
 * **Composition, so it lives here.** The sidebar's six counts come from three
 * services (approvals, receipts, agreed rates, stock and bills are
 * procurement's; sites that never filed are siteops' over projects'
 * sites); the switcher's Mine is projects', its Recent workflow's trail;
 * what this person may create is identity's entitlements over the shell's
 * own menu. No service imports another, and nothing here computes money —
 * every figure is a count the owning service produced.
 *
 * A person's preferences, history and saved views are theirs: every route
 * takes the principal from the resolved identity and never from the body,
 * and workflow filters every read to it.
 */
function requestId(c: Context): string {
  return c.req.header('x-request-id') ?? 'unknown';
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalid(c: Context, message: string): Response {
  return c.json(
    { code: 'VALIDATION_FAILED' as const, message, requestId: requestId(c) },
    HTTP_STATUS.VALIDATION_FAILED as 400,
  );
}
function forbidden(c: Context, message: string): Response {
  return c.json({ code: 'FORBIDDEN' as const, message, requestId: requestId(c) }, HTTP_STATUS.FORBIDDEN as 403);
}
function notFound(c: Context, message: string): Response {
  return c.json({ code: 'NOT_FOUND' as const, message, requestId: requestId(c) }, HTTP_STATUS.NOT_FOUND as 404);
}

/**
 * The square's menu: everything this person may create, grouped by the
 * section it belongs to. An item is drawn when the role holds its action
 * and reaches its module; the module keys are the same the routes carry, so
 * the menu and the sidebar never disagree about a door.
 */
const CREATABLE: ReadonlyArray<{
  section: string;
  key: string;
  label: string;
  href: string;
  module: string;
  action: string | null;
  projectScoped: boolean;
}> = [
  { section: 'Sales', key: 'lead', label: 'New lead', href: '/crm?new=1', module: 'crm', action: null, projectScoped: false },
  { section: 'Projects', key: 'project', label: 'New project', href: '/projects?new=1', module: 'projects', action: null, projectScoped: false },
  { section: 'Projects', key: 'variation', label: 'New variation', href: '/projects/[projectId]/change-orders?new=1', module: 'change_orders', action: null, projectScoped: true },
  { section: 'Projects', key: 'document', label: 'Upload a document', href: '/documents?new=1', module: 'documents', action: 'upload_document', projectScoped: false },
  { section: 'Buying', key: 'order', label: 'New order', href: '/purchase-orders?new=1', module: 'purchase_orders', action: 'create_po', projectScoped: true },
  { section: 'Buying', key: 'vendor', label: 'New vendor', href: '/vendors?new=1', module: 'vendors', action: null, projectScoped: false },
  { section: 'Buying', key: 'rate', label: 'New agreed rate', href: '/vendors/rate-contracts?new=1', module: 'vendors', action: null, projectScoped: false },
  { section: 'Buying', key: 'receipt', label: 'Stock receipt', href: '/inventory?new=receipt', module: 'inventory', action: null, projectScoped: false },
  { section: 'Site', key: 'report', label: 'File today’s report', href: '/site-reports?new=1', module: 'operations', action: null, projectScoped: true },
  { section: 'Site', key: 'issue', label: 'Raise an issue', href: '/site-reports?new=issue', module: 'operations', action: null, projectScoped: true },
  { section: 'Money', key: 'payment', label: 'New payment', href: '/money/payments?new=1', module: 'payments', action: 'create_payment', projectScoped: false },
  { section: 'Money', key: 'invoice', label: 'New invoice', href: '/money/client-billing?new=1', module: 'client_billing', action: null, projectScoped: true },
  { section: 'Work', key: 'task', label: 'New task', href: '/tasks?new=1', module: 'dashboard', action: null, projectScoped: true },
];

export function shellRoutes(): Hono {
  const app = new Hono();

  /** The sidebar's counts, one read. */
  app.get('/shell/counts', async (c) => {
    const tx = txOf(c);
    const today = todayInIndia();
    // One transaction, one client, one statement at a time — `pg` queues a
    // second query on a busy client and deprecates the habit.
    const waiting = await pendingApprovals(tx);
    const stock = await stockSummary(tx);
    const payables = await payablesSummary(tx, today);
    const ending = await rateContractsEndingBy(tx, addDays(today, 30));
    const projects = await listProjectBudgets(tx);
    const sites = projects.filter((p) => p.state === 'in_progress').map((p) => ({ id: p.id, code: p.code }));
    const site = await siteToday(tx, today, sites);
    return c.json({
      approvals: waiting.length,
      unchecked: stock.awaitingCheckIn,
      expiring: ending,
      low: stock.belowReorder,
      noReport: site.sites.filter((s) => s.lastReportOn === null).length,
      overdue: payables.overdue.count,
    });
  });

  /** The switcher's groups: Mine from the team, Recent from the trail. */
  app.get('/shell/my-projects', async (c) => {
    const tx = txOf(c);
    const me = tenantOf(c).principal.id;
    const mine = await projectsFor(tx, me);
    const recent = await recentProjects(tx, me);
    return c.json({ mine: [...mine], recent: [...recent] });
  });

  /** The bar's history popover. */
  app.get('/shell/history', async (c) => {
    const items = await recentHistory(txOf(c), tenantOf(c).principal.id);
    const codes = await projectCodes(c, items.map((i) => i.projectId).filter((p): p is string => p !== null));
    return c.json({
      items: items.map((i) => ({
        kind: i.kind,
        id: i.id,
        title: i.title,
        subtitle: i.subtitle,
        href: i.href,
        projectCode: i.projectId === null ? null : (codes.get(i.projectId) ?? null),
        openedAt: i.openedAt,
      })),
    });
  });

  /** Written when a record page opens. */
  app.post('/shell/history', async (c) => {
    const parsed = recordOpenedInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, 'That record could not be noted.');
    await recordOpened(txOf(c), tenantOf(c).principal.id, parsed.data);
    return c.json({ ok: true });
  });

  app.get('/shell/preferences', async (c) => c.json(await readPreferences(txOf(c), tenantOf(c).principal.id)));

  app.patch('/shell/preferences', async (c) => {
    const parsed = updatePreferencesInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, 'That preference could not be saved.');
    // zod leaves an absent key `undefined`; the merge wants it absent
    const change = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
    return c.json(await updatePreferences(txOf(c), tenantOf(c).principal.id, change));
  });

  /** What this person may create, here. */
  /**
   * The bar's search over records — one call, scoped. Each owning service
   * searches its own tables by the words typed (a code, a number, a name);
   * the host composes the kinds the person may reach (their modules) into one
   * answer and names the href the app draws. `scope` narrows to one kind;
   * `projectId` narrows the kinds that belong to a project. At most ten a
   * kind, fifty in all: a search, never a list.
   */
  app.get('/shell/search', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    const scope = c.req.query('scope') ?? 'everything';
    const projectId = c.req.query('projectId');
    if (projectId !== undefined && !UUID.test(projectId)) return invalid(c, 'projectId must be a uuid');
    if (q.length < 2) return c.json({ scope, items: [] });
    const tx = txOf(c);
    const { modules } = await loadEntitlements(tx, await loadPrincipalRoles(tx, tenantOf(c).principal.id));
    const want = (kind: string): boolean => scope === 'everything' || scope === kind;
    const items: Array<{ kind: 'project' | 'order' | 'vendor' | 'lead' | 'document'; id: string; title: string; subtitle: string; href: string }> = [];
    if (want('projects') && modules.includes('projects') && projectId === undefined) {
      for (const h of await searchProjects(tx, q, 10)) items.push({ kind: 'project', ...h, href: `/projects/${h.id}` });
    }
    if (want('orders') && modules.includes('purchase_orders')) {
      for (const h of await searchOrders(tx, q, 10, projectId)) items.push({ kind: 'order', ...h, href: `/purchase-orders/${h.id}` });
    }
    if (want('vendors') && modules.includes('vendors') && projectId === undefined) {
      for (const h of await searchVendors(tx, q, 10)) items.push({ kind: 'vendor', ...h, href: `/vendors/${h.id}` });
    }
    if (want('leads') && modules.includes('crm') && projectId === undefined) {
      for (const h of await searchLeads(tx, q, 10)) items.push({ kind: 'lead', ...h, href: `/crm/${h.id}` });
    }
    if (want('documents') && modules.includes('documents')) {
      const docs = await listDocuments(tx, { limit: 10, cursor: null, before: false }, { q, ...(projectId === undefined ? {} : { projectId }) });
      for (const d of docs.items) items.push({ kind: 'document', id: d.id, title: d.fileName, subtitle: d.entityType.replace(/_/g, ' '), href: projectId === undefined ? `/documents?doc=${d.id}` : `/projects/${projectId}/documents?doc=${d.id}` });
    }
    return c.json({ scope, items: items.slice(0, 50).map(({ kind, id, title, subtitle, href }) => ({ kind, id, title, subtitle, href })) });
  });

  app.get('/shell/quick-create', async (c) => {
    const tx = txOf(c);
    const { modules, actions } = await loadEntitlements(tx, await loadPrincipalRoles(tx, tenantOf(c).principal.id));
    const projectId = c.req.query('projectId');
    const groups = new Map<string, Array<{ key: string; label: string; href: string; projectScoped: boolean }>>();
    for (const item of CREATABLE) {
      if (!modules.includes(item.module)) continue;
      if (item.action !== null && !actions.includes(item.action)) continue;
      const href =
        projectId === undefined
          ? item.href.replace('/projects/[projectId]', '/projects')
          : item.projectScoped
            ? item.href.includes('[projectId]')
              ? item.href.replace('[projectId]', projectId)
              : `${item.href}&projectId=${projectId}`
            : item.href;
      const list = groups.get(item.section) ?? [];
      list.push({ key: item.key, label: item.label, href, projectScoped: item.projectScoped });
      groups.set(item.section, list);
    }
    return c.json({ groups: [...groups].map(([section, items]) => ({ section, items })) });
  });

  /** A list's saved views: the firm's, then this person's. */
  app.get('/shell/views', async (c) => {
    const listKey = c.req.query('list');
    if (listKey === undefined || listKey === '') return invalid(c, 'Which list?');
    const tx = txOf(c);
    const me = tenantOf(c).principal.id;
    const views = await listSavedViews(tx, me, listKey);
    const prefs = await readPreferences(tx, me);
    const starred = new Set(prefs.starredViews);
    return c.json({ items: views.map((v) => ({ ...v, starred: starred.has(v.id) })) });
  });

  app.post('/shell/views', async (c) => {
    const parsed = createSavedViewInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, 'That view could not be saved.');
    const tx = txOf(c);
    const me = tenantOf(c).principal.id;
    if (parsed.data.shared && !(await mayManage(c))) return forbidden(c, 'A view for the whole firm needs the settings permission.');
    try {
      const view = await createSavedView(tx, me, parsed.data);
      return c.json({ ...view, starred: false }, 201);
    } catch (e) {
      if (e instanceof SavedViewNameTaken) return invalid(c, `A view called “${parsed.data.name}” already exists here.`);
      throw e;
    }
  });

  app.delete('/shell/views/:viewId', async (c) => {
    const tx = txOf(c);
    const me = tenantOf(c).principal.id;
    try {
      await deleteSavedView(tx, me, c.req.param('viewId'), await mayManage(c));
    } catch (e) {
      if (e instanceof SavedViewNotFound) return notFound(c, 'No such view.');
      throw e;
    }
    return c.json({ ok: true });
  });

  return app;
}

async function mayManage(c: Context): Promise<boolean> {
  const tx = txOf(c);
  const { actions } = await loadEntitlements(tx, await loadPrincipalRoles(tx, tenantOf(c).principal.id));
  return actions.includes('manage_settings');
}

async function projectCodes(c: Context, ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
  if (ids.length === 0) return new Map();
  const projects = await listProjectBudgets(txOf(c));
  return new Map(projects.filter((p) => ids.includes(p.id)).map((p) => [p.id, p.code]));
}

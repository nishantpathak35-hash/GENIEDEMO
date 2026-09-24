import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { API_ROUTES } from '@cog/contracts';
import { Empty, NotificationPanel, load, relabel } from '@cog/design-system';
import { ShellFrame } from '../_components/shell-frame';
import { terms as termsOf } from '../../lib/terms';
import { markAllNotificationsRead } from './notifications/actions';
import { markAllReadForm, toItem } from './notifications/items';
import { apiAsCaller } from '../../lib/api';
import { currentCredential } from '../../lib/session';

/**
 * The bar's *Demo organisation* notice draws for a demonstration tenant. The
 * product holds no such fact on a tenant; the two the seed provisions are
 * known by their slugs (`scripts/demo-principals.mjs`), which is what the
 * design's notice is about — a screen a buyer is shown, on data that is not
 * real. A tenant fact is the honest home for it and is recorded as a gap.
 */
const DEMO_SLUGS: ReadonlySet<string> = new Set(['bhitarang-interiors', 'samarachana-fitouts']);

/**
 * The application chrome — two navigations, one shell
 * (`docs/design/03-navigation.html`).
 *
 * Two things happen here and nowhere else:
 *
 *   1. **No credential means the sign-in page**, before any screen renders,
 *      and sign-in keeps the address it was sent from. Not an authorization
 *      check — the server does those — but there is no reason to render
 *      sixty screens' worth of refusals to someone who has not signed in.
 *   2. **What the shell draws is read here, once per request**: who the
 *      server says you are, what your role reaches and holds, which optional
 *      workflows the tenant switched on, the sidebar's six counts, the
 *      projects (the switcher and a project's block), the ones you are on and
 *      opened last, your trail, your preferences, what you may create here,
 *      and the bell's count. The sidebar and the switcher are pure over those
 *      reads; nothing in the chrome counts, ranks or decides anything.
 *
 * A read that fails leaves its part of the chrome honest rather than empty:
 * the tree draws every entry its module might allow when the optional
 * switches could not be read, and the page itself answers not found; the
 * counts are absent, not zero.
 */
export default async function ShellLayout({ children }: { children: ReactNode }): Promise<ReactNode> {
  // `proxy.ts` sends a person with no credential to sign in with the address
  // kept; this is the fallback for a request the proxy did not see
  if ((await currentCredential()) === null) redirect('/sign-in');

  const client = await apiAsCaller();
  const [who, tenant, me, tenantModules, people, inbox, counts, projects, myProjects, history, prefs, quick, terms] =
    await Promise.all([
      load(client, API_ROUTES.whoami, {}),
      load(client, API_ROUTES.tenantSettings, {}),
      load(client, API_ROUTES.myEntitlements, {}),
      load(client, API_ROUTES.modules, {}),
      load(client, API_ROUTES.people, { query: { limit: '200' } }),
      load(client, API_ROUTES.notifications, {}),
      load(client, API_ROUTES.shellCounts, {}),
      load(client, API_ROUTES.listProjects, { query: { limit: '200' } }),
      load(client, API_ROUTES.myProjects, {}),
      load(client, API_ROUTES.recentHistory, {}),
      load(client, API_ROUTES.preferences, {}),
      load(client, API_ROUTES.quickCreate, {}),
      // the firm's words, once: the sidebar, the quick-create and every page's labels read this one call
      termsOf(),
    ]);

  const tenantName = tenant.kind === 'ok' ? tenant.data.legalName : 'Construct-O-Genie';
  const principalId = who.kind === 'ok' ? who.data.principalId : null;
  const person = people.kind === 'ok' && principalId !== null ? people.data.items.find((p) => p.id === principalId) : undefined;
  const name = person?.displayName ?? person?.email ?? (who.kind === 'unreachable' ? 'API unreachable' : 'Not resolved');
  const role = me.kind === 'ok' ? me.data.roles.join(' · ') : who.kind === 'ok' ? who.data.principalKind : '';

  return (
    <ShellFrame
      who={{
        modules: me.kind === 'ok' ? me.data.modules : [],
        actions: me.kind === 'ok' ? me.data.actions : [],
        optional: tenantModules.kind === 'ok' ? tenantModules.data.items.filter((m) => m.enabled).map((m) => m.key) : null,
      }}
      counts={counts.kind === 'ok' ? counts.data : null}
      projects={projects.kind === 'ok' ? projects.data.items : []}
      projectsRead={projects.kind}
      mine={myProjects.kind === 'ok' ? myProjects.data.mine : []}
      recent={myProjects.kind === 'ok' ? myProjects.data.recent : []}
      history={history.kind === 'ok' ? history.data.items : []}
      prefs={prefs.kind === 'ok' ? prefs.data : null}
      quickCreate={quick.kind === 'ok' ? { groups: quick.data.groups.map((g) => ({ ...g, items: g.items.map((i) => ({ ...i, label: relabel(i.label, terms) })) })) } : null}
      tenantName={tenantName}
      demo={tenant.kind === 'ok' && DEMO_SLUGS.has(tenant.data.slug)}
      unread={inbox.kind === 'ok' ? inbox.data.unread : 0}
      inbox={
        inbox.kind !== 'ok' ? null : inbox.data.count === 0 ? (
          <div className="popover" role="dialog" aria-label="Notifications">
            <Empty illustration="notifications" title="You’re up to date" size="narrow">
              Anything that needs you appears here the moment it happens.
            </Empty>
          </div>
        ) : (
          <NotificationPanel
            unread={inbox.data.unread}
            items={inbox.data.items.slice(0, 8).map((n) => toItem(n, new Date(), terms))}
            allHref="/notifications"
            {...(inbox.data.unread === 0 ? {} : { markAllReadAction: markAllReadForm(markAllNotificationsRead) })}
          />
        )
      }
      person={{ name, role }}
      terms={terms}
    >
      {children}
    </ShellFrame>
  );
}

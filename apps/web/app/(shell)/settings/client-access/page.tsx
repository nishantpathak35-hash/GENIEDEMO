import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../lib/api';
import { AbsentNotice, Empty, PageHeader, Pager, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { GrantClientProjectForm, RevokeClientProjectButton } from '../forms';
import { pageLinks, pageState } from '../../../../lib/paging';

export const metadata = { title: 'Client access · Settings' };
export const dynamic = 'force-dynamic';

/** Settings › Client access — the hub's card, opened. */
const HEADER = <PageHeader crumbs={[{ href: '/settings', label: 'Settings' }]} title="Client access" sub="Which clients may open which projects." />;

/**
 * What each client login can see.
 *
 * **This list is the one that is enforced.** A client credential is narrowed to
 * the projects linked to it and every portal route answers not-found for
 * anything else — the same list, read by the same table. There is no second
 * list here that a screen displays and nothing checks.
 *
 * Revoking is the half that matters. Adding a project to a client&rsquo;s login
 * is a convenience; taking one away is the control somebody reaches for when a
 * job ends or a relationship does, and it takes effect on the client&rsquo;s
 * next request.
 */
export default async function ClientAccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const paging = pageState(params);
  const caller = await apiAsCaller();
  const [accounts, projects] = await Promise.all([
    load(caller, API_ROUTES.clientAccounts, { query: paging.query }),
    // a lookup: the widest window the endpoint allows
    load(caller, API_ROUTES.listProjects, { query: { limit: '200' } }),
  ]);

  if (accounts.kind === 'unreachable') return <UnreachableState />;
  if (accounts.kind === 'refused') {
    return (
      <>
        {HEADER}
        <Section title="Client access">
          <Refusal error={accounts.error} />
        </Section>
      </>
    );
  }

  const options: ReadonlyArray<readonly [string, string]> =
    projects.kind === 'ok' ? projects.data.items.map((p) => [p.id, p.name] as const) : [];

  function hrefFor(overrides: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    const merged: Record<string, string | undefined> = { ...params, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== '') next.set(key, value);
    }
    const qs = next.toString();
    return qs === '' ? '/settings/client-access' : `/settings/client-access?${qs}`;
  }
  const links = pageLinks(paging, accounts.data, hrefFor);

  return (
    <>
      {HEADER}
      <Section bare title={`Client logins — ${accounts.data.count}`}>
        <div className="card-b">
          {accounts.data.count === 0 ? (
            <Empty illustration="projects" title="No client logins">
              A client account is a principal of kind <code>client</code>, and there is no create
              button here on purpose — see below.
            </Empty>
          ) : (
            <>
              <div className="tbl-wrap">
                {/* Client · State · Can see · Give access to — identity
                    never drops; active/disabled is the decision column;
                    what the login can already see and the grant control are
                    reference and drop first. */}
                <table className="tbl" data-priority>
                  <thead>
                    <tr>
                      <th data-p="1">Client</th>
                      <th data-p="2">State</th>
                      <th data-p="3">Can see</th>
                      <th data-p="4">Give access to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.data.items.map((account) => (
                      <tr key={account.id}>
                        <td data-p="1">{account.email}</td>
                        <td data-p="2">
                          <Pill tone={account.disabled ? 'bad' : 'ok'}>
                            {account.disabled ? 'Disabled' : 'Active'}
                          </Pill>
                        </td>
                        <td data-p="3" data-label="Can see">
                          {account.projects.length === 0 ? (
                            <span className="muted">Nothing — a login scoped to no project</span>
                          ) : (
                            account.projects.map((project) => (
                              <div key={project.id}>
                                {project.name}{' '}
                                <RevokeClientProjectButton
                                  principalId={account.id}
                                  projectId={project.id}
                                  projectName={project.name}
                                />
                              </div>
                            ))
                          )}
                        </td>
                        <td data-p="4" data-label="Give access to">
                          <GrantClientProjectForm principalId={account.id} projects={options} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                shown={links.shown}
                of={accounts.data.count}
                unit={accounts.data.count === 1 ? 'client login' : 'client logins'}
                next={links.next}
                prev={links.prev}
              />
            </>
          )}
        </div>
      </Section>

      <AbsentNotice title="No password is generated here, and none is shown">
        The previous system creates a client account with a password built in the browser from a
        fixed <code>Client@</code> prefix. A credential minted client-side with a predictable
        prefix is two failures in one line, and neither is worth porting. A client login is created
        by inviting one on Settings — the invitation records that it is a <em>client</em>
        invitation, and that is read back from the stored row when the link is redeemed, so
        whoever accepts it cannot accept it as staff. This surface then decides what that login can
        see: a new client login is scoped to nothing until a project is granted below.
      </AbsentNotice>

      <AbsentNotice title="A link to a project that no longer exists shows its id">
        It is not quietly dropped. A row that vanishes from an access list looks like access that
        was revoked, and it was not.
      </AbsentNotice>
    </>
  );
}

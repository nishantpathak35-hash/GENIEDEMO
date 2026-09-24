import type { ReactNode } from 'react';
import Link from 'next/link';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../lib/api';
import { AbsentNotice, Empty, PageHeader, Pager, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { InviteForm } from '../forms';
import { pageLinks, pageState } from '../../../../lib/paging';

export const metadata = { title: 'People · Settings' };
export const dynamic = 'force-dynamic';

/** The design's vocabulary for the three login kinds — never the raw enum. */
const KIND_LABELS: Record<string, string> = { staff: 'Staff', client: 'Client', vendor: 'Vendor' };

/** Settings › People — the hub's card, opened. */
const HEADER = <PageHeader crumbs={[{ href: '/settings', label: 'Settings' }]} title="People" sub="Everyone in the firm; a project’s people are its Team tab." />;

/**
 * Everybody in the organisation, and where they work.
 *
 * **Two scopes on one row, and they are different questions.** A role is
 * tenant-wide and says what somebody is permitted to do; a project membership
 * is the narrower scope, and the designation beside it is a job title that is
 * never compared against a permission. Conflating the two is how a free-text
 * field ends up being read as an authorisation, which is the shape
 * `lead_contacts.role` had before migration 0061 renamed it.
 *
 * Nothing is created here. Access arrives through an invitation whose link is
 * shown once — the previous system creates a user with the password
 * `ChangeMe123!` and a fixed set of roles, which is a credential nobody
 * rotates and permissions nobody chose.
 */
export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const paging = pageState(params);
  // two lists on one page, each with its own window: people, and `i…` for invitations
  const invitePaging = pageState(params, 'i');
  const client = await apiAsCaller();
  const [people, invites] = await Promise.all([
    load(client, API_ROUTES.people, { query: paging.query }),
    load(client, API_ROUTES.listInvites, { query: invitePaging.query }),
  ]);

  if (people.kind === 'unreachable') return <UnreachableState />;
  if (people.kind === 'refused') {
    return (
      <>
        {HEADER}
        <Section title="People">
          <Refusal error={people.error} />
        </Section>
      </>
    );
  }

  function hrefFor(overrides: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    const merged: Record<string, string | undefined> = { ...params, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== '') next.set(key, value);
    }
    const qs = next.toString();
    return qs === '' ? '/settings/people' : `/settings/people?${qs}`;
  }
  const links = pageLinks(paging, people.data, hrefFor);
  const inviteLinks = invites.kind === 'ok' ? pageLinks(invitePaging, invites.data, hrefFor) : null;

  return (
    <>
      {HEADER}
      <Section bare title={`People — ${people.data.summary.active} active of ${people.data.count}`}>
        <div className="card-b">
          {people.data.count === 0 ? (
            <Empty illustration="projects" title="Nobody yet">
              Invite somebody below — the invitation link is shown once, and
              only its hash is stored, so it cannot be retrieved afterwards.
            </Empty>
          ) : (
            <>
              <div className="tbl-wrap">
                {/* Who · State · May do (tenant-wide) · Works on — identity
                    never drops; active/disabled is the decision column;
                    roles and project membership are reference and drop
                    first. */}
                <table className="tbl" data-priority>
                  <thead>
                    <tr>
                      <th data-p="1">Who</th>
                      <th data-p="2">State</th>
                      <th data-p="3">May do (tenant-wide)</th>
                      <th data-p="4">Works on</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.data.items.map((person) => (
                      <tr key={person.id}>
                        <td data-p="1">
                        {person.displayName === null ? (
                          person.email
                        ) : (
                          <>
                            {person.displayName}
                            <span className="sub">{person.email}</span>
                          </>
                        )}
                      </td>
                        <td data-p="2">
                          <Pill tone={person.disabled ? 'bad' : 'ok'}>
                            {person.disabled ? 'Disabled' : 'Active'}
                          </Pill>
                        </td>
                        <td data-p="3" data-label="May do (tenant-wide)">
                          {person.roles.length === 0 ? (
                            <span className="muted">No role — entitled to nothing</span>
                          ) : (
                            person.roles.map((role) => (
                              <Pill key={role} tone="idle">
                                {role}
                              </Pill>
                            ))
                          )}
                        </td>
                        <td data-p="4" data-label="Works on">
                          {person.projects.length === 0 ? (
                            <span className="muted">No project</span>
                          ) : (
                            person.projects.map((project) => (
                              <div key={project.id}>
                                <Link href={`/projects/${project.id}/team`}>{project.name}</Link>
                                {project.designation === '' ? null : (
                                  <span className="muted"> — {project.designation}</span>
                                )}
                              </div>
                            ))
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                shown={links.shown}
                of={people.data.count}
                unit={people.data.count === 1 ? 'person' : 'people'}
                next={links.next}
                prev={links.prev}
              />
            </>
          )}
        </div>
      </Section>

      <Section bare title="Outstanding invitations">
        {invites.kind !== "ok" ? (
          <div className="card-b">
            <p className="muted">The invitation list could not be read.</p>
          </div>
        ) : invites.data.items.length === 0 ? (
          <Empty illustration="projects" title="No outstanding invitations" />
        ) : (
          <>
            <div className="tbl-wrap">
              {/* Email · Status · Kind · Roles · Expires — identity never
                  drops; whether it is still outstanding is the decision
                  column; kind, roles and the expiry are reference and drop
                  first, in that order. */}
              <table className="tbl" data-priority>
                <thead>
                  <tr>
                    <th data-p="1">Email</th>
                    <th data-p="2">Status</th>
                    <th data-p="3">Kind</th>
                    <th data-p="4">Roles</th>
                    <th data-p="4">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.data.items.map((invite) => (
                    <tr key={invite.id}>
                      <td data-p="1">
                        {invite.displayName === null ? (
                          invite.email
                        ) : (
                          <>
                            {invite.displayName}
                            <span className="sub">{invite.email}</span>
                          </>
                        )}
                      </td>
                      <td data-p="2">
                        <Pill tone={invite.accepted ? "ok" : "waiting"}>
                          {invite.accepted
                            ? "Accepted"
                            : "Waiting to be accepted"}
                        </Pill>
                      </td>
                      <td data-p="3" data-label="Kind">
                        {/* Which application this will create a login for. An
                            outstanding invitation is a pending grant, so what it
                            grants belongs in the list rather than only in the
                            form that made it. */}
                        {KIND_LABELS[invite.kind] ?? invite.kind}
                      </td>
                      <td data-p="4" data-label="Roles">
                        {invite.roles.length === 0 ? (
                          <span className="muted">none</span>
                        ) : (
                          invite.roles.join(", ")
                        )}
                      </td>
                      <td data-p="4" data-label="Expires">
                        {invite.expiresAt.slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card-b">
              <Pager
                shown={inviteLinks?.shown ?? { from: 0, to: 0 }}
                of={invites.data.count}
                unit={invites.data.count === 1 ? "invitation" : "invitations"}
                next={inviteLinks?.next ?? null}
                prev={inviteLinks?.prev ?? null}
              />
            </div>
          </>
        )}
      </Section>

      <Section bare title="Invite someone">
        <div className="card-b">
          <InviteForm />
        </div>
      </Section>

      <AbsentNotice title="Project membership is changed on the project, not here">
        Adding somebody to a job is a decision made by whoever runs that job, on that
        project&rsquo;s own team screen. Putting a second write path here would mean two places to
        look when somebody has access they should not, and two places to remember when revoking it.
        Roles are on the Roles &amp; permissions tab for the same reason.
      </AbsentNotice>
    </>
  );
}

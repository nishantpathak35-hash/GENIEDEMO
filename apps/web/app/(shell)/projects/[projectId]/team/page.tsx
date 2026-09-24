import { API_ROUTES } from '@cog/contracts';
import { Empty, Pager, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { apiAsCaller } from '../../../../../lib/api';
import { ProjectHead } from '../header';

export const metadata = { title: 'Team · Project' };

/**
 * Who is on this project.
 *
 * `project_team` was one of the seventeen modules a role can be granted, with
 * no table behind it — a screen that could be permitted and did not exist.
 *
 * **This screen is scoped more narrowly than every other screen in the app.**
 * Everywhere else, being in the tenant is enough and row-level security does
 * the work. Here the server also asks whether the caller is on THIS project,
 * and answers 404 if not — a 403 would confirm the project exists and that
 * somebody else is on it, which across work for competing clients is worth
 * knowing.
 *
 * So a "not found" below is not necessarily a missing project. It is the same
 * answer for a project that is not yours, deliberately.
 */
export default async function ProjectTeamPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const team = await load(await apiAsCaller(), API_ROUTES.projectTeam, {
    params: { projectId },
  });

  if (team.kind === 'unreachable') return <UnreachableState />;
  if (team.kind === 'refused') return <Refusal error={team.error} />;

  return (
    <>
      <ProjectHead projectId={projectId} section="People" title="Team" />
    <Section bare title="Team">
      <div className="card-b">
        {team.data.items.length === 0 ? (
          <Empty illustration="projects" title="Nobody is on this project yet">
            Membership decides who can see this project&rsquo;s team, and adding people is an
            administrative action needing <code>manage_users</code> — being on a project must not
            by itself let you add to it.
          </Empty>
        ) : (
          <>
            {/* Person · On this project · Added — priority: identity never
                drops, "on this project" (the role) is the decision column,
                "added" is reference and drops first. */}
            <div className="tbl-wrap">
              <table className="tbl" data-priority>
                <thead>
                  <tr>
                    <th data-p="1">Person</th>
                    <th data-p="2">On this project</th>
                    <th data-p="4">Added</th>
                  </tr>
                </thead>
                <tbody>
                  {team.data.items.map((member) => (
                    <tr key={member.id}>
                      <td data-p="1">{member.email}</td>
                      <td data-p="2">
                        {member.designation === '' ? (
                          <span className="muted">—</span>
                        ) : (
                          member.designation
                        )}
                      </td>
                      <td className="muted" data-p="4">
                        {member.addedAt.slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              shown={{ from: 1, to: team.data.items.length }}
              of={team.data.items.length}
              unit="members"
            />
          </>
        )}
      </div>
    </Section>
    </>
  );
}

import type { ReactNode } from 'react';
import Link from 'next/link';
import { API_ROUTES } from '@cog/contracts';
import { Empty, Icon, Pager, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { apiAsCaller } from '../../lib/api';

export const metadata = { title: 'Your projects · Client portal' };
export const dynamic = 'force-dynamic';

/**
 * Your projects — the index above the design's single-project chrome.
 *
 * `10-portals.html` has no sample of this screen: its client-portal frame
 * goes straight into one project's Progress tab, because its sample client
 * (Meridian Systems) has exactly one. This app's data model allows more than
 * one project per client link, so the index stays — thin on purpose. The
 * stats the design shows (contract value, days reported, drawings issued,
 * measurements signed) live on each project's own Progress tab, not
 * duplicated here per row.
 */
export default async function ClientProjectsPage(): Promise<ReactNode> {
  const projects = await load(await apiAsCaller(), API_ROUTES.clientPortalProjects, {});

  if (projects.kind === 'unreachable') return <UnreachableState />;
  if (projects.kind === 'refused') return <Refusal error={projects.error} />;

  const items = projects.data.items;

  return (
    <div className="p-body">
      <div className="pgh">
        <h1 className="pt">Your projects</h1>
        <p className="ps">
            {items.length} project{items.length === 1 ? '' : 's'}
          </p>
      </div>

      {items.length === 0 ? (
        <Empty illustration="approvals" title="No project is linked to this account">
          If you expected to see one, your account may not be linked yet — ask your project
          contact to check.
        </Empty>
      ) : (
        <>
          <Section bare title="Projects">
            <ul className="list">
              {items.map((project) => (
                <li key={project.id}>
                  <Link href={`/projects/${project.id}`}>
                    <b>{project.name}</b>
                    {/* no internal code on a client's screen (10-portals): what was last reported from site instead */}
                    <small>{project.lastReportOn === null ? 'Not started on site yet' : `Last reported from site ${project.lastReportOn}`}</small>
                  </Link>
                  <Icon name="chevron" />
                </li>
              ))}
            </ul>
          </Section>
          <Pager shown={{ from: 1, to: items.length }} of={items.length} unit="projects" />
        </>
      )}
    </div>
  );
}

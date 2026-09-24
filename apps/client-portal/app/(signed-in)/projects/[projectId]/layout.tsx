import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { API_ROUTES } from '@cog/contracts';
import { PortalHead, Refusal, UnreachableState, load } from '@cog/design-system';
import { apiAsCaller } from '../../../../lib/api';
import { ProjectTabs } from './project-tabs';

/**
 * A project's own chrome — `10-portals.html`'s `.p-head` with the project's
 * name and its `.ptabs` (Progress · Variations · Documents · Billing).
 *
 * **There is no "get one client project by id" route** — only
 * `clientPortalProjects`, the list. This reads the whole list and finds the
 * one the URL names; a project this client is not linked to is simply not in
 * it, so it 404s rather than refuses — the same "a client asking about
 * somebody else's project learns nothing about whether it exists" rule the
 * variations screen already documented. `dynamic = 'force-dynamic'` on every
 * page under this layout means the list is read once per navigation, same as
 * every other portal screen; there is no separate single-project endpoint to
 * prefer over it.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const projects = await load(await apiAsCaller(), API_ROUTES.clientPortalProjects, {});

  if (projects.kind === 'unreachable') return <UnreachableState />;
  if (projects.kind === 'refused') return <Refusal error={projects.error} />;

  const project = projects.data.items.find((p) => p.id === projectId);
  if (project === undefined) notFound();

  // no internal code on a client's screen (10-portals): the project by its name, by the firm
  const me = await load(await apiAsCaller(), API_ROUTES.portalWhoami, {});
  return (
    <>
      <PortalHead organisation={me.kind === 'ok' ? me.data.organisation : project.name} sub={`${project.name} · by ${me.kind === 'ok' ? me.data.firm : 'your contractor'}`} tabs={<ProjectTabs projectId={projectId} />} />
      <div className="p-body">{children}</div>
    </>
  );
}

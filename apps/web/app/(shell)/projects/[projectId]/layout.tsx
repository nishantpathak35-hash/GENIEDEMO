import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../lib/api';
import { answer, load } from '@cog/design-system';

/**
 * One project. Its lifecycle is the sidebar's (`docs/design/03-navigation.html`,
 * the project's tree): no tab strip here, and no header here either — each
 * page carries the project's code as its first crumb, its section as the
 * second and its own title (`ProjectPageHeader`), so the head names the page
 * and the switcher in the bar names the project. The layout answers only for
 * a project that cannot be read: not here, or refused.
 *
 * The legacy's equivalent is `getProjectFullDossier` — one call returning
 * financials, POs, invoices, documents, drawings, DPRs, BOQ schedules and
 * recces together (`ProjectDetails.js:808`). Here each page reads only what it
 * shows, so a slow section cannot delay the rest and a refusal on one does not
 * take the page down.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const project = await load(await apiAsCaller(), API_ROUTES.getProject, { params: { projectId } });
  if (project.kind !== 'ok')
    return answer(project, { what: 'This project', backHref: '/projects', backLabel: 'Back to Projects' });
  return children;
}

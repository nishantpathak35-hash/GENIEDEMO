import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { answer, load } from '@cog/design-system';
import { apiAsCaller } from '../../../../../lib/api';
import { ReportsCenter } from '../../../reports/center';

export const metadata = { title: 'Reports · Project' };
export const dynamic = 'force-dynamic';

/** The project's reports — the Reports Center's nine, narrowed to this project. */
export default async function ProjectReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const project = await load(await apiAsCaller(), API_ROUTES.getProject, { params: { projectId } });
  if (project.kind !== 'ok') return answer(project, { what: 'This project', backHref: '/projects', backLabel: 'Back to Projects' });
  return <ReportsCenter params={await searchParams} project={project.data} />;
}

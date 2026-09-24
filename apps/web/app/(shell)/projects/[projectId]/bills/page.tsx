import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { answer, load } from '@cog/design-system';
import { apiAsCaller } from '../../../../../lib/api';
import { BillsList } from '../../../money/bills/list';

export const metadata = { title: 'Bills · Project' };
export const dynamic = 'force-dynamic';

/** The project's bills — against its orders; the firm's list narrowed, its owe card and stats the project's (06-projects, the twins). */
export default async function ProjectBillsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const project = await load(await apiAsCaller(), API_ROUTES.getProject, { params: { projectId } });
  if (project.kind !== 'ok') return answer(project, { what: 'This project', backHref: '/projects', backLabel: 'Back to Projects' });
  return <BillsList params={await searchParams} project={project.data} />;
}

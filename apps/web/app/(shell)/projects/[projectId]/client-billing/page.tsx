import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { answer, load } from '@cog/design-system';
import { apiAsCaller } from '../../../../../lib/api';
import { ClientBillingList } from '../../../money/client-billing/list';

export const metadata = { title: 'Client billing · Project' };
export const dynamic = 'force-dynamic';

/** The project's client billing — invoices on this contract; the firm's list narrowed, its owe card and stats the project's (06-projects, the twins). */
export default async function ProjectClientBillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const project = await load(await apiAsCaller(), API_ROUTES.getProject, { params: { projectId } });
  if (project.kind !== 'ok') return answer(project, { what: 'This project', backHref: '/projects', backLabel: 'Back to Projects' });
  return <ClientBillingList params={await searchParams} project={project.data} />;
}

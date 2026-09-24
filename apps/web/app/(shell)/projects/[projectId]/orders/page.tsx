import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { answer, load } from '@cog/design-system';
import { apiAsCaller } from '../../../../../lib/api';
import { OrdersList } from '../../../purchase-orders/list';

export const metadata = { title: 'Orders · Project' };
export const dynamic = 'force-dynamic';

/** The project's orders — the firm's list narrowed to this project, the Project column dropped; the plan is its second tab. */
export default async function ProjectOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const project = await load(await apiAsCaller(), API_ROUTES.getProject, { params: { projectId } });
  if (project.kind !== 'ok') return answer(project, { what: 'This project', backHref: '/projects', backLabel: 'Back to Projects' });
  return <OrdersList params={await searchParams} project={project.data} />;
}

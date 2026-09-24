import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { answer, load } from '@cog/design-system';
import { apiAsCaller } from '../../../../../lib/api';
import { DocumentsVault } from '../../../documents/vault';

export const metadata = { title: 'Documents · Project' };
export const dynamic = 'force-dynamic';

/** The project's vault — the firm's list narrowed to this project's files, the Project column dropped (06-projects, the twins). */
export default async function ProjectDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const project = await load(await apiAsCaller(), API_ROUTES.getProject, { params: { projectId } });
  if (project.kind !== 'ok') return answer(project, { what: 'This project', backHref: '/projects', backLabel: 'Back to Projects' });
  return <DocumentsVault params={await searchParams} project={project.data} />;
}

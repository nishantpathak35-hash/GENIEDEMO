import type { ReactNode } from 'react';
import Link from 'next/link';
import { API_ROUTES } from '@cog/contracts';
import { Empty, Section, answer, load } from '@cog/design-system';
import { apiAsCaller } from '../../../../../lib/api';
import { StockList } from '../../../inventory/list';
import { ProjectPageHeader } from '../header';

export const metadata = { title: 'Stock · Project' };
export const dynamic = 'force-dynamic';

/**
 * The project's stock — its site store, one of the stores the firm keeps
 * (`stock_locations` of kind `site` naming this project); the central store
 * stays at the firm level (06-projects, the twins). A project with no site
 * store yet says so and points at where one is made.
 */
export default async function ProjectStockPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const client = await apiAsCaller();
  const [project, locations] = await Promise.all([
    load(client, API_ROUTES.getProject, { params: { projectId } }),
    load(client, API_ROUTES.listStockLocations, {}),
  ]);
  if (project.kind !== 'ok') return answer(project, { what: 'This project', backHref: '/projects', backLabel: 'Back to Projects' });
  const store = locations.kind === 'ok' ? (locations.data.items.find((l) => l.projectId === projectId && !l.retired) ?? null) : null;
  if (store === null) {
    return (
      <>
        <ProjectPageHeader project={project.data} section="Build" title="Stock" />
        <Section title="Site store">
          <Empty
            illustration="stock"
            title="No site store for this project yet"
            action={
              <Link className="btn primary" href="/settings/stock-locations">
                Add a site store
              </Link>
            }
          >
            {locations.kind === 'ok' ? 'Stock is kept per store; add one for this site under Settings › Stock locations and receipts and issues land here.' : 'The stores could not be read.'}
          </Empty>
        </Section>
      </>
    );
  }
  return <StockList params={await searchParams} project={project.data} store={store.name} />;
}

import type { ReactNode } from 'react';
import Link from 'next/link';
import { API_ROUTES, type Project } from '@cog/contracts';
import { AppliedFilters, Empty, Icon, KebabMenu, ListCard, ListPager, ListToolbar, PageHeader, Refusal, Section, Stat, StatRow, UnreachableState, load } from '@cog/design-system';
import { relabel, type Terms } from '@cog/design-system';
import { apiAsCaller } from '../../../lib/api';
import { terms } from '../../../lib/terms';
import { exportHref } from '../../../lib/export';
import { applied, listAddress, pageSizeOf, withView } from '../../../lib/lists';
import { pageLinks, pageState } from '../../../lib/paging';
import { ViewsMenu } from '../../_components/views-menu';
import { ProjectPageHeader } from '../projects/[projectId]/header';
import { DocsList } from './docs-list';
import { RegisterDocumentForm } from './forms';

const VALUE = 'Find the signed drawing or the vendor’s bill in one search, instead of asking who has the latest copy.';

/**
 * The vault — `docs/design/06-projects.html`, "Project › Documents — the
 * vault": folders as the stats, the list under them, one search that reaches
 * every file. At the firm level (`/documents`) it is every file with a
 * Project column and filter; inside a project it is the same list narrowed to
 * that project's files (`workflow.documents.project_id`, 0105), the Project
 * column dropped.
 *
 * **No download link, no preview, no versions.** An object is fetched through
 * a signed URL minted per request — a permanent URL in a list is VAULT-01,
 * `public/uploads/` served with no session, no tenant check and no expiry,
 * holding signed contracts. The vault records one object per registration and
 * no revision chain; a preview needs a byte path this API deliberately does
 * not have. Both are HUMAN(DATA) items in the report, not drawn as if they
 * existed. Bulk actions offer what exists: Delete.
 */
export async function DocumentsVault({
  params,
  project,
}: {
  params: Record<string, string | undefined>;
  /** Inside a project, the project — the list is its own and the Project column goes. */
  project: Project | null;
}): Promise<ReactNode> {
  const client = await apiAsCaller();
  const t = await terms();
  const listKey = project === null ? 'documents' : 'project-documents';
  const base = project === null ? '/documents' : `/projects/${project.id}/documents`;
  const keys = project === null ? (['folder', 'project', 'q'] as const) : (['folder', 'q'] as const);

  const viewId = params['view'] ?? null;
  const views = await load(client, API_ROUTES.savedViews, { query: { list: listKey } });
  const view = viewId === null || views.kind !== 'ok' ? null : (views.data.items.find((v) => v.id === viewId) ?? null);
  const p = withView(params, view?.criteria ?? null);

  const q = (p['q'] ?? '').trim();
  const folderFilter = p['folder'] ?? '';
  const projectFilter = project === null ? (p['project'] ?? '') : project.id;
  const anyFilter = q !== '' || folderFilter !== '' || (project === null && projectFilter !== '');
  const limit = pageSizeOf(p);
  const paging = pageState(p, '', limit);

  const [documents, everyDocument, projects, me] = await Promise.all([
    load(client, API_ROUTES.listDocuments, {
      query: { ...paging.query, ...(folderFilter === '' ? {} : { folder: folderFilter }), ...(q === '' ? {} : { q }), ...(projectFilter === '' ? {} : { projectId: projectFilter }) },
    }),
    // the whole vault's (or the whole project's) folder stats and total, one row's worth
    anyFilter || project !== null ? load(client, API_ROUTES.listDocuments, { query: { limit: '1', ...(project === null ? {} : { projectId: project.id }) } }) : null,
    project === null ? load(client, API_ROUTES.listProjects, { query: { limit: '200' } }) : null,
    load(client, API_ROUTES.myEntitlements, {}),
  ]);
  const { hrefFor, perPageHrefs, clearAll, criteria } = listAddress(base, p, keys);

  if (documents.kind === 'unreachable') return <UnreachableState />;

  const mayShare = me.kind === 'ok' && me.data.actions.includes('manage_settings');
  const mayUpload = me.kind === 'ok' && me.data.actions.includes('upload_document');
  const codeOf = new Map(projects !== null && projects.kind === 'ok' ? projects.data.items.map((pr) => [pr.id, pr.code]) : []);
  const whole = everyDocument !== null && everyDocument.kind === 'ok' ? everyDocument.data.summary : documents.kind === 'ok' ? documents.data.summary : null;
  const totalCount = whole?.total ?? 0;
  const folderStats = (whole?.byFolder ?? []).slice(0, 4);

  const chips = applied(hrefFor, [
    { key: 'folder', label: 'Folder', value: folderFilter, show: folderWord },
    ...(project === null ? [{ key: 'project', label: 'Project', value: projectFilter, show: (v: string) => codeOf.get(v) ?? v }] : []),
    { key: 'q', label: 'Search', value: q },
  ]);

  const title =
    views.kind === 'ok' ? (
      <ViewsMenu listKey={listKey} base={base} views={views.data.items} currentViewId={view?.id ?? null} defaultName="All documents" criteria={criteria} columns={null} mayShare={mayShare} />
    ) : (
      'All documents'
    );
  const sub = documents.kind === 'ok' ? <>{totalCount} {totalCount === 1 ? 'file' : 'files'} in the vault · searchable from every screen</> : undefined;
  const more = <KebabMenu sortHrefs={[]} exportHref={exportHref('documents', p, ['q', 'folder'])} refreshHref={hrefFor({})} />;
  const primary = mayUpload ? (
    <Link className="btn primary" href={`${hrefFor({ new: '1' })}#register`}>
      <Icon name="plus" />
      Upload
    </Link>
  ) : undefined;
  const header =
    project === null ? (
      <PageHeader title={title} help={VALUE} sub={sub} more={more} {...(primary === undefined ? {} : { primary })} />
    ) : (
      <ProjectPageHeader project={project} section="Design" title={title} help={VALUE} sub={sub} more={more} {...(primary === undefined ? {} : { primary })} />
    );

  if (documents.kind === 'refused') {
    return (
      <>
        {header}
        <ListCard label="Documents">
          <div className="card-b">
            <Refusal error={documents.error} />
          </div>
        </ListCard>
      </>
    );
  }
  const links = pageLinks(paging, documents.data, hrefFor, limit);

  const toolbar = (
    <ListToolbar
      formAction={base}
      search={{ name: 'q', placeholder: 'Name, folder or who uploaded', value: p['q'] ?? '', label: 'Search documents' }}
      hidden={viewId === null ? {} : { view: viewId }}
      filters={[
        {
          key: 'folder',
          label: 'Folder',
          value: folderFilter === '' ? null : folderWord(folderFilter, t),
          control: (
            <div className="field">
              <label htmlFor="f-folder">Folder</label>
              <select id="f-folder" name="folder" defaultValue={folderFilter}>
                <option value="">All</option>
                {(whole?.byFolder ?? []).map((f) => (
                  <option key={f.folder} value={f.folder}>
                    {folderWord(f.folder, t)}
                  </option>
                ))}
              </select>
            </div>
          ),
        },
        ...(project === null
          ? [
              {
                key: 'project',
                label: 'Project',
                value: projectFilter === '' ? null : (codeOf.get(projectFilter) ?? projectFilter),
                control: (
                  <div className="field">
                    <label htmlFor="f-project">Project</label>
                    <select id="f-project" name="project" defaultValue={projectFilter}>
                      <option value="">All</option>
                      {[...codeOf].map(([id, code]) => (
                        <option key={id} value={id}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </div>
                ),
              },
            ]
          : []),
      ]}
      exportHref={exportHref('documents', p, ['q', 'folder'])}
    />
  );

  const body =
    totalCount === 0 ? (
      <Empty
        illustration="documents"
        title="Nothing in the vault yet"
        {...(primary === undefined ? {} : { action: primary })}
      >
        {project === null ? 'Every file registered against a project, an order or a vendor lands here.' : 'Every file registered against this project, or one of its orders, lands here.'}
      </Empty>
    ) : documents.data.count === 0 ? (
      <Empty
        illustration="search"
        variant="filtered"
        title={`No document matches ${chips.length === 1 ? 'this filter' : 'these filters'}`}
        action={
          <a className="btn primary" href={clearAll}>
            {chips.length === 1 ? 'Clear the filter' : 'Clear the filters'}
          </a>
        }
      >
        {chips.map((c) => `${c.label} ${c.value}`).join(' · ')}. Widen it, or drop one.
      </Empty>
    ) : (
      <DocsList
        rows={documents.data.items.map((doc) => ({
          id: doc.id,
          fileName: doc.fileName,
          contentType: doc.contentType,
          sizeBytes: doc.sizeBytes,
          entityType: doc.entityType,
          entityId: doc.entityId,
          createdAt: doc.createdAt,
          projectCode: project !== null || doc.projectId === null ? null : (codeOf.get(doc.projectId) ?? null),
        }))}
      />
    );

  return (
    <>
      {header}
      {folderStats.length < 2 ? null : (
        <StatRow n={folderStats.length >= 4 ? 4 : folderStats.length === 3 ? 3 : 2}>
          {folderStats.map((f) => (
            <Stat key={f.folder} label={folderWord(f.folder, t)} value={f.count} lift />
          ))}
        </StatRow>
      )}
      <div data-hero>
        <ListCard
          label="Documents"
          toolbar={totalCount === 0 ? undefined : toolbar}
          applied={<AppliedFilters applied={chips} clearAllHref={clearAll} />}
          pager={
            totalCount === 0 ? undefined : (
              <ListPager
                from={links.shown.from}
                to={links.shown.to}
                total={documents.data.count}
                unit="documents"
                perPage={limit}
                prevHref={links.prev}
                nextHref={links.next}
                perPageHrefs={perPageHrefs}
                {...(anyFilter ? { filteredFrom: totalCount } : {})}
              />
            )
          }
        >
          {body}
        </ListCard>
      </div>

      {p['new'] === '1' && mayUpload ? (
        <Section bare title="Register an object" sub="the file is put in object storage by its key; this records it">
          <div className="card-b" id="register">
            <RegisterDocumentForm {...(project === null ? {} : { project: { id: project.id, code: project.code } })} />
          </div>
        </Section>
      ) : null}
    </>
  );
}

/** A folder is the record kind a file hangs off, in the customer's word — the firm's, when it chose one. */
export function folderWord(entityType: string, t?: Terms): string {
  const word = FOLDER[entityType] ?? entityType;
  return t === undefined ? word : relabel(word, t);
}
const FOLDER: Readonly<Record<string, string>> = {
  project: 'Projects',
  purchase_order: 'Orders',
  vendor: 'Vendors',
  change_order: 'Variations',
  boq_item: 'BOQ lines',
  lead: 'Leads',
  site_report: 'Daily reports',
};

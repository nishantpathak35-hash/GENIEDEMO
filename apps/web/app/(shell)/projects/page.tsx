import type { ReactNode } from 'react';
import Link from 'next/link';
import { API_ROUTES } from '@cog/contracts';
import { AppliedFilters, ColumnControl, Empty, Icon, KebabMenu, ListCard, ListPager, ListTable, ListToolbar, Money, MoneyExact, PageHeader, Progress, Pill, Refusal, Section, UnreachableState, load, type Column, type Row } from '@cog/design-system';
import { apiAsCaller } from '../../../lib/api';
import { terms } from '../../../lib/terms';
import { exportHref } from '../../../lib/export';
import { applied, listAddress, pageSizeOf, withView } from '../../../lib/lists';
import { pageLinks, pageState } from '../../../lib/paging';
import { rememberColumns } from '../../actions/preferences';
import { ViewsMenu } from '../../_components/views-menu';
import { NewProjectForm } from './form';
import { healthLabel, healthTone, projectStateLabel } from './vocabulary';

export const metadata = { title: 'Projects · Construct-O-Genie' };
export const dynamic = 'force-dynamic';

/**
 * Projects — `docs/design/06-projects.html`, "the list, ordered against
 * contract in one column". The chooser itself, so it is never drawn inside a
 * project.
 *
 * *See which project is over its contract before the next order makes it worse.*
 *
 * Every figure is the server's: the health and the ordered share come from
 * the rollup (`/rollups/projects`), computed over every project, never over
 * the page on screen — a screen must not compare `committed` against
 * `contractValue` itself, which is the mistake `ProjectsSidebar.js:10` makes
 * (PROJ-01). The state tabs and the search are the address (`?state=`,
 * `?q=`), answered by the server; the empty query is All, the design's own
 * default. **No Health filter and no sort control:** health and the ordered
 * share are the rollup's, computed over every project, and the list read
 * takes neither as a parameter — a screen that narrowed or reordered the
 * page it was sent would be doing the thing `13-decisions` names as the
 * defect that looks like a feature. Recorded, not faked.
 */
const LIST = 'projects';
const BASE = '/projects';
const FILTER_KEYS = ['state', 'q'] as const;
const VALUE = 'See which project is over its contract before the next order makes it worse.';

// The design's default sample is the "All" tab, so the empty query string means All.
const STATE_TABS = [
  { value: 'in_progress', label: 'In progress' },
  { value: 'won', label: 'Won' },
  { value: 'handed_over', label: 'Handed over' },
  { value: '', label: 'All' },
] as const;

const COLUMNS: readonly Column[] = [
  { key: 'project', label: 'Project', p: 1 },
  { key: 'health', label: 'Health', p: 2 },
  { key: 'contract', label: 'Contract', p: 3, num: true },
  { key: 'ordered', label: 'Ordered so far', p: 2, num: true },
  { key: 'share', label: 'Ordered against contract', p: 2, num: true },
  { key: 'margin', label: 'Margin at risk', p: 3, num: true },
];

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<ReactNode> {
  const raw = await searchParams;
  const client = await apiAsCaller();
  const t = await terms();

  const viewId = raw['view'] ?? null;
  const views = await load(client, API_ROUTES.savedViews, { query: { list: LIST } });
  const view = viewId === null || views.kind !== 'ok' ? null : (views.data.items.find((v) => v.id === viewId) ?? null);
  const params = withView(raw, view?.criteria ?? null);

  const stateAsked = params['state'] ?? '';
  const activeTab = STATE_TABS.find((t) => t.value === stateAsked) ?? STATE_TABS[3];
  const q = (params['q'] ?? '').trim();
  const anyFilter = activeTab.value !== '' || q !== '';
  const limit = pageSizeOf(params);
  const paging = pageState(params, '', limit);

  const [projects, everyProject, inProgress, prefs, me] = await Promise.all([
    load(client, API_ROUTES.listProjects, { query: { ...paging.query, ...(activeTab.value === '' ? {} : { state: activeTab.value }), ...(q === '' ? {} : { q }) } }),
    anyFilter ? load(client, API_ROUTES.listProjects, { query: { limit: '1' } }) : null,
    load(client, API_ROUTES.listProjects, { query: { state: 'in_progress', limit: '1' } }),
    load(client, API_ROUTES.preferences, {}),
    load(client, API_ROUTES.myEntitlements, {}),
  ]);
  const { hrefFor, perPageHrefs, clearAll, criteria } = listAddress(BASE, params, FILTER_KEYS);

  if (projects.kind === 'unreachable') return <UnreachableState />;

  const mayShare = me.kind === 'ok' && me.data.actions.includes('manage_settings');
  const chosen = prefs.kind === 'ok' ? (prefs.data.columns[LIST] ?? null) : null;
  const columns = COLUMNS.filter((c) => c.p === 1 || chosen === null || chosen.includes(c.key));
  const chips = applied(hrefFor, [{ key: 'q', label: 'Search', value: q }]);

  const tabs = (
    <nav className="subtabs" aria-label="Views">
      {STATE_TABS.map((tab) => (
        <a key={tab.value} href={hrefFor({ state: tab.value === '' ? undefined : tab.value })} {...(tab.value === activeTab.value ? { 'aria-current': 'page' as const } : {})}>
          {tab.label}
        </a>
      ))}
    </nav>
  );

  // the rollup's figures for the projects on this page — health, ordered share, margin at risk
  const ids = projects.kind === 'ok' ? projects.data.items.map((p) => p.id).join(',') : '';
  const rollup = projects.kind === 'ok' ? await load(client, API_ROUTES.projectRollup, { query: ids === '' ? { limit: '1' } : { ids } }) : null;
  const figuresOf = new Map(rollup !== null && rollup.kind === 'ok' ? rollup.data.items.map((p) => [p.id, p]) : []);
  const inProgressCount = inProgress.kind === 'ok' ? inProgress.data.count : 0;
  const totalCount = everyProject !== null && everyProject.kind === 'ok' ? everyProject.data.count : projects.kind === 'ok' ? projects.data.count : 0;

  const header = (
    <PageHeader
      title={
        views.kind === 'ok' ? (
          <ViewsMenu listKey={LIST} base={BASE} views={views.data.items} currentViewId={view?.id ?? null} defaultName="All projects" criteria={criteria} columns={chosen} mayShare={mayShare} />
        ) : (
          'All projects'
        )
      }
      help={VALUE}
      sub={
        projects.kind === 'ok' ? (
          <>
            {totalCount} {totalCount === 1 ? 'project' : 'projects'} · {inProgressCount} in progress
            {rollup !== null && rollup.kind === 'ok' ? (
              <>
                {' · '}
                <Money wire={rollup.data.orderedSoFar} /> ordered so far
              </>
            ) : null}
          </>
        ) : undefined
      }
      more={<KebabMenu sortHrefs={[]} exportHref={exportHref('projects', params, ['state'])} refreshHref={hrefFor({})} />}
      primary={
        <Link className="btn primary" href={`${hrefFor({ new: '1' })}#new-project`}>
          <Icon name="plus" />
          New project
        </Link>
      }
      tabs={tabs}
    />
  );

  if (projects.kind === 'refused') {
    return (
      <>
        {header}
        <ListCard label="Projects">
          <div className="card-b">
            <Refusal error={projects.error} />
          </div>
        </ListCard>
      </>
    );
  }
  const links = pageLinks(paging, projects.data, hrefFor, limit);
  // one filter on: the tab alone, or the search alone
  const oneFilter = (activeTab.value === '') !== (q === '');
  const atRiskPct = rollup !== null && rollup.kind === 'ok' ? rollup.data.threshold.atRiskPct : null;

  // the server's order — newest first; the rollup's figures joined by id
  const rows: Row[] = projects.data.items.map((p) => {
    const figures = figuresOf.get(p.id);
    const pct = figures?.orderedPct ?? null;
    return {
      key: p.id,
      href: `/projects/${p.id}`,
      selectLabel: p.code,
      cells: [
        <span key="p">
          <Link href={`/projects/${p.id}`}>{p.code}</Link>
          <span className="sub">
            {p.name} · {p.clientName}
          </span>
        </span>,
        figures === undefined ? (
          <span key="h" className="muted">
            Not read
          </span>
        ) : (
          <Pill key="h" tone={healthTone(figures.health)}>
            {healthLabel(figures.health)}
          </Pill>
        ),
        p.originalValue === null ? (
          <span key="c" className="muted" title="No contract value yet">
            —
          </span>
        ) : (
          <MoneyExact key="c" wire={p.originalValue} />
        ),
        <MoneyExact key="o" wire={figures?.committed ?? '0'} />,
        pct === null ? (
          <span key="s" className="muted" title="No contract value is recorded, so nothing to order against">
            —
          </span>
        ) : (
          <span key="s" className="prog-cell">
            <Progress pct={pct} low={atRiskPct !== null && pct > 100} />
            <small>{pct}%</small>
          </span>
        ),
        figures === undefined || figures.margin.status === 'no-boq' || figures.margin.atRisk === null ? (
          <span key="m" className="muted" title={`No ${t.boq}, so no cost budget to measure approved orders against`}>
            —
          </span>
        ) : (
          <span key="m">
            <MoneyExact wire={figures.margin.atRisk} />
            {figures.margin.status === 'partial' ? <span className="sub num">partial · {figures.margin.unpricedLines} unpriced</span> : null}
          </span>
        ),
      ],
      detail: (
        <>
          {projectStateLabel(p.state)}
          {figures === undefined ? '' : ` · ${healthLabel(figures.health)}`}
        </>
      ),
    };
  });

  const toolbar = (
    <ListToolbar
      formAction={BASE}
      search={{ name: 'q', placeholder: 'Code, project or client', value: params['q'] ?? '', label: 'Code, project or client' }}
      hidden={{ ...(activeTab.value === '' ? {} : { state: activeTab.value }), ...(viewId === null ? {} : { view: viewId }) }}
      columns={<ColumnControl listKey={LIST} columns={COLUMNS.map((c) => ({ key: c.key, label: c.label, locked: c.p === 1 }))} chosen={chosen} action={chooseColumns} />}
      exportHref={exportHref('projects', params, ['state'])}
    />
  );

  const body =
    totalCount === 0 ? (
      <Empty
        illustration="projects"
        title="No projects yet"
        action={
          <Link className="btn primary" href={`${hrefFor({ new: '1' })}#new-project`}>
            <Icon name="plus" />
            New project
          </Link>
        }
      >
        Create one to start recording a BOQ, orders and site activity against it — or hand a won lead over from Sales.
      </Empty>
    ) : rows.length === 0 ? (
      <Empty
        illustration="search"
        variant="filtered"
        title={`No project matches ${oneFilter ? 'this filter' : 'these filters'}`}
        action={
          <a className="btn primary" href={clearAll}>
            {oneFilter ? 'Clear the filter' : 'Clear the filters'}
          </a>
        }
      >
        {[...(activeTab.value === '' ? [] : [`State ${activeTab.label}`]), ...chips.map((c) => `${c.label} ${c.value}`)].join(' · ')}. Widen it, or drop one.
      </Empty>
    ) : (
      <ListTable label="Projects" columns={columns} rows={rows} />
    );

  return (
    <>
      {header}
      <ListCard
        label="Projects"
        toolbar={totalCount === 0 ? undefined : toolbar}
        applied={<AppliedFilters applied={chips} clearAllHref={clearAll} />}
        pager={
          totalCount === 0 ? undefined : (
            <ListPager
              from={links.shown.from}
              to={links.shown.to}
              total={projects.data.count}
              unit="projects"
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

      {params['new'] === '1' ? (
        <Section bare title="New project">
          <div className="card-b" id="new-project">
            <NewProjectForm />
          </div>
        </Section>
      ) : null}
    </>
  );
}

async function chooseColumns(form: FormData): Promise<void> {
  'use server';
  const reset = form.get('reset') === '1';
  const columns = form.getAll('column').map(String);
  await rememberColumns(LIST, reset ? null : columns, BASE);
}

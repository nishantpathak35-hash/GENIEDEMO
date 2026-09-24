import type { ReactNode } from 'react';
import Link from 'next/link';
import { API_ROUTES } from '@cog/contracts';
import { AppliedFilters, ColumnControl, Empty, Icon, KebabMenu, ListCard, ListPager, ListTable, ListToolbar, PageHeader, Pill, Refusal, Section, Sparkline, Stat, StatRow, UnreachableState, load, type Column, type Row } from '@cog/design-system';
import { apiAsCaller } from '../../../lib/api';
import { columnsIn, terms } from '../../../lib/terms';
import { exportHref } from '../../../lib/export';
import { applied, listAddress, pageSizeOf, withView } from '../../../lib/lists';
import { pageLinks, pageState } from '../../../lib/paging';
import { chooseColumns } from '../../actions/preferences';
import { ViewsMenu } from '../../_components/views-menu';
import { NewDailyReportForm } from './forms';

export async function generateMetadata(): Promise<{ title: string }> {
  return { title: `${(await terms()).dailyReports} · Construct-O-Genie` };
}
export const dynamic = 'force-dynamic';

/**
 * Site › Daily reports — `docs/design/08-site.html`, "Site › Daily log".
 *
 * *See which sites have not filed today, before the day is gone.*
 *
 * The stat that changed shape (VALUE-MAP): sites with no report today,
 * naming them — the server's `siteToday.sites[]` — in place of reports filed
 * today, a count going up. The day card is the newest report on file; the
 * list is every report with its site as the Project column and filter, the
 * firm's, on the pattern. Inside a project the same reports are its Site page.
 *
 * **A report has no issues or photos of its own** — site issues are the
 * site's (`siteToday.openIssues`), and nothing attaches a photo to a report
 * (HUMAN(DATA)); the day card says what it has.
 */
const LIST = 'daily-reports';
const BASE = '/site-reports';
const FILTER_KEYS = ['project', 'sort'] as const;
const VALUE = 'See which sites have not filed today, before the day is gone.';

const COLUMNS: readonly Column[] = [
  { key: 'day', label: 'Day', p: 1, sort: null },
  { key: 'site', label: 'Site', p: 1 },
  { key: 'onsite', label: 'On site', p: 2, num: true },
  { key: 'status', label: 'Status', p: 3 },
  { key: 'open', label: '', p: 3 },
];

export default async function SiteReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<ReactNode> {
  const raw = await searchParams;
  const client = await apiAsCaller();
  const t = await terms();

  const viewId = raw['view'] ?? null;
  const views = await load(client, API_ROUTES.savedViews, { query: { list: LIST } });
  const view = viewId === null || views.kind !== 'ok' ? null : (views.data.items.find((v) => v.id === viewId) ?? null);
  const params = withView(raw, view?.criteria ?? null);

  const projectFilter = params['project'] ?? '';
  const sortDir: 'asc' | 'desc' = params['sort'] === 'date:asc' ? 'asc' : 'desc';
  const anyFilter = projectFilter !== '';
  const limit = pageSizeOf(params);
  const paging = pageState(params, '', limit);
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  const [reports, everyReport, projects, site, prefs, me] = await Promise.all([
    load(client, API_ROUTES.listDailyReports, { query: { ...paging.query, sort: sortDir, ...(projectFilter === '' ? {} : { projectId: projectFilter }) } }),
    anyFilter ? load(client, API_ROUTES.listDailyReports, { query: { limit: '1' } }) : null,
    load(client, API_ROUTES.listProjects, { query: { limit: '200' } }),
    load(client, API_ROUTES.siteToday, { query: { date: todayKey } }),
    load(client, API_ROUTES.preferences, {}),
    load(client, API_ROUTES.myEntitlements, {}),
  ]);
  const { hrefFor, perPageHrefs, clearAll, criteria } = listAddress(BASE, params, FILTER_KEYS);

  if (reports.kind === 'unreachable') return <UnreachableState />;

  const mayShare = me.kind === 'ok' && me.data.actions.includes('manage_settings');
  const chosen = prefs.kind === 'ok' ? (prefs.data.columns[LIST] ?? null) : null;
  const columns = columnsIn(COLUMNS, t).filter((c) => c.p === 1 || chosen === null || chosen.includes(c.key));
  const withSort: readonly Column[] = columns.map((c): Column =>
    c.sort === undefined ? c : { ...c, sort: sortDir, sortHref: hrefFor({ sort: sortDir === 'desc' ? 'date:asc' : undefined }) },
  );
  const projectItems = projects.kind === 'ok' ? projects.data.items : [];
  const codeOf = new Map(projectItems.map((p) => [p.id, p.code]));
  const s = site.kind === 'ok' ? site.data : null;
  const notFiled = s === null ? [] : s.sites.filter((x) => !x.reportedToday);
  const spark = s === null ? [] : s.byDay.map((d) => d.onSite).filter((v): v is number => v !== null);

  const chips = applied(hrefFor, [{ key: 'project', label: 'Site', value: projectFilter, show: (v) => codeOf.get(v) ?? v }]);
  const totalCount = everyReport !== null && everyReport.kind === 'ok' ? everyReport.data.count : reports.kind === 'ok' ? reports.data.count : 0;

  const header = (
    <PageHeader
      crumbs={[{ href: '/site-reports', label: 'Site' }]}
      title={
        views.kind === 'ok' ? (
          <ViewsMenu listKey={LIST} base={BASE} views={views.data.items} currentViewId={view?.id ?? null} defaultName="All reports" criteria={criteria} columns={chosen} mayShare={mayShare} />
        ) : (
          'All reports'
        )
      }
      help={VALUE}
      sub={
        s === null ? undefined : (
          <>
            daily reports from {s.sitesTotal} {s.sitesTotal === 1 ? 'site' : 'sites'} · {s.sitesReporting === 0 ? 'none filed today yet' : `${String(s.sitesReporting)} filed today`}
            {s.latestReportOn !== null && s.latestReportOn !== s.date ? ` · ${String(s.sitesReportingOnLatest)} on ${s.latestReportOn}` : ''}
          </>
        )
      }
      more={
        <KebabMenu
          sortHrefs={[
            ['Newest first', hrefFor({ sort: undefined })],
            ['Oldest first', hrefFor({ sort: 'date:asc' })],
          ]}
          exportHref={exportHref('site-reports', params, ['project', 'sort'])}
          refreshHref={hrefFor({})}
        />
      }
      primary={
        <Link className="btn primary" href={`${hrefFor({ new: '1' })}#record`}>
          <Icon name="plus" />
          New daily report
        </Link>
      }
    />
  );

  if (reports.kind === 'refused') {
    return (
      <>
        {header}
        <ListCard label={t.dailyReports}>
          <div className="card-b">
            <Refusal error={reports.error} />
          </div>
        </ListCard>
      </>
    );
  }
  const links = pageLinks(paging, reports.data, hrefFor, limit);
  const newest = reports.data.items[0] ?? null;

  // no Status filter: the list read takes none, and a page narrowed in the browser is not a filter
  const rows: Row[] = reports.data.items.map((r) => ({
    key: r.id,
    href: `/projects/${r.projectId}/site`,
    selectLabel: `${codeOf.get(r.projectId) ?? r.projectId.slice(0, 8)} on ${r.reportDate}`,
    cells: [
      <span key="d" className="nowrap">
        {shortDate(r.reportDate)}
      </span>,
      <Link key="s" href={`/projects/${r.projectId}/site`}>
        {codeOf.get(r.projectId) ?? r.projectId.slice(0, 8)}
      </Link>,
      r.headCount === null ? (
        <span key="o" className="muted" title="No head count recorded on this report">
          —
        </span>
      ) : (
        <span key="o">{r.headCount}</span>
      ),
      <Pill key="f" tone={r.submitted ? 'ok' : 'idle'}>
        {r.submitted ? 'Filed' : 'Draft'}
      </Pill>,
      <Link key="l" href={`/projects/${r.projectId}/site`}>
        Open
      </Link>,
    ],
    detail: <>{r.submitted ? 'Filed' : 'Draft'}{r.headCount === null ? '' : ` · ${String(r.headCount)} on site`}</>,
  }));

  const toolbar = (
    <ListToolbar
      formAction={BASE}
      hidden={{ ...(sortDir === 'asc' ? { sort: 'date:asc' } : {}), ...(viewId === null ? {} : { view: viewId }) }}
      filters={[
        {
          key: 'project',
          label: 'Site',
          value: projectFilter === '' ? null : (codeOf.get(projectFilter) ?? projectFilter),
          control: (
            <div className="field">
              <label htmlFor="f-site">Site</label>
              <select id="f-site" name="project" defaultValue={projectFilter}>
                <option value="">All</option>
                {projectItems.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code}
                  </option>
                ))}
              </select>
            </div>
          ),
        },
      ]}
      columns={<ColumnControl listKey={LIST} columns={columnsIn(COLUMNS, t).map((c) => ({ key: c.key, label: c.label === '' ? 'Open' : c.label, locked: c.p === 1 }))} chosen={chosen} action={chooseColumns.bind(null, BASE)} />}
      exportHref={exportHref('site-reports', params, ['project', 'sort'])}
    />
  );

  const body =
    totalCount === 0 ? (
      <Empty
        illustration="daily"
        title={`No ${t.dailyReportLower} yet`}
        action={
          <Link className="btn primary" href={`${hrefFor({ new: '1' })}#record`}>
            <Icon name="plus" />
            New daily report
          </Link>
        }
      >
        The site files one a day, from a phone; the head count and the notes land here.
      </Empty>
    ) : rows.length === 0 ? (
      <Empty
        illustration="search"
        variant="filtered"
        title={`No report matches ${chips.length === 1 ? 'this filter' : 'these filters'}`}
        action={
          <a className="btn primary" href={clearAll}>
            {chips.length === 1 ? 'Clear the filter' : 'Clear the filters'}
          </a>
        }
      >
        {chips.map((c) => `${c.label} ${c.value}`).join(' · ')}. Widen it, or drop one.
      </Empty>
    ) : (
      <ListTable label={t.dailyReports} columns={withSort} rows={rows} />
    );

  return (
    <>
      {header}

      <StatRow n={3}>
        <Stat
          label="On site today, all projects"
          value={s === null ? '—' : s.onSite === null ? '—' : s.onSite}
          note={s === null ? 'the site summary could not be read' : s.onSite === null ? 'no report filed today records a head count' : `${String(s.sitesReporting)} ${s.sitesReporting === 1 ? 'site' : 'sites'} reporting`}
          {...(spark.length > 1 ? { spark: <Sparkline values={spark} /> } : {})}
        />
        <Stat
          label="Sites with no report today"
          value={s === null ? '—' : notFiled.length}
          note={
            s === null ? (
              'the site summary could not be read'
            ) : notFiled.length === 0 ? (
              'every site has filed'
            ) : (
              <>
                {notFiled.slice(0, 4).map((x, i) => (
                  <span key={x.projectId}>
                    {i === 0 ? '' : ' · '}
                    <b>{x.code}</b>
                    {x.lastReportOn === null ? ' (never filed)' : ''}
                  </span>
                ))}
                {notFiled.length > 4 ? ` · and ${String(notFiled.length - 4)} more` : ''} still to file
              </>
            )
          }
        />
        <Stat
          label="Open site issues"
          value={s === null ? '—' : s.openIssues}
          note={s === null ? 'the site summary could not be read' : s.openIssues === 0 ? 'nothing is open' : s.blockingIssues === 0 ? 'none of them stops work' : `${String(s.blockingIssues)} stopping work`}
        />
      </StatRow>

      {newest === null ? null : (
        <div data-hero>
          <Section
            title={`${newest.reportDate} — ${codeOf.get(newest.projectId) ?? newest.projectId.slice(0, 8)}`}
            sub={newest.submitted ? 'filed' : 'draft'}
            bare
            action={
              <Link className="btn sm" href={`/projects/${newest.projectId}/site`}>
                Open the site
              </Link>
            }
          >
            <div className="daysum">
              <div>
                <b>{newest.headCount ?? '—'}</b>on site<small>{newest.headCount === null ? 'no head count recorded' : 'summed from the manpower rows'}</small>
              </div>
              <div>
                <b>{s === null ? '—' : s.openIssues}</b>issues open<small>{s === null ? '' : s.blockingIssues === 0 ? 'none blocking' : `${String(s.blockingIssues)} blocking`}</small>
              </div>
              <div>
                <b>0</b>photos<small>nothing attaches a photo to a report yet</small>
              </div>
              <div>
                <b>{newest.submitted ? 'Filed' : 'Draft'}</b>status<small>{newest.submitted ? 'on record' : 'not yet filed'}</small>
              </div>
            </div>
            <div className="card-b">
              <p className="u-strong">Notes</p>
              <p className="u-mb0">{newest.notes === '' ? <span className="muted">No notes on this report.</span> : newest.notes}</p>
            </div>
          </Section>
        </div>
      )}

      <ListCard
        label={t.dailyReports}
        toolbar={totalCount === 0 ? undefined : toolbar}
        applied={<AppliedFilters applied={chips} clearAllHref={clearAll} />}
        pager={
          totalCount === 0 ? undefined : (
            <ListPager
              from={links.shown.from}
              to={links.shown.to}
              total={reports.data.count}
              unit="reports"
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
        <Section bare title={`Record a ${t.dailyReportLower}`}>
          <div className="card-b" id="record">
            {projectItems.length === 0 ? <p className="muted">No project exists to report against.</p> : <NewDailyReportForm projects={projectItems.map((p) => [p.id, `${p.code} — ${p.name}`] as const)} />}
          </div>
        </Section>
      ) : null}
    </>
  );
}

/** "Thu 11 Sep" — the server's date string, formatted; a date, not money. */
function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(`${iso}T00:00:00+05:30`));
}

import type { ReactNode } from 'react';
import Link from 'next/link';
import { API_ROUTES, type Project } from '@cog/contracts';
import { Empty, Icon, MoneyExact, Notice, PageHeader, Refusal, Section, UnreachableState, load, type Terms } from '@cog/design-system';
import { apiAsCaller } from '../../../lib/api';
import { exportHref } from '../../../lib/export';
import { terms } from '../../../lib/terms';
import { star } from '../../actions/preferences';
import { ProjectPageHeader } from '../projects/[projectId]/header';
import { REPORTS, REPORT_GROUPS, exportListOf, reportOf, type Period, type Report, type ReportGroup } from './catalogue';

/**
 * The Reports Center — `docs/design/11-settings.html`, "Reports": categories
 * on the left with Favourites first, one table grouped by category on the
 * right, a count badge per group and a star per row. A row opens the report
 * (`?run=`), which runs its read with the read's own parameters — the period,
 * the project — and exports through the existing export path. A favourite is
 * the person's, kept in the preference store (`starredReports`).
 *
 * The same component is the project's twin: the nine narrowed to the
 * project, with the one that has no project view — leads are not a
 * project's — saying so and running firm-wide.
 */
const FAVOURITES = 'favourites';

export async function ReportsCenter({ params, project }: { params: Record<string, string | undefined>; project: Project | null }): Promise<ReactNode> {
  const client = await apiAsCaller();
  const [t, prefs, projects] = await Promise.all([
    terms(),
    load(client, API_ROUTES.preferences, {}),
    // a lookup, for the project picker on a firm-wide run: the widest window the endpoint allows
    project === null ? load(client, API_ROUTES.listProjects, { query: { limit: '200' } }) : null,
  ]);
  if (prefs.kind === 'unreachable') return <UnreachableState />;

  const base = project === null ? '/reports' : `/projects/${project.id}/reports`;
  if (prefs.kind === 'refused') {
    // a login of the wrong kind: the preference store refused it, and so would every report
    return (
      <>
        {project === null ? <PageHeader title="Reports" /> : <ProjectPageHeader project={project} section="Overview" title="Reports" />}
        <Section title="Reports">
          <Refusal error={prefs.error} />
        </Section>
      </>
    );
  }
  const starred = new Set(prefs.kind === 'ok' ? prefs.data.starredReports : []);
  const running = reportOf(params['run']);

  if (running !== null) return <RunPage report={running} params={params} project={project} base={base} t={t} starred={starred.has(running.key)} projects={projects !== null && projects.kind === 'ok' ? projects.data.items : []} />;

  const cat = params['cat'] ?? FAVOURITES;
  const favourites = REPORTS.filter((r) => starred.has(r.key));
  const groups = REPORT_GROUPS.map((g) => ({ name: g, reports: REPORTS.filter((r) => r.group === g) }));
  const shown = cat === FAVOURITES ? (favourites.length === 0 ? groups : [{ name: 'Favourites' as const, reports: favourites }]) : groups.filter((g) => g.name === cat);
  const catHref = (c: string): string => `${base}?cat=${encodeURIComponent(c)}`;

  const header =
    project === null ? (
      <PageHeader title="Reports" sub={`${String(REPORTS.length)} reports in ${String(REPORT_GROUPS.length)} groups · ${String(favourites.length)} favourited`} />
    ) : (
      <ProjectPageHeader project={project} section="Overview" title="Reports" sub={<>{`${String(REPORTS.length)} reports, narrowed to ${project.code}`} · {String(favourites.length)} favourited</>} />
    );

  return (
    <>
      {header}
      <div className="settings-grid">
        <nav className="cat-list" aria-label="Categories">
          <ul>
            <li>
              <Link href={catHref(FAVOURITES)} {...(cat === FAVOURITES ? { 'aria-current': 'true' as const } : {})}>
                <Icon name="star" size="sm" />
                Favourites
                <span className="badge">{favourites.length}</span>
              </Link>
            </li>
            {groups.map((g) => (
              <li key={g.name}>
                <Link href={catHref(g.name)} {...(cat === g.name ? { 'aria-current': 'true' as const } : {})}>
                  {g.name}
                  <span className="badge">{g.reports.length}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div data-hero>
          {cat === FAVOURITES && favourites.length === 0 ? (
            <Notice tone="info" title="No favourites yet" icon={<Icon name="star" />}>
              Star a report and it sits here first. Until then, every group is listed.
            </Notice>
          ) : null}
          <section className="card settings-tbl" aria-label="All reports">
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Report</th>
                    <th className="star-c">
                      <span className="sr-only">Favourite</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((g) => (
                    <GroupRows key={g.name} name={g.name} reports={g.reports} base={base} t={t} starred={starred} project={project} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <p className="count">
                {shown.reduce((n, g) => n + g.reports.length, 0)} of {REPORTS.length} reports · {String(REPORT_GROUPS.length)} groups
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function GroupRows({ name, reports, base, t, starred, project }: { name: ReportGroup | 'Favourites'; reports: readonly Report[]; base: string; t: Terms; starred: ReadonlySet<string>; project: Project | null }): ReactNode {
  return (
    <>
      <tr className="grp">
        <th colSpan={2} scope="rowgroup">
          {name}
          <span className="badge">{reports.length}</span>
        </th>
      </tr>
      {reports.map((r) => (
        <tr key={r.key}>
          <td>
            <Link href={`${base}?run=${r.key}`}>{r.name(t)}</Link>
            <span className="sub">
              {r.what(t)}
              {project !== null && !r.narrows ? ' · firm-wide: leads are not a project’s' : ''}
            </span>
          </td>
          <td className="star-c">
            <StarButton reportKey={r.key} name={r.name(t)} on={starred.has(r.key)} path={base} />
          </td>
        </tr>
      ))}
    </>
  );
}

/** The star: a form that posts the person's choice to the preference store and redraws the page. */
function StarButton({ reportKey, name, on, path }: { reportKey: string; name: string; on: boolean; path: string }): ReactNode {
  return (
    <form action={star.bind(null, 'report', reportKey, !on, path)}>
      <button type="submit" className={on ? 'btn icon ghost sm star on' : 'btn icon ghost sm star'} aria-pressed={on} aria-label={on ? `Unfavourite ${name}` : `Favourite ${name}`}>
        <Icon name="star" size="sm" />
      </button>
    </form>
  );
}

async function RunPage({
  report,
  params,
  project,
  base,
  t,
  starred,
  projects,
}: {
  report: Report;
  params: Record<string, string | undefined>;
  project: Project | null;
  base: string;
  t: Terms;
  starred: boolean;
  projects: ReadonlyArray<{ id: string; code: string; name: string }>;
}): Promise<ReactNode> {
  const period: Period = params['period'] === 'q' ? 'q' : 'fy';
  const picked = project?.id ?? (params['projectId'] === undefined || params['projectId'] === '' ? null : params['projectId']);
  const projectId = report.narrows ? picked : null;
  const result = await report.run(await apiAsCaller(), { period, projectId }, t);
  const name = report.name(t);
  const exportQuery = { period, ...(projectId === null ? {} : { projectId }) };
  const actions = (
    <>
      <StarButton reportKey={report.key} name={name} on={starred} path={`${base}?run=${report.key}`} />
      <a className="btn" href={exportHref(exportListOf(report.key), exportQuery, ['period', 'projectId'])}>
        <Icon name="download" />
        Export
      </a>
    </>
  );
  const header =
    project === null ? (
      <PageHeader crumbs={[{ href: base, label: 'Reports' }]} title={name} sub={report.what(t)} actions={actions} />
    ) : (
      <ProjectPageHeader project={project} section="Overview" title={name} sub={<>{report.what(t)}{report.narrows ? '' : ' · firm-wide: leads are not a project’s'}</>} actions={actions} />
    );

  const takesPeriod = report.params.includes('period');
  const takesProject = report.params.includes('project') && project === null;
  const filters =
    !takesPeriod && !takesProject ? null : (
      <form className="toolbar lv-tb" method="get" action={base}>
        <input type="hidden" name="run" value={report.key} />
        {takesPeriod ? (
          <div className="field">
            <label htmlFor="r-period">Period</label>
            <select id="r-period" name="period" defaultValue={period}>
              <option value="fy">Financial year to date</option>
              <option value="q">Quarter to date</option>
            </select>
          </div>
        ) : null}
        {takesProject ? (
          <div className="field">
            <label htmlFor="r-project">Project</label>
            <select id="r-project" name="projectId" defaultValue={projectId ?? ''}>
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <button type="submit" className="btn">
          Run
        </button>
      </form>
    );

  if (result.kind === 'unreachable') return <UnreachableState />;

  return (
    <>
      {header}
      <div data-hero>
        {result.kind === 'refused' ? (
          <Section title={name}>
            <Refusal error={result.error} />
          </Section>
        ) : (
          <Section title={name} sub={result.run.summary} bare>
            {filters}
            {result.run.rows.length === 0 ? (
              <Empty illustration="documents" title="Nothing in this window" size="narrow">
                The report ran and found no rows for {project === null ? 'the firm' : project.code}
                {takesPeriod ? ' in this period' : ''}.
              </Empty>
            ) : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      {result.run.columns.map((c) => (
                        <th key={c.label} className={c.num ? 'num' : undefined}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.run.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j} className={result.run.columns[j]?.num ? 'num' : undefined}>
                            {cell.money === undefined ? cell.text : <MoneyExact wire={cell.money} />}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="pager">
              <p className="count">
                {result.run.rows.length} {result.run.rows.length === 1 ? 'row' : 'rows'}
              </p>
            </div>
          </Section>
        )}
      </div>
    </>
  );
}

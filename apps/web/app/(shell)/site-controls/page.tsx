import type { ReactNode } from 'react';
import Link from 'next/link';
import { API_ROUTES } from '@cog/contracts';
import { formatQuantity, formatRupees } from '@cog/money';
import { apiAsCaller } from '../../../lib/api';
import { Icon, PageHeader, Pager, labelOf, load, type Options } from '@cog/design-system';
import { AbsentNotice, Absent, Empty, Money, Section, Pill, Refusal, UnreachableState } from '@cog/design-system';
import type { PillTone } from '@cog/design-system';
import {
  ReconcileImprestForm,
  RecordMeasurementForm,
  RequestImprestForm,
  SanctionImprestForm,
} from './forms';
import { pageLinks, pageState } from '../../../lib/paging';

export const metadata = { title: 'Site · Measurements and imprest · Construct-O-Genie' };
export const dynamic = 'force-dynamic';

const VALUE = 'Know what the site holds in cash and what has been measured before the RA bill is raised.';

const IMPREST_STATUS: Options = [
  ['requested', 'Waiting for approval'],
  ['sanctioned', 'Sanctioned'],
  ['reconciled', 'Reconciled'],
  ['rejected', 'Declined'],
];

function imprestTone(status: string): PillTone {
  switch (status) {
    case 'sanctioned':
      return 'active';
    case 'reconciled':
      return 'ok';
    case 'rejected':
      return 'bad';
    default:
      return 'waiting';
  }
}

/**
 * Site controls, by project.
 *
 * Imprest and joint measurement are both **per project** — `listImprest` and
 * `listMeasurements` are both `:projectId`-pathed routes, not tenant-wide
 * lists — so this screen is a project chooser plus, once `?projectId=` names
 * one, the ledger and the sheet for it. The design's four "Site" tabs (Daily
 * log, Imprest, Measurement, Recce) collapse to two shipped ones; this is
 * "Measurements and imprest", carrying what used to live at
 * `projects/[projectId]/site` before that tab became the daily-log day card.
 *
 * **The ledger is not the design's ledger.** `docs/design/08-site.html` draws
 * Day / What / In / Out / Balance / a receipt flag, and a headline "cash in
 * hand of a float" figure. `Imprest` has none of that shape: no running
 * balance, no in/out direction, no receipt field, no float ceiling. What
 * exists is a three-stage workflow row (requested → sanctioned → reconciled)
 * per cash advance, which is what is rendered — the design's ledger view
 * needs a distinct siteops endpoint that returns dated cash movements, not
 * this one.
 *
 * **The measurement sheet is not grouped or aggregated.** The design's
 * Previous / This period / To date / % of contract columns are a running
 * total per BOQ item across every measurement ever recorded against it,
 * bucketed by billing period — `listMeasurements` returns individual
 * append-only entries with no period boundary and no per-item aggregate.
 * Grouping and summing that here would be exactly the client-computed figure
 * STAGE4-COMMON rules out, so those three columns are `Absent`; `Contract` is
 * real (a lookup against the BOQ line by `boqItemId`, the same shape as
 * `nameFor.get(...)` elsewhere) and `This period` is the row's own
 * `measuredMicros` — not the design's period-summed span across many rows.
 *
 * Every figure here is the server's. `SiteControlsView.js:118-120` computes
 * three running totals in the browser, one of which subtracts a released
 * amount from a retained one per row and again in aggregate — none of that
 * is reproduced.
 */
export default async function SiteControlsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const sp = await searchParams;
  const projectId = sp['projectId'] !== undefined && sp['projectId'] !== '' ? sp['projectId'] : undefined;
  const client = await apiAsCaller();

  if (projectId === undefined) {
    const projects = await load(client, API_ROUTES.listProjects, { query: { limit: '200' } });
    if (projects.kind === 'unreachable') return <UnreachableState />;
    if (projects.kind === 'refused') return <Refusal error={projects.error} />;

    return (
      <>
        <PageHeader crumbs={[{ href: '/site-reports', label: 'Site' }]} title="Measurements & imprest" help={VALUE} sub="site cash and joint measurement are kept per project — choose which" />

        <Section bare title="Choose a project">
          {projects.data.items.length === 0 ? (
            <Empty
              illustration="projects"
              title="No projects"
              action={
                <Link className="btn primary" href="/projects">
                  Create one
                </Link>
              }
            >
              Site cash and joint measurement are both recorded against a project.
            </Empty>
          ) : (
            <div className="tbl-wrap">
              {/* Project(1) · Open(2, decision) · Code(3) · Client(4) */}
              <table className="tbl" data-priority="">
                <thead>
                  <tr>
                    <th data-p="1">Code</th>
                    <th data-p="1">Project</th>
                    <th data-p="4">Client</th>
                    <th data-p="2" />
                  </tr>
                </thead>
                <tbody>
                  {projects.data.items.map((p) => (
                    <tr key={p.id}>
                      <td data-p="3" data-label="Code">
                        {p.code}
                      </td>
                      <td data-p="1">{p.name}</td>
                      <td data-p="4" data-label="Client">
                        {p.clientName}
                      </td>
                      <td data-p="2">
                        <Link href={`/site-controls?projectId=${p.id}`}>Open</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pager
                shown={{ from: 1, to: projects.data.items.length }}
                of={projects.data.items.length}
                unit={projects.data.items.length === 1 ? 'project' : 'projects'}
              />
            </div>
          )}
        </Section>

        <AbsentNotice title="Retention is on its own page, and releasing it is not built">
          <Link href="/retention">Retention</Link> records what is held back. Releasing it moves
          money to a vendor, which makes it a payment — CA-01..CA-08.
        </AbsentNotice>
      </>
    );
  }

  // Two lists on one page, each with its own window: `i…` for imprest, `m…` for measurements.
  const imprestPaging = pageState(sp, 'i');
  const measurementsPaging = pageState(sp, 'm');

  const [project, imprest, measurements, boq] = await Promise.all([
    load(client, API_ROUTES.getProject, { params: { projectId } }),
    load(client, API_ROUTES.listImprest, { params: { projectId }, query: imprestPaging.query }),
    load(client, API_ROUTES.listMeasurements, { params: { projectId }, query: measurementsPaging.query }),
    load(client, API_ROUTES.projectBoq, { params: { projectId } }),
  ]);

  if (project.kind === 'unreachable') return <UnreachableState />;
  if (project.kind === 'refused') return <Refusal error={project.error} />;
  if (imprest.kind === 'unreachable') return <UnreachableState />;
  if (imprest.kind === 'refused') return <Refusal error={imprest.error} />;

  // Neither list has a filter or a sort control — only paging — so the
  // window's own three parameters are all `hrefFor` ever needs to keep.
  const hrefFor = (overrides: Record<string, string | undefined>): string => {
    const next = new URLSearchParams();
    const merged: Record<string, string | undefined> = { projectId, ...sp, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== '') next.set(key, value);
    }
    const qs = next.toString();
    return qs === '' ? '/site-controls' : `/site-controls?${qs}`;
  };
  const imprestLinks = pageLinks(imprestPaging, imprest.data, hrefFor);
  const measurementsLinks =
    measurements.kind === 'ok' ? pageLinks(measurementsPaging, measurements.data, hrefFor) : null;

  const boqById = new Map(boq.kind === 'ok' ? boq.data.items.map((line) => [line.id, line] as const) : []);
  const boqLines =
    boq.kind === 'ok'
      ? boq.data.items.map(
          (line) => [line.id, `${line.section} ${String(line.itemNo)} — ${line.description}`] as const,
        )
      : [];

  return (
    <>
      <PageHeader
        crumbs={[
          { href: '/site-reports', label: 'Site' },
          { href: `/projects/${project.data.id}`, label: project.data.code },
        ]}
        title="Measurements & imprest"
        help={VALUE}
        sub={
          <>
            {project.data.name} · {project.data.clientName}
          </>
        }
        actions={
          <>
            <a className="btn" href={`/export/measurements?projectId=${project.data.id}`}>
              <Icon name="download" />
              Measurements
            </a>
            <a className="btn" href={`/export/imprest?projectId=${project.data.id}`}>
              <Icon name="download" />
              Imprest
            </a>
          </>
        }
        primary={
          <Link className="btn primary" href="#request">
            <Icon name="plus" />
            Request petty cash
          </Link>
        }
      />

      <Section bare title="Ledger" sub="petty cash imprest, this project">
        {imprest.data.count === 0 ? (
          <Empty illustration="money" title="No imprest requested">
            Request site cash below.
          </Empty>
        ) : (
          <div className="tbl-wrap">
            {/* Purpose(1) · Status(2, decision) · Requested/Sanctioned/Reconciled/Action(3) */}
            <table className="data ledger" data-priority="">
              <thead>
                <tr>
                  <th data-p="1">Purpose</th>
                  <th data-p="2">Status</th>
                  <th className="num" data-p="3">
                    Requested
                  </th>
                  <th className="num" data-p="3">
                    Sanctioned
                  </th>
                  <th className="num" data-p="3">
                    Reconciled
                  </th>
                  <th data-p="3">Action</th>
                </tr>
              </thead>
              <tbody>
                {imprest.data.items.map((row) => (
                  <tr key={row.id}>
                    <td data-p="1">{row.purpose}</td>
                    <td data-p="2" data-label="Status">
                      <Pill tone={imprestTone(row.status)}>{labelOf(IMPREST_STATUS, row.status)}</Pill>
                    </td>
                    <td className="num" data-p="3" data-label="Requested">
                      <Money wire={row.amountRequested} />
                    </td>
                    <td className="num" data-p="3" data-label="Sanctioned">
                      <Money wire={row.amountSanctioned} />
                    </td>
                    <td className="num" data-p="3" data-label="Reconciled">
                      <Money wire={row.amountReconciled} />
                    </td>
                    <td data-p="3" data-label="Action">
                      {row.status === 'requested' ? (
                        <SanctionImprestForm
                          projectId={projectId}
                          imprestId={row.id}
                          version={row.version}
                          requested={formatRupees(row.amountRequested)}
                        />
                      ) : row.status === 'sanctioned' ? (
                        <ReconcileImprestForm projectId={projectId} imprestId={row.id} version={row.version} />
                      ) : (
                        <span className="muted">closed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager
              shown={imprestLinks.shown}
              of={imprest.data.count}
              unit={imprest.data.count === 1 ? 'request' : 'requests'}
              next={imprestLinks.next}
              prev={imprestLinks.prev}
            />
          </div>
        )}
        <AbsentNotice title="No running balance, no receipt flag">
          Imprest carries a request/sanction/reconcile workflow, not a dated ledger of cash
          movements — there is no in/out/balance figure and no field recording whether a spend has
          a receipt behind it. Rendering the design&rsquo;s ledger needs a siteops endpoint shaped
          like one.
        </AbsentNotice>
      </Section>

      <Section bare title="Request petty cash">
        <div className="card-b" id="request">
          <RequestImprestForm projectId={projectId} />
        </div>
      </Section>

      <Section bare title="Measurement sheet" sub="quantities only; rates come from the contract">
        {measurements.kind !== 'ok' || measurements.data.count === 0 ? (
          <Empty illustration="measure" title="Nothing measured yet">
            Record a measurement below — once recorded it cannot be edited or removed.
          </Empty>
        ) : (
          <div className="tbl-wrap">
            {/* Item(1) · This period(2, decision) · #/Contract/Previous/To date/Of contract/Measured on/Signed by(3-4) */}
            <table className="data sheet" data-priority="">
              <thead>
                <tr>
                  <th data-p="4">#</th>
                  <th data-p="1">Item</th>
                  <th className="num" data-p="3">
                    Contract
                  </th>
                  <th className="num" data-p="3">
                    Previous
                  </th>
                  <th className="num" data-p="2">
                    This period
                  </th>
                  <th className="num" data-p="3">
                    To date
                  </th>
                  <th className="num" data-p="3">
                    Of contract
                  </th>
                  <th data-p="4">Measured on</th>
                  <th data-p="4">Signed by</th>
                </tr>
              </thead>
              <tbody>
                {measurements.data.items.map((m) => {
                  const boqLine = m.boqItemId === null ? undefined : boqById.get(m.boqItemId);
                  return (
                    <tr key={m.id}>
                      <td data-p="4">{boqLine === undefined ? <Absent why="Not raised against a BOQ line" /> : boqLine.itemNo}</td>
                      <td data-p="1">
                        {m.description}
                        <br />
                        <small className="muted">per {m.uom}</small>
                      </td>
                      <td className="num" data-p="3" data-label="Contract">
                        {boqLine === undefined ? (
                          <Absent why="Not raised against a BOQ line" />
                        ) : (
                          formatQuantity(boqLine.quantityMicros)
                        )}
                      </td>
                      <td className="num" data-p="3" data-label="Previous">
                        <Absent why="listMeasurements returns append-only entries with no period boundary to sum before" />
                      </td>
                      <td className="num" data-p="2" data-label="This period">
                        {formatQuantity(m.measuredMicros)}
                      </td>
                      <td className="num" data-p="3" data-label="To date">
                        <Absent why="No per-item running total is returned — it would be summed client-side, which STAGE4-COMMON rules out" />
                      </td>
                      <td className="num" data-p="3" data-label="Of contract">
                        <Absent why="A percentage is only ever a figure the server sent" />
                      </td>
                      <td data-p="4" data-label="Measured on">
                        {m.measuredOn}
                      </td>
                      <td data-p="4" data-label="Signed by">
                        {m.signedByClient} · {m.signedBySite}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {measurementsLinks === null ? null : (
              <Pager
                shown={measurementsLinks.shown}
                of={measurements.data.count}
                unit={measurements.data.count === 1 ? 'measurement' : 'measurements'}
                next={measurementsLinks.next}
                prev={measurementsLinks.prev}
              />
            )}
          </div>
        )}
      </Section>

      <Section bare title="Record a measurement">
        <div className="card-b">
          <RecordMeasurementForm projectId={projectId} boqLines={boqLines} />
        </div>
      </Section>

      <AbsentNotice title="Retention is on its own page, and releasing it is not built">
        <Link href="/retention">Retention</Link> records what is held back. Releasing it moves
        money to a vendor, which makes it a payment — CA-01..CA-08.
      </AbsentNotice>
    </>
  );
}

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  API_ROUTES,
  type CashAgainstPayablesStat,
  type ClientAccountsResponse,
  type DailyReportsResponse,
  type MilestoneListResponse,
  type MoneyByMonthResponse,
  type MoneyPeriod,
  type ProjectRollupResponse,
  type ProjectTeamResponse,
  type SiteIssueListResponse,
  type SiteTodayResponse,
  type UnsignedVariationsResponse,
} from '@cog/contracts';
import { formatCompactRupees, formatIndianRupees } from '@cog/money';
import {
  AbsentPanel,
  Card,
  CardAction,
  Columns,
  DashGrid,
  Icon,
  Lines,
  Money,
  PageHeader,
  MoneyIn,
  MoneyOut,
  PeriodPicker,
  RatioBar,
  ShortfallBar,
  Tile,
  load,
  type DashSpan,
  type Loaded,
} from '@cog/design-system';
import { apiAsCaller } from '../../../../lib/api';
import { terms } from '../../../../lib/terms';
import { TodayHero } from '../../today-hero';
import { StageForms } from './stage-form';

export const dynamic = 'force-dynamic';

/**
 * A project's Overview — its Today, on the same grid in the same card
 * language (`docs/design/04-today.html`, part 4; VALUE-MAP "Overview").
 *
 * The hero is the thing on this project that needs you — `/today/hero`
 * asked of one project, ranked by the same rule as the firm's. Then four
 * tiles: ordered and billed against the contract, margin at risk on this
 * project, the variations awaiting the client's signature, payables this
 * week on this project; then its milestones beside its site this week; then
 * money in and out on this project beside the team and who signs for the
 * client. One form per fact: the variation the client is sitting on is the
 * tile, not a list as well.
 *
 * **The stage moves live in the page header**, beside the title, not in the
 * hero: the hero's action is reserved for the one thing that needs you, and
 * moving a project to its next state is always available, whatever the hero
 * says this morning.
 *
 * Every figure is the server's — the rollup's shares, the ageing buckets, the
 * chart's indices — and the four reads that once drew "BOQ value / BOQ cost /
 * Current contract / Drawings issued" as cards went with the cards: the BOQ
 * and the drawings have their own tabs, and the contract is on the first tile.
 */

const VALUE = {
  hero: 'The one figure that needs you this morning, and whose door to knock on.',
  orderedBilled: 'Where this project stands: how much of the contract is ordered, and how much of it is billed.',
  margin: 'Raise a variation or renegotiate the rate before the next order goes out on a project already past its cost budget.',
  unsigned: 'Work done that cannot be billed until the client signs — chase the signature, not the site.',
  payables: 'Decide what gets paid on Friday, with what is already overdue in front of you.',
  milestones: 'Which site slips before the client notices — the stages due or slipping this week.',
  site: 'A site with no report is the first sign of a problem: which sites reported, who was on them, what is open.',
  moneyInOut: 'The trend of money coming in against money going out, month by month, without a bank feed.',
  team: 'Who is on this project, and who signs for the client.',
} as const;

export default async function ProjectOverview({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const query = await searchParams;
  const period: MoneyPeriod = query['period'] === 'q' ? 'q' : 'fy';
  const client = await apiAsCaller();
  const t = await terms();

  const [project, hero, me, rollup, cash, unsigned, milestones, reports, issues, site, money, team, clients] = await Promise.all([
    load(client, API_ROUTES.getProject, { params: { projectId } }),
    load(client, API_ROUTES.todayHero, { query: { projectId } }),
    load(client, API_ROUTES.myEntitlements, {}),
    load(client, API_ROUTES.projectRollup, { query: { ids: projectId } }),
    load(client, API_ROUTES.cashAgainstPayables, { query: { projectId } }),
    load(client, API_ROUTES.unsignedVariations, { query: { projectId } }),
    load(client, API_ROUTES.milestonesForProject, { params: { projectId } }),
    load(client, API_ROUTES.listDailyReports, { query: { projectId, limit: '7' } }),
    load(client, API_ROUTES.listSiteIssues, { query: { projectId } }),
    load(client, API_ROUTES.siteToday, {}),
    load(client, API_ROUTES.moneyByMonth, { query: { period, projectId } }),
    load(client, API_ROUTES.projectTeam, { params: { projectId } }),
    load(client, API_ROUTES.clientAccounts, {}),
  ]);

  const modules = new Set(me.kind === 'ok' ? me.data.modules : []);
  const has = (module: string): boolean => me.kind !== 'ok' || modules.has(module);
  const code = project.kind === 'ok' ? project.data.code : '';
  const clientName = project.kind === 'ok' ? project.data.clientName : '';
  const today = new Date();
  const dateLine = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }).format(today);
  const periodHref = (p: MoneyPeriod): string => `/projects/${projectId}?period=${p}`;

  const tiles: Array<(span: DashSpan) => ReactNode> = [
    (span) => <OrderedBilledTile span={span} rollup={rollup} projectId={projectId} clientName={clientName} />,
    (span) => <MarginTile span={span} rollup={rollup} projectId={projectId} boq={t.boq} />,
  ];
  if (has('change_orders')) tiles.push((span) => <UnsignedTile span={span} unsigned={unsigned} projectId={projectId} words={[t.unsignedVariations, t.variations, t.variationLower]} />);
  tiles.push((span) => <PayablesTile span={span} cash={cash} />);
  const tileSpan: DashSpan = tiles.length === 4 ? 3 : 4;

  return (
    <>
      {project.kind === 'ok' ? (
        <PageHeader
          crumbs={[{ href: `/projects/${projectId}`, label: project.data.code }]}
          title="Overview"
          sub={
            <>
              {project.data.name} — what on it needs you, then the rest.{' '}
              {project.data.startedOn === null ? 'Not started on site.' : `On site since ${project.data.startedOn}.`}{' '}
              {project.data.handedOverOn === null ? '' : `Handed over on ${project.data.handedOverOn}.`}
            </>
          }
          actions={<StageForms projectId={projectId} moves={project.data.moves} />}
          primary={
            <Link className="btn primary" href={`/projects/${projectId}/boq`}>
              <Icon name="plus" />
              Raise an order
            </Link>
          }
        />
      ) : null}

      <DashGrid>
        <div className="c12">
          {hero.kind === 'ok' ? (
            <TodayHero candidate={hero.data.hero} dateLine={`${code} · ${dateLine}`} project={{ id: projectId, code }} />
          ) : (
            <Card title="This project" help={VALUE.hero} span={12}>
              <AbsentPanel>The hero did not load.</AbsentPanel>
            </Card>
          )}
        </div>

        {tiles.map((tile, i) => (
          <TileSlot key={i}>{tile(tileSpan)}</TileSlot>
        ))}

        {has('design_build') ? <MilestonesCard milestones={milestones} projectId={projectId} span={has('operations') ? 6 : 12} /> : null}
        {has('operations') ? <SiteWeekCard reports={reports} issues={issues} site={site} projectId={projectId} span={has('design_build') ? 6 : 12} /> : null}

        <MoneyInOut money={money} period={period} periodHref={periodHref} span={8} />
        <TeamCard team={team} clients={clients} projectId={projectId} clientName={clientName} span={4} />
      </DashGrid>
    </>
  );
}

function TileSlot({ children }: { children: ReactNode }): ReactNode {
  return children;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

function NotRead({ what }: { what: string }): ReactNode {
  return <AbsentPanel>{what} did not load.</AbsentPanel>;
}

// --------------------------------------------------------------- the tiles --

function OrderedBilledTile({
  span,
  rollup,
  projectId,
  clientName,
}: {
  span: DashSpan;
  rollup: Loaded<ProjectRollupResponse>;
  projectId: string;
  clientName: string;
}): ReactNode {
  const disc = { hue: 'blue', icon: 'contract' } as const;
  const item = rollup.kind === 'ok' ? rollup.data.items.find((p) => p.id === projectId) : undefined;
  if (item === undefined) {
    return <Tile title="Ordered and billed" help={VALUE.orderedBilled} span={span} disc={disc} figure="—" meaning="Not read" />;
  }
  if (item.contractValue === null || item.orderedPct === null || item.billedPct === null) {
    return (
      <Tile
        title="Ordered and billed"
        help={VALUE.orderedBilled}
        span={span}
        disc={disc}
        figure={<Money wire={item.committed} />}
        meaning="ordered · no contract value yet to set it against"
        split={[
          { label: 'Ordered', value: <Money wire={item.committed} /> },
          { label: 'Billed', value: <Money wire={item.billed} /> },
        ]}
        action={<CardAction href={`/projects/${projectId}/commercials`}>Contract</CardAction>}
      />
    );
  }
  return (
    <Tile
      title="Ordered and billed"
      help={VALUE.orderedBilled}
      span={span}
      disc={disc}
      figure={`${String(item.orderedPct)}%`}
      meaning={
        <>
          ordered · <b>{item.billedPct}%</b> billed to {clientName}
        </>
      }
      bar={<RatioBar pct={item.orderedPct > 100 ? 100 : item.orderedPct} label={`${String(item.orderedPct)}% of the contract ordered`} />}
      split={[
        { label: 'Contract', value: <Money wire={item.contractValue} /> },
        { label: 'Ordered', value: <Money wire={item.committed} /> },
        { label: 'Billed', value: <Money wire={item.billed} /> },
      ]}
      action={<CardAction href={`/projects/${projectId}/procurement`}>Orders</CardAction>}
    />
  );
}

function MarginTile({ span, rollup, projectId, boq }: { span: DashSpan; rollup: Loaded<ProjectRollupResponse>; projectId: string; boq: string }): ReactNode {
  const disc = { hue: 'yellow', icon: 'margin' } as const;
  const item = rollup.kind === 'ok' ? rollup.data.items.find((p) => p.id === projectId) : undefined;
  if (item === undefined) {
    return <Tile title="Margin at risk" help={VALUE.margin} span={span} disc={disc} figure="—" meaning="Not read" />;
  }
  const m = item.margin;
  if (m.status === 'no-boq' || m.atRisk === null || m.costBudget === null) {
    return (
      <Tile
        title="Margin at risk"
        help={VALUE.margin}
        span={span}
        disc={disc}
        figure="—"
        meaning={`no ${boq} yet, so no cost budget to measure approved orders against`}
        action={<CardAction href={`/projects/${projectId}/boq`}>{boq}</CardAction>}
      />
    );
  }
  const over = m.atRisk !== '0';
  return (
    <Tile
      title="Margin at risk"
      help={VALUE.margin}
      span={span}
      disc={disc}
      figure={<Money wire={m.atRisk} />}
      meaning={
        over ? (
          <>
            approved past the cost budget{m.status === 'partial' ? ` · budget partial, ${plural(m.unpricedLines, 'line')} unpriced` : ''}
          </>
        ) : (
          <>nothing approved past the cost budget{m.status === 'partial' ? ` · budget partial, ${plural(m.unpricedLines, 'line')} unpriced` : ''}</>
        )
      }
      {...(over && m.coveredPct !== null
        ? { bar: <ShortfallBar coveredPct={m.coveredPct} label="the cost budget against what is approved — the short part is past it" /> }
        : {})}
      split={[
        { label: 'Cost budget', value: <Money wire={m.costBudget} /> },
        { label: 'Approved', value: <Money wire={m.committedApproved} /> },
      ]}
      action={<CardAction href={`/projects/${projectId}/procurement`}>Orders</CardAction>}
    />
  );
}

function UnsignedTile({ span, unsigned, projectId, words }: { span: DashSpan; unsigned: Loaded<UnsignedVariationsResponse>; projectId: string; words: readonly [string, string, string] }): ReactNode {
  const [title, many, singular] = words;
  const disc = { hue: 'purple', icon: 'tray' } as const;
  if (unsigned.kind !== 'ok') {
    return <Tile title={title} help={VALUE.unsigned} span={span} disc={disc} module="change_orders" figure="—" meaning="Not read" />;
  }
  const u = unsigned.data;
  const first = u.items[0];
  return (
    <Tile
      title={title}
      help={VALUE.unsigned}
      span={span}
      disc={disc}
      module="change_orders"
      figure={<Money wire={u.total} />}
      meaning={
        first === undefined ? (
          'nothing waiting on a signature'
        ) : (
          <>
            {plural(u.count, singular, many.toLowerCase())} · <b>{first.number}</b> with {first.clientName} for signature
            {u.oldest === null || u.oldest.daysWaiting === null ? null : <> · {plural(u.oldest.daysWaiting, 'day')}</>}
          </>
        )
      }
      action={<CardAction href={`/projects/${projectId}/change-orders`}>{many}</CardAction>}
    />
  );
}

function PayablesTile({ span, cash }: { span: DashSpan; cash: Loaded<CashAgainstPayablesStat> }): ReactNode {
  const disc = { hue: 'red', icon: 'bill' } as const;
  if (cash.kind !== 'ok') {
    return <Tile title="Payables this week" help={VALUE.payables} span={span} disc={disc} figure="—" meaning="Not read" />;
  }
  const p = cash.data.payables;
  const first = p.upcoming.find((u) => !u.overdue);
  return (
    <Tile
      title="Payables this week"
      help={VALUE.payables}
      span={span}
      disc={disc}
      figure={<Money wire={p.dueThisWeek.total} />}
      meaning={
        p.dueThisWeek.count === 0 ? (
          'nothing falls due this week on this project'
        ) : (
          <>
            {plural(p.dueThisWeek.count, 'bill')}
            {first === undefined ? null : (
              <>
                {' · '}
                <b>{first.vendorName}</b>, {dayDate(first.dueOn)}
              </>
            )}
          </>
        )
      }
      split={[
        { label: 'Overdue', value: <Money wire={p.overdue.total} />, overdue: true },
        { label: 'To acknowledge', value: <Money wire={p.toAcknowledge.total} /> },
      ]}
      action={<CardAction href="/money/bills">Bills</CardAction>}
    />
  );
}

// -------------------------------------------------------------- milestones --

function MilestonesCard({ milestones, projectId, span }: { milestones: Loaded<MilestoneListResponse>; projectId: string; span: DashSpan }): ReactNode {
  const action = <CardAction href={`/projects/${projectId}/milestones`}>Milestones</CardAction>;
  if (milestones.kind === 'unreachable' || (milestones.kind === 'refused' && milestones.error.code !== 'NOT_FOUND')) {
    return (
      <Card title="Milestones this week" help={VALUE.milestones} span={span} module="design_build">
        <NotRead what="Milestones" />
      </Card>
    );
  }
  // Due or slipping: in the fortnight's lookahead, late, or delayed — the
  // server's flags, in the order the list came (planned start).
  const items = milestones.kind === 'ok' ? milestones.data.items.filter((m) => m.status !== 'complete' && (m.inLookahead || m.status === 'delayed' || m.daysLate !== null)) : [];
  if (items.length === 0) {
    return (
      <Card title="Milestones this week" help={VALUE.milestones} span={span} module="design_build" action={action}>
        <AbsentPanel>
          No milestone on this project is due or slipping this week. Give each milestone a date and the ones due or slipping
          show here.
        </AbsentPanel>
      </Card>
    );
  }
  return (
    <Card title="Milestones this week" help={VALUE.milestones} span={span} module="design_build" action={action}>
      <ul className="list day">
        {items.slice(0, 6).map((m) => (
          <li key={m.id}>
            <span className="kind" aria-hidden="true" />
            <div>
              <Link href={`/projects/${projectId}/milestones`}>{m.name}</Link>
              <small>
                {m.trade === '' ? 'no trade named' : m.trade}
                {m.status === 'delayed' && m.delayReason !== '' ? ` · ${m.delayReason}` : ''}
              </small>
            </div>
            <span className="when">
              {m.daysLate !== null && m.daysLate > 0 ? <span className="late">{plural(m.daysLate, 'day')} late</span> : null}
              {m.status === 'delayed' && m.daysLate !== null && m.daysLate > 0 ? `was ${dayDate(m.plannedFinish)}` : dayDate(m.plannedFinish)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------- site this week --

function SiteWeekCard({
  reports,
  issues,
  site,
  projectId,
  span,
}: {
  reports: Loaded<DailyReportsResponse>;
  issues: Loaded<SiteIssueListResponse>;
  site: Loaded<SiteTodayResponse>;
  projectId: string;
  span: DashSpan;
}): ReactNode {
  const action = <CardAction href="/site-reports">Reports</CardAction>;
  if (reports.kind !== 'ok') {
    return (
      <Card title="Site this week" help={VALUE.site} span={span} module="operations">
        <NotRead what="Site reports" />
      </Card>
    );
  }
  // newest first on the wire; drawn oldest first, the last seven reports
  const days = [...reports.data.items].reverse();
  if (days.length === 0) {
    return (
      <Card title="Site this week" help={VALUE.site} span={span} module="operations" action={action}>
        <AbsentPanel>No daily report on this project yet. The site engineer’s reports show here, day by day, once one is filed.</AbsentPanel>
      </Card>
    );
  }
  // Whether this site reported today is the server's answer, on the firm-wide
  // read that names every site; a project not in progress is not a site.
  const thisSite = site.kind === 'ok' ? site.data.sites.find((s) => s.projectId === projectId) : undefined;
  const latest = days[days.length - 1];
  const peak = days.reduce((max, d) => (d.headCount !== null && d.headCount > max ? d.headCount : max), 0);
  const open = issues.kind === 'ok' ? issues.data.items.filter((i) => i.resolvedOn === null) : [];
  const blocking = open.filter((i) => i.severity === 'blocking');
  return (
    <Card title="Site this week" help={VALUE.site} span={span} module="operations" action={action}>
      <p className="lead-line">
        {thisSite === undefined ? (
          <>
            <b>Not on site</b> yet
          </>
        ) : (
          <>
            <b>{thisSite.reportedToday ? 'Reported' : 'Not yet reported'}</b> today
            {!thisSite.reportedToday && latest !== undefined ? ` · last report ${dayDate(latest.reportDate)}` : ''}
          </>
        )}
      </p>
      <Columns
        label="On site, by day"
        labels={days.map((d) => weekday(d.reportDate))}
        series={[{ name: 'On site', values: days.map((d) => d.headCount), full: days.map((d) => (d.headCount === null ? 'no head count' : `${String(d.headCount)} on site`)) }]}
        ticks={peak > 0 ? [{ index: 10000, label: String(peak) }] : []}
        max={peak}
        short
        sr={`On site by day: ${days.map((d) => `${weekday(d.reportDate)} ${d.headCount === null ? 'no head count' : String(d.headCount)}`).join(', ')}.`}
      />
      <p className="issues-line">
        <b>{open.length}</b> open {open.length === 1 ? 'issue' : 'issues'}
        {blocking[0] !== undefined ? (
          <>
            {' · '}
            <b>{blocking.length} blocking</b>: {blocking[0].title}
          </>
        ) : null}
      </p>
    </Card>
  );
}

// --------------------------------------------------------- money in and out --

function MoneyInOut({
  money,
  period,
  periodHref,
  span,
}: {
  money: Loaded<MoneyByMonthResponse>;
  period: MoneyPeriod;
  periodHref: (p: MoneyPeriod) => string;
  span: DashSpan;
}): ReactNode {
  if (money.kind !== 'ok') {
    return (
      <Card title="Money in and out" help={VALUE.moneyInOut} span={span}>
        <NotRead what="Money in and out" />
      </Card>
    );
  }
  const m = money.data;
  return (
    <Card title="Money in and out" help={VALUE.moneyInOut} span={span} action={<PeriodPicker value={period} label={m.label} hrefFor={periodHref} />}>
      <div className="chart-with-figs">
        {m.ticks.length === 0 ? (
          <figure className="chart lines">
            <div className="empty-plot">Nothing recorded on this project in {m.label} yet</div>
          </figure>
        ) : (
          <Lines
            label="Month"
            labels={m.months.map((x) => x.label)}
            series={[
              { name: 'Collected', index: m.months.map((x) => x.collectedIndex), full: m.months.map((x) => formatIndianRupees(x.collected)) },
              { name: 'Paid out', index: m.months.map((x) => x.paidOutIndex), full: m.months.map((x) => formatIndianRupees(x.paidOut)) },
            ]}
            ticks={m.ticks.map((t) => ({ index: t.index, label: formatCompactRupees(t.wire) }))}
            sr={`Money in and out by month, ${m.label}: ${m.months.map((x) => `${x.label} collected ${formatIndianRupees(x.collected)}, paid out ${formatIndianRupees(x.paidOut)}`).join('; ')}.`}
          />
        )}
        <dl className="cash-figs">
          <div>
            <dt>Collected</dt>
            <dd>
              <MoneyIn>
                <Money wire={m.collected} />
              </MoneyIn>
            </dd>
          </div>
          <div>
            <dt>Paid out</dt>
            <dd>
              <MoneyOut>
                <Money wire={m.paidOut} />
              </MoneyOut>
            </dd>
          </div>
          <div>
            <dt>Net</dt>
            <dd>
              <Money wire={m.net} />
            </dd>
          </div>
        </dl>
      </div>
      <p className="hint">Receipts recorded against this project’s invoices and payments against its bills, net of TDS and retention — not a bank statement.</p>
    </Card>
  );
}

// -------------------------------------------------------------------- team --

function TeamCard({
  team,
  clients,
  projectId,
  clientName,
  span,
}: {
  team: Loaded<ProjectTeamResponse>;
  clients: Loaded<ClientAccountsResponse>;
  projectId: string;
  clientName: string;
  span: DashSpan;
}): ReactNode {
  const action = <CardAction href={`/projects/${projectId}/team`}>Team</CardAction>;
  if (team.kind !== 'ok') {
    return (
      <Card title="Team" help={VALUE.team} span={span}>
        <NotRead what="The team" />
      </Card>
    );
  }
  const signatories = clients.kind === 'ok' ? clients.data.items.filter((c) => !c.disabled && c.projects.some((p) => p.id === projectId)) : [];
  const members = team.data.items;
  if (members.length === 0 && signatories.length === 0) {
    return (
      <Card title="Team" help={VALUE.team} span={span} action={action}>
        <AbsentPanel
          action={
            <Link className="btn" href={`/projects/${projectId}/team`}>
              Add a member
            </Link>
          }
        >
          Nobody is on this project yet. Add the team, and give {clientName === '' ? 'the client' : clientName} a login to sign for them.
        </AbsentPanel>
      </Card>
    );
  }
  return (
    <Card title="Team" help={VALUE.team} span={span} action={action}>
      <ul className="who-list">
        {members.slice(0, 8).map((m) => (
          <li key={m.id}>
            <span className="avatar">{m.email.slice(0, 1).toUpperCase()}</span>
            <span>
              <b>{m.email}</b> <small>{m.designation === '' ? 'on the project' : m.designation}</small>
            </span>
          </li>
        ))}
        {signatories.map((c) => (
          <li key={c.id}>
            <span className="avatar">{clientName.slice(0, 1).toUpperCase()}</span>
            <span>
              <b>{c.email}</b> <small>signs for {clientName === '' ? 'the client' : clientName}</small>
            </span>
          </li>
        ))}
        {signatories.length === 0 ? (
          <li>
            <span className="avatar">{clientName.slice(0, 1).toUpperCase()}</span>
            <span>
              <b>{clientName === '' ? 'The client' : clientName}</b> <small>no client login yet</small>
            </span>
          </li>
        ) : null}
      </ul>
    </Card>
  );
}

// ------------------------------------------------------------------- dates --

function dayDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(
    new Date(`${iso}T00:00:00+05:30`),
  );
}

function weekday(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(`${iso}T00:00:00+05:30`));
}

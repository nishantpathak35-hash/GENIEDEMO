import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import {
  API_ROUTES,
  type CashAgainstPayablesStat,
  type MarginAtRiskStat,
  type MilestonesThisWeekResponse,
  type MoneyByMonthResponse,
  type MoneyPeriod,
  type PayablesAgeingResponse,
  type PipelineSummaryResponse,
  type ProjectRollupResponse,
  type ReceivablesAgeingResponse,
  type SiteTodayResponse,
  type SpendByTradeResponse,
  type TaskListResponse,
  type UnsignedVariationsResponse,
} from '@cog/contracts';
import { formatCompactRupees, formatIndianRupees } from '@cog/money';
import { AbsentPanel, Card, CardAction, Columns, DashGrid, Empty, Icon, Lines, MeterList, Money, MoneyIn, MoneyOut, OverdueStrip, OweCard, PageHeader, Parts, PeriodPicker, Refusal, ShortfallBar, Tile, UnreachableState, load, type DashSpan, type Loaded, type MeterRow } from '@cog/design-system';
import { apiAsCaller } from '../../lib/api';
import { terms } from '../../lib/terms';
import { GettingStarted } from './setup';
import { TodayHero } from './today-hero';

export const metadata = { title: 'Today · Construct-O-Genie' };
export const dynamic = 'force-dynamic';

/**
 * Today — the first screen, and the only one anybody opens without being
 * sent there.
 *
 * **One grid, one card, one form per fact — and every figure on it was
 * computed by the server** (`docs/design/04-today.html`, 19 September 2026).
 * The rows are the rows a director acts in: the hero at 12 — whatever
 * `/today/hero` ranked first this morning; four tiles at 3·3·3·3 — margin at
 * risk, payables this week, overdue receivables, unsigned variations; the
 * money owed each way at 6·6; money in and out at 8 beside cash by account
 * at 4; ordered against contract beside milestones this week; site today
 * beside your day; spend by trade package beside the pipeline. Each panel is
 * one read, the reads run together, and nothing is joined across services
 * here. Each panel's help icon carries its value line — the sentence, in the
 * client's words, that says what a director does after looking at it.
 *
 * **What the model lacks on a tenant, the panel says in product words.** A
 * read that answers empty draws the panel's empty state; only cash by account
 * has no read at all, because the model holds no cash position, and that
 * panel says so instead of estimating. A panel whose module the signed-in
 * person lacks — the pipeline needs `crm`, site today `operations`, unsigned
 * variations `change_orders`, milestones `design_build` — is not drawn, and
 * its row re-flows. This page adds nothing up and compares no dates for
 * money: every share on a bar, every day count and every index on a chart
 * arrived from the service that owns the figure.
 */

/** Each panel's value line, verbatim from the design set (`docs/design/build/panels.mjs`, VALUE). */
const VALUE = {
  hero: 'The one figure that needs you this morning, and whose door to knock on.',
  margin: 'Raise a variation or renegotiate the rate before the next order goes out on a project already past its cost budget.',
  payables: 'Decide what gets paid on Friday, with what is already overdue in front of you.',
  overdue: 'Who to call today — the overdue money by how long it has been overdue.',
  unsigned: 'Work done that cannot be billed until the client signs — chase the signature, not the site.',
  receivables: 'What clients still owe, and how much of it is already late.',
  totalPayables: 'What the firm owes vendors, and how much of it is already late.',
  moneyInOut: 'The trend of money coming in against money going out, month by month, without a bank feed.',
  cash: 'Cash by account is drawn from Tally once the connector is linked — until then the panel says so, and nothing is estimated.',
  ordered: 'Every project against its own contract at a glance, the one past it printed, not coloured.',
  milestones: 'Which site slips before the client notices — the stages due or slipping this week.',
  site: 'A site with no report is the first sign of a problem: which sites reported, who was on them, what is open.',
  yourDay: 'The five things on your list, the overdue ones marked.',
  spend: 'Which trades your money is going to, so the one running away is obvious before it is over.',
  pipeline: 'What is coming: the quotes a client is sitting on, and what is worth the site visit this month.',
} as const;

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const period: MoneyPeriod = params['period'] === 'q' ? 'q' : 'fy';
  const client = await apiAsCaller();
  const t = await terms();
  const [hero, me, margin, cash, receivables, payables, unsigned, money, rollup, milestones, site, tasks, spend, pipeline, setup, people] =
    await Promise.all([
      load(client, API_ROUTES.todayHero, {}),
      load(client, API_ROUTES.myEntitlements, {}),
      load(client, API_ROUTES.marginAtRisk, {}),
      load(client, API_ROUTES.cashAgainstPayables, {}),
      load(client, API_ROUTES.receivablesAgeing, {}),
      load(client, API_ROUTES.payablesAgeing, {}),
      load(client, API_ROUTES.unsignedVariations, {}),
      load(client, API_ROUTES.moneyByMonth, { query: { period } }),
      load(client, API_ROUTES.projectRollup, {}),
      load(client, API_ROUTES.milestonesThisWeek, {}),
      load(client, API_ROUTES.siteToday, {}),
      load(client, API_ROUTES.listTasks, {}),
      load(client, API_ROUTES.spendByTrade, { query: { period } }),
      load(client, API_ROUTES.pipelineSummary, {}),
      load(client, API_ROUTES.todaySetup, {}),
      // a lookup: the widest window the endpoint allows
      load(client, API_ROUTES.people, { query: { limit: '200' } }),
    ]);

  if (hero.kind === 'unreachable') return <UnreachableState />;
  if (hero.kind === 'refused') return <Refusal error={hero.error} />;

  // A task names its owner by principal id; the people list turns that into
  // the email the person signed in with. There is no display name to show.
  const emailOf = new Map(people.kind === 'ok' ? people.data.items.map((p) => [p.id, p.email]) : []);
  // The modules the signed-in person holds decide which panels are drawn.
  const modules = new Set(me.kind === 'ok' ? me.data.modules : []);
  const has = (module: string): boolean => me.kind !== 'ok' || modules.has(module);

  const today = new Date();
  const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const partOfDay = today.getHours() < 12 ? 'This morning' : today.getHours() < 17 ? 'This afternoon' : 'This evening';
  const dateLine = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Kolkata',
  }).format(today);
  const periodHref = (p: MoneyPeriod): string => `/?period=${p}`;
  // the setup tab stays until every step the server can see is done; `?tab=setup` opens it
  const settingUp = setup.kind === 'ok' && setup.data.done < setup.data.total;
  const tab = settingUp && params['tab'] === 'setup' ? 'setup' : 'today';

  // The four tiles, three when the person has no `change_orders`: the row
  // re-flows, four at 3 columns or three at 4.
  const tiles: Array<(span: DashSpan) => ReactNode> = [
    (span) => <MarginTile span={span} margin={margin} />,
    (span) => <PayablesTile span={span} cash={cash} />,
    (span) => <OverdueTile span={span} receivables={receivables} />,
  ];
  if (has('change_orders')) tiles.push((span) => <UnsignedTile span={span} unsigned={unsigned} words={[t.unsignedVariations, t.variations, t.variationLower]} />);
  const tileSpan: DashSpan = tiles.length === 4 ? 3 : tiles.length === 3 ? 4 : 6;

  return (
    <>
      <PageHeader
        title={greeting}
        sub={settingUp ? `${dateLine} · ${String(setup.data.done)} of ${String(setup.data.total)} setup steps done` : 'here is the one thing that needs you, then everything else'}
        actions={
          <Link className="btn" href="/projects?new=1">
            <Icon name="plus" />
            New project
          </Link>
        }
        primary={
          <Link className="btn primary" href="/purchase-orders?new=1">
            <Icon name="plus" />
            Raise an order
          </Link>
        }
        {...(settingUp
          ? {
              tabs: (
                // a tab on Today, not a card in it: Getting started is here until every step is done
                <nav className="subtabs" aria-label="Views">
                  <Link href="/" {...(tab === 'today' ? { 'aria-current': 'page' as const } : {})}>
                    Today
                  </Link>
                  <Link href="/?tab=setup" {...(tab === 'setup' ? { 'aria-current': 'page' as const } : {})}>
                    Getting started
                  </Link>
                </nav>
              ),
            }
          : {})}
      />

      {settingUp && tab === 'setup' ? (
        <div data-hero>
          <GettingStarted setup={setup.data} />
        </div>
      ) : (
      <DashGrid>
        <div className="c12">
          <TodayHero candidate={hero.data.hero} dateLine={`${partOfDay} · ${dateLine}`} />
        </div>

        {tiles.map((tile, i) => (
          <Fragment key={i}>{tile(tileSpan)}</Fragment>
        ))}

        <ReceivablesCard receivables={receivables} />
        <PayablesCard payables={payables} />

        <MoneyInOut money={money} period={period} periodHref={periodHref} span={8} />
        <Card title="Cash by account" help={VALUE.cash} span={4}>
          <AbsentPanel
            action={
              <Link className="btn" href="/settings/company">
                Connect Tally
              </Link>
            }
          >
            Cash position arrives from Tally once the connector is linked. Until then this panel stays empty rather than
            estimate.
          </AbsentPanel>
        </Card>

        <OrderedAgainstContract rollup={rollup} span={has('design_build') ? 6 : 12} />
        {has('design_build') ? <MilestonesCard milestones={milestones} span={6} /> : null}

        {has('operations') ? <SiteCard site={site} span={6} /> : null}
        <YourDay tasks={tasks} today={today} emailOf={emailOf} span={has('operations') ? 6 : 12} />

        <SpendByTrade spend={spend} period={period} periodHref={periodHref} span={has('crm') ? 6 : 12} />
        {has('crm') ? <PipelineCard pipeline={pipeline} span={6} /> : null}
      </DashGrid>
      )}
    </>
  );
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

/** A read that failed, in a panel's body: the API did not answer, or refused. Never a zero. */
function NotRead({ what }: { what: string }): ReactNode {
  return <AbsentPanel>{what} did not load.</AbsentPanel>;
}

// --------------------------------------------------------------- the tiles --

function MarginTile({ span, margin }: { span: DashSpan; margin: Loaded<MarginAtRiskStat> }): ReactNode {
  const disc = { hue: 'yellow', icon: 'margin' } as const;
  if (margin.kind !== 'ok') {
    return <Tile title="Margin at risk" help={VALUE.margin} span={span} disc={disc} figure="—" meaning="Not read" />;
  }
  if (margin.data.status === 'absent') {
    return <Tile title="Margin at risk" help={VALUE.margin} span={span} disc={disc} figure="—" meaning={margin.data.why} />;
  }
  const m = margin.data;
  const partial = m.partialProjects === 0 ? '' : ` · ${plural(m.partialProjects, 'budget')} partial`;
  return (
    <Tile
      title="Margin at risk"
      help={VALUE.margin}
      span={span}
      disc={disc}
      figure={<Money wire={m.total} />}
      meaning={
        m.projectsOver === 0 ? (
          <>nothing approved past a cost budget{partial}</>
        ) : (
          <>
            approved past the cost budget on{' '}
            {m.items.map((i, k) => (
              <span key={i.code}>
                {k > 0 ? ', ' : ''}
                <b>{i.code}</b>
              </span>
            ))}
            {partial}
          </>
        )
      }
      {...(m.projectsOver > 0
        ? { bar: <ShortfallBar coveredPct={m.coveredPct} label="the cost budget against what is approved — the short part is past it" /> }
        : {})}
      split={[
        { label: 'Cost budget', value: <Money wire={m.costBudget} /> },
        { label: 'Approved', value: <Money wire={m.committedApproved} /> },
      ]}
      action={<CardAction href="/purchase-orders">Orders</CardAction>}
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
          'nothing falls due this week'
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

function OverdueTile({ span, receivables }: { span: DashSpan; receivables: Loaded<ReceivablesAgeingResponse> }): ReactNode {
  const disc = { hue: 'yellow', icon: 'invoice-in' } as const;
  if (receivables.kind !== 'ok') {
    return <Tile title="Overdue receivables" help={VALUE.overdue} span={span} disc={disc} figure="—" meaning="Not read" />;
  }
  const r = receivables.data;
  const b = r.buckets;
  return (
    <Tile
      title="Overdue receivables"
      help={VALUE.overdue}
      span={span}
      disc={disc}
      figure={<Money wire={r.overdue.total} />}
      meaning={
        r.oldest === null ? (
          'nothing past its expected date'
        ) : (
          <>
            {plural(r.overdue.count, 'invoice')} · <b>{r.oldest.clientName}</b>, {plural(r.oldest.daysPast, 'day')} past its expected date
          </>
        )
      }
      {...(r.overdue.count > 0
        ? { bar: <OverdueStrip buckets={[b.days1to30, b.days31to60, b.over60]} label="overdue by 1 to 30, 31 to 60 and over 60 days" /> }
        : {})}
      ageing
      split={[
        { label: '1–30 days', value: <Money wire={b.days1to30.total} />, overdue: true },
        { label: '31–60 days', value: <Money wire={b.days31to60.total} />, overdue: true },
        { label: '60+ days', value: <Money wire={b.over60.total} />, overdue: true },
      ]}
      action={<CardAction href="/money/client-billing">Client billing</CardAction>}
    />
  );
}

function UnsignedTile({ span, unsigned, words }: { span: DashSpan; unsigned: Loaded<UnsignedVariationsResponse>; words: readonly [string, string, string] }): ReactNode {
  const [title, many, singular] = words;
  const disc = { hue: 'purple', icon: 'tray' } as const;
  if (unsigned.kind !== 'ok') {
    return <Tile title={title} help={VALUE.unsigned} span={span} disc={disc} figure="—" meaning="Not read" module="change_orders" />;
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
            {plural(u.count, singular, many.toLowerCase())} · <b>{first.projectCode}</b> · with {first.clientName} for signature
            {u.oldest === null || u.oldest.daysWaiting === null ? null : <> · oldest {plural(u.oldest.daysWaiting, 'day')}</>}
          </>
        )
      }
      action={<CardAction href="/projects">{many}</CardAction>}
    />
  );
}

// --------------------------------------------------------- the money cards --

function ReceivablesCard({ receivables }: { receivables: Loaded<ReceivablesAgeingResponse> }): ReactNode {
  const disc = { hue: 'green', icon: 'invoice-in' } as const;
  if (receivables.kind !== 'ok') {
    return (
      <Card title="Total receivables" help={VALUE.receivables} span={6} disc={disc} kind="owe">
        <NotRead what="Receivables" />
      </Card>
    );
  }
  const r = receivables.data;
  return (
    <OweCard
      title="Total receivables"
      help={VALUE.receivables}
      span={6}
      disc={disc}
      action={<CardAction href="/money/client-billing">New invoice</CardAction>}
      total={<Money wire={r.total} />}
      current={{ value: <Money wire={r.buckets.current.total} />, pct: r.buckets.current.pct }}
      buckets={[
        { label: '1–30 days', value: <Money wire={r.buckets.days1to30.total} />, pct: r.buckets.days1to30.pct },
        { label: '31–60 days', value: <Money wire={r.buckets.days31to60.total} />, pct: r.buckets.days31to60.pct },
        { label: '60+ days', value: <Money wire={r.buckets.over60.total} />, pct: r.buckets.over60.pct },
      ]}
      overduePct={String(r.overdue.pct)}
      note={
        r.openCount === 0 ? (
          'nothing is owed'
        ) : (
          <>
            {plural(r.openCount, 'invoice')} unpaid
            {r.oldest === null ? null : (
              <>
                {' · '}
                {r.oldest.number} is {plural(r.oldest.daysPast, 'day')} past its expected date
              </>
            )}
          </>
        )
      }
    />
  );
}

function PayablesCard({ payables }: { payables: Loaded<PayablesAgeingResponse> }): ReactNode {
  const disc = { hue: 'red', icon: 'invoice-out' } as const;
  if (payables.kind !== 'ok') {
    return (
      <Card title="Total payables" help={VALUE.totalPayables} span={6} disc={disc} kind="owe">
        <NotRead what="Payables" />
      </Card>
    );
  }
  const p = payables.data;
  return (
    <OweCard
      title="Total payables"
      help={VALUE.totalPayables}
      span={6}
      disc={disc}
      action={<CardAction href="/money/bills">New bill</CardAction>}
      total={<Money wire={p.total} />}
      current={{ value: <Money wire={p.buckets.current.total} />, pct: p.buckets.current.pct }}
      buckets={[
        { label: '1–30 days', value: <Money wire={p.buckets.days1to30.total} />, pct: p.buckets.days1to30.pct },
        { label: '31–60 days', value: <Money wire={p.buckets.days31to60.total} />, pct: p.buckets.days31to60.pct },
        { label: '60+ days', value: <Money wire={p.buckets.over60.total} />, pct: p.buckets.over60.pct },
      ]}
      overduePct={String(p.overdue.pct)}
      note={
        p.openCount === 0 && p.toAcknowledge.count === 0 ? (
          'nothing is owed'
        ) : (
          <>
            {plural(p.openCount, 'bill')} unpaid · {p.overdue.count} past due · {p.toAcknowledge.count} not yet acknowledged
          </>
        )
      }
    />
  );
}

// --------------------------------------------------------- money in and out --

function MoneyInOut({
  money,
  period,
  periodHref,
  span,
  label = 'Money in and out',
}: {
  money: Loaded<MoneyByMonthResponse>;
  period: MoneyPeriod;
  periodHref: (p: MoneyPeriod) => string;
  span: DashSpan;
  label?: string;
}): ReactNode {
  if (money.kind !== 'ok') {
    return (
      <Card title={label} help={VALUE.moneyInOut} span={span}>
        <NotRead what="Money in and out" />
      </Card>
    );
  }
  const m = money.data;
  const labels = m.months.map((x) => x.label);
  return (
    <Card title={label} help={VALUE.moneyInOut} span={span} action={<PeriodPicker value={period} label={m.label} hrefFor={periodHref} />}>
      <div className="chart-with-figs">
        {m.ticks.length === 0 ? (
          <figure className="chart lines">
            <div className="empty-plot">Nothing recorded in {m.label} yet</div>
          </figure>
        ) : (
          <Lines
            label="Month"
            labels={labels}
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
      <p className="hint">
        Receipts recorded against invoices and payments recorded against bills, net of TDS and retention — not a bank
        statement.
      </p>
    </Card>
  );
}

// ------------------------------------------------ ordered against contract --

/**
 * The chart: ordered against contract, by project. Threshold, band and
 * diamond, never a red bar. Every width is the server's
 * (`rollup.items[].meter`), and the text equivalent is built from the same
 * figures the rows show.
 */
function OrderedAgainstContract({ rollup, span }: { rollup: Loaded<ProjectRollupResponse>; span: DashSpan }): ReactNode {
  if (rollup.kind !== 'ok') {
    return (
      <Card title="Ordered against contract" help={VALUE.ordered} span={span}>
        <NotRead what="Projects" />
      </Card>
    );
  }
  const r = rollup.data;
  if (r.items.length === 0) {
    return (
      <Card title="Ordered against contract" help={VALUE.ordered} span={span} action={<CardAction href="/projects">Projects</CardAction>}>
        <AbsentPanel
          action={
            <Link className="btn" href="/projects">
              New project
            </Link>
          }
        >
          No project yet. Add one with its contract value and every order raised on it shows here against that contract.
        </AbsentPanel>
      </Card>
    );
  }
  const rows: MeterRow[] = r.items.map((p) => ({
    id: p.id,
    label: <Link href={`/projects/${p.id}`}>{p.code}</Link>,
    sub: p.name,
    pct: p.meter.fillPct,
    trackPct: p.meter.trackPct,
    ...(p.meter.thresholdPct === null ? {} : { thresholdPct: p.meter.thresholdPct }),
    ...(p.meter.overPct > 0 ? { overPct: p.meter.overPct } : {}),
    value: <Money wire={p.committed} />,
    note:
      p.contractValue === null ? (
        'no contract value yet'
      ) : p.health === 'over-budget' ? (
        <>
          over <Money wire={p.contractValue} />
        </>
      ) : (
        <>
          of <Money wire={p.contractValue} />
        </>
      ),
  }));
  const summary = r.items
    .map((p) =>
      p.contractValue === null
        ? `${p.code}: ${formatIndianRupees(p.committed)} ordered, no contract value.`
        : `${p.code}: ${formatIndianRupees(p.committed)} ordered of ${formatIndianRupees(p.contractValue)}.`,
    )
    .join(' ');
  return (
    <Card title="Ordered against contract" help={VALUE.ordered} span={span} action={<CardAction href="/projects">Projects</CardAction>}>
      <MeterList
        rows={rows}
        legend={[
          { key: 'contract', label: 'Contract' },
          { key: 'ordered', label: 'Ordered so far' },
          { key: 'over', label: 'Past the contract' },
          { key: 'threshold', label: `${String(r.threshold.atRiskPct)}%, watch closely` },
        ]}
        summary={summary}
      />
      {r.count > r.items.length ? (
        <p className="hint">
          Showing the {r.items.length} projects most against contract of {r.count}.
        </p>
      ) : null}
    </Card>
  );
}

// ------------------------------------------------------ milestones this week --

function MilestonesCard({ milestones, span }: { milestones: Loaded<MilestonesThisWeekResponse>; span: DashSpan }): ReactNode {
  const action = <CardAction href="/projects">Stages</CardAction>;
  if (milestones.kind === 'unreachable') {
    return (
      <Card title="Milestones this week" help={VALUE.milestones} span={span} module="design_build">
        <NotRead what="Milestones" />
      </Card>
    );
  }
  // Refused with not-found: the firm has the delivery-milestones feature
  // switched off, so no milestone exists to be due — the same empty state.
  if (milestones.kind === 'refused' && milestones.error.code !== 'NOT_FOUND') {
    return (
      <Card title="Milestones this week" help={VALUE.milestones} span={span} module="design_build">
        <NotRead what="Milestones" />
      </Card>
    );
  }
  const items = milestones.kind === 'ok' ? milestones.data.items : [];
  if (items.length === 0) {
    return (
      <Card title="Milestones this week" help={VALUE.milestones} span={span} module="design_build" action={action}>
        <AbsentPanel>
          No milestone is due or slipping this week. Give each project’s milestones a date and the ones due or slipping show
          here, by project.
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
              <Link href={`/projects/${m.projectId}/milestones`}>{m.name}</Link>
              <small>
                {m.projectCode}
                {m.trade === '' ? '' : ` · ${m.trade}`}
                {m.status === 'delayed' && m.delayReason !== '' ? ` · ${m.delayReason}` : ''}
              </small>
            </div>
            <span className="when">
              {m.daysLate !== null && m.daysLate > 0 ? <span className="late">{plural(m.daysLate, 'day')} late</span> : null}
              {m.dueThisWeek ? dayDate(m.plannedFinish) : m.status === 'delayed' ? `was ${dayDate(m.plannedFinish)}` : dayDate(m.plannedFinish)}
            </span>
          </li>
        ))}
      </ul>
      {items.length > 6 ? <p className="hint">And {items.length - 6} more this week.</p> : null}
    </Card>
  );
}

// -------------------------------------------------------------- site today --

function SiteCard({ site, span }: { site: Loaded<SiteTodayResponse>; span: DashSpan }): ReactNode {
  if (site.kind !== 'ok') {
    return (
      <Card title="Site today" help={VALUE.site} span={span} module="operations">
        <NotRead what="Site reports" />
      </Card>
    );
  }
  const s = site.data;
  const action = <CardAction href="/site-reports">Reports</CardAction>;
  if (s.sitesTotal === 0) {
    return (
      <Card title="Site today" help={VALUE.site} span={span} module="operations" action={action}>
        <AbsentPanel>No project is on site yet. Once a project starts on site, its daily reports show here.</AbsentPanel>
      </Card>
    );
  }
  const reportedToday = s.sites.filter((x) => x.reportedToday).length;
  const latestIsToday = s.latestReportOn === s.date;
  const reportedOnLatest = new Set(s.sites.filter((x) => x.lastReportOn !== null && x.lastReportOn === s.latestReportOn).map((x) => x.projectId));
  const days = s.byDay;
  const anyDay = days.some((d) => d.onSite !== null);
  const peak = days.reduce((max, d) => (d.onSite !== null && d.onSite > max ? d.onSite : max), 0);
  return (
    <Card title="Site today" help={VALUE.site} span={span} module="operations" action={action}>
      <p className="lead-line">
        <b>
          {reportedToday} of {s.sitesTotal}
        </b>{' '}
        sites reported today
        {!latestIsToday && s.latestReportOn !== null ? (
          <>
            {' · '}
            <b>
              {s.sitesReportingOnLatest} of {s.sitesTotal}
            </b>{' '}
            {relativeDay(s.latestReportOn, s.date)}
          </>
        ) : null}
      </p>
      {anyDay ? (
        <Columns
          label="On site, all sites, by day"
          labels={days.map((d) => d.label)}
          series={[{ name: 'On site', index: days.map((d) => (d.onSite === null ? null : d.index)), full: days.map((d) => (d.onSite === null ? 'no report' : `${String(d.onSite)} on site`)) }]}
          ticks={peak > 0 ? [{ index: 10000, label: String(peak) }] : []}
          short
          sr={`On site by day: ${days.map((d) => `${d.label} ${d.onSite === null ? 'no report' : String(d.onSite)}`).join(', ')}.`}
        />
      ) : null}
      <ul className="site-rows">
        {s.sites.map((x) => (
          <li key={x.projectId}>
            <b>{x.code}</b>
            <span {...(x.reportedToday || reportedOnLatest.has(x.projectId) ? {} : { className: 'no' })}>
              {x.reportedToday ? 'reported today' : reportedOnLatest.has(x.projectId) && s.latestReportOn !== null ? `reported ${relativeDay(s.latestReportOn, s.date)}` : 'not reported'}
            </span>
          </li>
        ))}
      </ul>
      <p className="issues-line">
        <b>{s.openIssues}</b> open {s.openIssues === 1 ? 'issue' : 'issues'}
        {s.blockingIssues > 0 && s.firstBlocking !== null ? (
          <>
            {' · '}
            <b>{s.blockingIssues} blocking</b>: {s.firstBlocking.title}
            {s.firstBlocking.projectCode === '' ? '' : ` (${s.firstBlocking.projectCode})`}
          </>
        ) : null}
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------- your day --

function YourDay({
  tasks,
  today,
  emailOf,
  span,
}: {
  tasks: Loaded<TaskListResponse>;
  today: Date;
  emailOf: ReadonlyMap<string, string>;
  span: DashSpan;
}): ReactNode {
  const action = <CardAction href="/tasks">All tasks</CardAction>;
  if (tasks.kind !== 'ok') {
    return (
      <Card title="Your day" help={VALUE.yourDay} span={span}>
        <NotRead what="Tasks" />
      </Card>
    );
  }
  const open = tasks.data.items.filter((t) => t.status === 'pending' || t.status === 'in_progress').slice(0, 5);
  if (open.length === 0) {
    return (
      <Card title="Your day" help={VALUE.yourDay} span={span} action={action}>
        <Empty
          illustration="tasks"
          title="Nothing to do"
          action={
            <Link className="btn primary" href="/tasks">
              New task
            </Link>
          }
        >
          Tasks people give you — and the ones the product raises — appear here.
        </Empty>
      </Card>
    );
  }
  return (
    <Card title="Your day" help={VALUE.yourDay} span={span} action={action}>
      <ul className="list day">
        {open.map((t) => (
          <li key={t.id}>
            <span className="kind" aria-hidden="true" />
            <div>
              <Link href="/tasks">{t.title}</Link>
              <small>{t.entityName === '' ? (emailOf.get(t.assignedTo) ?? '') : t.entityName}</small>
            </div>
            <span className={t.dueDate !== null && dueWord(t.dueDate, today) === 'Today' ? 'when today' : 'when'}>
              {t.overdue ? <span className="late">Overdue</span> : null}
              {t.dueDate === null ? 'No date' : dueWord(t.dueDate, today)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ------------------------------------------------------- spend by trade --

function SpendByTrade({
  spend,
  period,
  periodHref,
  span,
}: {
  spend: Loaded<SpendByTradeResponse>;
  period: MoneyPeriod;
  periodHref: (p: MoneyPeriod) => string;
  span: DashSpan;
}): ReactNode {
  if (spend.kind !== 'ok') {
    return (
      <Card title="Spend by trade package" help={VALUE.spend} span={span}>
        <NotRead what="Orders" />
      </Card>
    );
  }
  const s = spend.data;
  const picker = <PeriodPicker value={period} label={s.label} hrefFor={periodHref} />;
  if (s.items.length === 0) {
    return (
      <Card title="Spend by trade package" help={VALUE.spend} span={span} action={picker}>
        <AbsentPanel
          action={
            <Link className="btn" href="/purchase-orders">
              Raise an order
            </Link>
          }
        >
          No order raised in {s.label} yet. Every order not cancelled shows here by the trade package its lines name.
        </AbsentPanel>
      </Card>
    );
  }
  return (
    <Card title="Spend by trade package" help={VALUE.spend} span={span} action={picker}>
      <Parts
        label="Ordered by trade package"
        items={s.items.map((i) => ({ name: i.label, value: <Money wire={i.gross} />, pct: i.pct }))}
        rest={{ count: s.rest.count, value: <Money wire={s.rest.gross} />, pct: s.rest.pct }}
        sr={`Ordered by trade package, ${s.label}: ${s.items.map((i) => `${i.label} ${formatIndianRupees(i.gross)}`).join(', ')}${s.rest.count > 0 ? `, other ${formatIndianRupees(s.rest.gross)}` : ''}.`}
      />
    </Card>
  );
}

// ---------------------------------------------------------------- pipeline --

function PipelineCard({ pipeline, span }: { pipeline: Loaded<PipelineSummaryResponse>; span: DashSpan }): ReactNode {
  const action = <CardAction href="/crm">Sales</CardAction>;
  if (pipeline.kind !== 'ok') {
    return (
      <Card title="Pipeline" help={VALUE.pipeline} span={span} module="crm">
        <NotRead what="Leads" />
      </Card>
    );
  }
  const p = pipeline.data;
  if (p.open.count === 0) {
    return (
      <Card title="Pipeline" help={VALUE.pipeline} span={span} module="crm" action={action}>
        <AbsentPanel
          action={
            <Link className="btn" href="/crm">
              New lead
            </Link>
          }
        >
          No open lead yet. Add one and the quotes a client is sitting on, and what is worth the site visit this month, show
          here.
        </AbsentPanel>
      </Card>
    );
  }
  return (
    <Card title="Pipeline" help={VALUE.pipeline} span={span} module="crm" action={action}>
      <b className="fig-line">
        <Money wire={p.quoted.total} />
      </b>
      <p className="meaning">
        {plural(p.quoted.count, 'quote')} awaiting a client’s decision
        {p.quoted.names.length > 0 ? (
          <>
            {' · '}
            {p.quoted.names.map((n, i) => (
              <span key={n}>
                {i > 0 ? ', ' : ''}
                <b>{n}</b>
              </span>
            ))}
          </>
        ) : null}
      </p>
      <dl className="owe-split">
        <div>
          <dt>Next step this month</dt>
          <dd>
            {plural(p.nextStepThisMonth.count, 'lead')} · <Money wire={p.nextStepThisMonth.total} />
          </dd>
        </div>
        <div>
          <dt>Closing this month</dt>
          <dd>
            {plural(p.closingThisMonth.count, 'lead')} · <Money wire={p.closingThisMonth.total} />
          </dd>
        </div>
        <div>
          <dt>Open pipeline</dt>
          <dd>
            <Money wire={p.open.total} /> · {plural(p.open.count, 'lead')}
          </dd>
        </div>
      </dl>
      {p.closingThisMonth.count === 0 ? (
        <p className="hint">Closing this month shows here once a lead carries an expected close date in this month.</p>
      ) : null}
    </Card>
  );
}

// ------------------------------------------------------------------- dates --

/**
 * "Today", "Tomorrow", or the short date. A date comparison, not money; the
 * server has already said which task is overdue (`task.overdue`), so this only
 * chooses the word.
 */
function dueWord(dueDate: string, today: Date): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
  const todayKey = fmt.format(today);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  if (dueDate === todayKey) return 'Today';
  if (dueDate === fmt.format(tomorrow)) return 'Tomorrow';
  return dayDate(dueDate);
}

/** "yesterday", or the short date, for a report's day against today — both the server's dates. */
function relativeDay(day: string, today: string): string {
  const before = new Date(new Date(`${today}T00:00:00Z`).getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (day === before) return 'yesterday';
  return `on ${dayDate(day)}`;
}

/** "Fri 18 Sep" for a `YYYY-MM-DD`. */
function dayDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(
    new Date(`${iso}T00:00:00+05:30`),
  );
}

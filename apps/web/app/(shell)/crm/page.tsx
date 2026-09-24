import type { ReactNode } from 'react';
import Link from 'next/link';
import { API_ROUTES } from '@cog/contracts';
import { AppliedFilters, ColumnControl, Empty, KebabMenu, ListCard, ListPager, ListTable, ListToolbar, Money, MoneyExact, PageHeader, Pill, Refusal, Sparkline, Stat, StatRow, UnreachableState, load, type Column, type Row } from '@cog/design-system';
import { apiAsCaller } from '../../../lib/api';
import { exportHref } from '../../../lib/export';
import { applied, listAddress, pageSizeOf, withView } from '../../../lib/lists';
import { pageLinks, pageState } from '../../../lib/paging';
import { rememberColumns } from '../../actions/preferences';
import { ViewsMenu } from '../../_components/views-menu';
import { NewLeadDrawer } from './new-lead-drawer';
import { LEAD_STAGE_OPTIONS, leadStageLabel, leadStageTone } from './stage';

export const metadata = { title: 'Leads · Construct-O-Genie' };
export const dynamic = 'force-dynamic';

/**
 * Sales › Leads — `docs/design/05-sales.html`, "Sales › Leads — the list".
 *
 * *Find the lead, see what it is worth and who owns the next step.*
 *
 * The stat that changed shape (VALUE-MAP, Sales › Pipeline): the pipeline
 * weighted by stage — 10% at lead, 25% qualified, 40% proposal shared, 70%
 * at negotiation — with the unweighted figure beside it so nobody thinks the
 * number shrank. Both are the server's, over the whole pipeline under the
 * stage filter, never over the window on screen (`totals.weightedByStage`;
 * the lead's own entered probability drives `totals.weighted` and is left
 * exactly as typed, CRM-01).
 *
 * Filters, sort, the page and the search are the server's. **Owner** is a
 * principal id; `/settings/people` is the one read that names it.
 */
const LIST = 'leads';
const BASE = '/crm';
const FILTER_KEYS = ['stage', 'q', 'sort'] as const;
const VALUE = 'Find the lead, see what it is worth and who owns the next step.';

const COLUMNS: readonly Column[] = [
  { key: 'lead', label: 'Lead', p: 1 },
  { key: 'stage', label: 'Stage', p: 2 },
  { key: 'owner', label: 'Owner', p: 3 },
  { key: 'next', label: 'Next', p: 2 },
  { key: 'value', label: 'Value', p: 1, num: true, sort: null },
];

export default async function CrmPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<ReactNode> {
  const raw = await searchParams;
  const client = await apiAsCaller();

  const viewId = raw['view'] ?? null;
  const views = await load(client, API_ROUTES.savedViews, { query: { list: LIST } });
  const view = viewId === null || views.kind !== 'ok' ? null : (views.data.items.find((v) => v.id === viewId) ?? null);
  const params = withView(raw, view?.criteria ?? null);

  const stageAsked = params['stage'] ?? '';
  const stageFilter = LEAD_STAGE_OPTIONS.some(([v]) => v === stageAsked) ? stageAsked : '';
  const q = (params['q'] ?? '').trim();
  const [sortKeyRaw, sortDirRaw] = (params['sort'] ?? 'value:desc').split(':');
  const sortKey = sortKeyRaw === 'created' ? 'created' : 'value';
  const sortDir: 'asc' | 'desc' = sortDirRaw === 'asc' ? 'asc' : 'desc';
  const anyFilter = stageFilter !== '' || q !== '';
  const limit = pageSizeOf(params);
  const paging = pageState(params, '', limit);

  const [pipeline, everyLead, people, weekly, prefs, me] = await Promise.all([
    load(client, API_ROUTES.listLeads, {
      query: {
        ...paging.query,
        sort: `${sortKey}:${sortDir}`,
        ...(stageFilter === '' ? {} : { stage: stageFilter }),
        ...(q === '' ? {} : { q }),
      },
    }),
    // the unfiltered count and pipeline totals for the header, one row's worth
    anyFilter ? load(client, API_ROUTES.listLeads, { query: { limit: '1' } }) : null,
    // a lookup: the widest window the endpoint allows
    load(client, API_ROUTES.people, { query: { limit: '200' } }),
    load(client, API_ROUTES.weeklySeries, {}),
    load(client, API_ROUTES.preferences, {}),
    load(client, API_ROUTES.myEntitlements, {}),
  ]);
  const { hrefFor, perPageHrefs, clearAll, criteria } = listAddress(BASE, params, FILTER_KEYS);

  if (pipeline.kind === 'unreachable') return <UnreachableState />;

  const mayShare = me.kind === 'ok' && me.data.actions.includes('manage_settings');
  const chosen = prefs.kind === 'ok' ? (prefs.data.columns[LIST] ?? null) : null;
  const columns = COLUMNS.filter((c) => c.p === 1 || chosen === null || chosen.includes(c.key));
  const withSort: readonly Column[] = columns.map((c): Column =>
    c.sort === undefined ? c : { ...c, sort: sortKey === 'value' ? sortDir : null, sortHref: hrefFor({ sort: `value:${sortKey === 'value' && sortDir === 'desc' ? 'asc' : 'desc'}` }) },
  );
  const nameOf = new Map(people.kind === 'ok' ? people.data.items.map((p) => [p.id, p.displayName ?? p.email]) : []);
  const today = new Date().toISOString().slice(0, 10);

  const chips = applied(hrefFor, [
    { key: 'stage', label: 'Stage', value: stageFilter, show: leadStageLabel },
    { key: 'q', label: 'Search', value: q },
  ]);

  const totals = everyLead !== null && everyLead.kind === 'ok' ? everyLead.data.totals : pipeline.kind === 'ok' ? pipeline.data.totals : null;
  const totalCount = everyLead !== null && everyLead.kind === 'ok' ? everyLead.data.count : pipeline.kind === 'ok' ? pipeline.data.count : 0;

  const header = (
    <PageHeader
      crumbs={[{ href: '/crm/board', label: 'Sales' }]}
      title={
        views.kind === 'ok' ? (
          <ViewsMenu listKey={LIST} base={BASE} views={views.data.items} currentViewId={view?.id ?? null} defaultName="All leads" criteria={criteria} columns={chosen} mayShare={mayShare} />
        ) : (
          'All leads'
        )
      }
      help={VALUE}
      sub={
        totals === null ? undefined : (
          <>
            <Money wire={totals.total} /> in the pipeline · {totals.openCount} open · {totals.wonThisQuarter.count} won this quarter
          </>
        )
      }
      more={
        <KebabMenu
          sortHrefs={[
            ['Largest first', hrefFor({ sort: 'value:desc' })],
            ['Smallest first', hrefFor({ sort: 'value:asc' })],
            ['Newest first', hrefFor({ sort: 'created:desc' })],
            ['Oldest first', hrefFor({ sort: 'created:asc' })],
          ]}
          exportHref={exportHref('leads', params, ['stage', 'sort', 'q'])}
          refreshHref={hrefFor({})}
        />
      }
      primary={<NewLeadDrawer />}
    />
  );

  if (pipeline.kind === 'refused') {
    return (
      <>
        {header}
        <ListCard label="Leads">
          <div className="card-b">
            <Refusal error={pipeline.error} />
          </div>
        </ListCard>
      </>
    );
  }
  const t = totals ?? pipeline.data.totals;
  const links = pageLinks(paging, pipeline.data, hrefFor, limit);

  const rows: Row[] = pipeline.data.items.map((lead) => {
    const scope = [lead.projectType, lead.city].filter((s) => s !== '').join(' · ');
    const owner = lead.ownerId === null ? null : (nameOf.get(lead.ownerId) ?? null);
    const overdue = lead.nextFollowupOn !== null && lead.nextFollowupOn < today;
    return {
      key: lead.id,
      href: `/crm/${lead.id}`,
      selectLabel: lead.clientName,
      cells: [
        <span key="l">
          <Link href={`/crm/${lead.id}`}>{lead.clientName}</Link>
          {scope === '' ? null : <span className="sub">{scope}</span>}
        </span>,
        <Pill key="s" tone={leadStageTone(lead.stage)}>
          {leadStageLabel(lead.stage)}
        </Pill>,
        owner === null ? (
          <span key="o" className="muted">
            No owner
          </span>
        ) : (
          <span key="o">{owner}</span>
        ),
        lead.nextFollowupOn === null ? (
          <span key="n" className="muted">
            No next step
          </span>
        ) : overdue ? (
          <Pill key="n" tone="bad">
            Overdue {lead.nextFollowupOn}
          </Pill>
        ) : (
          <span key="n" className="nowrap">
            {lead.nextFollowupOn}
          </span>
        ),
        <MoneyExact key="v" wire={lead.estimatedValue} />,
      ],
      detail: (
        <>
          {leadStageLabel(lead.stage)}
          {owner === null ? '' : ` · ${owner}`}
        </>
      ),
    };
  });

  const toolbar = (
    <ListToolbar
      formAction={BASE}
      search={{ name: 'q', placeholder: 'Lead, client or owner', value: params['q'] ?? '', label: 'Lead, client or owner' }}
      hidden={{ sort: `${sortKey}:${sortDir}`, ...(viewId === null ? {} : { view: viewId }) }}
      filters={[
        {
          key: 'stage',
          label: 'Stage',
          value: stageFilter === '' ? null : leadStageLabel(stageFilter),
          control: (
            <div className="field">
              <label htmlFor="f-stage">Stage</label>
              <select id="f-stage" name="stage" defaultValue={stageFilter}>
                <option value="">All</option>
                {LEAD_STAGE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          ),
        },
      ]}
      columns={<ColumnControl listKey={LIST} columns={COLUMNS.map((c) => ({ key: c.key, label: c.label, locked: c.p === 1 }))} chosen={chosen} action={chooseColumns} />}
      exportHref={exportHref('leads', params, ['stage', 'sort', 'q'])}
    />
  );

  const body =
    totalCount === 0 ? (
      <Empty illustration="leads" title="No leads yet" action={<NewLeadDrawer />}>
        Record the first opportunity, and the pipeline starts here.
      </Empty>
    ) : rows.length === 0 ? (
      <Empty
        illustration="search"
        variant="filtered"
        title={`No lead matches ${chips.length === 1 ? 'this filter' : 'these filters'}`}
        action={
          <a className="btn primary" href={clearAll}>
            {chips.length === 1 ? 'Clear the filter' : 'Clear the filters'}
          </a>
        }
      >
        {chips.map((c) => `${c.label} ${c.value}`).join(' · ')}. Widen it, or drop one.
      </Empty>
    ) : (
      <ListTable label="Leads" columns={withSort} rows={rows} />
    );

  return (
    <>
      {header}

      <StatRow n={3}>
        <Stat
          label="Pipeline, weighted by stage"
          value={<Money wire={t.weightedByStage} />}
          delta={{ direction: 'flat', figure: <Money wire={t.total} />, period: 'unweighted · lead 10% to negotiation 70%' }}
          {...(weekly.kind === 'ok' && weekly.data.pipelineOpened.index.length > 1
            ? { spark: <Sparkline values={weekly.data.pipelineOpened.index} />, note: `new pipeline opened each week, last ${String(weekly.data.weeks.length)} weeks` }
            : {})}
        />
        <Stat
          label="Won this quarter"
          value={<Money wire={t.wonThisQuarter.value} />}
          note={
            <>
              <b>
                {t.wonThisQuarter.count} {t.wonThisQuarter.count === 1 ? 'lead' : 'leads'}
              </b>{' '}
              · since {t.wonThisQuarter.since}
            </>
          }
        />
        <Stat
          label="Next site visit"
          text
          value={t.nextSiteVisit === null ? 'None booked' : t.nextSiteVisit.on}
          note={t.nextSiteVisit === null ? 'no open lead has a site visit scheduled' : <Link href={`/crm/${t.nextSiteVisit.leadId}`}>{t.nextSiteVisit.clientName}</Link>}
        />
      </StatRow>

      <ListCard
        label="Leads"
        toolbar={totalCount === 0 ? undefined : toolbar}
        applied={<AppliedFilters applied={chips} clearAllHref={clearAll} />}
        pager={
          totalCount === 0 ? undefined : (
            <ListPager
              from={links.shown.from}
              to={links.shown.to}
              total={pipeline.data.count}
              unit="leads"
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
    </>
  );
}

async function chooseColumns(form: FormData): Promise<void> {
  'use server';
  const reset = form.get('reset') === '1';
  const columns = form.getAll('column').map(String);
  await rememberColumns(LIST, reset ? null : columns, BASE);
}

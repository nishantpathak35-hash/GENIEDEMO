import type { ReactNode } from 'react';
import Link from 'next/link';
import { API_ROUTES, type Project, type StaffBill } from '@cog/contracts';
import { AppliedFilters, AttachmentClip, ColumnControl, Empty, Icon, KebabMenu, ListCard, ListPager, ListTable, ListToolbar, Money, MoneyExact, OweCard, PageHeader, Pill, RecordPane, Refusal, Stat, UnreachableState, load, type Column, type Crumb, type Row, type Terms } from '@cog/design-system';
import { apiAsCaller } from '../../../../lib/api';
import { columnsIn, terms } from '../../../../lib/terms';
import { exportHref } from '../../../../lib/export';
import { applied, listAddress, pageSizeOf, withView } from '../../../../lib/lists';
import { pageLinks, pageState } from '../../../../lib/paging';
import { chooseColumns } from '../../../actions/preferences';
import { ViewsMenu } from '../../../_components/views-menu';
import { ProjectPageHeader } from '../../projects/[projectId]/header';
import { AcknowledgeBillForm, PayBillForm } from './forms';

/**
 * Money › Bills — `docs/design/09-money.html`, "Bills due" and "Bills to
 * acknowledge".
 *
 * *Pay what is due this week without paying anything twice, and see what is
 * still only a claim.*
 *
 * The list on the pattern: the view under the title (Due, To acknowledge,
 * Paid, Returned, All — the server's views), the owe card and its three
 * stats over every bill (the firm's, or the project's inside one), the table
 * with the Project · order column at the firm level, and the bill beside the
 * list (`?bill=`) with its figure, its facts and the one form its state
 * takes: acknowledge with the split the invoice shows, or pay. Every figure
 * is the server's, gross as each vendor claimed; what is deducted and
 * withheld shows on the voucher the payment makes.
 */
const FIRM_KEYS = ['view', 'vendor', 'project', 'q'] as const;
const PROJECT_KEYS = ['view', 'vendor', 'q'] as const;
const VALUE = 'Pay what is due this week without paying anything twice, and see what is still only a claim.';

const VIEWS = [
  ['due', 'Due'],
  ['to_acknowledge', 'To acknowledge'],
  ['paid', 'Paid'],
  ['returned', 'Returned'],
  ['all', 'All'],
] as const;
type View = (typeof VIEWS)[number][0];

const EMPTY = (t: Terms): Readonly<Record<View, string>> => ({
  due: 'Nothing is owed. A bill is due here once it is acknowledged with its taxable value, GST and due date.',
  to_acknowledge: `No bill is waiting. ${t.vendors} send bills from the ${t.vendorLower} portal, against orders issued to them.`,
  paid: 'No bill has been paid yet.',
  returned: 'No bill has been returned.',
  all: `No ${t.vendorLower} has sent a bill yet.`,
});

const FIRM_COLUMNS: readonly Column[] = [
  { key: 'when', label: 'Due', p: 3, num: true },
  { key: 'bill', label: 'Bill', p: 1 },
  { key: 'vendor', label: 'Vendor', p: 3 },
  { key: 'project', label: 'Project · order', p: 3 },
  { key: 'status', label: 'Status', p: 2 },
  { key: 'claimed', label: 'Claimed', p: 2, num: true },
  { key: 'clip', label: '', p: 3, clip: true },
];

function billCount(count: number): string {
  return `${String(count)} ${count === 1 ? 'bill' : 'bills'}`;
}

export async function BillsList({ params: raw, project }: { params: Record<string, string | undefined>; project: Project | null }): Promise<ReactNode> {
  const client = await apiAsCaller();
  const t = await terms();
  const LIST = project === null ? 'bills' : 'project-bills';
  const BASE = project === null ? '/money/bills' : `/projects/${project.id}/bills`;
  const KEYS = project === null ? FIRM_KEYS : PROJECT_KEYS;
  const COLUMNS = columnsIn(project === null ? FIRM_COLUMNS : FIRM_COLUMNS.map((c) => (c.key === 'project' ? { ...c, label: 'Order' } : c)), t);

  const viewId = raw['saved'] ?? null;
  const views = await load(client, API_ROUTES.savedViews, { query: { list: LIST } });
  const saved = viewId === null || views.kind !== 'ok' ? null : (views.data.items.find((v) => v.id === viewId) ?? null);
  const params = withView(raw, saved?.criteria ?? null);

  const view: View = VIEWS.find(([key]) => key === params['view'])?.[0] ?? 'due';
  const vendorFilter = params['vendor'] ?? '';
  const projectFilter = project === null ? (params['project'] ?? '') : project.id;
  const q = (params['q'] ?? '').trim();
  const anyFilter = view !== 'due' || vendorFilter !== '' || q !== '' || (project === null && projectFilter !== '');
  const limit = pageSizeOf(params);
  const paging = pageState(params, '', limit);
  const openId = params['bill'] ?? null;

  const [list, ageing, vendors, projects, prefs, me] = await Promise.all([
    load(client, API_ROUTES.listBills, {
      query: { ...paging.query, view, ...(vendorFilter === '' ? {} : { vendorId: vendorFilter }), ...(projectFilter === '' ? {} : { projectId: projectFilter }), ...(q === '' ? {} : { q }) },
    }),
    load(client, API_ROUTES.payablesAgeing, { query: project === null ? {} : { projectId: project.id } }),
    load(client, API_ROUTES.listVendors, { query: { limit: '200' } }),
    project === null ? load(client, API_ROUTES.listProjects, { query: { limit: '200' } }) : null,
    load(client, API_ROUTES.preferences, {}),
    load(client, API_ROUTES.myEntitlements, {}),
  ]);
  const { hrefFor, perPageHrefs, clearAll, criteria } = listAddress(BASE, params, KEYS);

  if (list.kind === 'unreachable') return <UnreachableState />;

  const mayShare = me.kind === 'ok' && me.data.actions.includes('manage_settings');
  const chosen = prefs.kind === 'ok' ? (prefs.data.columns[LIST] ?? null) : null;
  const columns = COLUMNS.filter((c) => c.p === 1 || chosen === null || chosen.includes(c.key)).map((c) => (c.key === 'when' ? { ...c, label: view === 'due' ? 'Due' : 'Submitted' } : c));
  const vendorNameOf = new Map(vendors.kind === 'ok' ? vendors.data.items.map((v) => [v.id, v.name]) : []);
  const codeOf = new Map(projects !== null && projects.kind === 'ok' ? projects.data.items.map((p) => [p.id, p.code]) : []);
  const viewLabel = VIEWS.find(([key]) => key === view)?.[1] ?? 'Due';

  const chips = applied(hrefFor, [
    { key: 'view', label: 'View', value: view === 'due' ? '' : view, show: (v) => VIEWS.find(([key]) => key === v)?.[1] ?? v },
    { key: 'vendor', label: t.vendor, value: vendorFilter, show: (v) => vendorNameOf.get(v) ?? v },
    ...(project === null ? [{ key: 'project', label: 'Project', value: projectFilter, show: (v: string) => codeOf.get(v) ?? v }] : []),
    { key: 'q', label: 'Search', value: q },
  ]);

  const summary = list.kind === 'ok' ? list.data.summary : null;
  const title =
    views.kind === 'ok' ? (
      <ViewsMenu listKey={LIST} base={BASE} views={views.data.items} currentViewId={saved?.id ?? null} defaultName="Bills due" criteria={criteria} columns={chosen} mayShare={mayShare} />
    ) : (
      'Bills due'
    );
  const sub = summary === null ? undefined : <>gross, as each vendor claimed · this week ends {summary.weekEnds}</>;
  const more = <KebabMenu sortHrefs={[]} exportHref={exportHref('bills', project === null ? params : { ...params, project: project.id }, ['view', 'project'])} refreshHref={hrefFor({})} />;
  const HeaderTag = project === null ? PageHeader : ProjectPageHeader;
  const headerProps = project === null ? { crumbs: [{ href: '/money/bills', label: 'Money' }] } : { project, section: 'Commercial' };
  const header = <HeaderTag {...(headerProps as { crumbs: Crumb[] } & { project: Project; section: string })} title={title} help={VALUE} sub={sub} more={more} />;

  if (list.kind === 'refused') {
    return (
      <>
        {header}
        <ListCard label="Bills">
          <div className="card-b">
            <Refusal error={list.error} />
          </div>
        </ListCard>
      </>
    );
  }
  const s = list.data.summary;
  const links = pageLinks(paging, list.data, hrefFor, limit);
  const totalCount = list.data.count;
  const open = openId === null ? null : (list.data.items.find((b) => b.id === openId) ?? null);

  const rows: Row[] = list.data.items.map((b) => {
    const code = b.projectId === null ? null : (codeOf.get(b.projectId) ?? null);
    return {
      key: b.id,
      href: hrefFor({ bill: b.id }),
      open: b.id === openId,
      selectLabel: b.billNumber,
      cells: [
        <span key="w" className="nowrap">
          {view === 'due' ? (b.dueOn ?? '—') : b.submittedAt.slice(0, 10)}
        </span>,
        <span key="b">{b.billNumber}</span>,
        <span key="v">{b.vendorName}</span>,
        project === null ? (
          <span key="p">
            {code === null ? <span className="muted">Stock</span> : code} · {b.orderNumber}
          </span>
        ) : (
          <span key="p">{b.orderNumber}</span>
        ),
        <StatePill key="s" bill={b} today={s.today} />,
        <MoneyExact key="c" wire={b.amountClaimed} />,
        <AttachmentClip key="clip" what="the vendor’s bill" />,
      ],
      detail: (
        <>
          {view === 'due' ? (b.dueOn ?? '') : b.submittedAt.slice(0, 10)} · {b.vendorName} · {code ?? 'Stock'} · {b.orderNumber}
        </>
      ),
    };
  });

  const toolbar = (
    <ListToolbar
      formAction={BASE}
      search={{ name: 'q', placeholder: 'Bill number or vendor', value: params['q'] ?? '', label: 'Bill number or vendor' }}
      hidden={viewId === null ? {} : { saved: viewId }}
      compact={open !== null}
      filters={[
        {
          key: 'view',
          label: 'View',
          value: view === 'due' ? 'Due' : viewLabel,
          control: (
            <div className="field">
              <label htmlFor="f-view">View</label>
              <select id="f-view" name="view" defaultValue={view}>
                {VIEWS.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          ),
        },
        {
          key: 'vendor',
          label: t.vendor,
          value: vendorFilter === '' ? null : (vendorNameOf.get(vendorFilter) ?? vendorFilter),
          control: (
            <div className="field">
              <label htmlFor="f-vendor">{t.vendor}</label>
              <select id="f-vendor" name="vendor" defaultValue={vendorFilter}>
                <option value="">All</option>
                {[...vendorNameOf].map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
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
      columns={<ColumnControl listKey={LIST} columns={COLUMNS.map((c) => ({ key: c.key, label: c.label === '' ? 'Attachment' : c.label, locked: c.p === 1 }))} chosen={chosen} action={chooseColumns.bind(null, BASE)} compact={open !== null} />}
      exportHref={exportHref('bills', project === null ? params : { ...params, project: project.id }, ['view', 'project'])}
    />
  );

  const body =
    totalCount === 0 && !anyFilter ? (
      <Empty illustration="money" title="No bills here">
        {EMPTY(t)[view]}
      </Empty>
    ) : rows.length === 0 ? (
      <Empty
        illustration="search"
        variant="filtered"
        title={`No bill matches ${chips.length === 1 ? 'this filter' : 'these filters'}`}
        action={
          <a className="btn primary" href={clearAll}>
            {chips.length === 1 ? 'Clear the filter' : 'Clear the filters'}
          </a>
        }
      >
        {chips.map((c) => `${c.label} ${c.value}`).join(' · ')}. Widen it, or drop one.
      </Empty>
    ) : (
      <ListTable label="Bills" columns={columns} rows={rows} />
    );

  const pane =
    open === null ? undefined : (
      <RecordPane
        title={open.billNumber}
        status={<StatePill bill={open} today={s.today} />}
        sub={
          <>
            {open.vendorName} · {open.orderNumber}
            {open.projectId === null ? '' : ` · ${codeOf.get(open.projectId) ?? project?.code ?? ''}`}
          </>
        }
        backHref={hrefFor({ bill: undefined })}
        closeHref={hrefFor({ bill: undefined })}
        fullHref={`/purchase-orders/${open.purchaseOrderId}`}
      >
        <div className="figbox">
          <div className="fig">
            <MoneyExact wire={open.amountClaimed} />
          </div>
        </div>
        <dl className="kv">
          <dt>Order</dt>
          <dd>
            <Link href={`/purchase-orders/${open.purchaseOrderId}`}>{open.orderNumber}</Link>
          </dd>
          <dt>Sent</dt>
          <dd>{open.submittedAt.slice(0, 10)} · on the portal</dd>
          <dt>For</dt>
          <dd>{open.narrative === '' ? <span className="muted">Not stated</span> : open.narrative}</dd>
          <dt>Period</dt>
          <dd>{open.periodFrom === null ? <span className="muted">Not stated</span> : `${open.periodFrom} to ${open.periodTo ?? ''}`}</dd>
          <dt>Taxable value</dt>
          <dd>{open.taxableAmount === null ? <span className="muted">Recorded when the bill is acknowledged</span> : <Money wire={open.taxableAmount} />}</dd>
          <dt>GST</dt>
          <dd>{open.gstAmount === null ? <span className="muted">Recorded when the bill is acknowledged</span> : <Money wire={open.gstAmount} />}</dd>
          <dt>Due</dt>
          <dd>{open.dueOn ?? <span className="muted">Recorded when the bill is acknowledged</span>}</dd>
          <dt>Paid</dt>
          <dd>{open.paidOn === null ? <span className="muted">Not yet</span> : <Link href={`/money/payments?payment=${open.paymentId ?? ''}`}>{open.paidOn}</Link>}</dd>
        </dl>
        {open.state === 'submitted' ? <AcknowledgeBillForm billId={open.id} /> : null}
        {open.state === 'acknowledged' && open.paidOn === null ? (
          <>
            <p className="hint muted">Tax is deducted and retention withheld at the provisional rates; the voucher shows how.</p>
            <PayBillForm billId={open.id} />
          </>
        ) : null}
      </RecordPane>
    );

  const a = ageing.kind === 'ok' ? ageing.data : null;
  return (
    <>
      {header}

      <div className="two owe-row">
        {a === null ? (
          <Stat label="Total payables" value={<Money wire={s.overdue.total} />} note="the ageing could not be read; overdue shown" />
        ) : (
          <OweCard
            title="Total payables"
            help="What is owed to vendors on bills acknowledged and unpaid — current, then overdue by how long"
            span={6}
            disc={{ hue: 'red', icon: 'bill' }}
            total={<Money wire={a.total} />}
            current={{ value: <Money wire={a.buckets.current.total} />, pct: a.buckets.current.pct }}
            buckets={[
              { label: '1–30 days', value: <Money wire={a.buckets.days1to30.total} />, pct: a.buckets.days1to30.pct },
              { label: '31–60 days', value: <Money wire={a.buckets.days31to60.total} />, pct: a.buckets.days31to60.pct },
              { label: '60+ days', value: <Money wire={a.buckets.over60.total} />, pct: a.buckets.over60.pct },
            ]}
            overduePct={String(a.overdue.pct)}
            note={a.openCount === 0 && a.toAcknowledge.count === 0 ? 'nothing is owed' : <>{billCount(a.openCount)} unpaid · {a.overdue.count} past due · this week ends {s.weekEnds}</>}
          />
        )}
        <div className="stats col">
          <Stat
            label="Due this week"
            value={<Money wire={s.dueThisWeek.total} />}
            note={
              <>
                <b>{billCount(s.dueThisWeek.count)}</b> · to {s.weekEnds}
              </>
            }
          />
          <Stat
            label="Due next week"
            value={<Money wire={s.dueNextWeek.total} />}
            note={
              <>
                <b>{billCount(s.dueNextWeek.count)}</b> · to {s.nextWeekEnds}
              </>
            }
          />
          <Stat
            label="To acknowledge"
            value={<Money wire={s.toAcknowledge.total} />}
            note={
              <>
                <b>{billCount(s.toAcknowledge.count)}</b> · sent and not yet checked
              </>
            }
          />
        </div>
      </div>

      <div data-hero>
        <ListCard
          label="Bills"
          toolbar={toolbar}
          applied={<AppliedFilters applied={chips} clearAllHref={clearAll} />}
          pager={
            <ListPager
              from={links.shown.from}
              to={links.shown.to}
              total={list.data.count}
              unit="bills"
              perPage={limit}
              prevHref={links.prev}
              nextHref={links.next}
              perPageHrefs={perPageHrefs}
            />
          }
          {...(pane === undefined ? {} : { pane })}
        >
          {body}
        </ListCard>
      </div>
    </>
  );
}

function StatePill({ bill, today }: { bill: StaffBill; today: string }): ReactNode {
  if (bill.paidOn !== null) return <Pill tone="ok">Paid {bill.paidOn}</Pill>;
  if (bill.state === 'acknowledged') return bill.dueOn !== null && bill.dueOn < today ? <Pill tone="warn">Overdue</Pill> : <Pill tone="idle">Due</Pill>;
  if (bill.state === 'returned') return <Pill tone="idle">Returned</Pill>;
  return <Pill tone="idle">To acknowledge</Pill>;
}

import type { ReactNode } from 'react';
import Link from 'next/link';
import { API_ROUTES, type RetentionPosition } from '@cog/contracts';
import { formatBasisPoints } from '@cog/money';
import { AppliedFilters, ColumnControl, Empty, Icon, KebabMenu, ListCard, ListPager, ListTable, ListToolbar, Money, MoneyExact, MoneyOut, PageHeader, Pill, RecordPane, Refusal, Section, Stat, StatRow, UnreachableState, load, type Column, type Row } from '@cog/design-system';
import { apiAsCaller } from '../../../lib/api';
import { columnsIn, terms } from '../../../lib/terms';
import { exportHref } from '../../../lib/export';
import { applied, listAddress, pageSizeOf, withView } from '../../../lib/lists';
import { pageLinks, pageState } from '../../../lib/paging';
import { chooseColumns } from '../../actions/preferences';
import { ViewsMenu } from '../../_components/views-menu';
import { RecordRetentionForm, ReleaseRetentionForm } from './forms';

export const metadata = { title: 'Retention · Money' };
export const dynamic = 'force-dynamic';

/**
 * Money › Retention — `docs/design/09-money.html`, "Retention".
 *
 * *See what is held against each order and release it when the defects
 * period ends, as a voucher and nothing else.*
 *
 * A holding is a rate against an order: withheld from that order's bills as
 * they are paid, released as a payment voucher with nothing further
 * deducted. Every figure is the server's. Its project is the order's,
 * resolved when the holding is open. Cash by account stays absent (HELD).
 */
const LIST = 'retention';
const BASE = '/retention';
const FILTER_KEYS = ['stage'] as const;
const VALUE = 'See what is held against each order and release it when the defects period ends, as a voucher and nothing else.';

const COLUMNS: readonly Column[] = [
  { key: 'order', label: 'Order', p: 1 },
  { key: 'vendor', label: 'Vendor', p: 3 },
  { key: 'rate', label: 'Rate', p: 3, num: true },
  { key: 'stage', label: 'Stage', p: 2 },
  { key: 'held', label: 'Held now', p: 2, num: true },
];

export default async function RetentionPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<ReactNode> {
  const raw = await searchParams;
  const client = await apiAsCaller();
  const t = await terms();

  const viewId = raw['view'] ?? null;
  const views = await load(client, API_ROUTES.savedViews, { query: { list: LIST } });
  const view = viewId === null || views.kind !== 'ok' ? null : (views.data.items.find((v) => v.id === viewId) ?? null);
  const params = withView(raw, view?.criteria ?? null);

  const stageAsked = params['stage'] ?? '';
  const stageFilter = stageAsked === 'held' || stageAsked === 'released' ? stageAsked : '';
  const limit = pageSizeOf(params);
  const paging = pageState(params, '', limit);
  const openId = params['holding'] ?? null;

  const [positions, orders, prefs, me] = await Promise.all([
    load(client, API_ROUTES.listRetentionPositions, { query: { ...paging.query, ...(stageFilter === '' ? {} : { stage: stageFilter }) } }),
    // a lookup, for the picker: the widest window the endpoint allows
    load(client, API_ROUTES.listPurchaseOrders, { query: { limit: '200' } }),
    load(client, API_ROUTES.preferences, {}),
    load(client, API_ROUTES.myEntitlements, {}),
  ]);
  const { hrefFor, perPageHrefs, clearAll, criteria } = listAddress(BASE, params, FILTER_KEYS);

  if (positions.kind === 'unreachable') return <UnreachableState />;

  const mayShare = me.kind === 'ok' && me.data.actions.includes('manage_settings');
  const chosen = prefs.kind === 'ok' ? (prefs.data.columns[LIST] ?? null) : null;
  const columns = columnsIn(COLUMNS, t).filter((c) => c.p === 1 || chosen === null || chosen.includes(c.key));
  const orderOptions = orders.kind === 'ok' ? orders.data.items.map((o) => [o.id, `${o.number} — ${o.vendorName ?? 'vendor unknown'}`] as const) : [];
  const chips = applied(hrefFor, [{ key: 'stage', label: 'Stage', value: stageFilter, show: (v) => (v === 'held' ? 'Held' : 'Released') }]);
  const summary = positions.kind === 'ok' ? positions.data.summary : null;

  const header = (
    <PageHeader
      crumbs={[{ href: '/money/bills', label: 'Money' }]}
      title={
        views.kind === 'ok' ? (
          <ViewsMenu listKey={LIST} base={BASE} views={views.data.items} currentViewId={view?.id ?? null} defaultName="All holdings" criteria={criteria} columns={chosen} mayShare={mayShare} />
        ) : (
          'All holdings'
        )
      }
      help={VALUE}
      sub={summary === null ? undefined : <>withheld from bills, released as payments · {summary.holdings} {summary.holdings === 1 ? 'holding' : 'holdings'}</>}
      more={<KebabMenu sortHrefs={[]} exportHref={exportHref('retention', {}, [])} refreshHref={hrefFor({})} />}
      primary={
        <Link className="btn primary" href={`${hrefFor({ new: '1' })}#record`}>
          <Icon name="plus" />
          Record a holding
        </Link>
      }
    />
  );

  if (positions.kind === 'refused') {
    return (
      <>
        {header}
        <ListCard label="Held against orders">
          <div className="card-b">
            <Refusal error={positions.error} />
          </div>
        </ListCard>
      </>
    );
  }
  const s = positions.data.summary;
  const links = pageLinks(paging, positions.data, hrefFor, limit);
  const open = openId === null ? null : (positions.data.items.find((p) => p.id === openId) ?? null);
  // the holding's project is its order's
  const order = open === null ? null : await load(client, API_ROUTES.getPurchaseOrder, { params: { id: open.purchaseOrderId } });
  const project = order !== null && order.kind === 'ok' && order.data.projectId !== null ? await load(client, API_ROUTES.getProject, { params: { projectId: order.data.projectId } }) : null;
  const projectCode = project !== null && project.kind === 'ok' ? project.data : null;
  const rows: Row[] = positions.data.items.map((p) => ({
    key: p.id,
    href: hrefFor({ holding: p.id }),
    open: p.id === openId,
    selectLabel: p.orderNumber ?? 'an order',
    cells: [
      <span key="o">{p.orderNumber ?? 'An order'}</span>,
      <span key="v">{p.vendorName ?? 'vendor unknown'}</span>,
      <span key="r">{formatBasisPoints(p.retentionRateBp)}</span>,
      <Pill key="s" tone={p.stage === 'released' ? 'ok' : 'warn'}>
        {p.stage === 'released' ? 'Released' : 'Held'}
      </Pill>,
      <MoneyExact key="h" wire={p.held} />,
    ],
    detail: (
      <>
        {p.vendorName ?? 'vendor unknown'} · {formatBasisPoints(p.retentionRateBp)}
      </>
    ),
  }));

  const toolbar = (
    <ListToolbar
      formAction={BASE}
      hidden={viewId === null ? {} : { view: viewId }}
      compact={open !== null}
      filters={[
        {
          key: 'stage',
          label: 'Stage',
          value: stageFilter === '' ? null : stageFilter === 'held' ? 'Held' : 'Released',
          control: (
            <div className="field">
              <label htmlFor="f-stage">Stage</label>
              <select id="f-stage" name="stage" defaultValue={stageFilter}>
                <option value="">All</option>
                <option value="held">Held</option>
                <option value="released">Released</option>
              </select>
            </div>
          ),
        },
      ]}
      columns={<ColumnControl listKey={LIST} columns={columnsIn(COLUMNS, t).map((c) => ({ key: c.key, label: c.label, locked: c.p === 1 }))} chosen={chosen} action={chooseColumns.bind(null, BASE)} compact={open !== null} />}
      exportHref={exportHref('retention', {}, [])}
    />
  );

  const body =
    positions.data.count === 0 && stageFilter === '' ? (
      <Empty
        illustration="money"
        title="No retention recorded"
        action={
          <Link className="btn primary" href={`${hrefFor({ new: '1' })}#record`}>
            <Icon name="plus" />
            Record a holding
          </Link>
        }
      >
        Record the rate held against an order; it is withheld from that order’s bills as they are paid.
      </Empty>
    ) : rows.length === 0 ? (
      <Empty
        illustration="search"
        variant="filtered"
        title="No holding matches this filter"
        action={
          <a className="btn primary" href={clearAll}>
            Clear the filter
          </a>
        }
      >
        {chips.map((c) => `${c.label} ${c.value}`).join(' · ')}. Widen it, or drop it.
      </Empty>
    ) : (
      <ListTable label="Held against orders" columns={columns} rows={rows} />
    );

  const pane = open === null ? undefined : <HoldingPane position={open} project={projectCode} backHref={hrefFor({ holding: undefined })} />;

  return (
    <>
      {header}

      <StatRow n={3}>
        <Stat label="Held now" value={<Money wire={s.held} />} note={<>withheld and not yet released · across <b>{s.holdings}</b> {s.holdings === 1 ? 'order' : 'orders'}</>} disc={{ hue: 'purple', icon: 'held' }} />
        <Stat label="Released" value={<MoneyOut><Money wire={s.released} /></MoneyOut>} note="paid out as vouchers" disc={{ hue: 'red', icon: 'voucher' }} />
        <Stat label="Holdings" value={s.holdings} note={`${s.holdings === 1 ? 'order' : 'orders'} retention is held against`} />
      </StatRow>

      <div data-hero>
        <ListCard
          label="Held against orders"
          toolbar={positions.data.count === 0 ? undefined : toolbar}
          applied={<AppliedFilters applied={chips} clearAllHref={clearAll} />}
          pager={
            positions.data.count === 0 ? undefined : (
              <ListPager from={links.shown.from} to={links.shown.to} total={positions.data.count} unit="holdings" perPage={limit} prevHref={links.prev} nextHref={links.next} perPageHrefs={perPageHrefs} />
            )
          }
          {...(pane === undefined ? {} : { pane })}
        >
          {body}
        </ListCard>
      </div>

      {params['new'] === '1' ? (
        <Section bare title="Record a holding">
          <div className="card-b" id="record">
            {orderOptions.length === 0 ? <p className="muted">No purchase order exists to hold retention against.</p> : <RecordRetentionForm orders={orderOptions} />}
          </div>
        </Section>
      ) : null}
    </>
  );
}

function HoldingPane({ position, project, backHref }: { position: RetentionPosition; project: { readonly id: string; readonly code: string } | null; backHref: string }): ReactNode {
  return (
    <RecordPane
      title={position.orderNumber ?? 'An order'}
      status={<Pill tone={position.stage === 'released' ? 'ok' : 'warn'}>{position.stage === 'released' ? 'Released' : 'Held'}</Pill>}
      sub={
        <>
          {position.vendorName ?? 'vendor unknown'}
          {project === null ? '' : <> · <Link href={`/projects/${project.id}`}>{project.code}</Link></>}
        </>
      }
      backHref={backHref}
      closeHref={backHref}
      fullHref={`/purchase-orders/${position.purchaseOrderId}`}
    >
      <div className="figbox">
        <div className="fig">
          <MoneyExact wire={position.held} />
        </div>
      </div>
      <dl className="kv">
        <dt>Rate held</dt>
        <dd>{formatBasisPoints(position.retentionRateBp)}</dd>
        <dt>Withheld from bills</dt>
        <dd>
          <Money wire={position.withheld} />
        </dd>
        <dt>Released</dt>
        <dd>
          <Money wire={position.released} />
        </dd>
        <dt>Stage</dt>
        <dd>
          <Pill tone={position.stage === 'released' ? 'ok' : 'warn'}>{position.stage === 'released' ? 'Released' : 'Held'}</Pill>
        </dd>
      </dl>
      {position.canRelease ? (
        <>
          <p className="hint muted">Paid as a voucher, with nothing further deducted.</p>
          <ReleaseRetentionForm holdingId={position.id} />
        </>
      ) : (
        <p className="muted">{position.stage === 'released' ? 'Released — the voucher is on Payments.' : 'Nothing withheld yet: retention is withheld as this order’s bills are paid.'}</p>
      )}
    </RecordPane>
  );
}

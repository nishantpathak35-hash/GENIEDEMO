import type { ReactNode } from 'react';
import Link from 'next/link';
import { API_ROUTES } from '@cog/contracts';
import { AppliedFilters, ColumnControl, Empty, Icon, KebabMenu, ListCard, ListPager, ListTable, ListToolbar, Money, MoneyExact, PageHeader, Refusal, Section, Stat, StatRow, UnreachableState, load, type Column, type Row } from '@cog/design-system';
import { apiAsCaller } from '../../../lib/api';
import { columnsIn, terms } from '../../../lib/terms';
import { exportHref } from '../../../lib/export';
import { applied, listAddress, pageSizeOf, withView } from '../../../lib/lists';
import { pageLinks, pageState } from '../../../lib/paging';
import { rememberColumns } from '../../actions/preferences';
import { ViewsMenu } from '../../_components/views-menu';
import { NewVendorForm } from './forms';

export async function generateMetadata(): Promise<{ title: string }> {
  return { title: `${(await terms()).vendors} · Construct-O-Genie` };
}
export const dynamic = 'force-dynamic';

/**
 * Buying › Vendors — `docs/design/07-buying.html`, "Buying › Vendors".
 *
 * *Pick the vendor you already have a rate with, instead of asking three
 * people for a quote again.*
 *
 * The stat that changed shape (VALUE-MAP): rate contracts expiring in 30
 * days, named — a deadline with a name attached — in place of a cumulative
 * count nobody acts on. Every figure on the row and in the table is the
 * server's, computed over every vendor, order, bill and contract, never
 * over the page on screen (`/vendors`'s own `summary`).
 *
 * **No Trade filter, no trade line under a vendor.** `vendor` has no
 * trade or specialisation field; the only trade code exists on a
 * rate-contract ITEM — HUMAN(DATA). The filter offered is Status.
 * **No bank column, on this screen or any.** VEND-02 closed at the schema:
 * the account number and IFSC sit in a table no vendor read touches.
 */
const LIST = 'vendors';
const BASE = '/vendors';
const FILTER_KEYS = ['status', 'q', 'sort'] as const;
const VALUE = 'Pick the vendor you already have a rate with, instead of asking three people for a quote again.';

const COLUMNS: readonly Column[] = [
  { key: 'vendor', label: 'Vendor', p: 1 },
  { key: 'rates', label: 'Agreed rates', p: 2, num: true, sort: null },
  { key: 'open', label: 'Open orders', p: 2, num: true, sort: null },
  { key: 'bills', label: 'Bills waiting', p: 3, num: true },
  { key: 'last', label: 'Last order', p: 3, num: true, sort: null },
];

const SORT_OF: Record<string, 'agreedRates' | 'openOrders' | 'lastOrder'> = { rates: 'agreedRates', open: 'openOrders', last: 'lastOrder' };

export default async function VendorsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<ReactNode> {
  const raw = await searchParams;
  const client = await apiAsCaller();
  const t = await terms();

  const viewId = raw['view'] ?? null;
  const views = await load(client, API_ROUTES.savedViews, { query: { list: LIST } });
  const view = viewId === null || views.kind !== 'ok' ? null : (views.data.items.find((v) => v.id === viewId) ?? null);
  const params = withView(raw, view?.criteria ?? null);

  const statusAsked = params['status'] ?? '';
  const statusFilter = statusAsked === 'active' || statusAsked === 'inactive' ? statusAsked : '';
  const q = (params['q'] ?? '').trim();
  const [sortKeyRaw, sortDirRaw] = (params['sort'] ?? 'lastOrder:desc').split(':');
  const sortKey = sortKeyRaw === 'name' || sortKeyRaw === 'openOrders' || sortKeyRaw === 'agreedRates' ? sortKeyRaw : 'lastOrder';
  const sortDir: 'asc' | 'desc' = sortDirRaw === 'asc' ? 'asc' : 'desc';
  const anyFilter = statusFilter !== '' || q !== '';
  const limit = pageSizeOf(params);
  const paging = pageState(params, '', limit);

  const [vendors, prefs, me] = await Promise.all([
    load(client, API_ROUTES.listVendors, {
      query: {
        ...paging.query,
        sort: `${sortKey}:${sortDir}`,
        ...(statusFilter === '' ? {} : { status: statusFilter }),
        ...(q === '' ? {} : { q }),
      },
    }),
    load(client, API_ROUTES.preferences, {}),
    load(client, API_ROUTES.myEntitlements, {}),
  ]);
  const { hrefFor, perPageHrefs, clearAll, criteria } = listAddress(BASE, params, FILTER_KEYS);

  if (vendors.kind === 'unreachable') return <UnreachableState />;

  const mayShare = me.kind === 'ok' && me.data.actions.includes('manage_settings');
  const chosen = prefs.kind === 'ok' ? (prefs.data.columns[LIST] ?? null) : null;
  const columns = columnsIn(COLUMNS, t).filter((c) => c.p === 1 || chosen === null || chosen.includes(c.key));
  const withSort: readonly Column[] = columns.map((c): Column => {
    const key = SORT_OF[c.key];
    if (c.sort === undefined || key === undefined) return c;
    return { ...c, sort: key === sortKey ? sortDir : null, sortHref: hrefFor({ sort: `${key}:${sortKey === key && sortDir === 'desc' ? 'asc' : 'desc'}` }) };
  });

  const chips = applied(hrefFor, [
    { key: 'status', label: 'Status', value: statusFilter, show: (v) => (v === 'active' ? 'Active' : 'Inactive') },
    { key: 'q', label: 'Search', value: q },
  ]);

  const summary = vendors.kind === 'ok' ? vendors.data.summary : null;
  const header = (
    <PageHeader
      crumbs={[{ href: '/purchase-orders', label: 'Buying' }]}
      title={
        views.kind === 'ok' ? (
          <ViewsMenu listKey={LIST} base={BASE} views={views.data.items} currentViewId={view?.id ?? null} defaultName={t.allVendors} criteria={criteria} columns={chosen} mayShare={mayShare} />
        ) : (
          t.allVendors
        )
      }
      help={VALUE}
      {...(summary !== null && summary.withoutTaxIds.count > 0
        ? {
            status: (
              <span className="warn-chip">
                <Icon name="alert" size="sm" />
                No PAN or GSTIN for {summary.withoutTaxIds.count} {summary.withoutTaxIds.count === 1 ? t.vendorLower : t.vendorsLower}
              </span>
            ),
          }
        : {})}
      sub={
        summary === null ? undefined : (
          <>
            {summary.active} active · {summary.agreedRates} agreed {summary.agreedRates === 1 ? 'rate' : 'rates'} · {summary.openOrders.count} open {summary.openOrders.count === 1 ? 'order' : 'orders'}
          </>
        )
      }
      more={
        <KebabMenu
          sortHrefs={[
            ['Last ordered first', hrefFor({ sort: 'lastOrder:desc' })],
            ['Name, A to Z', hrefFor({ sort: 'name:asc' })],
            ['Most open orders first', hrefFor({ sort: 'openOrders:desc' })],
            ['Most agreed rates first', hrefFor({ sort: 'agreedRates:desc' })],
          ]}
          exportHref={exportHref('vendors', params, ['q', 'sort', 'status'])}
          refreshHref={hrefFor({})}
        />
      }
      primary={
        // registering a vendor is any staff member's to do — the server gates no action on it
        <Link className="btn primary" href={`${hrefFor({ new: '1' })}#register-vendor`}>
          <Icon name="plus" />
          Add a {t.vendorLower}
        </Link>
      }
    />
  );

  if (vendors.kind === 'refused') {
    return (
      <>
        {header}
        <ListCard label={t.vendors}>
          <div className="card-b">
            <Refusal error={vendors.error} />
          </div>
        </ListCard>
      </>
    );
  }
  const s = vendors.data.summary;
  const expiring = s.contractsExpiringIn30Days;
  const totalCount = anyFilter ? s.registered : vendors.data.count;
  const links = pageLinks(paging, vendors.data, hrefFor, limit);

  const rows: Row[] = vendors.data.items.map((v) => ({
    key: v.id,
    href: `/vendors/${v.id}`,
    selectLabel: v.name,
    cells: [
      <span key="v">
        <Link href={`/vendors/${v.id}`}>{v.name}</Link>
        <span className="sub">
          {v.code}
          {v.status === 'active' ? '' : ' · inactive'}
          {v.pan === null || v.gstin === null ? ` · no ${v.pan === null && v.gstin === null ? 'PAN or GSTIN' : v.pan === null ? 'PAN' : 'GSTIN'}` : ''}
        </span>
      </span>,
      <span key="r">{v.contractCount}</span>,
      <span key="o">
        {v.openOrders}
        <span className="sub num">{v.openOrders === 0 ? '—' : <MoneyExact wire={v.openOrdersTotal} />}</span>
      </span>,
      v.billsWaiting === 0 ? (
        <span key="b">0</span>
      ) : (
        <span key="b" className="stock-low">
          {v.billsWaiting}
        </span>
      ),
      <span key="l" className="nowrap">
        {v.lastOrderedAt === null ? <span className="muted">Never</span> : v.lastOrderedAt.slice(0, 10)}
      </span>,
    ],
    detail: (
      <>
        {v.contractCount} agreed {v.contractCount === 1 ? 'rate' : 'rates'} · {v.openOrders} open
      </>
    ),
  }));

  const toolbar = (
    <ListToolbar
      formAction={BASE}
      search={{ name: 'q', placeholder: 'Name, code, GSTIN or PAN', value: params['q'] ?? '', label: 'Search vendors' }}
      hidden={{ sort: `${sortKey}:${sortDir}`, ...(viewId === null ? {} : { view: viewId }) }}
      filters={[
        {
          key: 'status',
          label: 'Status',
          value: statusFilter === '' ? null : statusFilter === 'active' ? 'Active' : 'Inactive',
          control: (
            <div className="field">
              <label htmlFor="f-status">Status</label>
              <select id="f-status" name="status" defaultValue={statusFilter}>
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          ),
        },
      ]}
      columns={<ColumnControl listKey={LIST} columns={columnsIn(COLUMNS, t).map((c) => ({ key: c.key, label: c.label, locked: c.p === 1 }))} chosen={chosen} action={chooseColumns} />}
      exportHref={exportHref('vendors', params, ['q', 'sort', 'status'])}
    />
  );

  const body =
    s.registered === 0 ? (
      <Empty
        illustration="vendors"
        title={`No ${t.vendorsLower} yet`}
        action={
          <Link className="btn primary" href={`${hrefFor({ new: '1' })}#register-vendor`}>
            <Icon name="plus" />
            Add a {t.vendorLower}
          </Link>
        }
      >
        Register one before raising a purchase order.
      </Empty>
    ) : rows.length === 0 ? (
      <Empty
        illustration="search"
        variant="filtered"
        title={`No vendor matches ${chips.length === 1 ? 'this filter' : 'these filters'}`}
        action={
          <a className="btn primary" href={clearAll}>
            {chips.length === 1 ? 'Clear the filter' : 'Clear the filters'}
          </a>
        }
      >
        {chips.map((c) => `${c.label} ${c.value}`).join(' · ')}. Widen it, or drop one.
      </Empty>
    ) : (
      <ListTable label={t.vendors} columns={withSort} rows={rows} />
    );

  return (
    <>
      {header}

      <StatRow n={3}>
        <Stat
          label={`Open orders, all ${t.vendorsLower}`}
          value={<Money wire={s.openOrders.total} />}
          note={
            <>
              <b>
                {s.openOrders.count} {s.openOrders.count === 1 ? 'order' : 'orders'}
              </b>{' '}
              · {s.openOrders.vendors} {s.openOrders.vendors === 1 ? t.vendorLower : t.vendorsLower}
            </>
          }
        />
        <Stat label="Bills waiting for a check" value={s.billsWaiting.count} note="submitted and not yet checked or sent back" />
        <Stat
          label="Rate contracts expiring in 30 days"
          value={expiring.count}
          note={
            expiring.contracts.length === 0 ? (
              'none ends in the next 30 days'
            ) : (
              <>
                {expiring.contracts.map((c, i) => (
                  <span key={c.id}>
                    {i === 0 ? '' : ' · '}
                    <b>{c.number}</b> · {c.vendorName} · to {c.validTo}
                  </span>
                ))}
                {expiring.count > expiring.contracts.length ? ` · and ${expiring.count - expiring.contracts.length} more` : ''}
              </>
            )
          }
        />
      </StatRow>

      <ListCard
        label={t.vendors}
        toolbar={s.registered === 0 ? undefined : toolbar}
        applied={<AppliedFilters applied={chips} clearAllHref={clearAll} />}
        pager={
          s.registered === 0 ? undefined : (
            <ListPager
              from={links.shown.from}
              to={links.shown.to}
              total={vendors.data.count}
              unit={t.vendorsLower}
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
        <Section bare title="Register a vendor">
          <div className="card-b" id="register-vendor">
            <NewVendorForm />
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

import type { ReactNode } from 'react';
import Link from 'next/link';
import { API_ROUTES, type Project } from '@cog/contracts';
import { formatQuantity } from '@cog/money';
import { AppliedFilters, ColumnControl, Empty, Icon, KebabMenu, ListCard, ListPager, ListTable, ListToolbar, PageHeader, Progress, Pill, Refusal, Section, Stat, StatRow, UnreachableState, load, type Column, type Crumb, type Row } from '@cog/design-system';
import { apiAsCaller } from '../../../lib/api';
import { exportHref } from '../../../lib/export';
import { applied, listAddress, pageSizeOf, withView } from '../../../lib/lists';
import { pageLinks, pageState } from '../../../lib/paging';
import { chooseColumns } from '../../actions/preferences';
import { ViewsMenu } from '../../_components/views-menu';
import { ProjectPageHeader } from '../projects/[projectId]/header';
import { CheckInButton, IssueForm, NewStockItemForm, ReceiveForm, TransferForm } from './forms';

/**
 * Buying › Stock — `docs/design/07-buying.html`, "Buying › Stock — inventory
 * in the stores".
 *
 * *Know what is actually in the store before you buy it twice, or before the
 * site runs out mid-week.*
 *
 * The central store and every site store on one list: what is on hand
 * against the reorder level, the level bar the server sized (`levelPct` is
 * two quantities divided on the server, never in a browser), and Issue on
 * the row. Receipts at the gate wait in their own card until somebody counts
 * them in. The below-reorder count and the spotlight are whole-set reads,
 * not one page of the store-filtered table.
 *
 * **The spotlight is the real lowest-stock item, not a demand forecast.**
 * The design's "needed for Monday's issue" needs a site-issue schedule this
 * model does not have; what is real is the first item below its level and
 * its on-hand figure. **No stock value.** A valuation needs a costing method
 * nobody has confirmed (INV-03, provisional). VALUE-MAP cut Last movement.
 */
const FIRM_FILTER_KEYS = ['site', 'q'] as const;
const PROJECT_FILTER_KEYS = ['q'] as const;
const VALUE = 'Know what is actually in the store before you buy it twice, or before the site runs out mid-week.';

const COLUMNS: readonly Column[] = [
  { key: 'item', label: 'Item', p: 1 },
  { key: 'onhand', label: 'On hand', p: 1, num: true },
  { key: 'reorder', label: 'Reorder at', p: 3, num: true },
  { key: 'level', label: 'Level', p: 2 },
  { key: 'issue', label: '', p: 3 },
];

export async function StockList({
  params: raw,
  project,
  store,
}: {
  params: Record<string, string | undefined>;
  /** Inside a project, the project — the list is its site store's, the Store filter goes. */
  project: Project | null;
  /** The project's site store, by name; null at the firm level. */
  store: string | null;
}): Promise<ReactNode> {
  const client = await apiAsCaller();
  const LIST = project === null ? 'stock' : 'project-stock';
  const BASE = project === null ? '/inventory' : `/projects/${project.id}/stock`;
  const FILTER_KEYS = project === null ? FIRM_FILTER_KEYS : PROJECT_FILTER_KEYS;

  const viewId = raw['view'] ?? null;
  const views = await load(client, API_ROUTES.savedViews, { query: { list: LIST } });
  const view = viewId === null || views.kind !== 'ok' ? null : (views.data.items.find((v) => v.id === viewId) ?? null);
  const params = withView(raw, view?.criteria ?? null);

  const siteFilter = store ?? params['site'] ?? '';
  const q = (params['q'] ?? '').trim();
  const anyFilter = (store === null && siteFilter !== '') || q !== '';
  const limit = pageSizeOf(params);
  const paging = pageState(params, '', limit);
  const gatePaging = pageState(params, 'r');
  const doing = params['do'] ?? '';

  const [stock, definitions, low, gate, prefs, me] = await Promise.all([
    load(client, API_ROUTES.listStock, {
      query: {
        ...paging.query,
        ...(siteFilter === '' ? {} : { warehouse: siteFilter }),
        ...(q === '' ? {} : { q }),
      },
    }),
    // a lookup, for the receive/issue/transfer pickers: the widest window the endpoint allows
    load(client, API_ROUTES.listStockItems, { query: { limit: '200' } }),
    // the below-reorder note and spotlight, unfiltered — a whole-set read
    load(client, API_ROUTES.listStock, { query: { belowReorder: 'true', limit: '200', ...(store === null ? {} : { warehouse: store }) } }),
    load(client, API_ROUTES.awaitingReceipts, { query: gatePaging.query }),
    load(client, API_ROUTES.preferences, {}),
    load(client, API_ROUTES.myEntitlements, {}),
  ]);
  const { hrefFor, perPageHrefs, clearAll, criteria } = listAddress(BASE, params, FILTER_KEYS);

  if (stock.kind === 'unreachable') return <UnreachableState />;

  const mayShare = me.kind === 'ok' && me.data.actions.includes('manage_settings');
  const chosen = prefs.kind === 'ok' ? (prefs.data.columns[LIST] ?? null) : null;
  const columns = COLUMNS.filter((c) => c.p === 1 || chosen === null || chosen.includes(c.key));
  const lowItems = low.kind === 'ok' ? low.data.items : [];
  const spotlight = lowItems[0] ?? null;
  // from the DEFINITIONS, not the balances: a balance only exists once
  // something has moved, so an item picked from the balance list could never
  // be chosen for the receipt that would give it one
  const itemOptions = definitions.kind === 'ok' ? definitions.data.items.map((i) => [i.id, `${i.name} (${i.uom})`] as const) : [];

  const chips = applied(hrefFor, [...(store === null ? [{ key: 'site', label: 'Store', value: siteFilter }] : []), { key: 'q', label: 'Search', value: q }]);

  const summary = stock.kind === 'ok' ? stock.data.summary : null;
  const HeaderTag = project === null ? PageHeader : ProjectPageHeader;
  const headerProps = project === null ? { crumbs: [{ href: '/purchase-orders', label: 'Buying' }] } : { project, section: 'Build' };
  const header = (
    <HeaderTag
      {...(headerProps as { crumbs: Crumb[] } & { project: Project; section: string })}
      title={
        views.kind === 'ok' ? (
          <ViewsMenu listKey={LIST} base={BASE} views={views.data.items} currentViewId={view?.id ?? null} defaultName="All stock" criteria={criteria} columns={chosen} mayShare={mayShare} />
        ) : (
          'All stock'
        )
      }
      help={VALUE}
      sub={
        summary === null ? undefined : (
          <>
            {store === null ? 'materials held in the central and site stores' : `materials held in ${store}`} · {summary.belowReorder} {summary.belowReorder === 1 ? 'item' : 'items'} below{' '}
            {summary.belowReorder === 1 ? 'its' : 'their'} reorder level
          </>
        )
      }
      actions={
        <>
          <Link className="btn" href={`${hrefFor({ do: 'transfer' })}#transfer`}>
            Transfer
          </Link>
          <Link className="btn" href={`${hrefFor({ do: 'define' })}#define`}>
            Define an item
          </Link>
        </>
      }
      more={<KebabMenu sortHrefs={[]} exportHref={exportHref('stock', params, ['site', 'q'])} refreshHref={hrefFor({})} />}
      primary={
        <Link className="btn primary" href={`${hrefFor({ do: 'receive' })}#receive`}>
          <Icon name="plus" />
          Receive stock
        </Link>
      }
    />
  );

  if (stock.kind === 'refused') {
    return (
      <>
        {header}
        <ListCard label="Stock by store">
          <div className="card-b">
            <Refusal error={stock.error} />
          </div>
        </ListCard>
      </>
    );
  }
  const s = stock.data.summary;
  const links = pageLinks(paging, stock.data, hrefFor, limit);
  const gateLinks = gate.kind === 'ok' ? pageLinks(gatePaging, gate.data, hrefFor) : null;

  const rows: Row[] = stock.data.items.map((row) => ({
    key: `${row.id}-${row.warehouse}`,
    selectLabel: `${row.name}, ${row.warehouse}`,
    cells: [
      <span key="i">
        {row.name}
        <span className="sub">{row.warehouse}</span>
      </span>,
      <span key="o" className={row.belowReorder ? 'stock-low' : undefined}>
        {formatQuantity(row.quantityMicros)} {row.uom}
      </span>,
      <span key="r">
        {formatQuantity(row.reorderLevel)} {row.uom}
      </span>,
      // the server decided the level by comparing the ledger sum to the reorder
      // level and sized the bar; a bar past the level is drawn full
      <span key="l" className="rate-bar">
        {row.levelPct === null ? null : <Progress pct={row.levelPct} low={row.belowReorder} />}
        <small>
          <Pill tone={row.belowReorder ? 'warn' : 'ok'}>{row.belowReorder ? 'Below reorder' : 'In stock'}</Pill>
        </small>
      </span>,
      <Link key="a" href={`${hrefFor({ do: 'issue' })}#issue`}>
        Issue
      </Link>,
    ],
    detail: (
      <>
        reorder at {formatQuantity(row.reorderLevel)} {row.uom}
      </>
    ),
  }));

  const toolbar = (
    <ListToolbar
      formAction={BASE}
      search={{ name: 'q', placeholder: 'Item or store', value: params['q'] ?? '', label: 'Search stock' }}
      hidden={viewId === null ? {} : { view: viewId }}
      filters={[
        ...(store === null
          ? [
              {
                key: 'site',
                label: 'Store',
                value: siteFilter === '' ? null : siteFilter,
                control: (
                  <div className="field">
                    <label htmlFor="f-store">Store</label>
                    <select id="f-store" name="site" defaultValue={siteFilter}>
                      <option value="">All</option>
                      {s.warehouses.map((w) => (
                        <option key={w} value={w}>
                          {w}
                        </option>
                      ))}
                    </select>
                  </div>
                ),
              },
            ]
          : []),
      ]}
      columns={
        <ColumnControl
          listKey={LIST}
          columns={COLUMNS.map((c) => ({ key: c.key, label: c.label === '' ? 'Issue' : c.label, locked: c.p === 1 }))}
          chosen={chosen}
          action={chooseColumns.bind(null, BASE)}
        />
      }
      exportHref={exportHref('stock', params, ['site', 'q'])}
    />
  );

  const body =
    s.balances === 0 ? (
      <Empty
        illustration="stock"
        title="No stock recorded"
        action={
          <Link className="btn primary" href={`${hrefFor({ do: 'receive' })}#receive`}>
            <Icon name="plus" />
            Receive stock
          </Link>
        }
      >
        Define an item, then receive it into a store, and the balance is kept here.
      </Empty>
    ) : rows.length === 0 ? (
      <Empty
        illustration="search"
        variant="filtered"
        title={`No item matches ${chips.length === 1 ? 'this filter' : 'these filters'}`}
        action={
          <a className="btn primary" href={clearAll}>
            {chips.length === 1 ? 'Clear the filter' : 'Clear the filters'}
          </a>
        }
      >
        {chips.map((c) => `${c.label} ${c.value}`).join(' · ')}. Widen it, or drop one.
      </Empty>
    ) : (
      <ListTable label="Stock by store" columns={columns} rows={rows} />
    );

  return (
    <>
      {header}

      <StatRow n={3}>
        <Stat
          label="Items below reorder level"
          value={s.belowReorder}
          note={
            lowItems.length === 0 ? (
              'none'
            ) : (
              <>
                {lowItems.slice(0, 3).map((r, i) => (
                  <span key={`${r.id}-${r.warehouse}`}>
                    {i === 0 ? '' : ' · '}
                    {i === 0 ? <b>{r.name}</b> : r.name}
                  </span>
                ))}
                {lowItems.length > 3 ? ` · and ${String(lowItems.length - 3)} more` : ''}
              </>
            )
          }
        />
        <Stat
          label={spotlight === null ? 'Lowest against its level' : `${spotlight.name}, ${spotlight.warehouse}`}
          {...(spotlight === null
            ? { value: 'Nothing is below reorder', text: true }
            : {
                value: (
                  <>
                    {formatQuantity(spotlight.quantityMicros)} <small>{spotlight.uom}</small>
                  </>
                ),
              })}
          note={
            spotlight === null ? (
              'every item is at or above its reorder level'
            ) : (
              <>
                reorder at{' '}
                <b>
                  {formatQuantity(spotlight.reorderLevel)} {spotlight.uom}
                </b>
              </>
            )
          }
        />
        <Stat
          label="Received but not checked in"
          value={s.awaitingCheckIn}
          note={
            s.awaitingCheckIn === 0
              ? 'every receipt is counted into a store'
              : gate.kind === 'ok' && gate.data.items[0] !== undefined
                ? `oldest ${gate.data.items[0].receivedAt.slice(0, 10)} · ${gate.data.items[0].name}`
                : `${s.awaitingCheckIn === 1 ? 'receipt' : 'receipts'} at the gate, out of the balance`
          }
        />
      </StatRow>

      {gate.kind === 'ok' && gate.data.count > 0 && gateLinks !== null ? (
        <Section title="Waiting to be checked in" sub={`${String(gate.data.count)} ${gate.data.count === 1 ? 'receipt' : 'receipts'} at the gate`} bare>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="p1">Item</th>
                  <th className="num p2">Quantity</th>
                  <th className="p3">Received</th>
                  <th className="p3">Reference</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {gate.data.items.map((r) => (
                  <tr key={r.id}>
                    <td className="p1">
                      {r.name}
                      <span className="sub">
                        <span className="nowrap">{r.warehouse}</span>
                      </span>
                    </td>
                    <td className="num p2">
                      {formatQuantity(r.quantityMicros)} {r.uom}
                    </td>
                    <td className="p3">{r.receivedAt.slice(0, 10)}</td>
                    <td className="p3">{r.reference === '' ? <span className="muted">—</span> : r.reference}</td>
                    <td>
                      <CheckInButton movementId={r.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      <ListCard
        label="Stock by store"
        toolbar={s.balances === 0 ? undefined : toolbar}
        applied={<AppliedFilters applied={chips} clearAllHref={clearAll} />}
        pager={
          s.balances === 0 ? undefined : (
            <ListPager
              from={links.shown.from}
              to={links.shown.to}
              total={stock.data.count}
              unit="items"
              perPage={limit}
              prevHref={links.prev}
              nextHref={links.next}
              perPageHrefs={perPageHrefs}
              {...(anyFilter ? { filteredFrom: s.balances } : {})}
            />
          )
        }
      >
        {body}
      </ListCard>

      {doing === 'define' ? (
        <Section bare title="Define an item">
          <div className="card-b" id="define">
            <NewStockItemForm />
          </div>
        </Section>
      ) : null}
      {doing === 'receive' || doing === 'issue' || doing === 'transfer' ? (
        itemOptions.length === 0 ? (
          <Section bare title="Define an item first">
            <div className="card-b" id={doing}>
              <p className="muted">No item is defined yet, so nothing can be received, issued or moved.</p>
              <NewStockItemForm />
            </div>
          </Section>
        ) : doing === 'receive' ? (
          <Section bare title="Receive">
            <div className="card-b" id="receive">
              <ReceiveForm items={itemOptions} />
            </div>
          </Section>
        ) : doing === 'issue' ? (
          <Section bare title="Issue">
            <div className="card-b" id="issue">
              <IssueForm items={itemOptions} />
            </div>
          </Section>
        ) : (
          <Section bare title="Transfer between stores">
            <div className="card-b" id="transfer">
              <TransferForm items={itemOptions} />
            </div>
          </Section>
        )
      ) : null}
    </>
  );
}

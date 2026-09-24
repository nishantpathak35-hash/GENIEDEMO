import type { ReactNode } from 'react';
import Link from 'next/link';
import { API_ROUTES } from '@cog/contracts';
import { formatBasisPoints } from '@cog/money';
import { AppliedFilters, ColumnControl, Empty, Icon, KebabMenu, ListCard, ListPager, ListTable, ListToolbar, MoneyExact, PageHeader, Pill, Refusal, Section, Stat, StatRow, UnreachableState, load, type Column, type Row } from '@cog/design-system';
import { apiAsCaller } from '../../../../lib/api';
import { columnsIn, terms } from '../../../../lib/terms';
import { applied, listAddress, withView } from '../../../../lib/lists';
import { rememberColumns } from '../../../actions/preferences';
import { ViewsMenu } from '../../../_components/views-menu';
import { NewRateContractForm } from './forms';

export const metadata = { title: 'Agreed rates · Construct-O-Genie' };
export const dynamic = 'force-dynamic';

/**
 * Buying › Agreed rates — `docs/design/07-buying.html`, "Buying › Rates —
 * rate analysis: agreed, last ordered, BOQ".
 *
 * *See when a vendor is quoting above the rate you already agreed, before
 * you approve the order.*
 *
 * Three figures per item and a check in words: what the BOQ carries, what
 * was agreed with a vendor, what was last ordered. The rows are the rate
 * library (`rateLibrary`): every agreed rate on file, the newest live order
 * line naming the same vendor and trade, and — from projects, by the id of
 * the BOQ line that order came from — the cost rate it was budgeted at. Both
 * comparisons are the server's, signed, and null where nothing compares:
 * the share under the agreed rate is its part of the BOQ cost rate, the
 * estimator's margin item by item. Nothing here matches on text.
 *
 * The library is whole-set — the design's own table is — so the pager
 * states the count and no more; the Trade and Vendor filters narrow it and
 * the stats stay over every row.
 */
const LIST = 'rates';
const BASE = '/vendors/rate-contracts';
const FILTER_KEYS = ['trade', 'vendor'] as const;
const VALUE = 'See when a vendor is quoting above the rate you already agreed, before you approve the order.';

const COLUMNS: readonly Column[] = [
  { key: 'item', label: 'Item', p: 1 },
  { key: 'boq', label: 'BOQ rate', p: 3, num: true },
  { key: 'agreed', label: 'Agreed rate', p: 1, num: true },
  { key: 'last', label: 'Last ordered', p: 2, num: true },
  { key: 'check', label: 'Check', p: 2 },
];

export default async function RateContractsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<ReactNode> {
  const raw = await searchParams;
  const client = await apiAsCaller();
  const t = await terms();

  const viewId = raw['view'] ?? null;
  const views = await load(client, API_ROUTES.savedViews, { query: { list: LIST } });
  const view = viewId === null || views.kind !== 'ok' ? null : (views.data.items.find((v) => v.id === viewId) ?? null);
  const params = withView(raw, view?.criteria ?? null);

  const tradeFilter = (params['trade'] ?? '').toUpperCase();
  const vendorFilter = params['vendor'] ?? '';
  const anyFilter = tradeFilter !== '' || vendorFilter !== '';

  const [library, vendors, prefs, me] = await Promise.all([
    load(client, API_ROUTES.rateLibrary, {
      query: {
        ...(tradeFilter === '' ? {} : { tradeCode: tradeFilter }),
        ...(vendorFilter === '' ? {} : { vendorId: vendorFilter }),
      },
    }),
    // a lookup, for the picker and the filter: the widest window the endpoint allows
    load(client, API_ROUTES.listVendors, { query: { limit: '200' } }),
    load(client, API_ROUTES.preferences, {}),
    load(client, API_ROUTES.myEntitlements, {}),
  ]);
  const { hrefFor, clearAll, criteria } = listAddress(BASE, params, FILTER_KEYS);

  if (library.kind === 'unreachable') return <UnreachableState />;

  const mayShare = me.kind === 'ok' && me.data.actions.includes('manage_settings');
  const chosen = prefs.kind === 'ok' ? (prefs.data.columns[LIST] ?? null) : null;
  const columns = columnsIn(COLUMNS, t).filter((c) => c.p === 1 || chosen === null || chosen.includes(c.key));
  const vendorNameOf = new Map(vendors.kind === 'ok' ? vendors.data.items.map((v) => [v.id, v.name]) : []);
  const rows0 = library.kind === 'ok' ? library.data.items : [];
  // the filter menus are drawn from the whole library, not the narrowed rows
  const every = anyFilter ? await load(client, API_ROUTES.rateLibrary, {}) : library;
  const everyRows = every.kind === 'ok' ? every.data.items : rows0;
  const tradeOptions = [...new Set(everyRows.map((r) => r.tradeCode))].sort();
  const vendorOptions = [...new Map(everyRows.map((r) => [r.vendorId, r.vendorName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));

  const chips = applied(hrefFor, [
    { key: 'trade', label: 'Trade', value: tradeFilter },
    { key: 'vendor', label: t.vendor, value: vendorFilter, show: (v) => vendorNameOf.get(v) ?? v },
  ]);

  const summary = library.kind === 'ok' ? library.data.summary : null;
  const header = (
    <PageHeader
      crumbs={[{ href: '/purchase-orders', label: 'Buying' }]}
      title={
        views.kind === 'ok' ? (
          <ViewsMenu listKey={LIST} base={BASE} views={views.data.items} currentViewId={view?.id ?? null} defaultName="All agreed rates" criteria={criteria} columns={chosen} mayShare={mayShare} />
        ) : (
          'All agreed rates'
        )
      }
      help={VALUE}
      sub={
        library.kind === 'ok' ? (
          <>
            agreed rate against what was last ordered and what the BOQ carries · {every.kind === 'ok' ? every.data.count : library.data.count} {(every.kind === 'ok' ? every.data.count : library.data.count) === 1 ? 'item' : 'items'}
          </>
        ) : undefined
      }
      more={<KebabMenu sortHrefs={[]} refreshHref={hrefFor({})} />}
      primary={
        <Link className="btn primary" href={`${hrefFor({ new: '1' })}#agree-rate`}>
          <Icon name="plus" />
          Agree a rate
        </Link>
      }
    />
  );

  if (library.kind === 'refused') {
    return (
      <>
        {header}
        <ListCard label="Rate analysis">
          <div className="card-b">
            <Refusal error={library.error} />
          </div>
        </ListCard>
      </>
    );
  }

  const above = everyRows.filter((r) => r.excessBp !== null && r.excessBp > 0);
  const never = everyRows.filter((r) => r.lastOrdered === null);
  const first = (s: string): string => s.split(',')[0] ?? s;

  const rows: Row[] = rows0.map((r) => ({
    key: r.itemId,
    selectLabel: r.description,
    cells: [
      <span key="i">
        {r.description}
        <span className="sub">
          {r.tradeCode} · per {r.uom} · {r.contractNumber} · to {r.validTo}
        </span>
      </span>,
      r.boqCostRate === null ? (
        <span key="b" className="muted" title={r.lastOrdered === null ? `Not ordered yet, so no ${t.boqLine} to compare` : `The last order was not raised from a ${t.boqLine}`}>
          —
        </span>
      ) : (
        <MoneyExact key="b" wire={r.boqCostRate} />
      ),
      <span key="a">
        <MoneyExact wire={r.agreedRate} />
        <span className="sub num">
          {r.agreedBpOfBoqCost === null ? '' : r.agreedBpOfBoqCost > 0 ? `${formatBasisPoints(r.agreedBpOfBoqCost)} above ${t.boq} · ` : r.agreedBpOfBoqCost < 0 ? `${formatBasisPoints(-r.agreedBpOfBoqCost)} under ${t.boq} · ` : 'at the BOQ rate · '}
          {r.vendorName}
        </span>
      </span>,
      r.lastOrdered === null ? (
        <span key="l" className="muted" title="Not bought yet">
          —
        </span>
      ) : (
        <span key="l">
          <MoneyExact wire={r.lastOrdered.unitRate} />
          <span className="sub num">
            <Link href={`/purchase-orders/${r.lastOrdered.orderId}`}>{r.lastOrdered.orderNumber}</Link> · {r.lastOrdered.on}
          </span>
        </span>
      ),
      r.excessBp === null ? (
        <span key="c" className="muted">
          Not ordered yet
        </span>
      ) : r.excessBp > 0 ? (
        <Pill key="c" tone="warn">
          {formatBasisPoints(r.excessBp)} above
        </Pill>
      ) : r.excessBp < 0 ? (
        <Pill key="c" tone="ok">
          {formatBasisPoints(-r.excessBp)} below
        </Pill>
      ) : (
        <Pill key="c" tone="ok">
          At agreed rate
        </Pill>
      ),
    ],
    detail: (
      <>
        {r.tradeCode} · {r.vendorName}
      </>
    ),
  }));

  const toolbar = (
    <ListToolbar
      formAction={BASE}
      hidden={viewId === null ? {} : { view: viewId }}
      filters={[
        {
          key: 'trade',
          label: 'Trade',
          value: tradeFilter === '' ? null : tradeFilter,
          control: (
            <div className="field">
              <label htmlFor="f-rtrade">Trade</label>
              <select id="f-rtrade" name="trade" defaultValue={tradeFilter}>
                <option value="">All</option>
                {tradeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
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
              <label htmlFor="f-rvendor">{t.vendor}</label>
              <select id="f-rvendor" name="vendor" defaultValue={vendorFilter}>
                <option value="">All</option>
                {vendorOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          ),
        },
      ]}
      columns={<ColumnControl listKey={LIST} columns={columnsIn(COLUMNS, t).map((c) => ({ key: c.key, label: c.label, locked: c.p === 1 }))} chosen={chosen} action={chooseColumns} />}
    />
  );

  const body =
    everyRows.length === 0 ? (
      <Empty
        illustration="rates"
        title="No agreed rate on file"
        action={
          <Link className="btn primary" href={`${hrefFor({ new: '1' })}#agree-rate`}>
            <Icon name="plus" />
            Agree a rate
          </Link>
        }
      >
        Record what a vendor agreed to charge, and every order is checked against it.
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
      <ListTable label="Rate analysis" columns={columns} rows={rows} />
    );

  return (
    <>
      {header}

      <StatRow n={3}>
        <Stat
          label="Items ordered above the agreed rate"
          value={above.length}
          note={above.length === 0 ? 'every order at or under its agreed rate' : above.map((r, i) => `${i === 0 ? '' : ' · '}${first(r.description)} ${formatBasisPoints(r.excessBp ?? 0)}`).join('')}
        />
        <Stat
          label="Agreed rates on file"
          value={everyRows.length}
          note={
            summary === null || summary.contracts === 0 ? (
              'none yet'
            ) : (
              <>
                <b>
                  {summary.contracts} {summary.contracts === 1 ? 'contract' : 'contracts'}
                </b>{' '}
                · {[...new Set(everyRows.map((r) => r.vendorName))].length} {[...new Set(everyRows.map((r) => r.vendorName))].length === 1 ? 'vendor' : 'vendors'}
              </>
            )
          }
        />
        <Stat label="Agreed rates never ordered against" value={never.length} note={never.length === 0 ? 'every agreed rate has been used' : never.map((r, i) => `${i === 0 ? '' : ' · '}${first(r.description)}`).join('')} />
      </StatRow>

      <ListCard
        label="Rate analysis"
        toolbar={everyRows.length === 0 ? undefined : toolbar}
        applied={<AppliedFilters applied={chips} clearAllHref={clearAll} />}
        pager={
          everyRows.length === 0 ? undefined : (
            <ListPager from={rows.length === 0 ? 0 : 1} to={rows.length} total={rows.length} unit="items" perPage={rows.length === 0 ? 1 : rows.length} prevHref={null} nextHref={null} {...(anyFilter ? { filteredFrom: everyRows.length } : {})} />
          )
        }
      >
        {body}
      </ListCard>

      {params['new'] === '1' ? (
        <Section bare title="Agree a rate">
          <div className="card-b" id="agree-rate">
            <NewRateContractForm
              vendors={
                // A refused or unreachable vendor list gives an EMPTY picker, not a
                // crash — and the picker says "Nothing to choose from yet" rather
                // than rendering a box that silently offers nothing.
                vendors.kind === 'ok' ? vendors.data.items.map((v) => ({ id: v.id, name: `${v.name} · ${v.code}` })) : []
              }
            />
          </div>
        </Section>
      ) : null}

      <Section title="How a rate is checked" sub="one rate per vendor, per trade, per day">
        <p>
          Two contracts covering the same vendor and trade over overlapping dates are refused when recorded, so every order line is measured against exactly one agreed rate or none. A field you did not fill stays
          empty — no default GST, minimum quantity, lead time, payment terms or expiry is guessed on your behalf.
        </p>
      </Section>
    </>
  );
}

async function chooseColumns(form: FormData): Promise<void> {
  'use server';
  const reset = form.get('reset') === '1';
  const columns = form.getAll('column').map(String);
  await rememberColumns(LIST, reset ? null : columns, BASE);
}

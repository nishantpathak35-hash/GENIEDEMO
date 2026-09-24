import type { ReactNode } from 'react';
import Link from 'next/link';
import { API_ROUTES } from '@cog/contracts';
import { formatBasisPoints } from '@cog/money';
import { AppliedFilters, ColumnControl, Empty, Icon, KebabMenu, ListCard, ListPager, ListTable, ListToolbar, MoneyExact, PageHeader, Refusal, Section, UnreachableState, load, type Column, type Row } from '@cog/design-system';
import { apiAsCaller } from '../../../lib/api';
import { applied, listAddress, pageSizeOf, withView } from '../../../lib/lists';
import { pageLinks, pageState } from '../../../lib/paging';
import { rememberColumns } from '../../actions/preferences';
import { ViewsMenu } from '../../_components/views-menu';
import { DeleteEstimationButton, NewEstimationForm } from './forms';

export const metadata = { title: 'Rate analysis · Construct-O-Genie' };
export const dynamic = 'force-dynamic';

/**
 * Sales › Rate analysis — the rate library (`docs/design/03-navigation.html`,
 * ROUTES: moved from Projects to Sales, because pricing happens before award).
 *
 * *Price a line from its cost factors once, and quote it the same way every
 * time.*
 *
 * **The breakdown is recomputed from the stored factors on every read.** That
 * is EST-02 turned around: the legacy recomputes the breakdown on every render
 * and displays *that*, while `boq.js:365` imports the *stored*
 * `final_rate_with_gst` — two engines, one shown and one used, with nothing
 * comparing them. Here there is one engine, and the stored rate is a cache the
 * same function produced. **The rate is pre-tax and there is no GST column**
 * — whether a BOQ rate carries GST is PO-16 and unanswered. The legacy's
 * hardcoded KPI strings (EST-04) and its 54 preset rates (PO-15) are not
 * reproduced: none has a stated basis.
 */
const LIST = 'rate-analysis';
const BASE = '/estimation';
const FILTER_KEYS = ['trade'] as const;
const VALUE = 'Price a line from its cost factors once, and quote it the same way every time.';

const COLUMNS: readonly Column[] = [
  { key: 'item', label: 'Item', p: 1 },
  { key: 'base', label: 'Base rate', p: 1, num: true },
  { key: 'material', label: 'Material', p: 3, num: true },
  { key: 'labour', label: 'Labour', p: 3, num: true },
  { key: 'equipment', label: 'Equipment', p: 3, num: true },
  { key: 'direct', label: 'Direct cost', p: 2, num: true },
  { key: 'overhead', label: 'Overhead', p: 3, num: true },
  { key: 'margin', label: 'Margin', p: 2, num: true },
  { key: 'remove', label: '', p: 3 },
];

export default async function EstimationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<ReactNode> {
  const raw = await searchParams;
  const client = await apiAsCaller();

  const viewId = raw['view'] ?? null;
  const views = await load(client, API_ROUTES.savedViews, { query: { list: LIST } });
  const view = viewId === null || views.kind !== 'ok' ? null : (views.data.items.find((v) => v.id === viewId) ?? null);
  const params = withView(raw, view?.criteria ?? null);

  const tradeFilter = params['trade'] ?? '';
  const anyFilter = tradeFilter !== '';
  const limit = pageSizeOf(params);
  const paging = pageState(params, '', limit);

  const [items, every, trades, prefs, me] = await Promise.all([
    load(client, API_ROUTES.listEstimationItems, { query: { ...paging.query, ...(tradeFilter === '' ? {} : { trade: tradeFilter }) } }),
    anyFilter ? load(client, API_ROUTES.listEstimationItems, { query: { limit: '1' } }) : null,
    // the trade list, so the screen offers it rather than inviting free text
    load(client, API_ROUTES.tradePackages, {}),
    load(client, API_ROUTES.preferences, {}),
    load(client, API_ROUTES.myEntitlements, {}),
  ]);
  const { hrefFor, perPageHrefs, clearAll, criteria } = listAddress(BASE, params, FILTER_KEYS);

  if (items.kind === 'unreachable') return <UnreachableState />;

  const mayShare = me.kind === 'ok' && me.data.actions.includes('manage_settings');
  const chosen = prefs.kind === 'ok' ? (prefs.data.columns[LIST] ?? null) : null;
  const columns = COLUMNS.filter((c) => c.p === 1 || chosen === null || chosen.includes(c.key));
  const tradeOptions = trades.kind === 'ok' ? trades.data.items.filter((t) => t.isActive).map((t) => ({ name: t.name, marginBp: t.defaultMarginBp })) : [];
  const chips = applied(hrefFor, [{ key: 'trade', label: 'Trade', value: tradeFilter }]);
  const totalCount = every !== null && every.kind === 'ok' ? every.data.count : items.kind === 'ok' ? items.data.count : 0;

  const header = (
    <PageHeader
      crumbs={[{ href: '/crm/board', label: 'Sales' }]}
      title={
        views.kind === 'ok' ? (
          <ViewsMenu listKey={LIST} base={BASE} views={views.data.items} currentViewId={view?.id ?? null} defaultName="All rate analyses" criteria={criteria} columns={chosen} mayShare={mayShare} />
        ) : (
          'All rate analyses'
        )
      }
      help={VALUE}
      sub={items.kind === 'ok' ? <>{totalCount} line {totalCount === 1 ? 'item' : 'items'} analysed · base rates pre-tax, from four cost factors</> : undefined}
      more={<KebabMenu sortHrefs={[]} refreshHref={hrefFor({})} />}
      primary={
        <Link className="btn primary" href={`${hrefFor({ new: '1' })}#analyse`}>
          <Icon name="plus" />
          Analyse a rate
        </Link>
      }
    />
  );

  if (items.kind === 'refused') {
    return (
      <>
        {header}
        <ListCard label="Rate library">
          <div className="card-b">
            <Refusal error={items.error} />
          </div>
        </ListCard>
      </>
    );
  }
  const links = pageLinks(paging, items.data, hrefFor, limit);

  const rows: Row[] = items.data.items.map((item) => ({
    key: item.id,
    selectLabel: item.itemName,
    cells: [
      <span key="i">
        {item.itemName}
        <span className="sub">
          {item.trade === '' ? 'No trade' : item.trade} · per {item.uom}
        </span>
      </span>,
      <b key="b">
        <MoneyExact wire={item.analysis.baseRate} />
      </b>,
      <MoneyExact key="m" wire={item.materialCost} />,
      <MoneyExact key="l" wire={item.labourCost} />,
      <MoneyExact key="e" wire={item.equipmentCost} />,
      <MoneyExact key="d" wire={item.analysis.directCost} />,
      <span key="o">
        <MoneyExact wire={item.analysis.overhead} />
        <span className="sub num">{formatBasisPoints(item.overheadBp)}</span>
      </span>,
      <span key="g">
        <MoneyExact wire={item.analysis.margin} />
        <span className="sub num">{formatBasisPoints(item.marginBp)}</span>
      </span>,
      <DeleteEstimationButton key="x" itemId={item.id} />,
    ],
    detail: (
      <>
        {item.trade === '' ? 'No trade' : item.trade} · per {item.uom}
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
              <label htmlFor="f-trade">Trade</label>
              <select id="f-trade" name="trade" defaultValue={tradeFilter}>
                <option value="">All</option>
                {tradeOptions.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          ),
        },
      ]}
      columns={<ColumnControl listKey={LIST} columns={COLUMNS.map((c) => ({ key: c.key, label: c.label === '' ? 'Remove' : c.label, locked: c.p === 1 }))} chosen={chosen} action={chooseColumns} />}
    />
  );

  const body =
    totalCount === 0 ? (
      <Empty
        illustration="rates"
        title="No rate analysed yet"
        action={
          <Link className="btn primary" href={`${hrefFor({ new: '1' })}#analyse`}>
            <Icon name="plus" />
            Analyse a rate
          </Link>
        }
      >
        Build the first one from its four cost factors, and quote it the same way every time.
      </Empty>
    ) : rows.length === 0 ? (
      <Empty
        illustration="search"
        variant="filtered"
        title="No item matches this filter"
        action={
          <a className="btn primary" href={clearAll}>
            Clear the filter
          </a>
        }
      >
        {chips.map((c) => `${c.label} ${c.value}`).join(' · ')}. Widen it, or drop it.
      </Empty>
    ) : (
      <ListTable label="Rate library" columns={columns} rows={rows} />
    );

  return (
    <>
      {header}
      <ListCard
        label="Rate library"
        toolbar={totalCount === 0 ? undefined : toolbar}
        applied={<AppliedFilters applied={chips} clearAllHref={clearAll} />}
        pager={
          totalCount === 0 ? undefined : (
            <ListPager
              from={links.shown.from}
              to={links.shown.to}
              total={items.data.count}
              unit="items"
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
        <Section bare title="Analyse a rate">
          <div className="card-b" id="analyse">
            <NewEstimationForm trades={tradeOptions} />
          </div>
        </Section>
      ) : null}

      <Section title="What a base rate is" sub="pre-tax, from four factors">
        <p>
          Material, labour and equipment make the direct cost; overhead and margin are applied to it at the item’s own percentages. Whether a BOQ rate carries GST is an open question (PO-16), so no
          rate here carries one, and the previous system’s 54 preset rates and its default 6% overhead and 15% margin are not seeded — none has a stated basis (PO-15).
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

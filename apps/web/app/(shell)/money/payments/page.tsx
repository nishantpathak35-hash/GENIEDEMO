import type { ReactNode } from 'react';
import Link from 'next/link';
import { API_ROUTES, type VendorPayment } from '@cog/contracts';
import { formatBasisPoints } from '@cog/money';
import { AppliedFilters, AttachmentClip, ColumnControl, Empty, KebabMenu, ListCard, ListPager, ListTable, ListToolbar, Money, MoneyExact, MoneyOut, Notice, PageHeader, Pill, RecordPane, Refusal, Stat, StatRow, UnreachableState, load, type Column, type Row } from '@cog/design-system';
import { apiAsCaller } from '../../../../lib/api';
import { columnsIn, terms } from '../../../../lib/terms';
import { exportHref } from '../../../../lib/export';
import { applied, listAddress, pageSizeOf, withView } from '../../../../lib/lists';
import { pageLinks, pageState } from '../../../../lib/paging';
import { chooseColumns } from '../../../actions/preferences';
import { ViewsMenu } from '../../../_components/views-menu';

export const metadata = { title: 'Payments · Money' };
export const dynamic = 'force-dynamic';

/**
 * Money › Payments — `docs/design/09-money.html`, "Payments".
 *
 * *See what went out, what was deducted and what was withheld, voucher by
 * voucher, before the tax is deposited.*
 *
 * Every figure is the server's: gross, taxable value, tax deducted at the
 * provisional rate, retention at the order's rate, net paid. Where a rate is
 * shown it says *Provisional*; a voucher computed from a provisional value
 * says *Draft: provisional rates* — a generated statutory document resting on
 * a value no chartered accountant has verified (ADR-0014 addendums;
 * STATUTORY_OUTPUTS=draft), never sent to Tally. The voucher's project is
 * its order's, resolved when the voucher is open.
 */
const LIST = 'payments';
const BASE = '/money/payments';
const FILTER_KEYS = ['vendor'] as const;
const VALUE = 'See what went out, what was deducted and what was withheld, voucher by voucher, before the tax is deposited.';

const COLUMNS: readonly Column[] = [
  { key: 'on', label: 'Paid on', p: 3, num: true },
  { key: 'voucher', label: 'Voucher', p: 1 },
  { key: 'to', label: 'Paid to', p: 3 },
  { key: 'for', label: 'For', p: 3 },
  { key: 'tax', label: 'Tax', p: 2, num: true },
  { key: 'net', label: 'Net paid', p: 2, num: true },
  { key: 'clip', label: '', p: 3, clip: true },
];

const REASONS: Readonly<Record<string, string>> = {
  deducted: 'Deducted',
  higher_rate_no_valid_pan: 'Deducted at the no-PAN rate',
  below_threshold: 'Below the threshold',
  transporter_declaration: 'Transporter declaration on file',
  no_section: 'No section on the vendor',
  buyer_not_covered: '194Q does not apply to you',
  retention_release: 'Retention released',
};

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<ReactNode> {
  const raw = await searchParams;
  const client = await apiAsCaller();
  const t = await terms();

  const viewId = raw['view'] ?? null;
  const views = await load(client, API_ROUTES.savedViews, { query: { list: LIST } });
  const view = viewId === null || views.kind !== 'ok' ? null : (views.data.items.find((v) => v.id === viewId) ?? null);
  const params = withView(raw, view?.criteria ?? null);

  const vendorFilter = params['vendor'] ?? '';
  const anyFilter = vendorFilter !== '';
  const limit = pageSizeOf(params);
  const paging = pageState(params, '', limit);
  const openId = params['payment'] ?? null;

  const [list, everyPayment, vendors, prefs, me] = await Promise.all([
    load(client, API_ROUTES.listPayments, { query: { ...paging.query, ...(vendorFilter === '' ? {} : { vendorId: vendorFilter }) } }),
    anyFilter ? load(client, API_ROUTES.listPayments, { query: { limit: '1' } }) : null,
    load(client, API_ROUTES.listVendors, { query: { limit: '200' } }),
    load(client, API_ROUTES.preferences, {}),
    load(client, API_ROUTES.myEntitlements, {}),
  ]);
  const { hrefFor, perPageHrefs, clearAll, criteria } = listAddress(BASE, params, FILTER_KEYS);

  if (list.kind === 'unreachable') return <UnreachableState />;

  const mayShare = me.kind === 'ok' && me.data.actions.includes('manage_settings');
  const chosen = prefs.kind === 'ok' ? (prefs.data.columns[LIST] ?? null) : null;
  const columns = columnsIn(COLUMNS, t).filter((c) => c.p === 1 || chosen === null || chosen.includes(c.key));
  const vendorNameOf = new Map(vendors.kind === 'ok' ? vendors.data.items.map((v) => [v.id, v.name]) : []);
  const chips = applied(hrefFor, [{ key: 'vendor', label: t.vendor, value: vendorFilter, show: (v) => vendorNameOf.get(v) ?? v }]);
  const summary = list.kind === 'ok' ? list.data.summary : null;

  const header = (
    <PageHeader
      crumbs={[{ href: '/money/bills', label: 'Money' }]}
      title={
        views.kind === 'ok' ? (
          <ViewsMenu listKey={LIST} base={BASE} views={views.data.items} currentViewId={view?.id ?? null} defaultName="All payments" criteria={criteria} columns={chosen} mayShare={mayShare} />
        ) : (
          'All payments'
        )
      }
      help={VALUE}
      sub={
        summary === null ? undefined : (
          <>
            what went out, what was deducted, what was withheld · {summary.paidThisMonth.count} paid in {summary.month}
            {summary.provisionalCount === 0 ? '' : ` · ${String(summary.provisionalCount)} computed from provisional rates`}
          </>
        )
      }
      more={<KebabMenu sortHrefs={[]} exportHref={exportHref('payments', {}, [])} refreshHref={hrefFor({})} />}
    />
  );

  if (list.kind === 'refused') {
    return (
      <>
        {header}
        <ListCard label="Payments">
          <div className="card-b">
            <Refusal error={list.error} />
          </div>
        </ListCard>
      </>
    );
  }
  const s = list.data.summary;
  const month = s.paidThisMonth;
  const links = pageLinks(paging, list.data, hrefFor, limit);
  const totalCount = everyPayment !== null && everyPayment.kind === 'ok' ? everyPayment.data.count : list.data.count;
  const open = openId === null ? null : (list.data.items.find((p) => p.id === openId) ?? null);
  // the voucher's project is its order's
  const order = open === null ? null : await load(client, API_ROUTES.getPurchaseOrder, { params: { id: open.purchaseOrderId } });
  const projects = order !== null && order.kind === 'ok' && order.data.projectId !== null ? await load(client, API_ROUTES.getProject, { params: { projectId: order.data.projectId } }) : null;
  const project = projects !== null && projects.kind === 'ok' ? projects.data : null;

  const rows: Row[] = list.data.items.map((p) => ({
    key: p.id,
    href: hrefFor({ payment: p.id }),
    open: p.id === openId,
    selectLabel: p.number,
    cells: [
      <span key="o" className="nowrap">
        {p.paidOn}
      </span>,
      <span key="v">{p.number}</span>,
      <span key="t">{p.payeeName}</span>,
      p.kind === 'bill' ? <span key="f">{p.billNumber ?? ''}</span> : <span key="f" className="muted">Retention released</span>,
      <MoneyExact key="x" wire={p.tdsAmount} />,
      <MoneyOut key="n">
        <MoneyExact wire={p.netPaid} />
      </MoneyOut>,
      <AttachmentClip key="c" what={p.reference === '' ? null : 'the bank’s advice'} />,
    ],
    detail: (
      <>
        {p.paidOn} · {p.payeeName} · {p.kind === 'bill' ? (p.billNumber ?? '') : 'retention released'}
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
      ]}
      columns={<ColumnControl listKey={LIST} columns={columnsIn(COLUMNS, t).map((c) => ({ key: c.key, label: c.label === '' ? 'Attachment' : c.label, locked: c.p === 1 }))} chosen={chosen} action={chooseColumns.bind(null, BASE)} compact={open !== null} />}
      exportHref={exportHref('payments', {}, [])}
    />
  );

  const body =
    totalCount === 0 ? (
      <Empty illustration="money" title="Nothing paid yet">
        A payment is made from an acknowledged bill, on <Link href="/money/bills">Bills</Link>; the voucher lands here with what was deducted and withheld.
      </Empty>
    ) : rows.length === 0 ? (
      <Empty
        illustration="search"
        variant="filtered"
        title="No payment matches this filter"
        action={
          <a className="btn primary" href={clearAll}>
            Clear the filter
          </a>
        }
      >
        {chips.map((c) => `${c.label} ${c.value}`).join(' · ')}. Widen it, or drop it.
      </Empty>
    ) : (
      <ListTable label="Payments" columns={columns} rows={rows} />
    );

  const pane = open === null ? undefined : <Voucher payment={open} project={project} backHref={hrefFor({ payment: undefined })} />;

  return (
    <>
      {header}

      <StatRow n={4}>
        <Stat label="Paid this month" value={<MoneyOut><Money wire={month.net} /></MoneyOut>} note="net, as it left the bank" disc={{ hue: 'red', icon: 'voucher' }} />
        <Stat label="Tax deducted this month" value={<Money wire={month.tds} />} note="to deposit by the 7th of next month" disc={{ hue: 'yellow', icon: 'due' }} />
        <Stat label="Retention withheld this month" value={<Money wire={month.retention} />} note="held against orders" disc={{ hue: 'purple', icon: 'held' }} />
        <Stat label="Retention held" value={<Money wire={s.retentionHeld} />} note="withheld and not yet released" disc={{ hue: 'purple', icon: 'held' }} />
      </StatRow>

      <div data-hero>
        <ListCard
          label="Payments"
          toolbar={totalCount === 0 ? undefined : toolbar}
          applied={<AppliedFilters applied={chips} clearAllHref={clearAll} />}
          pager={
            totalCount === 0 ? undefined : (
              <ListPager
                from={links.shown.from}
                to={links.shown.to}
                total={list.data.count}
                unit="payments"
                perPage={limit}
                prevHref={links.prev}
                nextHref={links.next}
                perPageHrefs={perPageHrefs}
                {...(anyFilter ? { filteredFrom: totalCount } : {})}
              />
            )
          }
          {...(pane === undefined ? {} : { pane })}
        >
          {body}
        </ListCard>
      </div>
    </>
  );
}

function Voucher({ payment, project, backHref }: { payment: VendorPayment; project: { readonly id: string; readonly code: string } | null; backHref: string }): ReactNode {
  return (
    <RecordPane
      title={`Payment voucher ${payment.number}`}
      sub={
        <>
          {payment.payeeName} · {payment.kind === 'bill' ? (payment.billNumber ?? '') : 'retention released'}
          {project === null ? '' : <> · <Link href={`/projects/${project.id}`}>{project.code}</Link></>}
        </>
      }
      backHref={backHref}
      closeHref={backHref}
      fullHref={`/purchase-orders/${payment.purchaseOrderId}`}
    >
      {payment.provisional ? (
        <Notice tone="warn" title="Draft: provisional rates">
          The tax on this voucher was worked out from values a chartered accountant has not yet verified. Unless drafts are switched on, it is refused — and a draft is never sent to Tally.
        </Notice>
      ) : null}
      <div className="figbox">
        <div className="fig">
          <MoneyExact wire={payment.netPaid} />
        </div>
      </div>
      <dl className="kv">
        <dt>Paid to</dt>
        <dd>
          {payment.payeeName}
          {payment.payeePan === null ? ' · no PAN on file' : ` · ${payment.payeePan}`}
        </dd>
        <dt>{payment.kind === 'bill' ? 'Bill' : 'Released'}</dt>
        <dd>{payment.billNumber ?? 'Retention held against the order'}</dd>
        <dt>Paid on</dt>
        <dd>
          {payment.paidOn}
          {payment.reference === '' ? '' : ` · ${payment.reference}`}
        </dd>
        <dt>Gross</dt>
        <dd>
          <Money wire={payment.grossAmount} />
        </dd>
        <dt>Taxable value</dt>
        <dd>
          <Money wire={payment.taxableAmount} />
        </dd>
        <dt>Tax deducted</dt>
        <dd>
          <Money wire={payment.tdsAmount} />
          {payment.tdsSection === null ? null : (
            <>
              {` · ${payment.tdsSection}`}
              {payment.tdsRateBp === null ? '' : ` at ${formatBasisPoints(payment.tdsRateBp)}`} <Pill tone={payment.provisional ? 'warn' : 'ok'}>{payment.provisional ? 'Provisional' : 'Verified'}</Pill>
            </>
          )}
          <br />
          <span className="muted">{REASONS[payment.tdsReason] ?? payment.tdsReason}</span>
        </dd>
        <dt>Retention withheld</dt>
        <dd>
          <Money wire={payment.retentionWithheld} />
        </dd>
        <dt>Net paid</dt>
        <dd>
          <Money wire={payment.netPaid} />
        </dd>
        <dt>Tally</dt>
        <dd>
          <span className="muted">{payment.provisional ? 'Not sent — a voucher resting on a provisional rate never is' : 'Not sent'}</span>
        </dd>
      </dl>
    </RecordPane>
  );
}

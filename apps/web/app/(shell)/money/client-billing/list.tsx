import type { ReactNode } from 'react';
import Link from 'next/link';
import { API_ROUTES, type ClientInvoice, type Project } from '@cog/contracts';
import { formatBasisPoints } from '@cog/money';
import { AppliedFilters, AttachmentClip, ColumnControl, Empty, Icon, KebabMenu, ListCard, ListPager, ListTable, ListToolbar, Money, MoneyExact, MoneyIn, Notice, OweCard, PageHeader, Pill, RecordPane, Refusal, Section, Stat, UnreachableState, load, type Column, type Crumb, type Row } from '@cog/design-system';
import { apiAsCaller } from '../../../../lib/api';
import { exportHref } from '../../../../lib/export';
import { applied, listAddress, pageSizeOf, withView } from '../../../../lib/lists';
import { pageLinks, pageState } from '../../../../lib/paging';
import { chooseColumns } from '../../../actions/preferences';
import { ViewsMenu } from '../../../_components/views-menu';
import { ProjectPageHeader } from '../../projects/[projectId]/header';
import { CancelInvoiceForm, RaiseInvoiceForm, RecordReceiptForm } from './forms';

/**
 * Money › Client billing — `docs/design/09-money.html`, "Client billing".
 *
 * *Know what each client still owes and when it is expected, before the
 * month closes.*
 *
 * The list on the pattern with the receivables owe card and its stats over
 * every invoice (the firm's, or the project's inside one), the Project column
 * and filter at the firm level, and the tax invoice beside the list
 * (`?invoice=`): its figure, its facts, GST at the provisional rate marked
 * so, and the two things its state takes — record a receipt, or cancel it.
 * An invoice resting on a provisional rate is a draft (ADR-0014 addendums;
 * STATUTORY_OUTPUTS=draft) and says so. Every figure is the server's.
 */
const FIRM_KEYS = ['project', 'state', 'q'] as const;
const PROJECT_KEYS = ['state', 'q'] as const;
const VALUE = 'Know what each client still owes and when it is expected, before the month closes.';

const FIRM_COLUMNS: readonly Column[] = [
  { key: 'dated', label: 'Dated', p: 3, num: true },
  { key: 'invoice', label: 'Invoice', p: 1 },
  { key: 'client', label: 'Client', p: 3 },
  { key: 'project', label: 'Project', p: 3 },
  { key: 'status', label: 'Status', p: 2 },
  { key: 'total', label: 'Total', p: 2, num: true },
  { key: 'received', label: 'Received', p: 2, num: true },
  { key: 'clip', label: '', p: 3, clip: true },
];

function status(i: ClientInvoice, today: string): ReactNode {
  if (i.state === 'cancelled') return <Pill tone="idle">Cancelled</Pill>;
  if (i.balance === '0') return <Pill tone="ok">Paid</Pill>;
  if (i.expectedOn < today) return <Pill tone="warn">Overdue</Pill>;
  return <Pill tone="idle">Due</Pill>;
}

export async function ClientBillingList({ params: raw, project }: { params: Record<string, string | undefined>; project: Project | null }): Promise<ReactNode> {
  const client = await apiAsCaller();
  const LIST = project === null ? 'client-billing' : 'project-client-billing';
  const BASE = project === null ? '/money/client-billing' : `/projects/${project.id}/client-billing`;
  const KEYS = project === null ? FIRM_KEYS : PROJECT_KEYS;
  const COLUMNS = project === null ? FIRM_COLUMNS : FIRM_COLUMNS.filter((c) => c.key !== 'project');

  const viewId = raw['view'] ?? null;
  const views = await load(client, API_ROUTES.savedViews, { query: { list: LIST } });
  const view = viewId === null || views.kind !== 'ok' ? null : (views.data.items.find((v) => v.id === viewId) ?? null);
  const params = withView(raw, view?.criteria ?? null);

  const projectFilter = project === null ? (params['project'] ?? '') : project.id;
  const stateAsked = params['state'] ?? '';
  const stateFilter = stateAsked === 'issued' || stateAsked === 'cancelled' ? stateAsked : '';
  const q = (params['q'] ?? '').trim();
  const anyFilter = (project === null && projectFilter !== '') || stateFilter !== '' || q !== '';
  const limit = pageSizeOf(params);
  const paging = pageState(params, '', limit);
  const openId = params['invoice'] ?? null;

  const [list, ageing, projects, prefs, me] = await Promise.all([
    load(client, API_ROUTES.listClientInvoices, { query: { ...paging.query, ...(projectFilter === '' ? {} : { projectId: projectFilter }), ...(stateFilter === '' ? {} : { state: stateFilter }), ...(q === '' ? {} : { q }) } }),
    load(client, API_ROUTES.receivablesAgeing, { query: project === null ? {} : { projectId: project.id } }),
    load(client, API_ROUTES.listProjects, { query: { limit: '200' } }),
    load(client, API_ROUTES.preferences, {}),
    load(client, API_ROUTES.myEntitlements, {}),
  ]);
  const { hrefFor, perPageHrefs, clearAll, criteria } = listAddress(BASE, params, KEYS);

  if (list.kind === 'unreachable') return <UnreachableState />;

  const mayShare = me.kind === 'ok' && me.data.actions.includes('manage_settings');
  const chosen = prefs.kind === 'ok' ? (prefs.data.columns[LIST] ?? null) : null;
  const columns = COLUMNS.filter((c) => c.p === 1 || chosen === null || chosen.includes(c.key));
  const projectItems = projects.kind === 'ok' ? projects.data.items : [];
  const codeOf = new Map(projectItems.map((p) => [p.id, p.code]));
  const projectOptions = (project === null ? projectItems : projectItems.filter((p) => p.id === project.id)).map((p) => [p.id, `${p.code} — ${p.clientName}`] as const);

  const chips = applied(hrefFor, [
    ...(project === null ? [{ key: 'project', label: 'Project', value: projectFilter, show: (v: string) => codeOf.get(v) ?? v }] : []),
    { key: 'state', label: 'State', value: stateFilter, show: (v) => (v === 'issued' ? 'Issued' : 'Cancelled') },
    { key: 'q', label: 'Search', value: q },
  ]);

  const summary = list.kind === 'ok' ? list.data.summary : null;
  const title =
    views.kind === 'ok' ? (
      <ViewsMenu listKey={LIST} base={BASE} views={views.data.items} currentViewId={view?.id ?? null} defaultName="All invoices" criteria={criteria} columns={chosen} mayShare={mayShare} />
    ) : (
      'All invoices'
    );
  const sub = summary === null ? undefined : <>tax invoices, receipts, and what is still due · {summary.openCount} open</>;
  const more = <KebabMenu sortHrefs={[]} exportHref={exportHref('client-invoices', {}, [])} refreshHref={hrefFor({})} />;
  const primary = (
    <Link className="btn primary" href={`${hrefFor({ new: '1' })}#raise`}>
      <Icon name="plus" />
      Raise an invoice
    </Link>
  );
  const HeaderTag = project === null ? PageHeader : ProjectPageHeader;
  const headerProps = project === null ? { crumbs: [{ href: '/money/bills', label: 'Money' }] } : { project, section: 'Commercial' };
  const header = <HeaderTag {...(headerProps as { crumbs: Crumb[] } & { project: Project; section: string })} title={title} help={VALUE} sub={sub} more={more} primary={primary} />;

  if (list.kind === 'refused') {
    return (
      <>
        {header}
        <ListCard label="Invoices">
          <div className="card-b">
            <Refusal error={list.error} />
          </div>
        </ListCard>
      </>
    );
  }
  const s = list.data.summary;
  const links = pageLinks(paging, list.data, hrefFor, limit);
  const today = ageing.kind === 'ok' ? ageing.data.today : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const open = openId === null ? null : (list.data.items.find((i) => i.id === openId) ?? null);

  const rows: Row[] = list.data.items.map((i) => ({
    key: i.id,
    href: hrefFor({ invoice: i.id }),
    open: i.id === openId,
    selectLabel: i.number,
    cells: [
      <span key="d" className="nowrap">
        {i.invoiceDate}
      </span>,
      <span key="n">{i.number}</span>,
      <span key="c">{i.clientName}</span>,
      ...(project === null ? [<span key="p" className="nowrap">{i.projectCode}</span>] : []),
      <span key="s">{status(i, today)}</span>,
      <MoneyExact key="t" wire={i.total} />,
      i.state === 'cancelled' ? (
        <span key="r" className="muted">
          —
        </span>
      ) : i.received === '0' ? (
        <MoneyExact key="r" wire={i.received} />
      ) : (
        <MoneyIn key="r">
          <MoneyExact wire={i.received} />
        </MoneyIn>
      ),
      <AttachmentClip key="clip" what={i.state === 'cancelled' ? null : 'the tax invoice'} />,
    ],
    detail: (
      <>
        {i.invoiceDate} · {i.clientName} · {i.projectCode}
      </>
    ),
  }));

  const toolbar = (
    <ListToolbar
      formAction={BASE}
      search={{ name: 'q', placeholder: 'Invoice, client or project', value: params['q'] ?? '', label: 'Invoice, client or project' }}
      hidden={viewId === null ? {} : { view: viewId }}
      compact={open !== null}
      filters={[
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
                      {projectItems.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code}
                        </option>
                      ))}
                    </select>
                  </div>
                ),
              },
            ]
          : []),
        {
          key: 'state',
          label: 'State',
          value: stateFilter === '' ? null : stateFilter === 'issued' ? 'Issued' : 'Cancelled',
          control: (
            <div className="field">
              <label htmlFor="f-state">State</label>
              <select id="f-state" name="state" defaultValue={stateFilter}>
                <option value="">All</option>
                <option value="issued">Issued</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          ),
        },
      ]}
      columns={<ColumnControl listKey={LIST} columns={COLUMNS.map((c) => ({ key: c.key, label: c.label === '' ? 'Attachment' : c.label, locked: c.p === 1 }))} chosen={chosen} action={chooseColumns.bind(null, BASE)} compact={open !== null} />}
      exportHref={exportHref('client-invoices', {}, [])}
    />
  );

  const body =
    list.data.count === 0 && !anyFilter ? (
      <Empty illustration="money" title="No invoices raised yet" action={primary}>
        A tax invoice is raised against a project's contract; its GST is computed at the provisional rate and marked so.
      </Empty>
    ) : rows.length === 0 ? (
      <Empty
        illustration="search"
        variant="filtered"
        title={`No invoice matches ${chips.length === 1 ? 'this filter' : 'these filters'}`}
        action={
          <a className="btn primary" href={clearAll}>
            {chips.length === 1 ? 'Clear the filter' : 'Clear the filters'}
          </a>
        }
      >
        {chips.map((c) => `${c.label} ${c.value}`).join(' · ')}. Widen it, or drop one.
      </Empty>
    ) : (
      <ListTable label="Invoices" columns={columns} rows={rows} />
    );

  const pane = open === null ? undefined : <InvoicePane invoice={open} backHref={hrefFor({ invoice: undefined })} />;
  const a = ageing.kind === 'ok' ? ageing.data : null;

  return (
    <>
      {header}

      <div className="two owe-row">
        {a === null ? (
          <Stat label="Total receivables" value={<Money wire={s.balance} />} note="the ageing could not be read" />
        ) : (
          <OweCard
            title="Total receivables"
            help="What clients still owe on tax invoices raised — current, then overdue by how long"
            span={6}
            disc={{ hue: 'green', icon: 'invoice-in' }}
            total={<Money wire={a.total} />}
            current={{ value: <Money wire={a.buckets.current.total} />, pct: a.buckets.current.pct }}
            buckets={[
              { label: '1–30 days', value: <Money wire={a.buckets.days1to30.total} />, pct: a.buckets.days1to30.pct },
              { label: '31–60 days', value: <Money wire={a.buckets.days31to60.total} />, pct: a.buckets.days31to60.pct },
              { label: '60+ days', value: <Money wire={a.buckets.over60.total} />, pct: a.buckets.over60.pct },
            ]}
            overduePct={String(a.overdue.pct)}
            note={a.openCount === 0 ? 'nothing is owed' : <>{a.openCount} {a.openCount === 1 ? 'invoice' : 'invoices'} unpaid · {a.overdue.count} past the expected date</>}
          />
        )}
        <div className="stats col">
          <Stat label="Invoiced" value={<Money wire={s.invoiced} />} note="issued, not cancelled" disc={{ hue: 'blue', icon: 'bill' }} />
          <Stat label="Received" value={<MoneyIn><Money wire={s.received} /></MoneyIn>} note="against those invoices" disc={{ hue: 'green', icon: 'invoice-in' }} />
          <Stat
            label="Next expected"
            {...(s.nextExpected === null ? { value: 'Nothing owed', text: true } : { value: <Money wire={s.nextExpected.balance} /> })}
            note={s.nextExpected === null ? 'every invoice is settled' : <><b>{s.nextExpected.number}</b> · by {s.nextExpected.expectedOn}{s.nextExpected.certifiedOn === null ? '' : ` · certified ${s.nextExpected.certifiedOn}`}</>}
            disc={{ hue: 'green', icon: 'due' }}
          />
        </div>
      </div>

      <div data-hero>
        <ListCard
          label="Invoices"
          toolbar={list.data.count === 0 ? undefined : toolbar}
          applied={<AppliedFilters applied={chips} clearAllHref={clearAll} />}
          pager={
            list.data.count === 0 ? undefined : (
              <ListPager from={links.shown.from} to={links.shown.to} total={list.data.count} unit="invoices" perPage={limit} prevHref={links.prev} nextHref={links.next} perPageHrefs={perPageHrefs} />
            )
          }
          {...(pane === undefined ? {} : { pane })}
        >
          {body}
        </ListCard>
      </div>

      {params['new'] === '1' ? (
        <Section bare title="Raise an invoice">
          <div className="card-b" id="raise">
            {projectOptions.length === 0 ? <p className="muted">No project to invoice against.</p> : <RaiseInvoiceForm projects={projectOptions} />}
          </div>
        </Section>
      ) : null}
    </>
  );
}

function InvoicePane({ invoice, backHref }: { invoice: ClientInvoice; backHref: string }): ReactNode {
  const withinState = invoice.supplyType === 'intra_state';
  return (
    <RecordPane
      title={`Tax invoice ${invoice.number}`}
      status={invoice.state === 'cancelled' ? <Pill tone="idle">Cancelled</Pill> : invoice.provisional ? <Pill tone="warn">Draft</Pill> : undefined}
      sub={
        <>
          {invoice.clientName} · <Link href={`/projects/${invoice.projectId}`}>{invoice.projectCode}</Link>
        </>
      }
      backHref={backHref}
      closeHref={backHref}
      fullHref={`/projects/${invoice.projectId}/client-billing?invoice=${invoice.id}`}
    >
      {invoice.provisional ? (
        <Notice tone="warn" title="Draft: provisional rates">
          The GST on this invoice was worked out at a rate a chartered accountant has not yet verified. Unless drafts are switched on, it is refused.
        </Notice>
      ) : null}
      {invoice.state === 'cancelled' ? (
        <Notice tone="bad" title="Cancelled">
          {invoice.cancelReason ?? 'No reason recorded'}. The number stays with this invoice and is not issued again.
        </Notice>
      ) : null}
      <div className="figbox">
        <div className="fig">
          <MoneyExact wire={invoice.total} />
        </div>
      </div>
      <dl className="kv">
        <dt>Billed to</dt>
        <dd>
          {invoice.clientName}
          {invoice.clientGstin === null ? '' : ` · ${invoice.clientGstin}`}
        </dd>
        <dt>For</dt>
        <dd>{invoice.description === '' ? <span className="muted">Not stated</span> : invoice.description}</dd>
        <dt>Dated</dt>
        <dd>{invoice.invoiceDate}</dd>
        <dt>Certified</dt>
        <dd>{invoice.certifiedOn ?? <span className="muted">Not yet</span>}</dd>
        <dt>Place of supply</dt>
        <dd>
          {invoice.placeOfSupply} · {withinState ? 'within the state' : 'across states'}
        </dd>
        <dt>Taxable value</dt>
        <dd>
          <Money wire={invoice.taxable} />
        </dd>
        <dt>GST at {formatBasisPoints(invoice.gstRateBp)}</dt>
        <dd>
          {withinState ? (
            <>
              <Money wire={invoice.cgst} /> + <Money wire={invoice.sgst} /> <Pill tone={invoice.provisional ? 'warn' : 'ok'}>{invoice.provisional ? 'Provisional' : 'Verified'}</Pill>
              <br />
              <span className="muted">
                CGST <Money wire={invoice.cgst} /> · SGST <Money wire={invoice.sgst} />
              </span>
            </>
          ) : (
            <>
              <Money wire={invoice.igst} /> <Pill tone={invoice.provisional ? 'warn' : 'ok'}>{invoice.provisional ? 'Provisional' : 'Verified'}</Pill>
              <br />
              <span className="muted">IGST — the site is in another state</span>
            </>
          )}
        </dd>
        <dt>Round off</dt>
        <dd>
          <Money wire={invoice.roundOff} />
        </dd>
        <dt>Invoice total</dt>
        <dd>
          <Money wire={invoice.total} />
        </dd>
        <dt>Received</dt>
        <dd>
          <Money wire={invoice.received} />
        </dd>
        <dt>Due</dt>
        <dd>
          <Money wire={invoice.balance} /> · expected {invoice.expectedOn}
        </dd>
      </dl>
      {invoice.state === 'issued' ? (
        <>
          <RecordReceiptForm invoiceId={invoice.id} />
          <CancelInvoiceForm invoiceId={invoice.id} />
        </>
      ) : null}
    </RecordPane>
  );
}

import type { ReactNode } from 'react';
import Link from 'next/link';
import { API_ROUTES, type BlockedApprovalsStat } from '@cog/contracts';
import { formatBasisPoints } from '@cog/money';
import { AppliedFilters, Empty, KebabMenu, ListCard, ListPager, ListTable, ListToolbar, Money, MoneyExact, Notice, PageHeader, Pill, RecordPane, Refusal, Section, Stat, StatRow, Steps, UnreachableState, load, type Column, type Row } from '@cog/design-system';
import { apiAsCaller } from '../../../lib/api';
import { columnsIn, terms } from '../../../lib/terms';
import { orderSteps } from '../../../lib/approval-steps';
import { applied, listAddress } from '../../../lib/lists';
import { DecisionPane } from './forms';

export const metadata = { title: 'Approvals · Construct-O-Genie' };
export const dynamic = 'force-dynamic';

/**
 * Approvals — `docs/design/09-money.html`, "Approvals — the queue".
 *
 * *Clear what is waiting on you, oldest first, without opening each order.*
 *
 * The queue is the server's (`blockedApprovals`): every order at a stage
 * awaiting a decision, oldest first, with its stage, how long it has waited
 * and who holds the role that clears it. The list on the pattern; the order
 * beside it (`?order=`) with its figure, its facts, its steps and the
 * decision — approve, or decline with a reason. A decision that lands opens
 * the next order, so the queue advances without a click. Pinned at both
 * levels in the sidebar with its count. Tasks is its second tab.
 *
 * **The queue is the tenant's, not filtered to the caller's role**: the
 * server names who a stage waits on; inventing that filter from
 * `myEntitlements` would fake what the server refuses to.
 */
const BASE = '/approvals';
const FILTER_KEYS = ['step', 'vendor'] as const;
const VALUE = 'Clear what is waiting on you, oldest first, without opening each order.';

const COLUMNS: readonly Column[] = [
  { key: 'order', label: 'Order', p: 1 },
  { key: 'vendor', label: 'Vendor', p: 3 },
  { key: 'project', label: 'Project', p: 3 },
  { key: 'step', label: 'Step', p: 2 },
  { key: 'waiting', label: 'Waiting', p: 2, num: true },
  { key: 'total', label: 'Total', p: 2, num: true },
];

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<ReactNode> {
  const params = await searchParams;
  const client = await apiAsCaller();
  const t = await terms();
  const [chains, blocked] = await Promise.all([load(client, API_ROUTES.approvalChains, {}), load(client, API_ROUTES.blockedApprovals, {})]);
  const { hrefFor, clearAll } = listAddress(BASE, params, FILTER_KEYS);

  if (blocked.kind === 'unreachable') return <UnreachableState />;

  const tabs = (
    <nav className="subtabs" aria-label="Views">
      <a href="/approvals" aria-current="page">
        Approvals
      </a>
      <a href="/tasks">Tasks</a>
    </nav>
  );
  const queue = blocked.kind === 'ok' ? blocked.data : null;
  const header = (
    <PageHeader
      title="Approvals"
      help={VALUE}
      sub={queue === null ? undefined : queue.count === 0 ? 'nothing is waiting, on any project' : <>{queue.count} {queue.count === 1 ? 'order' : 'orders'} waiting, on every project · oldest first</>}
      actions={
        <Link className="btn" href="/settings/approvals">
          Approval steps
        </Link>
      }
      more={<KebabMenu sortHrefs={[]} refreshHref={hrefFor({})} />}
      tabs={tabs}
    />
  );

  if (blocked.kind === 'refused') {
    return (
      <>
        {header}
        <ListCard label="Waiting for you">
          <div className="card-b">
            <Refusal error={blocked.error} />
          </div>
        </ListCard>
      </>
    );
  }
  const q = blocked.data;

  // the step and vendor filters are the page's: the queue read takes none, and the count line says so
  const stepFilter = params['step'] ?? '';
  const vendorFilter = params['vendor'] ?? '';
  const steps = [...new Set(q.items.map((i) => i.stageName).filter((s) => s !== ''))].sort();
  const vendorsHere = [...new Set(q.items.map((i) => i.vendorName).filter((v): v is string => v !== null))].sort();
  const shown = q.items.filter((i) => (stepFilter === '' || i.stageName === stepFilter) && (vendorFilter === '' || i.vendorName === vendorFilter));
  const chips = applied(hrefFor, [
    { key: 'step', label: 'Step', value: stepFilter },
    { key: 'vendor', label: t.vendor, value: vendorFilter },
  ]);

  // the pane holds one order: the one asked for, else the oldest; after a decision the next one opens
  const selected = q.items.find((i) => i.id === params['order']) ?? shown[0];
  const at = selected === undefined ? -1 : shown.indexOf(selected);
  const following = shown[at + 1] ?? shown[at - 1];
  const [history, deviations, whoami, people] =
    selected === undefined
      ? [null, null, null, null]
      : await Promise.all([
          load(client, API_ROUTES.approvalHistory, { params: { entityType: 'purchase_order', entityId: selected.id } }),
          load(client, API_ROUTES.listRateDeviations, { query: { purchaseOrderId: selected.id, limit: '200' } }),
          load(client, API_ROUTES.whoami, {}),
          load(client, API_ROUTES.people, { query: { limit: '200' } }),
        ]);
  const nameOf = new Map(people !== null && people.kind === 'ok' ? people.data.items.map((p) => [p.id, p.displayName ?? p.email] as const) : []);
  const chain = chains.kind === 'ok' ? (chains.data.items.find((c) => c.entityType === 'purchase_order' && c.isActive) ?? chains.data.items.find((c) => c.entityType === 'purchase_order') ?? null) : null;

  const rows: Row[] = shown.map((i) => ({
    key: i.id,
    href: hrefFor({ order: i.id }),
    open: selected !== undefined && i.id === selected.id,
    mine: true,
    selectLabel: i.number,
    cells: [
      <span key="o">{i.number}</span>,
      <span key="v">{i.vendorName ?? <span className="muted">—</span>}</span>,
      <span key="p" className="nowrap">
        {i.projectCode ?? <span className="muted">No project</span>}
      </span>,
      <Pill key="s" tone="waiting">
        {i.stageName === '' ? 'No stage resolved' : i.stageName}
      </Pill>,
      <span key="w">
        {i.days} {i.days === 1 ? 'day' : 'days'}
      </span>,
      <MoneyExact key="t" wire={i.gross} />,
    ],
    detail: (
      <>
        {i.vendorName ?? '—'} · {i.projectCode ?? 'no project'}
      </>
    ),
  }));

  const toolbar = (
    <ListToolbar
      formAction={BASE}
      compact={selected !== undefined}
      filters={[
        {
          key: 'step',
          label: 'Step',
          value: stepFilter === '' ? null : stepFilter,
          control: (
            <div className="field">
              <label htmlFor="f-step">Step</label>
              <select id="f-step" name="step" defaultValue={stepFilter}>
                <option value="">All</option>
                {steps.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          ),
        },
        {
          key: 'vendor',
          label: t.vendor,
          value: vendorFilter === '' ? null : vendorFilter,
          control: (
            <div className="field">
              <label htmlFor="f-vendor">{t.vendor}</label>
              <select id="f-vendor" name="vendor" defaultValue={vendorFilter}>
                <option value="">All</option>
                {vendorsHere.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          ),
        },
      ]}
    />
  );

  const body =
    q.count === 0 ? (
      <Empty illustration="approvals" title="Nothing is waiting">
        Every purchase order is either approved or has not been sent for approval yet.
      </Empty>
    ) : rows.length === 0 ? (
      <Empty
        illustration="search"
        variant="filtered"
        title={`No order matches ${chips.length === 1 ? 'this filter' : 'these filters'}`}
        action={
          <a className="btn primary" href={clearAll}>
            {chips.length === 1 ? 'Clear the filter' : 'Clear the filters'}
          </a>
        }
      >
        {chips.map((c) => `${c.label} ${c.value}`).join(' · ')}. Widen it, or drop one.
      </Empty>
    ) : (
      <ListTable label="Waiting for you" columns={columnsIn(COLUMNS, t)} rows={rows} />
    );

  let pane: ReactNode = undefined;
  if (selected !== undefined) {
    const decisions = history !== null && history.kind === 'ok' ? history.data.items : [];
    const drawn = orderSteps(chain, decisions, selected, (id) => nameOf.get(id) ?? 'someone no longer here');
    pane = (
      <RecordPane
        title={selected.number}
        status={<Pill tone="waiting">Waiting for approval</Pill>}
        sub={
          <>
            {selected.vendorName ?? '—'} · {selected.projectCode ?? 'no project'} · at {selected.stageName === '' ? 'no stage' : selected.stageName}
          </>
        }
        backHref={hrefFor({ order: undefined })}
        closeHref={hrefFor({ order: undefined })}
        fullHref={`/purchase-orders/${selected.id}`}
      >
        <div className="figbox">
          <div className="fig">
            <MoneyExact wire={selected.gross} />
          </div>
        </div>
        <dl className="kv">
          <dt>Sent for approval</dt>
          <dd>
            {selected.raisedBy ?? <span className="muted">not a person on file</span>} · {selected.days} {selected.days === 1 ? 'day' : 'days'} ago
          </dd>
          <dt>Rates</dt>
          <dd>
            {deviations === null || deviations.kind !== 'ok' ? (
              <span className="muted">The rate check could not be read</span>
            ) : deviations.data.items.length === 0 ? (
              <span className="muted">No line above an agreed rate</span>
            ) : (
              deviations.data.items.map((dev) => (
                <div key={`${dev.purchaseOrderId}:${String(dev.lineNo)}`}>
                  <Pill tone="warn">Above agreed rate</Pill> line {dev.lineNo}, by {formatBasisPoints(dev.excessBp)}
                </div>
              ))
            )}
          </dd>
        </dl>
        <p className="u-strong">Approval steps</p>
        {drawn === null ? <p className="muted">No approval chain is configured, so every decision is refused rather than let through by default.</p> : <Steps steps={drawn} />}
        <DecisionPane orderId={selected.id} after={following === undefined ? '/approvals' : `/approvals?order=${following.id}`} ownOrder={whoami !== null && whoami.kind === 'ok' && whoami.data.principalId === selected.requesterId} />
      </RecordPane>
    );
  }

  return (
    <>
      {header}

      {chains.kind === 'ok' && chains.data.items.length === 0 ? (
        <Notice tone="warn" title="No approval chain is configured, so every decision is refused">
          Who may approve what, and at which value, is not settled (PO-13). An unconfigured control that let approvals through would be worse than one that refuses them. Set the steps under Settings › Approval steps.
        </Notice>
      ) : null}

      <StatRow n={3}>
        <Stat label="Waiting for approval" value={q.count === 0 ? '0' : <Money wire={q.total} />} note={`${String(q.count)} ${q.count === 1 ? 'order' : 'orders'}`} disc={{ hue: 'purple', icon: 'tray' }} />
        <Stat label="Oldest waiting" {...(q.oldestDays === null ? { value: 'Nothing', text: true } : { value: `${String(q.oldestDays)} ${q.oldestDays === 1 ? 'day' : 'days'}` })} note={q.oldestDays === null ? 'nothing is waiting' : 'since it was sent for approval'} disc={{ hue: 'yellow', icon: 'due' }} />
        <OwnersStat owners={q.owners} />
      </StatRow>

      <div data-hero>
        <ListCard
          label="Waiting for you"
          toolbar={q.count === 0 ? undefined : toolbar}
          applied={<AppliedFilters applied={chips} clearAllHref={clearAll} />}
          pager={q.count === 0 ? undefined : <ListPager from={rows.length === 0 ? 0 : 1} to={rows.length} total={q.count} unit="orders" perPage={q.count === 0 ? 1 : q.count} prevHref={null} nextHref={null} {...(chips.length > 0 ? { filteredFrom: q.count } : {})} />}
          {...(pane === undefined ? {} : { pane })}
        >
          {body}
        </ListCard>
      </div>

      {chains.kind === 'ok' && chains.data.items.length > 0 ? (
        <Section title="Configured chains" sub={`${String(chains.data.items.length)} ${chains.data.items.length === 1 ? 'chain' : 'chains'}`} bare>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Chain</th>
                  <th>Applies to</th>
                  <th>Active</th>
                  <th>Stages</th>
                </tr>
              </thead>
              <tbody>
                {chains.data.items.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.entityType.replace(/_/g, ' ')}</td>
                    <td>
                      <Pill tone={c.isActive ? 'ok' : 'idle'}>{c.isActive ? 'Active' : 'Inactive'}</Pill>
                    </td>
                    <td>{c.stages.map((s) => `${String(s.sequence)}. ${s.name} — ${s.approverRole} ×${String(s.minApprovals)}`).join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}
    </>
  );
}

/** "Who they wait on" — the people holding the role each stage names; the role when nobody does. */
function OwnersStat({ owners }: { owners: BlockedApprovalsStat['owners'] }): ReactNode {
  if (owners.length === 0) return <Stat label="Who they wait on" value="Nobody" text note="nothing is waiting" disc={{ hue: 'purple', icon: 'people' }} />;
  return (
    <Stat
      label="Who they wait on"
      text
      value={owners.map((o) => (o.people.length === 0 ? roleLabel(o.role) : namesOf(o))).join(' · ')}
      note={owners.map((o) => (o.holders === 0 ? `${roleLabel(o.role)}: nobody holds it` : `${roleLabel(o.role)}: ${String(o.holders)} ${o.holders === 1 ? 'holds it' : 'hold it'}`)).join(' · ')}
      disc={{ hue: 'purple', icon: 'people' }}
    />
  );
}

/** The first two names, then "and N more" — a stat, not a directory. */
function namesOf(owner: BlockedApprovalsStat['owners'][number]): string {
  const shown = owner.people.slice(0, 2).map((p) => p.name);
  const rest = owner.people.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} and ${String(rest)} more` : shown.join(', ');
}

function roleLabel(role: string): string {
  // the empty string is "no stage resolved" — a label, not a permission
  return role.length === 0 ? 'no stage' : role.replace(/_/g, ' ');
}

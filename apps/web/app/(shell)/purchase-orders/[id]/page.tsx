import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { formatBasisPoints, formatQuantity } from '@cog/money';
import { Empty, Hero, Icon, Money, MoneyExact, Notice, PageHeader, Pill, Section, Stepper, answer, load } from '@cog/design-system';
import { apiAsCaller } from '../../../../lib/api';
import { orderSteps } from '../../../../lib/approval-steps';
import { DecisionPane } from '../../approvals/forms';
import { RenameOrderForm } from '../forms';
import { orderStateLabel, orderStateTone } from '../status';

export const dynamic = 'force-dynamic';

/**
 * One purchase order — `docs/design/07-buying.html`, "The full order page":
 * the total is the hero, the decision under it, then the lines, the approval
 * steps and the activity.
 *
 * **No PDF, Send to vendor or Cancel… action.** The design's toolbar shows all
 * three; `packages/contracts` has no route that generates a document,
 * notifies a vendor, or transitions an order to `cancelled` (the state exists
 * on the wire, nothing reaches it). HUMAN(DATA): each needs an endpoint this
 * screen does not have, so none is wired to a button that would do nothing.
 *
 * The lines are `purchaseOrderLines` — the server's amount and rate check on
 * each — and the provenance line names the BOQ items they came from when the
 * project's BOQ still carries them. Every figure on the page is the server's.
 */
export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }): Promise<ReactNode> {
  const { id } = await params;
  const client = await apiAsCaller();

  const [one, lines, history, chains, blocked, people, projects, whoami] = await Promise.all([
    // the record itself — never a page of the list hoping the record is on it
    load(client, API_ROUTES.getPurchaseOrder, { params: { id } }),
    load(client, API_ROUTES.purchaseOrderLines, { params: { id } }),
    load(client, API_ROUTES.approvalHistory, { params: { entityType: 'purchase_order', entityId: id } }),
    load(client, API_ROUTES.approvalChains, {}),
    load(client, API_ROUTES.blockedApprovals, {}),
    // a lookup: the widest window the endpoint allows
    load(client, API_ROUTES.people, { query: { limit: '200' } }),
    load(client, API_ROUTES.listProjects, { query: { limit: '200' } }),
    load(client, API_ROUTES.whoami, {}),
  ]);

  if (one.kind !== 'ok') return answer(one, { what: 'This order', backHref: '/purchase-orders', backLabel: 'Back to Orders' });
  const order = one.data;

  const project = order.projectId === null || projects.kind !== 'ok' ? null : (projects.data.items.find((p) => p.id === order.projectId) ?? null);
  const vendorName = order.vendorName ?? 'Vendor no longer registered';

  // the BOQ items the lines came from, named by their number
  const items = lines.kind === 'ok' ? lines.data.items : [];
  const fromBoq = items.filter((l) => l.boqItemId !== null);
  const boq = project !== null && fromBoq.length > 0 ? await load(client, API_ROUTES.projectBoq, { params: { projectId: project.id } }) : null;
  const boqItemOf = new Map(boq !== null && boq.kind === 'ok' ? boq.data.items.map((b) => [b.id, b]) : []);
  const boqNumbers = fromBoq.map((l) => boqItemOf.get(l.boqItemId ?? '')).filter((b) => b !== undefined).map((b) => `${b.section} ${String(b.itemNo)}`);

  const personName = new Map(people.kind === 'ok' ? people.data.items.map((p) => [p.id, p.displayName ?? p.email]) : []);
  const approverLabel = (approverId: string): string => personName.get(approverId) ?? `Approver ${approverId.slice(0, 8)}`;

  const chain =
    chains.kind === 'ok'
      ? (chains.data.items.find((c) => c.entityType === 'purchase_order' && c.isActive) ?? chains.data.items.find((c) => c.entityType === 'purchase_order') ?? null)
      : null;
  const decisions = history.kind === 'ok' ? history.data.items : [];
  const waiting = blocked.kind === 'ok' ? (blocked.data.items.find((b) => b.id === id) ?? null) : null;
  const steps = orderSteps(chain, decisions, waiting, approverLabel, order.state);
  const ownOrder = whoami.kind === 'ok' && waiting !== null && whoami.data.principalId === waiting.requesterId;

  const rates = new Set(items.map((l) => l.gstRate));
  const oneRate = rates.size === 1 ? [...rates][0] : undefined;
  const covered = items.filter((l) => l.contractedUnitRate !== null).length;
  const above = items.filter((l) => l.excessBp !== null && l.excessBp > 0).length;
  const lineWord = (n: number): string => `${String(n)} ${n === 1 ? 'line' : 'lines'}`;

  return (
    <>
      <PageHeader
        crumbs={[
          { href: '/purchase-orders', label: 'Buying' },
          { href: '/purchase-orders', label: 'Orders' },
        ]}
        title={order.number}
        status={<Pill tone={orderStateTone(order.state)}>{orderStateLabel(order.state)}</Pill>}
        sub={
          <>
            {vendorName}
            {project === null ? '' : <> · <span className="nowrap">{project.code}</span></>}
            {' · raised '}
            {order.createdAt.slice(0, 10)}
          </>
        }
      />

      {boqNumbers.length === 0 ? null : (
        <Notice tone="info" icon={<Icon name="info" />}>
          Raised from the {project?.code ?? ''} BOQ — {boqNumbers.length === 1 ? `line ${boqNumbers[0] ?? ''}` : `lines ${boqNumbers.slice(0, -1).join(', ')} and ${boqNumbers[boqNumbers.length - 1] ?? ''}`}.
          Quantities and cost rates were copied at that moment; later BOQ edits don’t change this order.
        </Notice>
      )}

      <div data-hero>
        <Hero
          ariaLabel="Total, GST included"
          eyebrow="Total, GST included"
          value={<MoneyExact wire={order.gross} />}
          sentence={
            <>
              <Money wire={order.taxable} /> before GST, and GST of <Money wire={order.gst} />{' '}
              {oneRate === undefined ? 'at the rates typed on each line' : `at the provisional ${formatBasisPoints(oneRate)} typed on every line`} — see Settings › Tax.{' '}
              {lines.kind !== 'ok'
                ? 'The lines could not be read.'
                : items.length === 0
                  ? 'No lines yet.'
                  : covered === 0
                    ? `${items.length === 1 ? 'One line, not' : `${lineWord(items.length)}, none`} covered by an agreed rate with ${vendorName}.`
                    : above === 0
                      ? `${lineWord(covered)} of ${String(items.length)} covered by an agreed rate with ${vendorName}, none above it.`
                      : `${lineWord(above)} above the agreed rate with ${vendorName}.`}
            </>
          }
          side={
            <>
              <b>{lineWord(items.length)}</b> · {covered === 0 ? 'no agreed rate to check against' : `${String(covered)} checked against an agreed rate`}
            </>
          }
          actions={order.state === 'pending_approval' ? <DecisionPane orderId={order.id} after={`/purchase-orders/${order.id}`} ownOrder={ownOrder} /> : null}
          {...(waiting === null
            ? {}
            : {
                owners: [
                  {
                    initial: waiting.approverRole.slice(0, 1).toUpperCase(),
                    name: waiting.stageName,
                    role: `waiting for ${waiting.approverRole} · ${String(waiting.days)} ${waiting.days === 1 ? 'day' : 'days'}`,
                  },
                ],
              })}
        />
      </div>

      <Section title="Lines" {...(lines.kind === 'ok' ? { sub: `${lineWord(items.length)} · checked against the agreed rates with ${vendorName}` } : {})} bare>
        {lines.kind !== 'ok' ? (
          <div className="card-b">
            <p className="muted">The lines could not be read.</p>
          </div>
        ) : items.length === 0 ? (
          <Empty illustration="orders" title="No lines on this order" size="narrow">
            An order raised from the BOQ carries its lines; this one has none yet.
          </Empty>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="num p3">#</th>
                  <th className="p1">Item</th>
                  <th className="num p2">Quantity</th>
                  <th className="num p2">Rate</th>
                  <th className="num p3">Agreed rate</th>
                  <th className="num p1">Amount</th>
                  <th className="p2">Check</th>
                </tr>
              </thead>
              <tbody>
                {items.map((l) => {
                  const b = l.boqItemId === null ? undefined : boqItemOf.get(l.boqItemId);
                  return (
                    <tr key={l.lineNo}>
                      <td className="num p3">{l.lineNo}</td>
                      <td className="p1">
                        {l.description}
                        {b === undefined && l.tradeCode === null ? null : (
                          <span className="sub">
                            {b === undefined ? '' : `BOQ ${b.section} ${String(b.itemNo)}`}
                            {b !== undefined && l.tradeCode !== null ? ' · ' : ''}
                            {l.tradeCode ?? ''}
                          </span>
                        )}
                      </td>
                      <td className="num p2">
                        {formatQuantity(l.quantityMicros)}
                        {b === undefined ? '' : ` ${b.uom}`}
                      </td>
                      <td className="num p2">
                        <MoneyExact wire={l.unitRate} />
                      </td>
                      <td className="num p3">
                        {l.contractedUnitRate === null ? (
                          <span className="muted" title="No agreed rate for this item with this vendor">
                            —
                          </span>
                        ) : (
                          <MoneyExact wire={l.contractedUnitRate} />
                        )}
                      </td>
                      <td className="num p1">
                        <MoneyExact wire={l.amount} />
                      </td>
                      <td className="p2">
                        {l.excessBp === null ? (
                          <span className="muted">No agreed rate</span>
                        ) : l.excessBp > 0 ? (
                          <Pill tone="warn">{formatBasisPoints(l.excessBp)} above</Pill>
                        ) : (
                          <Pill tone="ok">Agreed rate</Pill>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>Before GST, calculated for you</td>
                  <td className="num">
                    <MoneyExact wire={order.taxable} />
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Section>

      <Section title="Approval" {...(steps === null ? {} : { sub: `${String(steps.length)} ${steps.length === 1 ? 'step' : 'steps'} — the chain this organisation configured` })}>
        {steps === null ? (
          <Empty illustration="approvals" title="No approval chain is configured" size="narrow">
            Nothing decides who approves what yet, so every decision is refused rather than let through by default.
          </Empty>
        ) : (
          <Stepper steps={steps} />
        )}
      </Section>

      <Section title="Activity" sub="every change is recorded" bare>
        {history.kind !== 'ok' ? (
          <div className="card-b">
            <p className="muted">The history could not be read.</p>
          </div>
        ) : history.data.items.length === 0 ? (
          <Empty illustration="approvals" title="No decision has been recorded" size="narrow">
            Nothing has been approved or declined on this order yet.
          </Empty>
        ) : (
          <ul className="list">
            {history.data.items.map((entry) => (
              <li key={entry.id}>
                <div>
                  {approverLabel(entry.approverId)} {entry.decision === 'approved' ? 'approved it' : entry.decision === 'rejected' ? 'declined it' : entry.decision} at {entry.stageName}
                  {entry.remarks === '' ? null : <small>{entry.remarks}</small>}
                </div>
                <span className="muted">{entry.occurredAt.slice(0, 16).replace('T', ' ')}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Number" sub="rename this order">
        <RenameOrderForm id={order.id} number={order.number} version={order.version} />
      </Section>
    </>
  );
}

import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { Empty, Money, Pill, Refusal, Stat, StatRow, UnreachableState, load } from '@cog/design-system';
import { apiAsCaller } from '../../../../../lib/api';

export const dynamic = 'force-dynamic';

/**
 * Billing — the tax invoices for this project, what has been paid against them,
 * and what is still due.
 *
 * Every figure is the contractor's server's, for this client's own project
 * only. An invoice whose GST rate is still provisional says so; the rate is
 * confirmed by the contractor's chartered accountant, not here.
 */
export default async function ClientBillingPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const billing = await load(await apiAsCaller(), API_ROUTES.clientPortalBilling, { params: { projectId } });

  if (billing.kind === 'unreachable') return <UnreachableState />;
  if (billing.kind === 'refused') return <Refusal error={billing.error} />;

  const { invoices } = billing.data;

  return (
    <>
      <div className="pgh">
        <h1 className="pt">Billing</h1>
        <p className="ps">invoices, what has been paid, and what is due</p>
      </div>

      {invoices.length === 0 ? (
        <Empty illustration="money" title="No invoices yet">
          Your contractor&rsquo;s invoices for this project appear here as they are raised, with what
          you have paid and what is due.
        </Empty>
      ) : (
        <>
          <StatRow n={3}>
            <Stat label="Invoiced" value={<Money wire={billing.data.invoiced} />} note="with GST" />
            <Stat label="Paid" value={<Money wire={billing.data.received} />} note="received by your contractor" />
            <Stat label="Due" value={<Money wire={billing.data.balance} />} note="still to pay" />
          </StatRow>

          <ul className="card-list">
            {invoices.map((invoice) => (
              <li className="card" key={invoice.id}>
                <div className="top">
                  <div>
                    <b>{invoice.number}</b>
                    <small>
                      {invoice.invoiceDate}
                      {invoice.description === '' ? '' : ` · ${invoice.description}`}
                    </small>
                  </div>
                  <Pill tone={invoice.state === 'cancelled' ? 'idle' : 'ok'}>
                    {invoice.state === 'cancelled' ? 'Cancelled' : 'Issued'}
                  </Pill>
                </div>
                <div className="amt">
                  <Money wire={invoice.total} />
                  <small>invoiced, with GST</small>
                </div>
                <dl className="kv">
                  <dt>Taxable value</dt>
                  <dd>
                    <Money wire={invoice.taxable} />
                  </dd>
                  <dt>CGST · SGST · IGST</dt>
                  <dd>
                    <Money wire={invoice.cgst} /> · <Money wire={invoice.sgst} /> · <Money wire={invoice.igst} />{' '}
                    {invoice.provisional ? <Pill tone="idle">Provisional</Pill> : null}
                  </dd>
                  <dt>Round off</dt>
                  <dd>
                    <Money wire={invoice.roundOff} />
                  </dd>
                  <dt>Paid</dt>
                  <dd>
                    <Money wire={invoice.received} />
                  </dd>
                  <dt>Due</dt>
                  <dd>
                    <Money wire={invoice.balance} /> · expected {invoice.expectedOn}
                  </dd>
                </dl>
                {invoice.provisional ? (
                  <p className="muted">Draft: provisional rates — the GST rate is still to be confirmed.</p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

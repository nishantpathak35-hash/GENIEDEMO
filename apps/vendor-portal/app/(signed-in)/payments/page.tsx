import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { formatBasisPoints } from '@cog/money';
import { Empty, Icon, Money, Notice, Pager, Pill, Refusal, UnreachableState, load } from '@cog/design-system';
import { apiAsCaller } from '../../../lib/api';
import { pageLinks, pageState } from '../../../lib/paging';

export const metadata = { title: 'Payments · Vendor portal' };
export const dynamic = 'force-dynamic';

/**
 * Payments — what you were paid, what was deducted and what was withheld.
 *
 * Every row is your client's payment as recorded: tax deducted under a section
 * at a rate, retention withheld, and what reached you. A rate that is still
 * provisional says so beside it (ADR-0014, addendum); nothing else carries a
 * banner.
 *
 * **The tenant's own name is not substituted in.** No vendor-portal route
 * returns it (the layout's HUMAN(DATA-vendor-portal-identity)), and this is a
 * multi-tenant surface.
 */
export default async function VendorPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const paging = pageState(params);
  const payments = await load(await apiAsCaller(), API_ROUTES.vendorPortalPayments, { query: paging.query });

  if (payments.kind === 'unreachable') return <UnreachableState />;
  if (payments.kind === 'refused') return <Refusal error={payments.error} />;

  function hrefFor(overrides: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined && value !== '') next.set(key, value);
    }
    const qs = next.toString();
    return qs === '' ? '/payments' : `/payments?${qs}`;
  }
  const links = pageLinks(paging, payments.data, hrefFor);

  return (
    <>
      <div className="pgh">
        <h1 className="pt">Payments</h1>
        <p className="ps">what was paid, and what was deducted</p>
      </div>

      {payments.data.count === 0 ? (
        <Empty illustration="money" title="Nothing paid yet">
          When a bill you sent is paid, it appears here with the tax deducted, any retention withheld and what reached
          you.
        </Empty>
      ) : (
        <>
          <ul className="card-list">
            {payments.data.items.map((payment) => (
              <li className="card" key={payment.id}>
                <div className="top">
                  <div>
                    <b>{payment.billNumber ?? 'Retention released'}</b>
                    <small>
                      {payment.paidOn}
                      {payment.reference === '' ? '' : ` · ${payment.reference}`}
                    </small>
                  </div>
                  <Pill tone="ok">Paid</Pill>
                </div>
                <div className="amt">
                  <Money wire={payment.netPaid} />
                  <small>reached you</small>
                </div>
                <dl className="kv">
                  <dt>Billed</dt>
                  <dd>
                    <Money wire={payment.grossAmount} />
                  </dd>
                  <dt>Tax deducted</dt>
                  <dd>
                    <Money wire={payment.tdsAmount} />
                    {payment.tdsSection === null ? null : (
                      <>
                        {` · ${payment.tdsSection}`}
                        {payment.tdsRateBp === null ? '' : ` at ${formatBasisPoints(payment.tdsRateBp)}`}{' '}
                        {/* the vendor audience is shown no caution colour (13-decisions, the second shipped contradiction): Provisional in the neutral pill */}
                        <Pill tone={payment.provisional ? 'idle' : 'ok'}>
                          {payment.provisional ? 'Provisional' : 'Verified'}
                        </Pill>
                      </>
                    )}
                  </dd>
                  <dt>Retention withheld</dt>
                  <dd>
                    <Money wire={payment.retentionWithheld} />
                  </dd>
                </dl>
              </li>
            ))}
          </ul>
          <Pager shown={links.shown} of={payments.data.count} unit="payments" next={links.next} prev={links.prev} />
        </>
      )}

      <Notice tone="info" title="The certificate" icon={<Icon name="info" />}>
        The quarterly TDS certificate comes from your client; it is not produced on this portal yet.
      </Notice>
    </>
  );
}

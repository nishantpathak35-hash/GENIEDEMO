import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { AbsentNotice, Empty, Icon, Money, Notice, Pager, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import type { PillTone } from '@cog/design-system';
import { apiAsCaller } from '../../../lib/api';
import { pageLinks, pageState } from '../../../lib/paging';
import { SubmitBillForm } from '../forms';

export const metadata = { title: 'Bills · Vendor portal' };
export const dynamic = 'force-dynamic';

/**
 * Running-account bills this vendor has submitted — `10-portals.html`'s
 * Bills card list.
 *
 * **A claim, not a payable.** Every figure on this page is what the vendor
 * entered; nothing has been deducted from it, netted against it, or approved.
 * The legacy portal's equivalent table has an "Invoice Amount", a "TDS
 * Deducted" and a "Net Receivable" column, the last computed in the browser as
 * `Math.max(0, amountRequested - tdsAmount)` — a statutory deduction, subtracted
 * client-side, presented to the party it is deducted from. None of those three
 * derived figures exists here, because the rules behind them are CA-01..CA-08
 * and unverified.
 *
 * **HUMAN(DATA-vendor-bill-return-reason):** the design's "Sent back" card
 * states the reason in the finance person's own words. `vendorBill` (
 * `packages/contracts/src/api/purchase-orders.ts`) carries no such field and
 * `vendorPortalSubmitBill` is create-only — there is no endpoint to edit or
 * resubmit an existing bill. The reason renders `Absent`; "fix it" is a real
 * link to the same "Send a bill" panel below (a new claim against the same
 * order), not a fabricated edit action.
 */
export default async function VendorBillsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const paging = pageState(params);
  const client = await apiAsCaller();
  const [bills, orders] = await Promise.all([
    load(client, API_ROUTES.vendorPortalBills, { query: paging.query }),
    // a lookup, for the "Send a bill" picker below: the widest window the
    // endpoint allows
    load(client, API_ROUTES.vendorPortalOrders, { query: { limit: '200' } }),
  ]);

  if (bills.kind === 'unreachable') return <UnreachableState />;
  if (bills.kind === 'refused') return <Refusal error={bills.error} />;

  const orderOptions = orders.kind === 'ok' ? orders.data.items.map((o) => [o.id, o.number] as const) : [];
  const items = bills.data.items;

  function hrefFor(overrides: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined && value !== '') next.set(key, value);
    }
    const qs = next.toString();
    return qs === '' ? '/bills' : `/bills?${qs}`;
  }
  const links = pageLinks(paging, bills.data, hrefFor);

  return (
    <>
      <div className="pgh">
        <h1 className="pt">Your bills</h1>
        <p className="ps">{bills.data.count} submitted</p>
      </div>

      {bills.data.count === 0 ? (
        <Empty illustration="money" title="Nothing submitted yet">
          Submit your first bill below, against one of your orders.
        </Empty>
      ) : (
        <>
          <ul className="card-list">
            {items.map((bill) => (
              <li className="card" key={bill.id}>
                <div className="top">
                  <div>
                    <b>{bill.billNumber}</b>
                    <small>
                      {bill.periodFrom === null
                        ? bill.submittedAt.slice(0, 10)
                        : `${bill.periodFrom} to ${bill.periodTo ?? ''}`}
                    </small>
                  </div>
                  <Pill tone={bill.paidOn === null ? billTone(bill.state) : 'ok'}>
                    {bill.paidOn === null ? billLabel(bill.state) : 'Paid'}
                  </Pill>
                </div>
                <div className="amt">
                  <Money wire={bill.amountClaimed} />
                  <small>what you billed</small>
                </div>
                {bill.paidOn !== null ? (
                  <p className="muted">Paid on {bill.paidOn} — Payments shows what was deducted.</p>
                ) : bill.dueOn !== null ? (
                  <p className="muted">Due on {bill.dueOn}</p>
                ) : null}
                {bill.state === 'returned' ? (
                  <Notice
                    tone="bad"
                    title="Sent back"
                    icon={<Icon name="alert" />}
                    actions={
                      <a className="btn" href="#send-a-bill">
                        Submit a corrected bill
                      </a>
                    }
                  >
                    The reason is not shown here yet — ask your contact for it directly.
                  </Notice>
                ) : bill.narrative === '' ? null : (
                  <p>{bill.narrative}</p>
                )}
              </li>
            ))}
          </ul>
          <Pager shown={links.shown} of={bills.data.count} unit="bills" next={links.next} prev={links.prev} />
        </>
      )}

      <AbsentNotice title="What you were paid is on Payments, not here">
        The amount above is what you claimed. Once a bill is paid, Payments shows the tax deducted, any retention
        withheld and what reached you, with the rate marked provisional while it is.
      </AbsentNotice>

      <Section bare title="Send a bill" sub="against an accepted order">
        <div className="card-b">
          {orderOptions.length === 0 ? (
            <p className="muted">You have no orders to bill against.</p>
          ) : (
            <SubmitBillForm orders={orderOptions} />
          )}
        </div>
      </Section>
    </>
  );
}

function billTone(state: string): PillTone {
  switch (state) {
    case 'acknowledged':
      return 'ok';
    case 'returned':
      return 'bad';
    default:
      return 'waiting';
  }
}

/** The design's words — 00-foundations vocabulary, never the raw enum. */
function billLabel(state: string): string {
  switch (state) {
    case 'acknowledged':
      return 'Received';
    case 'returned':
      return 'Sent back';
    default:
      return 'Sent';
  }
}

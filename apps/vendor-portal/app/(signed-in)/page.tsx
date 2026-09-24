import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { AbsentNotice, Empty, Money, Pager, Pill, Refusal, UnreachableState, load } from '@cog/design-system';
import type { PillTone } from '@cog/design-system';
import { apiAsCaller } from '../../lib/api';
import { pageLinks, pageState } from '../../lib/paging';
import { AcceptOrderForm } from './forms';
import { OrderLinesDrawer } from './order-lines-drawer';

export const metadata = { title: 'Orders · Vendor portal' };
export const dynamic = 'force-dynamic';

/**
 * The orders issued to this vendor — `10-portals.html`'s Orders card list.
 *
 * **The vendor id is never in this page.** It is not a query parameter, not a
 * path segment and not a hidden field: the server reads it from
 * `identity.principal_links` inside the transaction. The legacy passes
 * `vendorId` from the client (`VendorPortalView.js:22-27`), which makes the
 * scoping an input rather than a control.
 *
 * **What is deliberately not here: TDS and retention.** Both are CA-01..CA-08.
 * The legacy portal shows a "TDS Deducted (₹)" column and a "Net Receivable"
 * computed in the browser as `Math.max(0, amountRequested - tdsAmount)`
 * (`VendorPortalView.js:295`) — a statutory deduction, subtracted in a browser,
 * shown to the party it is deducted from. An isolation test asserts no such
 * field appears in any response on this surface.
 *
 * **`?lines=<orderId>`** carries the "See lines" drawer's state in the URL,
 * per `STAGE4-COMMON`'s rule that a view a link opens is server-read state,
 * not client state — `vendorPortalOrderLines` is a real, already-shipped
 * endpoint, so this is wired to it rather than left `Absent`.
 *
 * Cards, not a table, at every width — the design's own choice for both
 * portals, not only under a phone breakpoint.
 */
export default async function VendorOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  // Filterless list: the only URL state is the paging window itself, and the
  // "See lines" drawer's own `lines` id, which is not a paging parameter.
  const paging = pageState(params);
  const client = await apiAsCaller();
  const [orders, everyOrder] = await Promise.all([
    load(client, API_ROUTES.vendorPortalOrders, { query: paging.query }),
    // "N need your answer" is a whole-book count, not one page's — the widest
    // window the endpoint allows, since there is no dedicated summary field for it.
    load(client, API_ROUTES.vendorPortalOrders, { query: { limit: '200' } }),
  ]);

  if (orders.kind === 'unreachable') return <UnreachableState />;
  if (orders.kind === 'refused') return <Refusal error={orders.error} />;

  const items = orders.data.items;
  const unanswered = everyOrder.kind === 'ok' ? everyOrder.data.items.filter((o) => o.acceptance === null) : [];

  const linesFor = params['lines'];
  const openOrder = linesFor === undefined ? undefined : items.find((o) => o.id === linesFor);
  const lines =
    openOrder === undefined
      ? null
      : await load(client, API_ROUTES.vendorPortalOrderLines, { params: { orderId: openOrder.id } });

  function hrefFor(overrides: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined && value !== '') next.set(key, value);
    }
    const qs = next.toString();
    return qs === '' ? '/' : `/?${qs}`;
  }
  const links = pageLinks(paging, orders.data, hrefFor);

  return (
    <>
      <div className="pgh">
        <h1 className="pt">Your orders</h1>
        <p className="ps">
          {unanswered.length === 0
            ? `${orders.data.count} order${orders.data.count === 1 ? '' : 's'}`
            : unanswered.length === 1
              ? '1 needs your answer'
              : `${unanswered.length} need your answer`}
        </p>
      </div>

      {orders.data.count === 0 ? (
        <Empty illustration="orders" title="No orders yet">
          Orders raised against you appear here — if you expected one, ask your contact to check your account is linked
          to a vendor record.
        </Empty>
      ) : (
        <>
          <ul className="card-list">
            {items.map((order) => (
              <li className="card" key={order.id}>
                <div className="top">
                  <div>
                    <b>{order.number}</b>
                    <small>raised {order.createdAt.slice(0, 10)}</small>
                  </div>
                  <Pill tone={order.state === 'approved' ? 'ok' : 'idle'}>{order.state}</Pill>
                </div>
                <div className="amt">
                  <Money wire={order.taxable} />
                  <small>
                    before GST · GST <Money wire={order.gst} /> · total <Money wire={order.gross} />
                  </small>
                </div>
                {order.acceptance === null ? (
                  <AcceptOrderForm orderId={order.id} />
                ) : (
                  <div className="row">
                    <Pill tone={acceptanceTone(order.acceptance)}>
                      {order.acceptance === 'accepted' ? 'Accepted' : 'Declined'}
                    </Pill>
                    <a className="btn ghost" href={`/?lines=${order.id}`}>
                      See lines
                    </a>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <Pager
            shown={links.shown}
            of={orders.data.count}
            unit={orders.data.count === 1 ? 'order' : 'orders'}
            next={links.next}
            prev={links.prev}
          />
        </>
      )}

      <AbsentNotice title="Gross is taxable plus GST — nothing is deducted from it here">
        No TDS figure and no retention figure appears on this portal, because the rules that produce them have not been
        verified by a chartered accountant (CA-01..CA-08). What is actually paid to you is agreed outside this system
        until they are.
      </AbsentNotice>

      {openOrder === undefined || lines === null ? null : (
        <OrderLinesDrawer
          orderNumber={openOrder.number}
          lines={lines.kind === 'ok' ? lines.data.items : []}
          error={
            lines.kind === 'refused'
              ? lines.error.message
              : lines.kind === 'unreachable'
                ? 'The API is not reachable. Nothing was read.'
                : null
          }
        />
      )}
    </>
  );
}

function acceptanceTone(decision: string): PillTone {
  return decision === 'accepted' ? 'ok' : 'bad';
}

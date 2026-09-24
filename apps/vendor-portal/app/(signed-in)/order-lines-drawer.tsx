'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Drawer, Money } from '@cog/design-system';
import { formatQuantity } from '@cog/money';
import type { VendorPortalLineListResponse } from '@cog/contracts';

/** Not exported on its own — only the list response is. Derived, not added to `packages/contracts`. */
type VendorPortalLine = VendorPortalLineListResponse['items'][number];

/**
 * "See lines" — `10-portals.html`'s Orders card.
 *
 * Opened by a real link (`?lines=<orderId>`, read by the page's own
 * `searchParams` and fetched server-side against `vendorPortalOrderLines`) so
 * the URL carries the state per `STAGE4-COMMON`; this component only draws
 * what the server already read. Closing pushes the bare path, which is a
 * client-side navigation Next.js resolves without a further server read of
 * its own.
 */
export function OrderLinesDrawer({
  orderNumber,
  lines,
  error,
}: {
  orderNumber: string;
  lines: readonly VendorPortalLine[];
  /** Set when the read was refused — another vendor's order id, most likely. */
  error: string | null;
}): ReactNode {
  const router = useRouter();

  return (
    <Drawer
      title={`Lines on ${orderNumber}`}
      open
      onClose={() => {
        router.push('/');
      }}
    >
      {error === null ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>HSN/SAC</th>
                <th className="num">Quantity</th>
                <th className="num">Rate</th>
                <th className="num">GST</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.lineNo}>
                  <td>{line.lineNo}</td>
                  <td>{line.description}</td>
                  <td>{line.hsnSac}</td>
                  <td className="num">{formatQuantity(line.quantityMicros)}</td>
                  <td className="num">
                    <Money wire={line.unitRate} />
                  </td>
                  <td className="num">{line.gstRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">{error}</p>
      )}
    </Drawer>
  );
}

import type { ReactNode } from 'react';
import { ListCard, PageHeader, Skeleton } from '@cog/design-system';

/**
 * The Orders list, while it loads: the same header and the same card, with
 * the table's own columns shimmering — so nothing changes height the moment
 * the data arrives (`docs/design/12-states-roles.html`, loading a list).
 */
export default function Loading(): ReactNode {
  return (
    <>
      <PageHeader crumbs={[{ href: '/purchase-orders', label: 'Buying' }]} title="All orders" sub="Loading…" />
      <ListCard label="Orders">
        <Skeleton
          columns={[
            { label: 'Raised', numeric: true },
            { label: 'Order' },
            { label: 'Vendor' },
            { label: 'Project' },
            { label: 'Status' },
            { label: 'Total', numeric: true },
            { label: 'Rates' },
          ]}
        />
      </ListCard>
    </>
  );
}

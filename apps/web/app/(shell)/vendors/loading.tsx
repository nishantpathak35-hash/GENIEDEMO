import type { ReactNode } from 'react';
import { ListCard, PageHeader, Skeleton } from '@cog/design-system';

/** The Vendors list, while it loads: the same header and card, the table's own columns shimmering. */
export default function Loading(): ReactNode {
  return (
    <>
      <PageHeader crumbs={[{ href: '/purchase-orders', label: 'Buying' }]} title="All vendors" sub="Loading…" />
      <ListCard label="Vendors">
        <Skeleton
          columns={[
            { label: 'Vendor' },
            { label: 'Agreed rates', numeric: true },
            { label: 'Open orders', numeric: true },
            { label: 'Bills waiting', numeric: true },
            { label: 'Last order', numeric: true },
          ]}
        />
      </ListCard>
    </>
  );
}

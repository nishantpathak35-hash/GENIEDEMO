import type { ReactNode } from 'react';
import { ListCard, PageHeader, Skeleton } from '@cog/design-system';

/** The stock list, while it loads: the same header and card, the table's own columns shimmering. */
export default function Loading(): ReactNode {
  return (
    <>
      <PageHeader crumbs={[{ href: '/purchase-orders', label: 'Buying' }]} title="All stock" sub="Loading…" />
      <ListCard label="Stock by store">
        <Skeleton
          columns={[
            { label: 'Item' },
            { label: 'On hand', numeric: true },
            { label: 'Reorder at', numeric: true },
            { label: 'Level' },
          ]}
        />
      </ListCard>
    </>
  );
}

import type { ReactNode } from 'react';
import { ListCard, PageHeader, Skeleton } from '@cog/design-system';

/** The rate analysis, while it loads: the same header and card, the table's own columns shimmering. */
export default function Loading(): ReactNode {
  return (
    <>
      <PageHeader crumbs={[{ href: '/purchase-orders', label: 'Buying' }]} title="All agreed rates" sub="Loading…" />
      <ListCard label="Rate analysis">
        <Skeleton
          columns={[
            { label: 'Item' },
            { label: 'BOQ rate', numeric: true },
            { label: 'Agreed rate', numeric: true },
            { label: 'Last ordered', numeric: true },
            { label: 'Check' },
          ]}
        />
      </ListCard>
    </>
  );
}

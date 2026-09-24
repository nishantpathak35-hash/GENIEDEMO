import type { ReactNode } from 'react';
import { ListCard, PageHeader, Skeleton } from '@cog/design-system';

/** The queue, while it loads: the same header and card, the table's own columns shimmering. */
export default function Loading(): ReactNode {
  return (
    <>
      <PageHeader title="Approvals" sub="Loading…" />
      <ListCard label="Waiting for you">
        <Skeleton columns={[{ label: 'Order' }, { label: 'Vendor' }, { label: 'Project' }, { label: 'Step' }, { label: 'Waiting', numeric: true }, { label: 'Total', numeric: true }]} />
      </ListCard>
    </>
  );
}

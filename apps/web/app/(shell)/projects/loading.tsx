import type { ReactNode } from 'react';
import { ListCard, PageHeader, Skeleton } from '@cog/design-system';

/** The projects list, while it loads: the same header and card, the table's own columns shimmering. */
export default function Loading(): ReactNode {
  return (
    <>
      <PageHeader title="All projects" sub="Loading…" />
      <ListCard label="Projects">
        <Skeleton columns={[{ label: 'Project' }, { label: 'Health' }, { label: 'Contract', numeric: true }, { label: 'Ordered so far', numeric: true }, { label: 'Ordered against contract', numeric: true }]} />
      </ListCard>
    </>
  );
}

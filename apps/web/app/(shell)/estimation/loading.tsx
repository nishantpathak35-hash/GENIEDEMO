import type { ReactNode } from 'react';
import { ListCard, PageHeader, Skeleton } from '@cog/design-system';

/** The rate library, while it loads: the same header and card, the table's own columns shimmering. */
export default function Loading(): ReactNode {
  return (
    <>
      <PageHeader crumbs={[{ href: '/crm/board', label: 'Sales' }]} title="All rate analyses" sub="Loading…" />
      <ListCard label="Rate library">
        <Skeleton columns={[{ label: 'Item' }, { label: 'Base rate', numeric: true }, { label: 'Direct cost', numeric: true }, { label: 'Margin', numeric: true }]} />
      </ListCard>
    </>
  );
}

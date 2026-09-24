import type { ReactNode } from 'react';
import { ListCard, PageHeader, Skeleton } from '@cog/design-system';

/** The leads list, while it loads: the same header and card, the table's own columns shimmering. */
export default function Loading(): ReactNode {
  return (
    <>
      <PageHeader crumbs={[{ href: '/crm/board', label: 'Sales' }]} title="All leads" sub="Loading…" />
      <ListCard label="Leads">
        <Skeleton columns={[{ label: 'Lead' }, { label: 'Stage' }, { label: 'Owner' }, { label: 'Next' }, { label: 'Value', numeric: true }]} />
      </ListCard>
    </>
  );
}

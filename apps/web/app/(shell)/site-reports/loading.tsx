import type { ReactNode } from 'react';
import { ListCard, PageHeader, Skeleton } from '@cog/design-system';

/** The daily reports, while they load: the same header and card, the table's own columns shimmering. */
export default function Loading(): ReactNode {
  return (
    <>
      <PageHeader crumbs={[{ href: '/site-reports', label: 'Site' }]} title="All reports" sub="Loading…" />
      <ListCard label="Daily reports">
        <Skeleton columns={[{ label: 'Day', numeric: true }, { label: 'Site' }, { label: 'On site', numeric: true }, { label: 'Status' }]} />
      </ListCard>
    </>
  );
}

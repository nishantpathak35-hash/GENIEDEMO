import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

/** A settings page's table, while it loads; the hub itself needs no read. */
export default function Loading(): ReactNode {
  return <Skeleton columns={[{ label: 'Name' }, { label: 'Status' }, { label: 'Kind' }, { label: 'Roles' }]} />;
}

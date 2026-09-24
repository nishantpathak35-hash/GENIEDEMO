import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

export default function Loading(): ReactNode {
  return (
    <Skeleton
      columns={[
        { label: 'Deliverable' },
        { label: 'Revision', numeric: true },
        { label: 'Included', numeric: true },
        { label: 'State' },
        { label: 'Due' },
      ]}
    />
  );
}

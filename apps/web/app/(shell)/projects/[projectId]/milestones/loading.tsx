import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

export default function Loading(): ReactNode {
  return (
    <Skeleton
      columns={[
        { label: 'Milestone' },
        { label: 'Planned' },
        { label: 'Actual' },
        { label: 'Late by' },
        { label: 'State' },
      ]}
    />
  );
}

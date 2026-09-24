import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

/** The people table's own shape, while it loads. */
export default function Loading(): ReactNode {
  return (
    <Skeleton
      columns={[
        { label: 'Who' },
        { label: 'State' },
        { label: 'May do (tenant-wide)' },
        { label: 'Works on' },
      ]}
    />
  );
}

import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

export default function Loading(): ReactNode {
  return (
    <Skeleton
      columns={[
        { label: '#', numeric: true },
        { label: 'Stage' },
        { label: 'State' },
        { label: 'Signed off' },
      ]}
    />
  );
}

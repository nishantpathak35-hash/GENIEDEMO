import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

export default function Loading(): ReactNode {
  return (
    <Skeleton
      columns={[
        { label: '#' },
        { label: 'Stage' },
        { label: 'Released by' },
        { label: 'Share' },
        { label: 'Amount' },
      ]}
    />
  );
}

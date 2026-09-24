import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

export default function Loading(): ReactNode {
  return (
    <Skeleton
      columns={[{ label: 'Title' }, { label: 'Floor' }, { label: 'Scale' }, { label: 'Drawing' }]}
    />
  );
}

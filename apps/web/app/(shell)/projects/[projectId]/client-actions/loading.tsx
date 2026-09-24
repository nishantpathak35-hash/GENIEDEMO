import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

export default function Loading(): ReactNode {
  return (
    <Skeleton
      columns={[{ label: 'Kind' }, { label: 'What' }, { label: 'Needs' }, { label: 'By' }]}
    />
  );
}

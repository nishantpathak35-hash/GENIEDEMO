import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

export default function Loading(): ReactNode {
  return (
    <Skeleton
      columns={[{ label: 'Who' }, { label: 'Booked' }, { label: 'Of which beyond the fee' }]}
    />
  );
}

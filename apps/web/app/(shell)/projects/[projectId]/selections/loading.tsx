import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

export default function Loading(): ReactNode {
  return (
    <Skeleton
      columns={[
        { label: 'Room' },
        { label: 'Item' },
        { label: 'Unit price', numeric: true },
        { label: 'Lead time', numeric: true },
        { label: 'State' },
      ]}
    />
  );
}

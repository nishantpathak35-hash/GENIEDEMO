import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

export default function Loading(): ReactNode {
  return (
    <Skeleton
      columns={[
        { label: 'Room' },
        { label: 'Item' },
        { label: 'Lead time', numeric: true },
        { label: 'Days left', numeric: true },
        { label: 'Short by', numeric: true },
        { label: 'State' },
      ]}
    />
  );
}

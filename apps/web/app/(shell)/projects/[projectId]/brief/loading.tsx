import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

export default function Loading(): ReactNode {
  return (
    <Skeleton
      columns={[
        { label: 'Room' },
        { label: 'Area', numeric: true },
        { label: 'People', numeric: true },
        { label: 'What it is for' },
      ]}
    />
  );
}

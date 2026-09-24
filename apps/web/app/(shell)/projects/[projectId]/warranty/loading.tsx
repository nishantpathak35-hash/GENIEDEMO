import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

export default function Loading(): ReactNode {
  return (
    <Skeleton
      columns={[
        { label: 'Claim' },
        { label: 'Trade' },
        { label: 'Reported' },
        { label: 'Promised by' },
        { label: 'State' },
      ]}
    />
  );
}

import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

/** The trades table's own shape, while it loads. */
export default function Loading(): ReactNode {
  return (
    <Skeleton
      columns={[
        { label: 'Trade' },
        { label: 'State' },
        { label: 'Usual margin', numeric: true },
        { label: 'Code' },
        { label: '' },
      ]}
    />
  );
}

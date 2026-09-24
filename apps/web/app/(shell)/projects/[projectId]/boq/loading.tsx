import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

export default function Loading(): ReactNode {
  return (
    <Skeleton
      columns={[
        { label: 'Item' },
        { label: 'Quantity' },
        { label: 'Client rate', numeric: true },
        { label: 'Cost rate', numeric: true },
        { label: 'Amount', numeric: true },
      ]}
    />
  );
}

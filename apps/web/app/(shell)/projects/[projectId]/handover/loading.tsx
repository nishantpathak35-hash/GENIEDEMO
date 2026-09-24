import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

export default function Loading(): ReactNode {
  return (
    <Skeleton
      columns={[
        { label: 'Where' },
        { label: 'What' },
        { label: 'Severity' },
        { label: 'With' },
        { label: 'State' },
      ]}
    />
  );
}

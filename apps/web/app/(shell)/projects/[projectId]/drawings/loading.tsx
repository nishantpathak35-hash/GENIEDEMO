import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

export default function Loading(): ReactNode {
  return (
    <Skeleton
      columns={[
        { label: 'Number' },
        { label: 'Title' },
        { label: 'Discipline' },
        { label: 'Revision', numeric: true },
        { label: 'Status' },
        { label: 'File' },
      ]}
    />
  );
}

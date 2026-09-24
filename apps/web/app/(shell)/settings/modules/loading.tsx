import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

/** The module table's own shape, while it loads. */
export default function Loading(): ReactNode {
  return (
    <Skeleton
      columns={[{ label: 'Module' }, { label: 'State' }, { label: 'What it is for' }, { label: '' }]}
    />
  );
}

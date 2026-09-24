import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

/** The vendor-logins table's own shape, while it loads. */
export default function Loading(): ReactNode {
  return (
    <Skeleton
      columns={[
        { label: 'Login' },
        { label: 'State' },
        { label: 'Represents' },
        { label: 'Give access to' },
      ]}
    />
  );
}

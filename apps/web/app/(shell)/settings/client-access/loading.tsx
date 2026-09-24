import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

/** The client-logins table's own shape, while it loads. */
export default function Loading(): ReactNode {
  return (
    <Skeleton
      columns={[
        { label: 'Client' },
        { label: 'State' },
        { label: 'Can see' },
        { label: 'Give access to' },
      ]}
    />
  );
}

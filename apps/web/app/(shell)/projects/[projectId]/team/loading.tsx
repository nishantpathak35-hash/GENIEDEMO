import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

export default function Loading(): ReactNode {
  return (
    <Skeleton columns={[{ label: 'Person' }, { label: 'On this project' }, { label: 'Added' }]} />
  );
}

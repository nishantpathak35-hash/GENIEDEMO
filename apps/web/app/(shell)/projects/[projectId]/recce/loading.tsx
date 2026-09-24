import type { ReactNode } from 'react';
import { Section, Skeleton } from '@cog/design-system';

export default function Loading(): ReactNode {
  return (
    <Section bare title="Every survey">
      <Skeleton
        columns={[
          { label: 'Date' },
          { label: 'Status' },
          { label: 'Condition' },
          { label: 'Built-up', numeric: true },
          { label: 'Carpet', numeric: true },
        ]}
      />
    </Section>
  );
}

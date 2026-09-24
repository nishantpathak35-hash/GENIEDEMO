import type { ReactNode } from 'react';
import { Section, Skeleton } from '@cog/design-system';

export default function Loading(): ReactNode {
  return (
    <Section bare title="All reports for this project">
      <Skeleton columns={[{ label: 'Day' }, { label: 'Status' }, { label: 'Notes' }]} />
    </Section>
  );
}

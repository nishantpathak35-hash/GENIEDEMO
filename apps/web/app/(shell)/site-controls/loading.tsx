import type { ReactNode } from 'react';
import { Section, Skeleton } from '@cog/design-system';

export default function Loading(): ReactNode {
  return (
    <Section bare title="Choose a project">
      <Skeleton columns={[{ label: 'Code' }, { label: 'Project' }, { label: 'Client' }, { label: '' }]} />
    </Section>
  );
}

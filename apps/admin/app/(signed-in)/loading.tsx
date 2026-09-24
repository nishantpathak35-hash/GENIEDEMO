import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

/** The organisations table's own shape, while it loads. */
export default function Loading(): ReactNode {
  return (
    <>
      <header className="pgh">
        <div className="pgh-t">
          <h1 className="pt">Organisations</h1>
        </div>
      </header>
      <Skeleton
        columns={[
          { label: 'Organisation' },
          { label: 'Plan' },
          { label: 'Tally' },
          { label: 'Last active', numeric: true },
        ]}
      />
    </>
  );
}

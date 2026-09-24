import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

/** The Decided table, loading. Overrides the parent project's skeleton. */
export default function Loading(): ReactNode {
  return (
    <>
      <header className="pgh">
        <div className="pgh-t">
          <h1 className="pt">Variations</h1>
        </div>
      </header>
      <Skeleton
        columns={[
          { label: 'Variation' },
          { label: 'Amount', numeric: true },
          { label: 'Decision' },
          { label: 'When' },
        ]}
      />
    </>
  );
}

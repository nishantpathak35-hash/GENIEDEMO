import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

/**
 * The Bills list, loading. Overrides the Orders skeleton at
 * `(signed-in)/loading.tsx`, which would otherwise be this segment's
 * fallback too — see that file's comment on why there is no card-list
 * `Skeleton` variant to reach for instead.
 */
export default function Loading(): ReactNode {
  return (
    <>
      <header className="pgh">
        <div className="pgh-t">
          <h1 className="pt">Your bills</h1>
        </div>
      </header>
      <Skeleton
        columns={[
          { label: 'Bill number' },
          { label: 'Period' },
          { label: 'Amount claimed', numeric: true },
          { label: 'Covering' },
          { label: 'Status' },
          { label: 'Submitted' },
        ]}
      />
    </>
  );
}

import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

/**
 * Your projects, loading. `Skeleton` only knows how to shimmer a
 * `table.data`, and this list is a `.list`, not a table — see
 * `apps/vendor-portal`'s `(signed-in)/loading.tsx` for the same gap.
 */
export default function Loading(): ReactNode {
  return (
    <>
      <header className="pgh">
        <div className="pgh-t">
          <h1 className="pt">Your projects</h1>
        </div>
      </header>
      <Skeleton columns={[{ label: 'Project' }, { label: 'Code' }]} />
    </>
  );
}

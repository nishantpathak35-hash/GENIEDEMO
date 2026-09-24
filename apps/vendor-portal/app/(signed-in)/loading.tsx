import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

/**
 * The Orders list, loading.
 *
 * `Skeleton` only knows how to shimmer a `table.data` — there is no card-list
 * variant of it in `packages/design-system`, which this app is not the place
 * to add. The columns below name what the loaded card actually shows, so a
 * reader gets the right SHAPE of information even though the final render is
 * cards, not this table.
 */
export default function Loading(): ReactNode {
  return (
    <>
      <header className="pgh">
        <div className="pgh-t">
          <h1 className="pt">Your orders</h1>
        </div>
      </header>
      <Skeleton
        columns={[
          { label: 'Number' },
          { label: 'Raised' },
          { label: 'State' },
          { label: 'Before GST', numeric: true },
          { label: 'GST', numeric: true },
          { label: 'Total', numeric: true },
          { label: 'Your answer' },
        ]}
      />
    </>
  );
}

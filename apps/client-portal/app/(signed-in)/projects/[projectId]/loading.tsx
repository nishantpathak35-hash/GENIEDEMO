import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

/**
 * A project (its layout and its default Progress tab), loading.
 *
 * Overrides `(signed-in)/loading.tsx` — the projects-list skeleton — for the
 * whole `projects/[projectId]/*` subtree; `variations/loading.tsx` overrides
 * this one again for its own table.
 */
export default function Loading(): ReactNode {
  return (
    <>
      <header className="pgh">
        <div className="pgh-t">
          <h1 className="pt">Progress</h1>
        </div>
      </header>
      <Skeleton
        columns={[
          { label: 'Contract value', numeric: true },
          { label: 'Days reported', numeric: true },
          { label: 'Drawings issued', numeric: true },
          { label: 'Measurements signed', numeric: true },
        ]}
        rows={1}
      />
    </>
  );
}

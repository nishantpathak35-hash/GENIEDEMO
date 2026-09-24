import type { ReactNode } from 'react';
import { Skeleton } from '@cog/design-system';

/** The list's own shape, while `listTasks` loads. */
export default function Loading(): ReactNode {
  return (
    <>
      <header className="pgh">
        <div className="pgh-t">
          <h1 className="pt">Tasks</h1>
        </div>
      </header>
      <Skeleton columns={[{ label: 'Task' }, { label: 'Assigned to' }, { label: 'Due' }]} />
    </>
  );
}

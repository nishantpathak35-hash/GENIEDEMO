'use client';

import { useState, type ReactNode } from 'react';
import { Drawer, Icon } from '@cog/design-system';
import { NewTaskForm } from './forms';

/** The page header's one primary action: a drawer, not an always-open panel. */
export function NewTaskDrawer({
  people,
  projects,
}: {
  people: ReadonlyArray<readonly [string, string]>;
  projects: ReadonlyArray<readonly [string, string]>;
}): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn primary" onClick={() => setOpen(true)}>
        <Icon name="plus" />
        New task
      </button>
      <Drawer title="New task" open={open} onClose={() => setOpen(false)}>
        <NewTaskForm people={people} projects={projects} />
      </Drawer>
    </>
  );
}

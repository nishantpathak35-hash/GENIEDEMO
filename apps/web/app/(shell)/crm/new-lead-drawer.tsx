'use client';

import { useState, type ReactNode } from 'react';
import { Drawer, Icon } from '@cog/design-system';
import { NewLeadForm } from './forms';

/** The page header's primary action: opens the existing create form in a drawer. */
export function NewLeadDrawer(): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn primary" onClick={() => setOpen(true)}>
        <Icon name="plus" />
        New lead
      </button>
      <Drawer title="New lead" open={open} onClose={() => setOpen(false)}>
        <NewLeadForm />
      </Drawer>
    </>
  );
}

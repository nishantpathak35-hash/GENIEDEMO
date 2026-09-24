'use client';

import type { ReactNode } from 'react';
import { Choice, Field, Form } from '@cog/design-system';
import { createStockLocation, retireStockLocation } from './actions';

export function StockLocationForm({ projects }: { projects: ReadonlyArray<readonly [string, string]> }): ReactNode {
  return (
    <Form action={createStockLocation} submitLabel="Register location" pendingLabel="Registering…">
      <div className="row">
        <Field name="name" label="Name" required placeholder="Central store" />
        <Choice
          name="kind"
          label="Kind"
          defaultValue="store"
          options={[
            ['store', 'A store — the office or the yard'],
            ['site', 'A site store — on one project'],
          ]}
        />
        <Choice
          name="projectId"
          label="Project, for a site store"
          options={projects}
          hint="Ignored for a store."
        />
      </div>
    </Form>
  );
}

export function RetireLocationButton({ locationId }: { locationId: string }): ReactNode {
  return (
    <form action={retireStockLocation.bind(null, locationId)} className="inline">
      <button type="submit" className="btn sm">
        Retire
      </button>
    </form>
  );
}

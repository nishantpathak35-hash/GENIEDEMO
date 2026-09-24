'use client';

import type { ReactNode } from 'react';
import { Field, Form } from '@cog/design-system';
import { createSheet } from './actions';

export function NewSheetForm({ projectId }: { projectId: string }): ReactNode {
  return (
    <Form
      action={createSheet.bind(null, projectId)}
      submitLabel="Create sheet"
      pendingLabel="Creating…"
    >
      <div className="row">
        <Field name="title" label="Sheet title" required />
        <Field name="floorName" label="Floor or level" />
      </div>
      <div className="row">
        <Field name="scalePxNum" label="Scale — pixels" placeholder="96" />
        <Field name="scalePxDen" label="Scale — units" placeholder="1" />
        <Field name="scaleUnit" label="Unit" placeholder="ft" />
      </div>
      <p className="hint u-m0">
        The scale is an exact ratio of whole numbers, not a decimal. Both halves or neither —
        half a scale is refused, because it reads as calibrated.
      </p>
    </Form>
  );
}

'use client';

import type { ReactNode } from 'react';
import { Choice, Field, Form } from '@cog/design-system';
import { DRAWING_CATEGORIES } from '@cog/design-system';
import { issueDrawing, withdrawDrawing } from './actions';

export function IssueDrawingForm({
  projectId,
  documents,
}: {
  projectId: string;
  documents: ReadonlyArray<readonly [string, string]>;
}): ReactNode {
  return (
    <Form
      action={issueDrawing.bind(null, projectId)}
      submitLabel="Issue revision"
      pendingLabel="Issuing…"
    >
      <div className="row">
        <Field name="drawingNo" label="Drawing number" required />
        <Field name="title" label="Title" required />
        <Field name="revision" label="Revision" required placeholder="Rev 0" />
        <Choice name="category" label="Discipline" options={DRAWING_CATEGORIES} />
      </div>
      <Choice
        name="documentId"
        label="Vault object (optional)"
        options={documents}
        hint="Registered separately, by checksum. The API never accepts the file itself."
      />
    </Form>
  );
}

export function WithdrawDrawingForm({
  projectId,
  drawingId,
}: {
  projectId: string;
  drawingId: string;
}): ReactNode {
  return (
    <form
      action={withdrawDrawing.bind(null, projectId, drawingId)}
      className="inline"
    >
      <button type="submit" className="btn sm">
        Withdraw
      </button>
    </form>
  );
}

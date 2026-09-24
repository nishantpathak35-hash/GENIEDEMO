'use client';

import type { ReactNode } from 'react';
import { Field, Form, MoneyField } from '@cog/design-system';
import { createProject } from './actions';

export function NewProjectForm(): ReactNode {
  return (
    <Form action={createProject} submitLabel="Create project" pendingLabel="Creating…">
      <div className="row">
        <Field name="code" label="Code" required hint="Short, unique in this organisation." />
        <Field name="name" label="Project name" required />
        <Field name="clientName" label="Client" required />
      </div>
      <MoneyField
        name="originalValue"
        label="Contract value (optional)"
        hint="What was signed. Never overwritten later — an approved variation adds to it rather than replacing it."
      />
    </Form>
  );
}

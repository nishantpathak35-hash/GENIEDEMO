'use client';

import type { ReactNode } from 'react';
import { Field, Form } from '@cog/design-system';
import { deleteDocument, registerDocument } from './actions';

export function RegisterDocumentForm({ project }: { project?: { readonly id: string; readonly code: string } }): ReactNode {
  return (
    <Form action={registerDocument} submitLabel="Register object" pendingLabel="Registering…">
      <div className="row">
        {project === undefined ? (
          <>
            <Field name="entityType" label="Attached to" required placeholder="project" />
            <Field name="entityId" label="Entity id" required />
          </>
        ) : (
          <>
            {/* inside a project the file is the project's: the record is fixed, the project stamped */}
            <input type="hidden" name="entityType" value="project" />
            <input type="hidden" name="entityId" value={project.id} />
            <input type="hidden" name="base" value={`/projects/${project.id}/documents`} />
            <p className="hint u-m0">
              Attached to <b>{project.code}</b> — this project.
            </p>
          </>
        )}
        <Field name="fileName" label="File name" required />
        <Field name="contentType" label="Content type" required placeholder="application/pdf" />
      </div>
      <div className="row">
        <Field name="sizeBytes" label="Size in bytes" required />
        <Field
          name="checksum"
          label="SHA-256 checksum"
          required
          hint="64 hex characters. It names exactly one object, so a substitution is detectable."
        />
      </div>
      <p className="hint u-m0">
        This records that an object exists and where it lives. The API never accepts file bytes —
        the object is written to storage under a tenant-prefixed key and fetched through a signed
        URL with a short expiry.
      </p>
    </Form>
  );
}

export function DeleteDocumentButton({ documentId }: { documentId: string }): ReactNode {
  return (
    <form action={deleteDocument.bind(null, documentId)} className="inline">
      <button type="submit" className="btn danger sm">
        Delete
      </button>
    </form>
  );
}

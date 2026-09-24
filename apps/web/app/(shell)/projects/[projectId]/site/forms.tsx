'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { Choice, Field, Form, Notes } from '@cog/design-system';
import { createDailyReport, raiseSiteIssue, resolveSiteIssue } from '../../../site-reports/actions';

/** Raise an issue on this project. The server stamps who and the day. */
export function RaiseSiteIssueForm({ projectId }: { projectId: string }): ReactNode {
  return (
    <Form action={raiseSiteIssue} submitLabel="Raise issue" pendingLabel="Raising…">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="row">
        <Field name="title" label="What is wrong" required />
        <Choice
          name="severity"
          label="Severity"
          defaultValue="minor"
          options={[
            ['minor', 'Minor'],
            ['major', 'Major'],
            ['blocking', 'Stops work'],
          ]}
        />
      </div>
    </Form>
  );
}

/** Resolve one open issue, with a line on what fixed it. */
export function ResolveSiteIssueForm({ issueId }: { issueId: string }): ReactNode {
  return (
    <Form action={resolveSiteIssue.bind(null, issueId)} submitLabel="Resolve" pendingLabel="Resolving…">
      <Field name="resolution" label="What fixed it" />
    </Form>
  );
}

/**
 * The daily-report form, fixed to this project.
 *
 * Same action as the tenant-wide form on `/site-reports`
 * (`createDailyReport` takes its project from the submitted field, not from
 * an argument bound at import time) — this one just replaces the project
 * `Choice` with a hidden input, since the project is already the page.
 */
export function NewProjectDailyReportForm({ projectId }: { projectId: string }): ReactNode {
  const [rowCount, setRowCount] = useState(2);
  const rows = Array.from({ length: rowCount }, (_, index) => index);

  return (
    <Form action={createDailyReport} submitLabel="Record report" pendingLabel="Recording…">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="row">
        <Field name="reportDate" label="Date" type="date" required />
      </div>

      <h3>Manpower on site</h3>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Floor</th>
              <th>Trade</th>
              <th className="num">Head count</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((index) => (
              <tr key={index}>
                <td>
                  <input name="manpowerFloor" aria-label={`Row ${index + 1} floor`} />
                </td>
                <td>
                  <input name="manpowerTrade" aria-label={`Row ${index + 1} trade`} />
                </td>
                <td>
                  <input name="manpowerCount" size={6} aria-label={`Row ${index + 1} count`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="actions">
        <button type="button" className="btn" onClick={() => setRowCount(rowCount + 1)}>
          Add a row
        </button>
      </div>

      <Notes name="notes" label="Notes" rows={2} />
    </Form>
  );
}
